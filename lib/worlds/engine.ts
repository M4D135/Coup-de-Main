import type {ActionResult, ActResult, Creature, DeviceDefinition, DeviceStatus, DrawingDefinition, DrawnRoute, EditSnapshot, GameAction, GameEvent, Gate, Point, RouteEdge, RunSnapshot, StageProgress, WorldLevel, WorldRun} from './types';
import {advanceMechanism,getDeviceAnchor,getSupportPaths,initializeMechanism,MECHANICS_REVISION,predictPendulum,supportReady,windTransfer} from './mechanics';

export const WORLD_SAVE_KEY='coup-de-main-v3';
export const FIXED_STEP=1/60;
export const ANCHOR_RADIUS=76;
const SPACING=45;
const finite=(value:unknown,fallback=0):number=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const copyPoints=(points:Point[]):Point[]=>points.map(point=>({...point}));
const copyDrawings=(drawings:Record<string,DrawnRoute>):Record<string,DrawnRoute>=>Object.fromEntries(Object.entries(drawings).map(([id,route])=>[id,{...route,points:copyPoints(route.points)}]));
const nodeFor=(level:WorldLevel,id:string)=>level.nodes.find(node=>node.id===id)!;
const edgeFor=(level:WorldLevel,id:string|null)=>level.edges.find(edge=>edge.id===id);
const deviceFor=(level:WorldLevel,id:string)=>level.devices.find(device=>device.id===id);
const actCache=new WeakMap<WorldLevel,WorldLevel[]>();
const actParents=new WeakMap<WorldLevel,WorldLevel>();
const canonicalWorld=(level:WorldLevel):WorldLevel=>actParents.get(level)??level;
export const getActCount=(level:WorldLevel):number=>level.acts?.length??level.journeyActCount??1;
export function getActiveAct(level:WorldLevel,run:Pick<WorldRun,'actIndex'>):WorldLevel {
  if(level.actKey||!level.acts?.length)return level;
  let acts=actCache.get(level);
  if(!acts){
    acts=level.acts.map((act,index)=>{
      const resolved={...level,...act,stageName:act.title,acts:undefined,actKey:act.key,actNumber:index+1,journeyActCount:level.acts!.length};
      actParents.set(resolved,level);return resolved;
    });
    actCache.set(level,acts);
  }
  return acts[clamp(Math.floor(finite(run.actIndex)),0,acts.length-1)];
}
const copyActResults=(results:ActResult[]):ActResult[]=>results.map(result=>({...result,lostIds:[...result.lostIds]}));
const copyVisits=(visits:Record<string,number[]>):Record<string,number[]>=>Object.fromEntries(Object.entries(visits).map(([id,units])=>[id,[...units]]));
const geometryScale=(level:WorldLevel):number=>level.height/900;
const stationDevice=(level:WorldLevel,nodeId:string)=>level.devices.find(device=>device.weightNodes?.includes(nodeId));
const stationPosition=(run:WorldRun,level:WorldLevel,unit:Creature):Point=>{
  const node=nodeFor(level,unit.nodeId),capacity=node.capacity??3;
  const definition=stationDevice(level,node.id),anchor=definition?getDeviceAnchor(run,definition):node;
  return {x:anchor.x+((unit.formationSlot??unit.id%capacity)-(capacity-1)/2)*46*geometryScale(level),y:anchor.y};
};

function nodePosition(run:WorldRun,level:WorldLevel,id:string):Point {
  const node=nodeFor(level,id),definition=stationDevice(level,id);
  return definition?getDeviceAnchor(run,definition):{x:node.x,y:node.y};
}

/** Preserve the authored curve in an endpoint-relative frame as supports move. */
function reframePoint(point:Point,oldFrom:Point,oldTo:Point,newFrom:Point,newTo:Point):Point {
  const dx=oldTo.x-oldFrom.x,dy=oldTo.y-oldFrom.y,length=Math.hypot(dx,dy)||1;
  const along=((point.x-oldFrom.x)*dx+(point.y-oldFrom.y)*dy)/(length*length);
  const across=((point.x-oldFrom.x)*-dy+(point.y-oldFrom.y)*dx)/length;
  const nx=newTo.x-newFrom.x,ny=newTo.y-newFrom.y,newLength=Math.hypot(nx,ny)||1;
  return {x:newFrom.x+nx*along-ny/newLength*across,y:newFrom.y+ny*along+nx/newLength*across};
}

export function getDrawingEndpoints(run:WorldRun,level:WorldLevel,drawing:DrawingDefinition):{from:Point;to:Point} {
  const edge=level.edges.find(edge=>edge.drawingId===drawing.id);
  if(!edge)return {from:{...drawing.from},to:{...drawing.to}};
  const from=nodeFor(level,edge.from),to=nodeFor(level,edge.to),a=nodePosition(run,level,from.id),b=nodePosition(run,level,to.id);
  return {from:reframePoint(drawing.from,from,to,a,b),to:reframePoint(drawing.to,from,to,a,b)};
}

export const pathLength=(points:Point[]):number=>points.slice(1).reduce((sum,point,index)=>sum+distance(points[index],point),0);
export function pointAlongPath(points:Point[],at:number):Point&{direction:-1|1} {
  if(!points.length)return {x:0,y:0,direction:1};
  let remaining=Math.max(0,at);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=distance(a,b);
    if(remaining<=length||i===points.length-1){
      const t=length?clamp(remaining/length,0,1):0;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,direction:b.x>=a.x?1:-1};
    }
    remaining-=length;
  }
  return {...points[0],direction:1};
}

/** Includes a fixed approach/tail when a drawn span is only part of an edge. */
function getEdgeBasePath(run:WorldRun,level:WorldLevel,edge:RouteEdge):Point[] {
  level=getActiveAct(level,run);
  const drawing=edge.drawingId?level.drawings.find(item=>item.id===edge.drawingId):undefined;
  const built=edge.drawingId?run.drawings[edge.drawingId]:undefined;
  const from=nodeFor(level,edge.from),to=nodeFor(level,edge.to),points=drawing&&built?copyPoints(built.points):copyPoints(edge.path);
  if(drawing&&built){
    if(distance(from,points[0])>1)points.unshift({x:from.x,y:from.y});
    const tailIndex=edge.path.findIndex(point=>distance(point,drawing.to)<2);
    if(tailIndex>=0)points.push(...copyPoints(edge.path.slice(tailIndex+1)));
    if(distance(points[points.length-1],to)>1)points.push({x:to.x,y:to.y});
  }
  const a=nodePosition(run,level,from.id),b=nodePosition(run,level,to.id);
  if(distance(a,from)<1e-9&&distance(b,to)<1e-9)return points;
  return points.map(point=>reframePoint(point,from,to,a,b));
}

export function getEdgeSupportPaths(run:WorldRun,level:WorldLevel,edge:RouteEdge):Point[][] {
  return getSupportPaths(run,level,edge,getEdgeBasePath(run,level,edge));
}

export function getEdgePath(run:WorldRun,level:WorldLevel,edge:RouteEdge):Point[] {
  return getEdgeSupportPaths(run,level,edge).flat();
}

export function createRun(level:WorldLevel):WorldRun {
  return createActRun(canonicalWorld(level),Math.max(0,(level.actNumber??1)-1),[]);
}

function createActRun(world:WorldLevel,actIndex:number,actResults:ActResult[]):WorldRun {
  const level=getActiveAct(world,{actIndex});
  const source=nodeFor(level,level.spawn);
  const previous=actResults.find(result=>result.index===actIndex-1);
  const lostIds=new Set(previous?.lostIds??[]);
  const devices=Object.fromEntries(level.devices.map(device=>{
    const state={mode:device.initialMode,progress:0,load:0};initializeMechanism(device,state);return [device.id,state];
  }));
  return {
    version:3,mechanicsRevision:MECHANICS_REVISION,geometryRevision:level.revision??3,autoCheckpointId:null,levelId:level.id,actIndex,actResults:copyActResults(actResults),phase:'ready',time:0,speed:1,
    units:Array.from({length:level.total},(_,id)=>({id,x:source.x,y:lostIds.has(id)?level.height+300:source.y,state:lostIds.has(id)?'lost':'queued',direction:1,nodeId:source.id,edgeId:null,distance:0,walkTime:0,waitTime:0,savedAt:null,lostAt:lostIds.has(id)?0:null,fallVelocity:0,returning:false,returnEdges:[],formationSlot:null,variant:(id*7)%5})),
    devices,
    drawings:{},spawned:lostIds.size,saved:0,lost:lostIds.size,nextSpawn:0,accumulator:0,edits:0,retries:0,visits:{},passages:{},
    activeStroke:null,history:[],events:[],message:'Prépare le chemin, puis libère la troupe.',checkpoint:null,
  };
}

export function gateSatisfied(run:WorldRun,gate:Gate):boolean {
  const state=run.devices[gate.deviceId];
  return !!state&&(gate.mode===undefined||state.mode===gate.mode)
    &&(gate.notMode===undefined||state.mode!==gate.notMode)
    &&(gate.minProgress===undefined||state.progress+1e-6>=gate.minProgress)
    &&(gate.minLoad===undefined||state.load>=gate.minLoad);
}

const gatesSatisfied=(run:WorldRun,gates:Gate[]|undefined)=>!gates||gates.every(gate=>gateSatisfied(run,gate));
const editSnapshot=(run:WorldRun):EditSnapshot=>({drawings:copyDrawings(run.drawings),modes:Object.fromEntries(Object.entries(run.devices).map(([id,state])=>[id,state.mode]))});
const remember=(run:WorldRun)=>{run.history.push(editSnapshot(run));if(run.history.length>30)run.history.shift();run.edits++;};
const result=(run:WorldRun,ok:boolean,message:string,extra:Partial<ActionResult>={}):ActionResult=>{run.message=message;return {ok,message,...extra};};
const emit=(run:WorldRun,event:GameEvent)=>{run.events.push(event);if(run.events.length>80)run.events.shift();};

/** A cleat is a retaining knot, not a remote on/off switch. Once its supported
 * route has carried someone, releasing it would strand later groups several
 * screens away. The passage ledger proves that the player already solved and
 * used this mechanism; it does not open an unused route for them.
 */
function committedCleat(run:WorldRun,level:WorldLevel,definition:DeviceDefinition):boolean {
  return definition.kind==='latch'&&level.edges.some(edge=>(run.passages[edge.id]?.length??0)>0
    &&(edge.gates?.some(gate=>gate.deviceId===definition.id&&(gate.mode===1||(gate.minProgress??0)>0))
      ||(!!definition.powerDeviceId&&edge.mechanism?.drivers.includes(definition.powerDeviceId))));
}

function activeOnDrawing(run:WorldRun,level:WorldLevel,id:string):boolean {
  if(!run.drawings[id])return false;
  return run.units.some(unit=>!['queued','saved','lost'].includes(unit.state)
    &&(edgeFor(level,unit.edgeId)?.drawingId===id||(unit.returning&&(unit.returnEdges??[]).some(edgeId=>edgeFor(level,edgeId)?.drawingId===id))));
}

export function applyAction(run:WorldRun,level:WorldLevel,action:GameAction):ActionResult {
  if(run.levelId!==level.id)return result(run,false,'Ce stage ne correspond pas à la sauvegarde.');
  const world=canonicalWorld(level);level=getActiveAct(level,run);
  if(action.type==='advanceAct'){
    if(run.phase!=='won')return result(run,false,'Réunis la troupe avant de passer au tableau suivant.');
    if(run.actIndex>=getActCount(world)-1)return result(run,false,'Les trois tableaux sont terminés.');
    recordAct(run,level);
    const speed=run.speed;
    Object.assign(run,createActRun(world,run.actIndex+1,run.actResults));run.speed=speed;
    rememberGestureCheckpoint(run,level);
    return result(run,true,`Tableau ${run.actIndex+1} : la même troupe attend ton signal.`);
  }
  if(action.type==='restart'){
    const retries=run.retries+1;
    Object.assign(run,createActRun(world,run.actIndex??0,(run.actResults??[]).filter(item=>item.index<(run.actIndex??0))));run.retries=retries;
    emit(run,{type:'retry'});
    return result(run,true,'La troupe attend à l’entrée. Prépare un nouveau chemin.');
  }
  if(action.type==='retry'){
    if(!run.checkpoint)return applyAction(run,level,{type:'restart'});
    const checkpoint=run.checkpoint,retries=run.retries+1,restored=restoreRun(checkpoint,world);
    if(!restored)return result(run,false,'Ce point de reprise est indisponible.');
    Object.assign(run,restored);run.checkpoint=checkpoint;run.retries=retries;run.phase='paused';
    emit(run,{type:'retry'});
    return result(run,true,level.sectors?'Retour au dernier souvenir.':'Retour au dernier geste. Reprends quand tu es prêt.');
  }
  if(action.type==='checkpoint'){
    run.checkpoint=snapshotCore(run);
    return result(run,true,'Un point de reprise est posé.');
  }
  if(action.type==='speed'){
    run.speed=action.value??(run.speed===1?2:1);
    return result(run,true,run.speed===1?'À leur rythme.':'La troupe accélère.');
  }
  if(action.type==='start'){
    if(run.phase==='won'||run.phase==='lost')return result(run,false,'Recommence le stage pour repartir.');
    run.phase='playing';
    if(!run.checkpoint)run.checkpoint=snapshotCore(run);
    return result(run,true,'La troupe est en route.');
  }
  if(action.type==='pause'){
    if(run.phase==='ready')return result(run,true,'La troupe attend ton départ.');
    if(run.phase==='won'||run.phase==='lost')return result(run,false,'Le stage est terminé.');
    const paused=action.paused??run.phase==='playing';run.phase=paused?'paused':'playing';
    return result(run,true,paused?'Prends le temps de réfléchir et de dessiner.':'C’est reparti.');
  }
  if(run.phase==='won'||run.phase==='lost')return result(run,false,'Le stage est terminé.');
  if(action.type==='erase'){
    const id=action.id??Object.keys(run.drawings).reverse().find(key=>!activeOnDrawing(run,level,key));
    if(!id||!run.drawings[id])return result(run,false,'Choisis un passage dessiné et libre pour récupérer son encre.');
    if(activeOnDrawing(run,level,id))return result(run,false,'Ce passage porte encore des compagnons. Laisse-les quitter le trait avant de l’effacer.');
    const amount=Math.round(run.drawings[id].inkLength);remember(run);delete run.drawings[id];run.activeStroke=null;
    emit(run,{type:'undo'});rememberGestureCheckpoint(run,level);
    return result(run,true,`${amount} unités d’encre récupérées. Le passage peut être redessiné.`);
  }
  if(action.type==='undo'){
    const previous=run.history[run.history.length-1];
    if(!previous)return result(run,false,'Aucun geste à annuler.');
    const changed=Object.keys(run.drawings).filter(id=>JSON.stringify(previous.drawings[id]?.points)!==JSON.stringify(run.drawings[id].points));
    if(changed.some(id=>activeOnDrawing(run,level,id)))return result(run,false,'Laisse les compagnons quitter ce trait avant de l’effacer.');
    for(const definition of level.devices){
      if(definition.kind==='lift'&&previous.modes[definition.id]!==run.devices[definition.id].mode
        &&run.units.some(unit=>unit.state==='riding'&&edgeFor(level,unit.edgeId)?.deviceId===definition.id)){
        return result(run,false,'Laisse l’ascenseur déposer ses passagers avant d’annuler.');
      }
      if((definition.kind==='counterweight'||definition.kind==='latch')&&previous.modes[definition.id]===0&&run.devices[definition.id].mode===1){
        const reason=deviceActionReason(run,level,definition,0);
        if(reason)return result(run,false,reason);
      }
    }
    run.history.pop();run.drawings=copyDrawings(previous.drawings);
    // Undo edits, not the troupe's already completed physical relay visits.
    for(const [id,mode] of Object.entries(previous.modes))if(run.devices[id]&&deviceFor(level,id)?.playerControlled!==false)run.devices[id].mode=mode;
    run.activeStroke=null;emit(run,{type:'undo'});rememberGestureCheckpoint(run,level);
    return result(run,true,'Le dernier geste est annulé.');
  }
  if(action.type==='device'){
    const definition=deviceFor(level,action.id),state=run.devices[action.id];
    if(!definition||!state)return result(run,false,'Ce mécanisme est introuvable.');
    if(definition.modes.length<2)return result(run,false,definition.description);
    const next=action.mode??Array.from({length:definition.modes.length-1},(_,offset)=>(state.mode+offset+1)%definition.modes.length)
      .find(mode=>!deviceActionReason(run,level,definition,mode))??((state.mode+1)%definition.modes.length);
    if(!Number.isInteger(next)||next<0||next>=definition.modes.length)return result(run,false,'Cette position est indisponible.');
    if(definition.playerControlled===false)return result(run,false,deviceActionReason(run,level,definition,next));
    if(next===state.mode)return result(run,true,`${definition.label} : ${definition.modes[next]}.`);
    const blocked=deviceActionReason(run,level,definition,next);
    if(blocked)return result(run,false,blocked);
    remember(run);state.mode=next;state.released=0;
    if(definition.kind==='wind'&&definition.mechanics)state.receivedForce=windTransfer(definition,state);
    emit(run,{type:'device',x:definition.x,y:definition.y,deviceId:definition.id});
    rememberGestureCheckpoint(run,level);
    return result(run,true,`${definition.label} : ${definition.modes[next]}.`);
  }
  return result(run,false,'Action inconnue.');
}

export function beginStroke(run:WorldRun,level:WorldLevel,point:Point):ActionResult {
  level=getActiveAct(level,run);
  if(run.phase==='won'||run.phase==='lost')return result(run,false,'Le stage est terminé.');
  let match:{definition:DrawingDefinition;reversed:boolean;distance:number}|null=null;
  for(const definition of level.drawings){
    const endpoints=getDrawingEndpoints(run,level,definition);
    for(const reversed of [false,true]){
      const d=distance(point,reversed?endpoints.to:endpoints.from);
      const unbuilt=!run.drawings[definition.id],previousUnbuilt=match?!run.drawings[match.definition.id]:false;
      if(d<=ANCHOR_RADIUS&&(!match||(unbuilt&&!previousUnbuilt)||(unbuilt===previousUnbuilt&&d<match.distance)))match={definition,reversed,distance:d};
    }
  }
  if(!match)return result(run,false,'Commence ton trait sur un petit appui lumineux.');
  if(activeOnDrawing(run,level,match.definition.id))return result(run,false,'Attends que le trait soit libre pour le redessiner.');
  const endpoints=getDrawingEndpoints(run,level,match.definition);
  run.activeStroke={drawingId:match.definition.id,points:[{...(match.reversed?endpoints.to:endpoints.from)}],reversed:match.reversed};
  return result(run,true,match.definition.hint,{drawingId:match.definition.id});
}

export function appendStroke(run:WorldRun,level:WorldLevel,point:Point):void {
  level=getActiveAct(level,run);
  const stroke=run.activeStroke;
  if(!stroke||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
  const bounded={x:clamp(point.x,0,level.width),y:clamp(point.y,80,level.height-90)};
  if(distance(stroke.points[stroke.points.length-1],bounded)<2.5)return;
  if(stroke.points.length>=700)stroke.points=stroke.points.filter((_,index)=>index%2===0||index===stroke.points.length-1);
  stroke.points.push(bounded);
  const start=stroke.points[0],movement=distance(start,bounded);
  if(movement>=30){
    let best:{id:string;reversed:boolean;score:number}|null=null;
    for(const definition of level.drawings)for(const reversed of [false,true]){
      const endpoints=getDrawingEndpoints(run,level,definition),anchor=reversed?endpoints.to:endpoints.from,target=reversed?endpoints.from:endpoints.to;
      if(distance(anchor,start)>=2||activeOnDrawing(run,level,definition.id))continue;
      const reach=distance(start,target),score=((bounded.x-start.x)*(target.x-start.x)+(bounded.y-start.y)*(target.y-start.y))/(movement*reach);
      if(score>.3&&(!best||score>best.score))best={id:definition.id,reversed,score};
    }
    if(best){stroke.drawingId=best.id;stroke.reversed=best.reversed;}
  }
}

const pointSegmentDistance=(p:Point,a:Point,b:Point):number=>{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0;
  return distance(p,{x:a.x+dx*t,y:a.y+dy*t});
};

function simplify(points:Point[],tolerance:number):Point[] {
  if(points.length<=2)return copyPoints(points);
  let max=tolerance,index=-1;
  for(let i=1;i<points.length-1;i++){
    const d=pointSegmentDistance(points[i],points[0],points[points.length-1]);
    if(d>max){max=d;index=i;}
  }
  if(index<0)return [{...points[0]},{...points[points.length-1]}];
  return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];
}

export function finishStroke(run:WorldRun,level:WorldLevel):ActionResult {
  level=getActiveAct(level,run);
  const stroke=run.activeStroke;
  if(!stroke)return result(run,false,'Commence sur un appui, puis rejoins l’autre.');
  run.activeStroke=null;
  // Several real passages can meet at one physical support. The player's
  // destination, rather than definition order, selects the intended span.
  const first=stroke.points[0],last=stroke.points[stroke.points.length-1];
  const destinations=level.drawings.flatMap(definition=>[false,true].flatMap(reversed=>{
    const endpoints=getDrawingEndpoints(run,level,definition),start=reversed?endpoints.to:endpoints.from,end=reversed?endpoints.from:endpoints.to;
    return distance(first,start)<2&&distance(last,end)<=ANCHOR_RADIUS+12?[{definition,reversed,distance:distance(last,end)}]:[];
  })).sort((a,b)=>a.distance-b.distance);
  if(destinations[0]){stroke.drawingId=destinations[0].definition.id;stroke.reversed=destinations[0].reversed;}
  const definition=level.drawings.find(item=>item.id===stroke.drawingId)!;
  const endpoints=getDrawingEndpoints(run,level,definition);
  const points=stroke.reversed?copyPoints(stroke.points).reverse():copyPoints(stroke.points);
  if(points.length<2||pathLength(points)<distance(endpoints.from,endpoints.to)*.55)return result(run,false,'Prolonge le trait jusqu’au second appui.');
  if(distance(points[0],endpoints.from)>ANCHOR_RADIUS||distance(points[points.length-1],endpoints.to)>ANCHOR_RADIUS+12)return result(run,false,'Le trait doit rejoindre les deux appuis. Tu peux les approcher largement.');
  points[0]={...endpoints.from};points[points.length-1]={...endpoints.to};
  const normalized=points.map(point=>reframePoint(point,endpoints.from,endpoints.to,definition.from,definition.to));
  normalized[0]={...definition.from};normalized[normalized.length-1]={...definition.to};
  const stable=simplify(normalized,3.5),inkLength=pathLength(stable);
  if(inkLength>definition.inkLimit)return result(run,false,'Ce trait est trop long. Essaie un chemin plus direct.');
  const alreadyUsed=Object.entries(run.drawings).reduce((sum,[id,route])=>sum+(id===definition.id?0:route.inkLength),0);
  if(level.inkBudget!==undefined&&alreadyUsed+inkLength>level.inkBudget+.01)return result(run,false,`Il reste ${Math.max(0,Math.floor(level.inkBudget-alreadyUsed))} unités d’encre. Efface un passage libre avec la gomme pour récupérer son encre.`);
  if(stable.some(point=>pointSegmentDistance(point,definition.from,definition.to)>definition.corridor))return result(run,false,'Reste un peu plus près du passage à relier.');
  if(activeOnDrawing(run,level,definition.id))return result(run,false,'Les compagnons ont rejoint ce trait ; laisse-les passer.');
  remember(run);run.drawings[definition.id]={points:stable,inkLength,createdAt:run.time};
  emit(run,{type:'draw',x:definition.to.x,y:definition.to.y});rememberGestureCheckpoint(run,level);
  return result(run,true,`Trait validé : ${definition.label}.`,{drawingId:definition.id});
}

export function cancelStroke(run:WorldRun):void {run.activeStroke=null;}

export function getPendulumPosition(definition:DeviceDefinition,time:number,run?:WorldRun):Point&{angle:number} {
  const pivot=definition.pivot??{x:definition.x,y:definition.y};
  if(definition.mechanics&&run?.devices[definition.id]){
    const brake=definition.lockDeviceId?run.devices[definition.lockDeviceId]:undefined;
    const motion=predictPendulum(definition,run.devices[definition.id],Math.max(0,time-run.time),brake?.mode===1);
    const length=definition.length??190;
    return {x:pivot.x+Math.sin(motion.angle)*length,y:pivot.y+Math.cos(motion.angle)*length,angle:motion.angle};
  }
  const freeAngle=Math.sin(time/(definition.duration??7)*Math.PI*2+(definition.phase??0))*.95;
  const brake=definition.lockDeviceId&&run?.devices[definition.lockDeviceId];
  const held=brake&&brake.mode===1?brake.progress:0;
  const angle=freeAngle*(1-held)+.95*held;
  const length=definition.length??190;
  return {x:pivot.x+Math.sin(angle)*length,y:pivot.y+Math.cos(angle)*length,angle};
}

function updateDevices(run:WorldRun,level:WorldLevel,dt:number):void {
  const anchors=new Map(level.devices.filter(device=>device.mechanics&&device.weightNodes?.length).map(device=>[device.id,getDeviceAnchor(run,device)]));
  for(const definition of level.devices){
    const state=run.devices[definition.id];
    state.load=definition.weightNodes?run.units.filter(unit=>definition.weightNodes!.includes(unit.nodeId)&&unit.edgeId===null&&unit.state==='waiting'&&distance(unit,stationPosition(run,level,unit))<=geometryScale(level)).length
      :definition.kind==='lift'?run.units.filter(unit=>unit.state==='riding'&&edgeFor(level,unit.edgeId)?.deviceId===definition.id).length:0;
    if(definition.mechanics){
      if(definition.kind==='pendulum')continue;
      if(definition.kind==='lift'&&state.progress<.02&&run.units.some(unit=>unit.state==='riding'&&edgeFor(level,unit.edgeId)?.deviceId===definition.id&&unit.distance<1)){state.velocity=0;continue;}
      const oldMode=state.mode;advanceMechanism(run,level,definition,dt);
      if(state.mode!==oldMode)emit(run,{type:'device',deviceId:definition.id,x:definition.x,y:definition.y});
      continue;
    }
    let target=state.mode>0?1:0;
    if(definition.kind==='counterweight')target=state.mode===1||state.load>=(definition.requiredLoad??1)?1:0;
    if(definition.kind==='wind')target=state.mode===1||(definition.lockDeviceId&&run.devices[definition.lockDeviceId]?.mode===1)?1:0;
    if(definition.kind==='lift'&&!gatesSatisfied(run,definition.gates))target=state.progress;
    if(definition.kind==='lift'&&state.progress<.02&&run.units.some(unit=>unit.state==='riding'&&edgeFor(level,unit.edgeId)?.deviceId===definition.id&&unit.distance<1))target=0;
    if(definition.kind==='pendulum'){state.progress=(Math.sin(run.time/(definition.duration??7)*Math.PI*2+(definition.phase??0))+1)/2;continue;}
    const delta=dt/(definition.duration??.35);
    state.progress=target>state.progress?Math.min(target,state.progress+delta):Math.max(target,state.progress-delta);
  }
  for(const definition of level.devices)if(definition.mechanics&&definition.kind==='pendulum')advanceMechanism(run,level,definition,dt);
  for(const definition of level.devices){
    const before=anchors.get(definition.id);if(!before)continue;
    const after=getDeviceAnchor(run,definition),dx=after.x-before.x,dy=after.y-before.y;
    if(!dx&&!dy)continue;
    for(const unit of run.units)if(definition.weightNodes?.includes(unit.nodeId)&&unit.edgeId===null&&unit.state==='waiting'){
      unit.x+=dx;unit.y+=dy;
    }
  }
}

function routePrepared(run:WorldRun,level:WorldLevel,edge:RouteEdge,unit:Creature):boolean {
  if(edge.route&&run.devices[edge.route.deviceId]?.mode!==edge.route.mode)return false;
  if(edge.drawingId&&!run.drawings[edge.drawingId])return false;
  if(!gatesSatisfied(run,edge.gates))return false;
  if(!supportReady(run,level,edge))return false;
  if(edge.maxPassages!==undefined&&!run.passages[edge.id]?.includes(unit.id)&&(run.passages[edge.id]?.length??0)>=edge.maxPassages)return false;
  return true;
}
function canEnter(run:WorldRun,level:WorldLevel,edge:RouteEdge,unit:Creature):boolean {
  if(!routePrepared(run,level,edge,unit))return false;
  const destination=nodeFor(level,edge.to);
  if(stationDevice(level,destination.id)&&destination.capacity){
    const count=run.units.filter(other=>other.id!==unit.id&&!['queued','lost','saved'].includes(other.state)
      &&((other.nodeId===destination.id&&other.edgeId===null)||(!other.returning&&edgeFor(level,other.edgeId)?.to===destination.id))).length;
    if(count>=destination.capacity)return false;
  }
  if(edge.kind==='lift'){
    const state=run.devices[edge.deviceId!];
    if(!state||state.progress>.018||state.mode!==0||Math.abs(state.velocity??0)>.035)return false;
    if(run.units.filter(other=>other.edgeId===edge.id&&other.state==='riding').length>=(edge.capacity??3))return false;
  }else if(run.units.some(other=>other.id!==unit.id&&other.edgeId===edge.id&&!other.returning&&!['lost','saved'].includes(other.state)&&other.distance<SPACING*geometryScale(level)))return false;
  return true;
}

function depart(run:WorldRun,level:WorldLevel,unit:Creature,nodeId:string):boolean {
  const node=nodeFor(level,nodeId);
  if(node.kind==='weight'&&run.devices[node.deviceId!]?.mode!==1)return false;
  const station=stationDevice(level,nodeId);
  if(station?.mechanics&&station.kind==='gate'&&(run.devices[station.id].mode!==1||run.devices[station.id].progress<.999))return false;
  const options=level.edges.filter(edge=>edge.from===nodeId).sort((a,b)=>(b.priority??0)-(a.priority??0));
  const next=options.find(edge=>canEnter(run,level,edge,unit));
  if(!next)return false;
  const destination=nodeFor(level,next.to);
  if(next.kind==='lift'||stationDevice(level,destination.id)){
    const capacity=next.kind==='lift'?(next.capacity??3):(destination.capacity??3);
    const occupied=new Set(run.units.filter(other=>other!==unit&&!other.returning&&!['queued','saved','lost'].includes(other.state)
      &&(next.kind==='lift'?other.edgeId===next.id:(other.edgeId===null&&other.nodeId===destination.id)||edgeFor(level,other.edgeId)?.to===destination.id))
      .map(other=>other.formationSlot).filter(slot=>slot!==null&&slot!==undefined));
    unit.formationSlot=Array.from({length:capacity},(_,slot)=>slot).find(slot=>!occupied.has(slot))??0;
  }else unit.formationSlot=null;
  unit.nodeId=nodeId;unit.edgeId=next.id;unit.distance=0;unit.waitTime=0;
  unit.returning=false;unit.returnEdges=[];
  unit.state=next.kind==='lift'?'riding':'walking';
  const visitors=run.passages[next.id]??=[];if(!visitors.includes(unit.id))visitors.push(unit.id);
  for(const gate of next.gates??[]){
    const definition=deviceFor(level,gate.deviceId),state=run.devices[gate.deviceId];
    if(!definition?.autoCloseAfter||state.mode!==1)continue;
    const held=definition.holdOpenDeviceId?run.devices[definition.holdOpenDeviceId]:undefined;
    if(held?.mode===1&&held.progress>=.99)continue;
    state.released=(state.released??0)+1;
    if(state.released>=definition.autoCloseAfter){state.mode=0;run.message='Un éclaireur est passé. La barrière s’est refermée pour protéger les suivants.';}
  }
  // Keep the feet where they are. Boarding a cradle/edge uses a short walked
  // approach in the next tick rather than snapping to the shared route origin.
  return true;
}

/** Find a real walk back to a junction whose selected route has changed.
 * Lift shafts, hazards and latched weight stations are never invented shortcuts.
 */
function returnPath(run:WorldRun,level:WorldLevel,nodeId:string,incomingId:string|null,unitId:number):string[]|null {
  const pending=[{nodeId,edges:[] as string[]}],visited=new Set<string>();
  while(pending.length){
    const current=pending.shift()!;
    if(visited.has(current.nodeId))continue;
    visited.add(current.nodeId);
    const node=nodeFor(level,current.nodeId);
    if(node.kind==='checkpoint')continue;
    if(node.kind==='weight'){
      const definition=deviceFor(level,node.deviceId!)!,state=run.devices[node.deviceId!];
      const approaching=run.units.filter(unit=>!unit.returning&&!['queued','saved','lost'].includes(unit.state)
        &&unit.edgeId!==null&&edgeFor(level,unit.edgeId)?.to===node.id).length;
      if(current.edges.length>0||state.mode===1||state.load+approaching>=(definition.requiredLoad??1))continue;
    }
    for(const edge of level.edges.filter(candidate=>candidate.to===current.nodeId)){
      if(current.edges.length===0&&incomingId&&edge.id!==incomingId)continue;
      if(!run.passages[edge.id]?.includes(unitId))continue;
      if(!['ground','drawn'].includes(edge.kind)||(edge.drawingId&&!run.drawings[edge.drawingId]))continue;
      const edges=[...current.edges,edge.id];
      if(edge.route&&run.devices[edge.route.deviceId]?.mode!==edge.route.mode)return edges;
      // A still-selected junction can lie between this dead end and an older
      // junction that the player has changed. In a double balance, stopping
      // at the second fork would strand every possible porter beyond the
      // first, unfilled plateau. Follow only this companion's real route;
      // checkpoints, weight stations and one-way mechanisms still bound it.
      pending.push({nodeId:edge.from,edges});
    }
  }
  return null;
}

function recallStranded(run:WorldRun,level:WorldLevel,unit:Creature,nodeId:string):boolean {
  // A prepared ordinary exit keeps its queue. A full or absent lift may let
  // its waiting passengers return to their own changed upstream junction;
  // otherwise an autonomous lift could retain every missing counterweight.
  // returnPath still requires a real previously used route and changed fork.
  if(level.edges.some(edge=>edge.from===nodeId&&routePrepared(run,level,edge,unit)
    &&(edge.kind!=='lift'||canEnter(run,level,edge,unit))))return false;
  const incoming=edgeFor(level,unit.edgeId);
  const edges=returnPath(run,level,nodeId,incoming?.to===nodeId?incoming.id:null,unit.id);
  if(!edges?.length)return false;
  const first=edgeFor(level,edges[0])!,length=pathLength(getEdgePath(run,level,first));
  // The companions queued on this same path turn together; their spacing and
  // their feet remain where they were rather than jumping back to the junction.
  for(const companion of run.units){
    if(companion!==unit&&(companion.edgeId!==first.id||companion.returning||['queued','saved','lost','riding'].includes(companion.state)))continue;
    const ownEdges=companion===unit?edges:returnPath(run,level,nodeId,first.id,companion.id);
    if(!ownEdges?.length||ownEdges[0]!==first.id)continue;
    const oldDistance=companion.edgeId===first.id?companion.distance:length;
    companion.nodeId=first.to;companion.edgeId=first.id;companion.distance=Math.max(0,length-oldDistance);
    companion.returning=true;companion.returnEdges=[...ownEdges];companion.state='walking';companion.waitTime=0;
    companion.formationSlot=null;
  }
  run.message='L’aiguillage a changé : les compagnons bloqués reviennent à pied choisir l’autre chemin.';
  return true;
}

/** Reaching a junction finishes the return even if its selected exit is full.
 * Keeping the old edge here would block the next returning porter, whose
 * reserved place is precisely what this waiting companion needs to depart. */
function settleReturnedCompanion(unit:Creature,nodeId:string):void {
  unit.nodeId=nodeId;unit.edgeId=null;unit.distance=0;unit.returning=false;unit.returnEdges=[];
  unit.formationSlot=null;unit.state='waiting';
}

function arrive(run:WorldRun,level:WorldLevel,unit:Creature,edge:RouteEdge):void {
  if(unit.returning){
    // A physically recalled scout gives its unfinished reservation back.
    // Otherwise a late return could leave the permitted identities behind
    // a queue of companions who are no longer allowed onto the branch.
    if(edge.maxPassages!==undefined)run.passages[edge.id]=(run.passages[edge.id]??[]).filter(id=>id!==unit.id);
    const remaining=(unit.returnEdges??[]).slice(1),nodeId=edge.from;
    if(remaining.length){
      const next=edgeFor(level,remaining[0])!;
      if(next.drawingId&&!run.drawings[next.drawingId]){unit.state='waiting';return;}
      unit.nodeId=nodeId;unit.edgeId=remaining[0];unit.distance=0;
      unit.returnEdges=remaining;unit.state='walking';unit.waitTime=0;
    }else{
      settleReturnedCompanion(unit,nodeId);
      if(!depart(run,level,unit,nodeId))unit.waitTime+=FIXED_STEP;
    }
    return;
  }
  const node=nodeFor(level,edge.to);
  const visitors=run.visits[node.id]??=[];
  if(!visitors.includes(unit.id)){
    visitors.push(unit.id);
    const trigger=node.arrivalTrigger;
    const triggerDevice=trigger?deviceFor(level,trigger.deviceId):undefined;
    if(trigger&&visitors.length>=trigger.minVisitors&&!(triggerDevice?.mechanics&&triggerDevice.weightNodes?.length)){
      const state=run.devices[trigger.deviceId];
      if(state&&state.mode!==trigger.mode){state.mode=trigger.mode;emit(run,{type:'device',deviceId:trigger.deviceId,x:node.x,y:node.y});
        run.message=`${deviceFor(level,trigger.deviceId)?.label??'Le relais'} est activé par les éclaireurs.`;}
    }
  }
  if(node.kind==='goal'){
    unit.state='saved';unit.savedAt=run.time;unit.edgeId=null;unit.nodeId=node.id;unit.x=node.x;unit.y=node.y;run.saved++;
    emit(run,{type:'saved',x:unit.x,y:unit.y,unitId:unit.id});return;
  }
  if(stationDevice(level,node.id)){
    unit.nodeId=node.id;unit.edgeId=null;unit.state='waiting';unit.waitTime=0;
    emit(run,{type:'wait',x:unit.x,y:unit.y,unitId:unit.id});return;
  }
  if(!depart(run,level,unit,node.id)){
    if(recallStranded(run,level,unit,node.id))return;
    if(unit.state!=='waiting')emit(run,{type:'wait',x:unit.x,y:unit.y,unitId:unit.id});
    unit.state='waiting';
  }
}

function lose(run:WorldRun,unit:Creature):void {
  unit.state='lost';unit.lostAt=run.time;unit.fallVelocity=-100;run.lost++;
  emit(run,{type:'lost',x:unit.x,y:unit.y,unitId:unit.id});
}

function simulateStep(run:WorldRun,level:WorldLevel,dt:number):void {
  run.time+=dt;
  updateDevices(run,level,dt);
  if(run.spawned<level.total&&run.time>=run.nextSpawn){
    const unit=run.units.find(candidate=>candidate.state==='queued');
    if(unit&&depart(run,level,unit,level.spawn)){
      run.spawned++;run.nextSpawn=run.time+level.spawnInterval;
      emit(run,{type:'spawn',x:unit.x,y:unit.y,unitId:unit.id});
    }
  }
  for(const unit of run.units){
    if(unit.state==='queued'||unit.state==='saved')continue;
    if(unit.state==='lost'){
      if(unit.y<level.height+200){unit.fallVelocity+=450*dt;unit.y+=unit.fallVelocity*dt;unit.x+=unit.direction*30*dt;}
      continue;
    }
    if(unit.edgeId===null){
      const node=nodeFor(level,unit.nodeId);
      const station=stationDevice(level,node.id);
      if(station){
        const target=stationPosition(run,level,unit),gap=distance(unit,target),step=Math.min(gap,level.pace*dt);
        if(gap>geometryScale(level)){
          unit.direction=target.x>=unit.x?1:-1;unit.x+=(target.x-unit.x)*step/gap;unit.y+=(target.y-unit.y)*step/gap;
          unit.walkTime+=step/level.pace;unit.waitTime=0;continue;
        }
      }
      unit.waitTime+=dt;
      if(!depart(run,level,unit,unit.nodeId))recallStranded(run,level,unit,unit.nodeId);
      continue;
    }
    const edge=edgeFor(level,unit.edgeId)!;
    if(unit.returning&&edge.drawingId&&!run.drawings[edge.drawingId]){
      unit.state='waiting';unit.waitTime+=dt;continue;
    }
    if(edge.kind==='lift'){
      const definition=deviceFor(level,edge.deviceId!)!,state=run.devices[definition.id];
      const slot=unit.formationSlot??unit.id%3;
      const low=definition.low??edge.path[0],high=definition.high??edge.path[edge.path.length-1];
      const slotX=low.x+(high.x-low.x)*state.progress+(slot-((edge.capacity??3)-1)/2)*36*geometryScale(level);
      const platformY=low.y+(high.y-low.y)*state.progress;
      if(state.progress<=.018&&unit.distance<1){
        const gap=slotX-unit.x,step=level.pace*dt;
        unit.x+=Math.sign(gap)*Math.min(Math.abs(gap),step);unit.y=platformY;
        if(Math.abs(gap)<=step)unit.distance=1;
        unit.walkTime+=Math.min(Math.abs(gap),step)/level.pace;
      }else{
        unit.x=slotX;unit.y=platformY;unit.distance=1;
      }
      unit.waitTime+=dt;
      if(state.progress>=.995&&state.mode===1&&Math.abs(state.velocity??0)<.035){
        const to=nodeFor(level,edge.to);
        // The next edge walks the few remaining centimetres from the lift
        // platform to the fixed landing, keeping its real point of contact.
        if(!depart(run,level,unit,to.id))unit.state='riding';
      }
      continue;
    }
    const normalPath=getEdgePath(run,level,edge),points=unit.returning?[...normalPath].reverse():normalPath,length=pathLength(points);
    const start=points[0];
    if(unit.distance===0&&distance(unit,start)>1){
      const gap=distance(unit,start),step=Math.min(gap,level.pace*dt);
      unit.direction=start.x>=unit.x?1:-1;unit.x+=(start.x-unit.x)*step/gap;unit.y+=(start.y-unit.y)*step/gap;
      unit.walkTime+=step/level.pace;unit.state='walking';continue;
    }
    if(unit.distance>=length-.05){unit.waitTime+=dt;arrive(run,level,unit,edge);continue;}
    const pace=level.pace*(.94+(unit.id%5)*.025)*(edge.kind==='hazard'?1.45:1);
    let target=Math.min(length,unit.distance+pace*dt);
    for(const other of run.units){
      if(other.id===unit.id||other.edgeId!==edge.id||!!other.returning!==!!unit.returning||['lost','saved','queued'].includes(other.state))continue;
      if(other.distance>unit.distance+.01||(Math.abs(other.distance-unit.distance)<.01&&other.id<unit.id))target=Math.min(target,Math.max(unit.distance,other.distance-SPACING*geometryScale(level)));
    }
    const moved=target-unit.distance;
    unit.distance=target;
    const position=pointAlongPath(points,target);unit.x=position.x;unit.y=position.y;unit.direction=position.direction;
    if(moved>.001){unit.state='walking';unit.walkTime+=moved/level.pace;unit.waitTime=0;}else{unit.state='waiting';unit.waitTime+=dt;}
    if(edge.kind==='hazard'&&edge.deviceId){
      const definition=deviceFor(level,edge.deviceId)!;
      const bob=getPendulumPosition(definition,run.time,run);
      const body={x:unit.x,y:unit.y-level.creatureHeight*.4};
      if(distance(body,bob)<(definition.radius??40)+level.creatureHeight*.22){lose(run,unit);continue;}
    }
    if(unit.distance>=length-.05)arrive(run,level,unit,edge);
  }
  if(level.sectors)updatePhysicalCheckpoint(run,level);
  if(level.sectors&&run.lost>level.total-level.rescueTarget){
    run.phase='lost';run.message='La troupe ne peut plus atteindre le refuge. Reviens au dernier souvenir.';return;
  }
  if(run.spawned===level.total&&run.saved+run.lost===level.total){
    run.phase=run.saved>=level.rescueTarget?'won':'lost';
    run.message=run.phase==='won'?(run.saved===level.total?'Toute la troupe est réunie !':'Le refuge s’illumine. Tu peux revenir sauver tout le monde.'):'Le refuge attend encore des compagnons. Reprends ton dernier geste.';
    if(run.phase==='won'){recordAct(run,level);emit(run,{type:'win'});}
  }
}

/** Fixed simulation ticks make physics, spacing and hazards independent of render cadence. */
export function updateRun(run:WorldRun,level:WorldLevel,dt:number):GameEvent[] {
  level=getActiveAct(level,run);
  run.events=[];
  if(run.phase!=='playing'||run.levelId!==level.id||!Number.isFinite(dt)||dt<=0)return run.events;
  run.accumulator+=Math.min(dt,.5)*run.speed;
  let ticks=0;
  while(run.accumulator+1e-9>=FIXED_STEP&&run.phase==='playing'&&ticks<61){
    run.accumulator-=FIXED_STEP;if(run.accumulator<0)run.accumulator=0;
    simulateStep(run,level,FIXED_STEP);ticks++;
  }
  return run.events;
}

/** A checkpoint is a flat snapshot: never recursively embed earlier checkpoints. */
function snapshotCore(run:RunSnapshot):RunSnapshot {
  return {version:3,mechanicsRevision:run.mechanicsRevision??MECHANICS_REVISION,geometryRevision:run.geometryRevision??3,migratedInkLimit:run.migratedInkLimit,autoCheckpointId:run.autoCheckpointId??null,levelId:run.levelId,actIndex:run.actIndex??0,actResults:copyActResults(run.actResults??[]),phase:run.phase,time:run.time,speed:run.speed,
    units:run.units.map(unit=>({...unit,returning:unit.returning===true,returnEdges:[...(unit.returnEdges??[])]})),devices:Object.fromEntries(Object.entries(run.devices).map(([id,state])=>[id,{...state}])),
    drawings:copyDrawings(run.drawings),spawned:run.spawned,saved:run.saved,lost:run.lost,nextSpawn:run.nextSpawn,accumulator:run.accumulator,edits:run.edits,retries:run.retries,
    visits:copyVisits(run.visits??{}),passages:copyVisits(run.passages??{}),checkpoint:null};
}
function rememberGestureCheckpoint(run:WorldRun,level:WorldLevel):void {
  if(!level.sectors)run.checkpoint=snapshotCore(run);
}
function updatePhysicalCheckpoint(run:WorldRun,level:WorldLevel):void {
  if(run.spawned<level.total||run.units.some(unit=>!['saved','lost'].includes(unit.state)&&edgeFor(level,unit.edgeId)?.kind==='hazard'))return;
  const previous=level.nodes.find(node=>node.id===run.autoCheckpointId)?.x??-1;
  const survivors=run.units.filter(unit=>unit.state!=='lost');
  const candidate=level.nodes.filter(node=>node.kind==='checkpoint'&&node.x>previous
    &&survivors.every(unit=>(run.visits[node.id]??[]).includes(unit.id)&&unit.x>=node.x-.05&&!unit.returning))
    .sort((a,b)=>b.x-a.x)[0];
  if(!candidate)return;
  run.autoCheckpointId=candidate.id;run.checkpoint=snapshotCore(run);
  run.message=`${candidate.checkpointLabel??'Souvenir'} : la troupe est réunie.`;
  emit(run,{type:'device',x:candidate.x,y:candidate.y,deviceId:candidate.id});
}
export function saveRun(run:WorldRun):RunSnapshot {
  return {...snapshotCore(run),checkpoint:run.checkpoint?snapshotCore(run.checkpoint):null};
}

const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** Used only while migrating geometry: keep an originally safe crossing from
 * becoming a surprise collision solely because its illustration moved. */
function remainingHazardCollides(run:WorldRun,level:WorldLevel,unit:Creature):boolean {
  const edge=edgeFor(level,unit.edgeId);
  if(edge?.kind!=='hazard'||!edge.deviceId||unit.returning)return false;
  const definition=deviceFor(level,edge.deviceId)!,path=getEdgePath(run,level,edge);
  const pace=level.pace*(.94+(unit.id%5)*.025)*1.45,duration=Math.max(0,pathLength(path)-unit.distance)/pace;
  const lock=definition.lockDeviceId?run.devices[definition.lockDeviceId]:undefined;
  const lockDefinition=definition.lockDeviceId?deviceFor(level,definition.lockDeviceId):undefined;
  const projected=lock?{...run,devices:{...run.devices,[definition.lockDeviceId!]:{...lock}}}:run;
  for(let tick=0;tick<=Math.ceil(duration/FIXED_STEP);tick++){
    const elapsed=Math.min(duration,tick*FIXED_STEP),point=pointAlongPath(path,unit.distance+pace*elapsed);
    if(lock?.mode===1)projected.devices[definition.lockDeviceId!].progress=Math.min(1,lock.progress+elapsed/(lockDefinition?.duration??.35));
    const bob=getPendulumPosition(definition,run.time+elapsed,projected);
    if(distance({x:point.x,y:point.y-level.creatureHeight*.4},bob)<(definition.radius??40)+level.creatureHeight*.22)return true;
  }
  return false;
}

/** The old sinusoidal apparatus has an exactly recoverable pose and velocity.
 * Keep that state when moving it into the inertial pivot, including a brake
 * which had already parked it. Other old mechanisms have no velocity record. */
function restoreLegacyMechanics(run:WorldRun,level:WorldLevel,time:number):void {
  for(const definition of level.devices){
    if(!definition.mechanics)continue;
    const state=run.devices[definition.id];state.velocity=0;state.rotorVelocity=0;
    if(definition.weightNodes?.length)state.anchorOffset=-(definition.mechanics.travel??88)*state.progress;
    if(definition.kind!=='pendulum'){initializeMechanism(definition,state,time);continue;}
    const phase=time/(definition.duration??7)*Math.PI*2+(definition.phase??0);
    const brake=definition.lockDeviceId?run.devices[definition.lockDeviceId]:undefined;
    const held=brake?.mode===1?brake.progress:0;
    state.angle=Math.sin(phase)*.95*(1-held)+.95*held;
    state.angularVelocity=Math.cos(phase)*.95*Math.PI*2/(definition.duration??7)*(1-held);
    initializeMechanism(definition,state,time);
  }
}

/** Reproject a validated earlier journey onto authored artwork. The topology
 * and identities stay intact; only distances and physical locations change.
 */
function migrateGeometry(raw:Record<string,unknown>,level:WorldLevel):Record<string,unknown>|null {
  const previous=level.previousGeometry;
  if(!previous)return null;
  const oldLevel:WorldLevel={...level,...previous,pace:previous.pace??96,previousGeometry:undefined};
  const oldRun=restoreRun({...raw,checkpoint:null},oldLevel,false);
  if(!oldRun)return null;
  const migrated:WorldRun={...oldRun,geometryRevision:level.revision??3,drawings:{},units:[],
    devices:Object.fromEntries(Object.entries(oldRun.devices).map(([id,state])=>[id,{...state}]))};
  if(raw.mechanicsRevision===undefined)restoreLegacyMechanics(migrated,level,oldRun.time);
  for(const [id,route] of Object.entries(oldRun.drawings)){
    const oldDrawing=oldLevel.drawings.find(drawing=>drawing.id===id),drawing=level.drawings.find(candidate=>candidate.id===id);
    if(!oldDrawing||!drawing)return null;
    const ox=oldDrawing.to.x-oldDrawing.from.x,oy=oldDrawing.to.y-oldDrawing.from.y,oldReach=Math.hypot(ox,oy);
    const nx=drawing.to.x-drawing.from.x,ny=drawing.to.y-drawing.from.y,reach=Math.hypot(nx,ny);
    if(oldReach<1||reach<1)return null;
    const perpendicularScale=Math.min(drawing.corridor/oldDrawing.corridor,reach/oldReach);
    const points=route.points.map(point=>{
      const px=point.x-oldDrawing.from.x,py=point.y-oldDrawing.from.y;
      const along=(px*ox+py*oy)/(oldReach*oldReach),across=(ox*py-oy*px)/oldReach*perpendicularScale;
      return {x:clamp(drawing.from.x+nx*along-ny/reach*across,0,level.width),
        y:clamp(drawing.from.y+ny*along+nx/reach*across,0,level.height)};
    });
    points[0]={...drawing.from};points[points.length-1]={...drawing.to};
    migrated.drawings[id]={...route,points,inkLength:pathLength(points)};
  }
  const resize=level.height/oldLevel.height;
  migrated.units=oldRun.units.map(unit=>{
    const next={...unit,returnEdges:[...unit.returnEdges]};
    if(unit.state==='lost'){next.x=clamp(unit.x/oldLevel.width*level.width,0,level.width);next.y=level.height+300;return next;}
    if(unit.state==='saved'||unit.state==='queued'){
      const node=nodeFor(level,unit.state==='saved'?level.goal:level.spawn);next.x=node.x;next.y=node.y;return next;
    }
    const oldEdge=edgeFor(oldLevel,unit.edgeId),edge=edgeFor(level,unit.edgeId);
    if(oldEdge&&edge){
      if(unit.state==='riding'&&edge.kind==='lift'){
        const definition=deviceFor(level,edge.deviceId!)!,state=migrated.devices[definition.id];
        const low=definition.low??edge.path[0],high=definition.high??edge.path.at(-1)!;
        next.x=low.x+(high.x-low.x)*state.progress+((unit.formationSlot??unit.id%3)-((edge.capacity??3)-1)/2)*36*geometryScale(level);
        next.y=low.y+(high.y-low.y)*state.progress;
      }else{
        const oldPath=getEdgePath(oldRun,oldLevel,oldEdge),path=getEdgePath(migrated,level,edge);
        const fraction=clamp(unit.distance/Math.max(1,pathLength(oldPath)),0,1);
        next.distance=fraction*pathLength(path);
        const oriented=unit.returning?[...path].reverse():path;
        Object.assign(next,pointAlongPath(oriented,next.distance));
        const oldStart=unit.returning?oldPath.at(-1)!:oldPath[0];
        if(unit.distance===0&&distance(unit,oldStart)>1){
          next.x=oriented[0].x+(unit.x-oldStart.x)*resize;next.y=oriented[0].y+(unit.y-oldStart.y)*resize;
        }
      }
    }else{
      const oldNode=nodeFor(oldLevel,unit.nodeId),node=nodeFor(level,unit.nodeId);
      next.x=node.x+(unit.x-oldNode.x)*resize;next.y=node.y+(unit.y-oldNode.y)*resize;
    }
    return next;
  });
  for(const unit of migrated.units){
    if(['queued','saved','lost'].includes(unit.state)||!remainingHazardCollides(migrated,level,unit)
      ||remainingHazardCollides(oldRun,oldLevel,oldRun.units[unit.id]))continue;
    const edge=edgeFor(level,unit.edgeId)!,bank=nodeFor(level,edge.from);
    Object.assign(unit,{nodeId:bank.id,edgeId:null,distance:0,x:bank.x,y:bank.y,state:'waiting',returning:false,returnEdges:[],formationSlot:null,waitTime:0});
    for(const gate of edge.gates??[]){
      const definition=deviceFor(level,gate.deviceId);
      if(definition?.kind==='gate'&&definition.playerControlled!==false)Object.assign(migrated.devices[gate.deviceId],{mode:0,progress:0,released:0});
    }
  }
  const used=Object.values(migrated.drawings).reduce((sum,drawing)=>sum+drawing.inkLength,0);
  if(level.inkBudget!==undefined&&used>level.inkBudget)migrated.migratedInkLimit=used;
  return {...snapshotCore(migrated),checkpoint:raw.checkpoint};
}

export function restoreRun(raw:unknown,level:WorldLevel,restoreCheckpoint=true):WorldRun|null {
  const world=canonicalWorld(level);
  if(!isRecord(raw)||raw.levelId!==world.id||!Array.isArray(raw.units)||raw.units.length!==world.total)return null;
  if(raw.version===1||raw.version===2){
    const migrated=createRun(world);
    migrated.message='Le paysage est devenu une grande aventure continue. La nouvelle troupe attend au départ ; les anciens records restent dans le carnet.';
    return migrated;
  }
  if(raw.version!==3||!Number.isInteger(raw.actIndex)||finite(raw.actIndex)<0||finite(raw.actIndex)>=getActCount(world))return null;
  const actIndex=finite(raw.actIndex);
  const legacyMechanics=raw.mechanicsRevision===undefined;
  level=getActiveAct(world,{actIndex});
  const revision=raw.geometryRevision??3;
  if(revision!==(level.revision??3)){
    if(revision!==level.previousGeometry?.revision)return null;
    const migrated=migrateGeometry(raw,level);if(!migrated)return null;raw=migrated;
  }
  if(!isRecord(raw)||!Array.isArray(raw.units))return null;
  if(!Array.isArray(raw.actResults)||raw.actResults.length<actIndex||raw.actResults.length>actIndex+1)return null;
  const actResults:ActResult[]=[];
  for(let index=0;index<raw.actResults.length;index++){
    const result=raw.actResults[index],definition=getActiveAct(world,{actIndex:index});
    if(!isRecord(result)||result.index!==index||result.key!==(definition.actKey??definition.id)||!Array.isArray(result.lostIds)
      ||result.lostIds.some(id=>!Number.isInteger(id)||typeof id!=='number'||id<0||id>=world.total)||new Set(result.lostIds).size!==result.lostIds.length
      ||finite(result.saved,-1)!==world.total-result.lostIds.length||finite(result.lost,-1)!==result.lostIds.length
      ||finite(result.time,-1)<0||finite(result.inkUsed,-1)<0)return null;
    const lostIds=result.lostIds as number[];
    if(actResults[index-1]?.lostIds.some(id=>!lostIds.includes(id)))return null;
    actResults.push({index,key:definition.actKey??definition.id,saved:finite(result.saved),lost:lostIds.length,lostIds:[...lostIds],
      time:finite(result.time),inkUsed:finite(result.inkUsed),mastered:result.mastered===true});
  }
  const run=createActRun(world,actIndex,actResults);
  if(isRecord(raw.devices))for(const definition of level.devices){
    const candidate=raw.devices[definition.id];
    if(isRecord(candidate)){
      const state=run.devices[definition.id]={mode:clamp(Math.floor(finite(candidate.mode,definition.initialMode)),0,definition.modes.length-1),progress:clamp(finite(candidate.progress),0,1),load:0,released:Math.max(0,Math.floor(finite(candidate.released)))} as typeof run.devices[string];
      if(definition.mechanics){
        state.velocity=clamp(finite(candidate.velocity),-4,4);state.rotorAngle=clamp(finite(candidate.rotorAngle),-1e6,1e6);
        state.rotorVelocity=clamp(finite(candidate.rotorVelocity),-200,200);state.receivedForce=clamp(finite(candidate.receivedForce),0,1e6);
        const travel=definition.mechanics.travel??88;
        state.anchorOffset=clamp(finite(candidate.anchorOffset,legacyMechanics&&definition.weightNodes?.length?-travel*state.progress:0),-Math.max(200,travel),Math.max(200,travel));
        if(definition.kind==='pendulum'){
          state.angle=typeof candidate.angle==='number'&&Number.isFinite(candidate.angle)?clamp(candidate.angle,-Math.PI*2,Math.PI*2)
            :Math.sin(finite(raw.time)/(definition.duration??7)*Math.PI*2+(definition.phase??0))*.95;
          state.angularVelocity=clamp(finite(candidate.angularVelocity),-12,12);
        }
        initializeMechanism(definition,state,finite(raw.time));
      }
    }
  }
  if(legacyMechanics)restoreLegacyMechanics(run,level,finite(raw.time));
  if(isRecord(raw.drawings))for(const definition of level.drawings){
    const candidate=raw.drawings[definition.id];
    if(!isRecord(candidate)||!Array.isArray(candidate.points)||candidate.points.length<2||candidate.points.length>700)continue;
    const points:Point[]=[];
    for(const point of candidate.points){
      if(!isRecord(point)||typeof point.x!=='number'||typeof point.y!=='number'||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>level.width||point.y<0||point.y>level.height){points.length=0;break;}
      points.push({x:point.x,y:point.y});
    }
    if(points.length<2||distance(points[0],definition.from)>1||distance(points[points.length-1],definition.to)>1||pathLength(points)>definition.inkLimit+.01
      ||points.some(point=>pointSegmentDistance(point,definition.from,definition.to)>definition.corridor))continue;
    run.drawings[definition.id]={points,inkLength:pathLength(points),createdAt:Math.max(0,finite(candidate.createdAt))};
  }
  const carriedInk=finite(raw.migratedInkLimit),maximumInk=level.drawings.reduce((sum,drawing)=>sum+drawing.inkLimit,0);
  if(carriedInk>0&&carriedInk<=maximumInk)run.migratedInkLimit=carriedInk;
  if(level.inkBudget!==undefined&&Object.values(run.drawings).reduce((sum,route)=>sum+route.inkLength,0)>Math.max(level.inkBudget,run.migratedInkLimit??0)+.01)return null;
  for(const field of ['visits','passages'] as const){
    if(!isRecord(raw[field]))return null;
    for(const [id,ids] of Object.entries(raw[field])){
      const exists=field==='visits'?level.nodes.some(node=>node.id===id):level.edges.some(edge=>edge.id===id);
      if(!exists||!Array.isArray(ids)||ids.some(value=>!Number.isInteger(value)||typeof value!=='number'||value<0||value>=level.total)||new Set(ids).size!==ids.length)return null;
      run[field][id]=[...ids] as number[];
    }
  }
  const validStates=['queued','walking','waiting','riding','saved','lost'];
  for(let index=0;index<level.total;index++){
    const unit=raw.units[index];
    if(!isRecord(unit)||unit.id!==index||typeof unit.state!=='string'||!validStates.includes(unit.state)||typeof unit.nodeId!=='string'||!level.nodes.some(node=>node.id===unit.nodeId))return null;
    const edgeId=unit.edgeId===null?null:typeof unit.edgeId==='string'&&edgeFor(level,unit.edgeId)?unit.edgeId:null;
    if(unit.edgeId!==null&&edgeId===null)return null;
    const edge=edgeFor(level,edgeId);
    if(edge?.drawingId&&!run.drawings[edge.drawingId]&&unit.returning!==true)return null;
    if(['walking','riding'].includes(unit.state)&&!edge)return null;
    if(unit.state==='riding'&&edge?.kind!=='lift')return null;
    const returning=unit.returning===true;
    const returnEdges=Array.isArray(unit.returnEdges)&&unit.returnEdges.every(id=>typeof id==='string'&&edgeFor(level,id))?unit.returnEdges as string[]:[];
    if(returning&&(!edge||returnEdges[0]!==edge.id||returnEdges.some((id,index)=>{
      const part=edgeFor(level,id)!;
      return !['ground','drawn'].includes(part.kind)
        ||(index>0&&edgeFor(level,returnEdges[index-1])!.from!==part.to);
    })))return null;
    const x=finite(unit.x,NaN),y=finite(unit.y,NaN);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x< -300||x>level.width+300||y< -300||y>level.height+500)return null;
    run.units[index]={...run.units[index],state:unit.state as Creature['state'],nodeId:unit.nodeId,edgeId,x,y,returning,returnEdges:returning?[...returnEdges]:[],
      formationSlot:Number.isInteger(unit.formationSlot)&&finite(unit.formationSlot,-1)>=0&&finite(unit.formationSlot)>=0&&finite(unit.formationSlot)<level.total?finite(unit.formationSlot):null,
      distance:edge?clamp(finite(unit.distance),0,pathLength(getEdgePath(run,level,edge))):0,
      direction:unit.direction===-1?-1:1,walkTime:Math.max(0,finite(unit.walkTime)),waitTime:Math.max(0,finite(unit.waitTime)),
      savedAt:typeof unit.savedAt==='number'&&Number.isFinite(unit.savedAt)?Math.max(0,unit.savedAt):null,
      lostAt:typeof unit.lostAt==='number'&&Number.isFinite(unit.lostAt)?Math.max(0,unit.lostAt):null,fallVelocity:clamp(finite(unit.fallVelocity),-500,2000)};
    // Older versions could erase a later bridge in an already committed
    // return walk. Keep the journey; wait at that bridge's real bank instead
    // of rejecting the save or allowing a walk across invisible ground.
    if(returning&&edge?.drawingId&&!run.drawings[edge.drawingId]){
      const bank=nodeFor(level,edge.to);Object.assign(run.units[index],{x:bank.x,y:bank.y,distance:0,state:'waiting'});
    }
    const restored=run.units[index];
    if(restored.returning&&edge&&restored.returnEdges.length===1
      &&restored.distance>=pathLength(getEdgePath(run,level,edge))-.05){
      if(edge.maxPassages!==undefined)run.passages[edge.id]=(run.passages[edge.id]??[]).filter(id=>id!==restored.id);
      settleReturnedCompanion(restored,edge.from);
    }
  }
  run.saved=run.units.filter(unit=>unit.state==='saved').length;run.lost=run.units.filter(unit=>unit.state==='lost').length;
  run.spawned=run.units.filter(unit=>unit.state!=='queued').length;
  // Survivors keep their identity. Previously lost companions are skipped by
  // the next tableau's release order and cannot be resurrected by a save.
  const previousLost=new Set(actResults.find(result=>result.index===actIndex-1)?.lostIds??[]);
  if(run.units.some(unit=>previousLost.has(unit.id)&&unit.state!=='lost'))return null;
  let queuedSeen=false;
  for(const unit of run.units){if(previousLost.has(unit.id))continue;if(unit.state==='queued')queuedSeen=true;else if(queuedSeen)return null;}
  run.time=Math.max(0,finite(raw.time));run.nextSpawn=Math.max(run.time,finite(raw.nextSpawn));run.speed=raw.speed===2?2:1;
  run.edits=Math.max(0,Math.floor(finite(raw.edits)));run.retries=Math.max(0,Math.floor(finite(raw.retries)));
  run.accumulator=clamp(finite(raw.accumulator),0,FIXED_STEP);
  run.phase=run.saved+run.lost===level.total?(run.saved>=level.rescueTarget?'won':'lost'):raw.phase==='ready'&&run.spawned===previousLost.size?'ready':'paused';
  if(level.sectors&&run.lost>level.total-level.rescueTarget)run.phase='lost';
  if(run.phase!=='won'&&actResults.some(result=>result.index===actIndex))return null;
  // Earlier saves allowed Undo to unfasten a cleat after the troupe had used
  // its bridge. Restore only that already-earned support, preserving every
  // position, drawing, selector and unsolved mechanism in the saved journey.
  for(const definition of level.devices)if(legacyMechanics&&committedCleat(run,level,definition)){
    const state=run.devices[definition.id];state.mode=1;state.progress=1;
    const power=definition.powerDeviceId?deviceFor(level,definition.powerDeviceId):undefined;
    if(power?.kind==='wind'&&power.lockDeviceId===definition.id)run.devices[power.id].progress=1;
  }
  updateDevices(run,level,0);if(run.phase==='won')recordAct(run,level);
  if(raw.autoCheckpointId!==null&&raw.autoCheckpointId!==undefined
    &&(typeof raw.autoCheckpointId!=='string'||!level.nodes.some(node=>node.id===raw.autoCheckpointId&&node.kind==='checkpoint')))return null;
  run.autoCheckpointId=typeof raw.autoCheckpointId==='string'?raw.autoCheckpointId:null;
  if(restoreCheckpoint&&isRecord(raw.checkpoint)){
    const checkpoint=restoreRun({...raw.checkpoint,checkpoint:null},world,false);
    if(checkpoint&&checkpoint.time<=run.time)run.checkpoint=snapshotCore(checkpoint);
  }
  if(!run.checkpoint)run.checkpoint=level.sectors?snapshotCore(createRun(world)):snapshotCore(run);
  run.message=level.sectors?'La troupe a retrouvé sa route.':`Tableau ${actIndex+1} retrouvé avec la même troupe. Reprends quand tu es prêt.`;
  return run;
}

function gateReason(run:WorldRun,level:WorldLevel,gate:Gate):string {
  const definition=deviceFor(level,gate.deviceId),state=run.devices[gate.deviceId];
  if(!definition||!state)return 'Ce mécanisme est indisponible.';
  if(gate.minLoad!==undefined&&state.load<gate.minLoad)return `${state.load}/${gate.minLoad} compagnons sur ${definition.label.toLowerCase()}.`;
  if(gate.mode!==undefined&&state.mode!==gate.mode)return `${definition.label} : choisis « ${definition.modes[gate.mode]} ».`;
  if(gate.notMode!==undefined&&state.mode===gate.notMode)return `Change la position de ${definition.label.toLowerCase()}.`;
  if(gate.minProgress!==undefined&&state.progress<gate.minProgress)return `Attends la fin du mouvement de ${definition.label.toLowerCase()}.`;
  return '';
}

function deviceActionReason(run:WorldRun,level:WorldLevel,definition:DeviceDefinition,next:number):string {
  const state=run.devices[definition.id];
  if(definition.playerControlled===false){
    if(definition.mechanics&&definition.weightNodes?.length){
      if(state.mode===1&&state.progress>=.999)return 'Le cliquet retient le câble ; les compagnons peuvent quitter la pédale.';
      if(state.mode===1)return 'Le frein est armé. Sa retenue attend que le balancier s’écarte du passage.';
      return state.load>=(definition.requiredLoad??2)?'Le poids des compagnons enfonce la pédale et tire le câble.':`${state.load}/${definition.requiredLoad??2} compagnons sur la pédale.`;
    }
    const node=level.nodes.find(node=>node.id===definition.activationNodeId),target=node?.arrivalTrigger?.minVisitors??1;
    const count=node?(run.visits[node.id]?.length??0):0;
    return count<target?`${Math.min(count,target)}/${target} éclaireurs arrivés à la borne. Ce mécanisme est actionné par leur passage.`:'La borne a été actionnée par les éclaireurs.';
  }
  if(definition.modes.length<2)return definition.description;
  if(next===state.mode)return '';
  if(next===0&&committedCleat(run,level,definition))return 'Le taquet maintient le passage emprunté par la troupe. Son cran reste engagé.';
  if(definition.kind==='counterweight'&&next===1&&state.load<(definition.requiredLoad??1))return `${state.load}/${definition.requiredLoad??1} porteurs. Envoie les compagnons manquants avant de verrouiller.`;
  if(definition.mechanics&&definition.kind==='counterweight'&&next===1&&(state.progress<.999||Math.abs(state.velocity??0)>.035))return 'Le poids fait encore descendre le plateau. Attends la butée avant d’engager le cran.';
  if(definition.kind==='latch'&&next===1&&definition.powerDeviceId){
    const power=deviceFor(level,definition.powerDeviceId),source=run.devices[definition.powerDeviceId];
    if(power?.mechanics&&(source.progress<.999||Math.abs(source.velocity??0)>.035))return 'La roue remonte encore le pont. Attends que le câble atteigne sa butée avant de le retenir.';
  }
  if(next===0&&(definition.kind==='counterweight'||definition.kind==='latch')){
    const driver=definition.kind==='latch'?definition.powerDeviceId:definition.id;
    if(driver&&level.edges.some(edge=>edge.mechanism?.drivers.includes(driver)&&run.units.some(unit=>unit.edgeId===edge.id&&!['queued','saved','lost'].includes(unit.state))))return 'Le câble soutient un pont occupé. Laisse les compagnons rejoindre le palier avant de libérer le cran.';
  }
  if(definition.kind==='counterweight'&&next===0&&state.load<(definition.requiredLoad??1)
    &&level.edges.some(edge=>edge.maxPassages!==undefined&&(definition.weightNodes??[]).includes(edge.to)&&(run.passages[edge.id]?.length??0)>=edge.maxPassages)){
    return 'Les porteurs ont quitté le plateau. Le cran reste verrouillé pour conserver le passage du reste de la troupe.';
  }
  if(next!==0){const missing=definition.gates?.find(gate=>!gateSatisfied(run,gate));if(missing)return gateReason(run,level,missing);}
  if(definition.kind==='counterweight'&&next===0&&level.edges.some(edge=>edge.gates?.some(gate=>gate.deviceId===definition.id)
    &&run.units.some(unit=>unit.edgeId===edge.id&&!['saved','lost'].includes(unit.state))))return 'Le cran soutient un passage occupé. Laisse la troupe le quitter avant de déverrouiller.';
  return '';
}

function counterweightWaitingReason(run:WorldRun,level:WorldLevel,definition:DeviceDefinition):string {
  const state=run.devices[definition.id],required=definition.requiredLoad??1;
  if(state.mode===0)return state.load>=required?(definition.mechanics&&state.progress<.999?'Le poids des porteurs abaisse le plateau et relève le pont.':'Le plateau est en butée. Engage son cran pour retenir le câble.'):`${state.load}/${required} porteurs sont installés sur le plateau.`;
  const stations=new Set(definition.weightNodes??[]);
  if(!run.units.some(unit=>stations.has(unit.nodeId)&&unit.edgeId===null&&unit.state==='waiting'))return 'Le cran reste engagé pour soutenir la passerelle.';
  const exits=level.edges.filter(edge=>stations.has(edge.from));
  const missing=exits.flatMap(edge=>edge.gates??[]).filter(gate=>!gateSatisfied(run,gate));
  if(missing.some(gate=>deviceFor(level,gate.deviceId)?.playerControlled===false))return 'La borne attend encore des compagnons.';
  if(state.progress<.98)return 'Le plateau n’a pas fini son mouvement.';
  if(missing.length)return `${deviceFor(level,missing[0].deviceId)?.label??'Un mécanisme'} retient encore la sortie.`;
  const ready=exits.filter(edge=>(!edge.drawingId||!!run.drawings[edge.drawingId])&&(!edge.route||run.devices[edge.route.deviceId]?.mode===edge.route.mode));
  if(!ready.length)return exits.some(edge=>edge.drawingId&&!run.drawings[edge.drawingId])?'Il manque encore le passage de retour.':'La sortie du plateau est encore fermée.';
  if(ready.every(edge=>run.units.some(unit=>unit.edgeId===edge.id&&!['lost','saved'].includes(unit.state)&&unit.distance<SPACING*geometryScale(level))))return 'Les porteurs attendent que le passage se libère.';
  return 'Le passage est libre ; les porteurs se mettent en route.';
}

export function getDeviceStatus(run:WorldRun,level:WorldLevel,id:string):DeviceStatus {
  level=getActiveAct(level,run);
  const definition=deviceFor(level,id),state=run.devices[id];
  if(!definition||!state)return {id,label:id,description:'',stateLabel:'Indisponible',load:0,requiredLoad:null,progress:0,actionable:false,nextMode:null,actionLabel:'Indisponible',reason:'Ce mécanisme ne fait pas partie de ce tableau.',modes:[]};
  const held=definition.holdOpenDeviceId?run.devices[definition.holdOpenDeviceId]:undefined;
  const allMayPass=held?.mode===1&&held.progress>=.99;
  const modeLabel=(mode:number)=>definition.autoCloseAfter&&mode===1?(allMayPass?'Laisser passer la troupe':'Laisser passer un éclaireur'):definition.modes[mode];
  const modes=definition.modes.map((_,mode)=>{
    const reason=deviceActionReason(run,level,definition,mode);
    return {mode,label:modeLabel(mode),enabled:mode!==state.mode&&!reason,reason};
  });
  const nextMode=Array.from({length:Math.max(0,definition.modes.length-1)},(_,offset)=>(state.mode+offset+1)%definition.modes.length).find(mode=>modes[mode].enabled)??null;
  let stateLabel=definition.modes[state.mode],reason=definition.description;
  if(definition.kind==='counterweight'&&definition.modes.length>1){
    stateLabel=state.mode===1?'Câble retenu':state.load>=(definition.requiredLoad??1)&&state.progress<.999?'Le plateau descend':`${state.load}/${definition.requiredLoad??1} porteurs`;
    reason=counterweightWaitingReason(run,level,definition);
  }else if(definition.kind==='lift'){
    const capacity=level.edges.find(edge=>edge.deviceId===id&&edge.kind==='lift')?.capacity??3;
    const moving=state.progress>.02&&state.progress<.98;
    stateLabel=`${moving?(state.mode===1?'En montée':'En descente'):state.progress>=.98?'En haut':'En bas'} · ${state.load}/${capacity}`;
    const missing=definition.gates?.find(gate=>!gateSatisfied(run,gate));
    reason=missing?gateReason(run,level,missing):moving?'Laisse l’ascenseur rejoindre son palier.':state.progress>=.98?(state.load?'Les passagers quittent le palier.':'Redescends chercher le groupe suivant.'):state.load?`${state.load} passager(s) à bord. Tu peux faire monter l’ascenseur.`:'Les compagnons montent à bord quand ils atteignent le palier.';
  }else if(definition.kind==='splitter'){
    reason=`Les prochains compagnons prennent « ${stateLabel} ». Ceux qui sont bloqués sur une branche peuvent revenir à pied.`;
  }else if(definition.kind==='wind'&&definition.mechanics){
    const locked=definition.lockDeviceId?run.devices[definition.lockDeviceId]?.mode===1:definition.mechanics.automaticRatchet&&state.progress>=.999;
    stateLabel=state.mode===1?'Le souffle entraîne la roue':'Souffle arrêté';
    reason=locked?'Le taquet retient le câble. Le pont reste au palier, même sans souffle.':state.mode===1?
      ((state.receivedForce??0)>0?'La roue remonte le pont par son treuil.':'La roue est hors du souffle ; le treuil ne reçoit aucune force.'):
      state.progress>0?'Le câble n’est pas retenu : la charge redescend.':'Le pont attend la force de la roue.';
  }else if(definition.kind==='wind'&&definition.modes.length>2){
    reason=state.mode===1?(state.progress>=.96?'Le moulin est en haut. Bloque son taquet avant de détourner le vent.':'Le moulin soulève le support de la passerelle.'):state.mode===2?'Le passage est à l’abri. Un taquet bloqué conserve la hauteur du moulin.':'Le vent gêne le chemin : choisis où le diriger.';
  }
  if(definition.playerControlled===false){
    const node=level.nodes.find(node=>node.id===definition.activationNodeId),target=definition.requiredLoad??node?.arrivalTrigger?.minVisitors??1,count=definition.mechanics&&definition.weightNodes?.length?state.load:node?(run.visits[node.id]?.length??0):0;
    stateLabel=state.mode===1&&state.progress>=.999?'Câble retenu':count<target?`${Math.min(count,target)}/${target} sur la pédale`:state.progress<.99?'La pédale descend':definition.modes[state.mode];
    reason=deviceActionReason(run,level,definition,state.mode);
  }
  if(definition.autoCloseAfter){
    stateLabel=allMayPass?(state.mode?'Passage libre':'Troupe prête'):state.mode?'Un éclaireur autorisé':'Barrière refermée';
    reason=allMayPass?'Le frein est serré : tu peux laisser passer toute la troupe.':'Observe le balancier. Un clic libère un seul éclaireur puis la barrière se referme automatiquement.';
  }
  return {id,label:definition.label,description:definition.description,stateLabel,load:state.load,requiredLoad:definition.requiredLoad??null,progress:state.progress,
    actionable:modes.some(mode=>mode.enabled),nextMode,actionLabel:nextMode===null?'Observer':modeLabel(nextMode),reason,modes};
}

export function getWaitingReason(run:WorldRun,level:WorldLevel,unit:Creature,brief=false):string|null {
  level=getActiveAct(level,run);
  if(unit.state!=='waiting'&&unit.state!=='riding')return null;
  const current=edgeFor(level,unit.edgeId);
  if(current?.kind==='lift'){
    const definition=deviceFor(level,current.deviceId!)!,state=run.devices[definition.id];
    if(!brief)return getDeviceStatus(run,level,definition.id).reason;
    if(definition.gates?.some(gate=>!gateSatisfied(run,gate)))return 'Un mécanisme retient encore la nacelle.';
    if(state.progress>.02&&state.progress<.98)return 'La nacelle est en mouvement.';
    return state.progress>=.98?'Le palier n’est pas encore libre.':'La nacelle attend au palier bas.';
  }
  if(unit.returning){
    const next=edgeFor(level,unit.returnEdges?.[1]??null);
    if((current?.drawingId&&!run.drawings[current.drawingId])
      ||(current&&unit.distance>=pathLength(getEdgePath(run,level,current))-.1&&next?.drawingId&&!run.drawings[next.drawingId]))return 'Le passage de retour est interrompu.';
  }
  if(current&&unit.distance<pathLength(getEdgePath(run,level,current))-.1)return brief?'Un compagnon attend devant.':'La troupe attend son tour sur le chemin.';
  const nodeId=current?(unit.returning?current.from:current.to):unit.nodeId,node=nodeFor(level,nodeId);
  const station=stationDevice(level,nodeId);if(station)return getDeviceStatus(run,level,station.id).reason;
  const options=level.edges.filter(edge=>edge.from===nodeId&&(!edge.route||run.devices[edge.route.deviceId]?.mode===edge.route.mode));
  for(const edge of options){
    if(edge.maxPassages!==undefined&&(run.passages[edge.id]?.length??0)>=edge.maxPassages)return brief?'Ce chemin a déjà son groupe.':'Les éclaireurs sont passés. Oriente maintenant le reste vers l’autre chemin.';
    if(edge.drawingId&&!run.drawings[edge.drawingId])return brief?'Il manque un passage devant la troupe.':`Dessine « ${level.drawings.find(drawing=>drawing.id===edge.drawingId)?.label??'le passage'} » entre ses deux appuis.`;
    if(!supportReady(run,level,edge))return edge.mechanism?.drivers.length===2?'Les deux demi-ponts doivent rejoindre le palier. Charge et retiens chaque câble.':'Le pont n’a pas encore rejoint son palier. Son câble doit finir de le relever.';
    const missing=edge.gates?.find(gate=>!gateSatisfied(run,gate));
    if(missing){
      const device=deviceFor(level,missing.deviceId);
      if(brief){
        if(device?.playerControlled===false)return 'La borne attend encore des compagnons.';
        if(device?.kind==='counterweight')return run.devices[device.id].mode===0?counterweightWaitingReason(run,level,device):'Le plateau n’a pas fini son mouvement.';
        if(device?.kind==='wind')return missing.minProgress!==undefined&&run.devices[device.id].progress<missing.minProgress?'Le moulin n’a pas encore levé le support.':'Le vent retient encore ce passage.';
        if(device?.kind==='latch')return 'Le support n’est pas encore retenu.';
        return 'Un mécanisme retient encore le passage.';
      }
      return device?.playerControlled===false?getDeviceStatus(run,level,missing.deviceId).reason:gateReason(run,level,missing);
    }
    if(edge.kind==='lift'){
      if(!brief)return getDeviceStatus(run,level,edge.deviceId!).reason;
      const state=run.devices[edge.deviceId!];
      return state.progress>.02?'La nacelle n’est pas au palier.':'La nacelle accueille déjà un groupe.';
    }
  }
  return options.length?(brief?'Le passage devant est occupé.':'Le prochain passage accueille déjà des compagnons.'):(brief?'La voie est fermée.':'Choisis une autre direction avec l’aiguillage.');
}

function recordAct(run:WorldRun,level:WorldLevel):void {
  if(run.phase!=='won')return;
  const summary=getRunSummary(run,level),record:ActResult={index:run.actIndex??0,key:level.actKey??level.id,saved:run.saved,lost:run.lost,
    lostIds:run.units.filter(unit=>unit.state==='lost').map(unit=>unit.id),time:run.time,inkUsed:summary.inkUsed,mastered:summary.mastered};
  run.actResults=[...(run.actResults??[]).filter(item=>item.index<record.index),record];
}

export function isJourneyComplete(level:WorldLevel,run:WorldRun):boolean {
  return run.phase==='won'&&(run.actIndex??0)===getActCount(level)-1&&(run.actResults?.length??0)===getActCount(level);
}

export function getRunSummary(run:WorldRun,level:WorldLevel){
  level=getActiveAct(level,run);
  const inkUsed=Math.round(Object.values(run.drawings).reduce((sum,drawing)=>sum+drawing.inkLength,0));
  const mastered=run.saved===level.total&&inkUsed<=level.masteryInk&&gatesSatisfied(run,level.masteryDevices);
  const stars=run.phase==='won'?(level.sectors?clamp(run.saved-level.rescueTarget+1,1,3):1+(run.saved===level.total?1:0)+(mastered?1:0)):0;
  return {phase:run.phase,saved:run.saved,lost:run.lost,total:level.total,target:level.rescueTarget,
    remaining:level.total-run.saved-run.lost,waiting:run.units.filter(unit=>unit.state==='waiting').length,
    time:Math.floor(run.time),inkUsed,drawn:Object.keys(run.drawings).length,canUndo:run.history.length>0,
    speed:run.speed,stars,mastered,masteryGoal:level.masteryGoal,inkAvailable:level.inkBudget===undefined?null:Math.max(0,level.inkBudget-inkUsed),message:run.message};
}

export function getJourneySummary(run:WorldRun,level:WorldLevel){
  const world=canonicalWorld(level),active=getActiveAct(level,run),local=getRunSummary(run,active);
  const results=run.actResults??[],actIndex=run.actIndex??0,actCount=getActCount(world);
  const past=results.filter(result=>result.index<actIndex),time=past.reduce((sum,result)=>sum+result.time,run.time);
  const inkUsed=past.reduce((sum,result)=>sum+result.inkUsed,local.inkUsed);
  const masteryInk=Array.from({length:actCount},(_,index)=>getActiveAct(world,{actIndex:index}).masteryInk).reduce((sum,value)=>sum+value,0);
  const complete=isJourneyComplete(world,run),mastered=complete&&run.saved===world.total&&inkUsed<=masteryInk;
  const stars=complete?(world.sectors?clamp(run.saved-world.rescueTarget+1,1,3):1+(run.saved===world.total?1:0)+(mastered?1:0)):0;
  const objectives=(active.objectives??[]).map(objective=>{
    let current:number|undefined,target:number|undefined;
    const complete=objective.conditions.every(condition=>{
      if(condition.kind==='drawing')return !!run.drawings[condition.id];
      if(condition.kind==='device')return gateSatisfied(run,condition.gate);
      if(condition.kind==='visitors'){current=Math.min(condition.count,run.visits[condition.nodeId]?.length??0);target=condition.count;return current>=target;}
      current=run.saved;target=world.total-run.lost;return run.saved>=target;
    });
    return {id:objective.id,label:objective.label,complete,current,target};
  });
  const acts=Array.from({length:actCount},(_,index)=>{
    const record=results.find(result=>result.index===index),act=getActiveAct(world,{actIndex:index});
    return {index,title:act.stageName,status:record?'completed' as const:index===actIndex?'current' as const:'locked' as const,
      saved:record?.saved,lost:record?.lost,time:record?.time};
  });
  return {actIndex,actNumber:actIndex+1,actCount,actTitle:active.stageName,objective:active.objective,completedActs:results.length,complete,
    survivors:world.total-run.lost,total:world.total,saved:run.saved,lost:run.lost,time,inkUsed,masteryInk,stars,mastered,
    masteryGoal:actCount===1?world.masteryGoal:`Réunis les douze compagnons au terme des ${actCount} tableaux avec au plus ${masteryInk.toLocaleString('fr-FR')} unités d’encre au total.`,objectives,acts};
}

/** Physical map progress, independent from elapsed time and menu/act bookkeeping. */
export function getStageProgress(run:WorldRun,level:WorldLevel):StageProgress {
  level=getActiveAct(level,run);
  const sectors=level.sectors??[{id:level.id,x:0,width:level.width,name:level.stageName}];
  const source=nodeFor(level,level.spawn),goal=nodeFor(level,level.goal),survivors=run.units.filter(unit=>unit.state!=='lost');
  const xs=survivors.map(unit=>unit.state==='queued'?source.x:unit.state==='saved'?goal.x:unit.x);
  const furthestX=xs.length?Math.max(...xs):source.x,rearmostX=xs.length?Math.min(...xs):source.x;
  const sectorIndex=Math.max(0,sectors.findIndex(sector=>furthestX>=sector.x&&furthestX<sector.x+sector.width));
  const checkpoint=level.nodes.find(node=>node.id===run.autoCheckpointId);
  const progress=run.phase==='won'?1:xs.length?xs.reduce((sum,x)=>sum+clamp((x-source.x)/Math.max(1,goal.x-source.x),0,1),0)/xs.length:0;
  return {sectorIndex,sectorNumber:sectorIndex+1,sectorCount:sectors.length,sectorName:sectors[sectorIndex].name,
    furthestX,rearmostX,progress,checkpoint:checkpoint?{id:checkpoint.id,x:checkpoint.x,y:checkpoint.y,name:checkpoint.checkpointLabel??'Souvenir'}:null,
    saved:run.saved,lost:run.lost,remaining:level.total-run.saved-run.lost,decisions:run.edits};
}
