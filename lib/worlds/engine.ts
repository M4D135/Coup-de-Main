import type {ActionResult, Creature, DeviceDefinition, DrawingDefinition, DrawnRoute, EditSnapshot, GameAction, GameEvent, Gate, Point, RouteEdge, RunSnapshot, WorldLevel, WorldRun} from './types';

export const WORLD_SAVE_KEY='mondes-du-trait-v2';
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
const stationPosition=(level:WorldLevel,unit:Creature):Point=>{
  const node=nodeFor(level,unit.nodeId),capacity=node.capacity??3;
  return {x:node.x+((unit.id%capacity)-(capacity-1)/2)*46,y:node.y};
};

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
export function getEdgePath(run:WorldRun,level:WorldLevel,edge:RouteEdge):Point[] {
  const drawing=edge.drawingId?level.drawings.find(item=>item.id===edge.drawingId):undefined;
  const built=edge.drawingId?run.drawings[edge.drawingId]:undefined;
  if(!drawing||!built)return edge.path;
  const points=copyPoints(built.points),from=nodeFor(level,edge.from),to=nodeFor(level,edge.to);
  if(distance(from,points[0])>1)points.unshift({x:from.x,y:from.y});
  const tailIndex=edge.path.findIndex(point=>distance(point,drawing.to)<2);
  if(tailIndex>=0)points.push(...copyPoints(edge.path.slice(tailIndex+1)));
  if(distance(points[points.length-1],to)>1)points.push({x:to.x,y:to.y});
  return points;
}

export function createRun(level:WorldLevel):WorldRun {
  const source=nodeFor(level,level.spawn);
  return {
    version:1,levelId:level.id,phase:'ready',time:0,speed:1,
    units:Array.from({length:level.total},(_,id)=>({id,x:source.x,y:source.y,state:'queued',direction:1,nodeId:source.id,edgeId:null,distance:0,walkTime:0,waitTime:0,savedAt:null,lostAt:null,fallVelocity:0,returning:false,returnEdges:[],variant:(id*7)%5})),
    devices:Object.fromEntries(level.devices.map(device=>[device.id,{mode:device.initialMode,progress:0,load:0}])),
    drawings:{},spawned:0,saved:0,lost:0,nextSpawn:0,accumulator:0,edits:0,retries:0,
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

function activeOnDrawing(run:WorldRun,level:WorldLevel,id:string):boolean {
  return run.units.some(unit=>!['queued','saved','lost'].includes(unit.state)&&edgeFor(level,unit.edgeId)?.drawingId===id);
}

export function applyAction(run:WorldRun,level:WorldLevel,action:GameAction):ActionResult {
  if(run.levelId!==level.id)return result(run,false,'Ce stage ne correspond pas à la sauvegarde.');
  if(action.type==='restart'){
    const retries=run.retries+1;
    Object.assign(run,createRun(level));run.retries=retries;
    emit(run,{type:'retry'});
    return result(run,true,'La troupe attend à l’entrée. Prépare un nouveau chemin.');
  }
  if(action.type==='retry'){
    if(!run.checkpoint)return applyAction(run,level,{type:'restart'});
    const checkpoint=run.checkpoint,retries=run.retries+1,restored=restoreRun(checkpoint,level);
    if(!restored)return result(run,false,'Ce point de reprise est indisponible.');
    Object.assign(run,restored);run.checkpoint=checkpoint;run.retries=retries;run.phase='paused';
    emit(run,{type:'retry'});
    return result(run,true,'Retour au dernier geste. Reprends quand tu es prêt.');
  }
  if(action.type==='checkpoint'){
    run.checkpoint=saveRun(run);
    return result(run,true,'Un point de reprise est posé.');
  }
  if(action.type==='speed'){
    run.speed=action.value??(run.speed===1?2:1);
    return result(run,true,run.speed===1?'À leur rythme.':'La troupe accélère.');
  }
  if(action.type==='start'){
    if(run.phase==='won'||run.phase==='lost')return result(run,false,'Recommence le stage pour repartir.');
    run.phase='playing';
    if(!run.checkpoint)run.checkpoint=saveRun(run);
    return result(run,true,'La troupe est en route.');
  }
  if(action.type==='pause'){
    if(run.phase==='ready')return result(run,true,'La troupe attend ton départ.');
    if(run.phase==='won'||run.phase==='lost')return result(run,false,'Le stage est terminé.');
    const paused=action.paused??run.phase==='playing';run.phase=paused?'paused':'playing';
    return result(run,true,paused?'Prends le temps de réfléchir et de dessiner.':'C’est reparti.');
  }
  if(run.phase==='won'||run.phase==='lost')return result(run,false,'Le stage est terminé.');
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
      if(definition.kind==='counterweight'&&previous.modes[definition.id]===0&&run.devices[definition.id].mode===1
        &&level.edges.some(edge=>edge.gates?.some(gate=>gate.deviceId===definition.id)
          &&run.units.some(unit=>unit.edgeId===edge.id&&!['saved','lost'].includes(unit.state)))){
        return result(run,false,'Le cran soutient encore un passage occupé. Attends avant d’annuler.');
      }
    }
    run.history.pop();run.drawings=copyDrawings(previous.drawings);
    for(const [id,mode] of Object.entries(previous.modes))if(run.devices[id])run.devices[id].mode=mode;
    run.activeStroke=null;emit(run,{type:'undo'});run.checkpoint=saveRun(run);
    return result(run,true,'Le dernier geste est annulé.');
  }
  if(action.type==='device'){
    const definition=deviceFor(level,action.id),state=run.devices[action.id];
    if(!definition||!state)return result(run,false,'Ce mécanisme est introuvable.');
    if(definition.modes.length<2)return result(run,false,definition.description);
    const next=action.mode??((state.mode+1)%definition.modes.length);
    if(!Number.isInteger(next)||next<0||next>=definition.modes.length)return result(run,false,'Cette position est indisponible.');
    if(next===state.mode)return result(run,true,`${definition.label} : ${definition.modes[next]}.`);
    if(definition.kind==='counterweight'&&next===1&&state.load<(definition.requiredLoad??1)){
      return result(run,false,`Il faut ${definition.requiredLoad??1} compagnons sur ${definition.id==='balance'&&level.id==='boucles'?'la nacelle':'la balance'} avant d’enclencher le cran.`);
    }
    if(next!==0&&!gatesSatisfied(run,definition.gates))return result(run,false,definition.kind==='lift'?'La balance doit d’abord libérer le frein.':'Attends que le mécanisme arrive en haut.');
    if(definition.kind==='counterweight'&&next===0){
      const dependentOccupied=level.edges.some(edge=>edge.gates?.some(gate=>gate.deviceId===definition.id)
        &&run.units.some(unit=>unit.edgeId===edge.id&&!['saved','lost'].includes(unit.state)));
      if(dependentOccupied)return result(run,false,'Le passage porte encore des compagnons. Garde le cran enclenché.');
    }
    remember(run);state.mode=next;
    emit(run,{type:'device',x:definition.x,y:definition.y,deviceId:definition.id});
    run.checkpoint=saveRun(run);
    return result(run,true,`${definition.label} : ${definition.modes[next]}.`);
  }
  return result(run,false,'Action inconnue.');
}

export function beginStroke(run:WorldRun,level:WorldLevel,point:Point):ActionResult {
  if(run.phase==='won'||run.phase==='lost')return result(run,false,'Le stage est terminé.');
  let match:{definition:DrawingDefinition;reversed:boolean;distance:number}|null=null;
  for(const definition of level.drawings){
    for(const reversed of [false,true]){
      const d=distance(point,reversed?definition.to:definition.from);
      if(d<=ANCHOR_RADIUS&&(!match||d<match.distance))match={definition,reversed,distance:d};
    }
  }
  if(!match)return result(run,false,'Commence ton trait sur un petit appui lumineux.');
  if(activeOnDrawing(run,level,match.definition.id))return result(run,false,'Attends que le trait soit libre pour le redessiner.');
  run.activeStroke={drawingId:match.definition.id,points:[{...(match.reversed?match.definition.to:match.definition.from)}],reversed:match.reversed};
  return result(run,true,match.definition.hint,{drawingId:match.definition.id});
}

export function appendStroke(run:WorldRun,level:WorldLevel,point:Point):void {
  const stroke=run.activeStroke;
  if(!stroke||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
  const bounded={x:clamp(point.x,0,level.width),y:clamp(point.y,80,level.height-90)};
  if(distance(stroke.points[stroke.points.length-1],bounded)<2.5)return;
  if(stroke.points.length>=700)stroke.points=stroke.points.filter((_,index)=>index%2===0||index===stroke.points.length-1);
  stroke.points.push(bounded);
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
  const stroke=run.activeStroke;
  if(!stroke)return result(run,false,'Commence sur un appui, puis rejoins l’autre.');
  run.activeStroke=null;
  const definition=level.drawings.find(item=>item.id===stroke.drawingId)!;
  const points=stroke.reversed?copyPoints(stroke.points).reverse():copyPoints(stroke.points);
  if(points.length<2||pathLength(points)<distance(definition.from,definition.to)*.55)return result(run,false,'Prolonge le trait jusqu’au second appui.');
  if(distance(points[0],definition.from)>ANCHOR_RADIUS||distance(points[points.length-1],definition.to)>ANCHOR_RADIUS+12)return result(run,false,'Le trait doit rejoindre les deux appuis. Tu peux les approcher largement.');
  points[0]={...definition.from};points[points.length-1]={...definition.to};
  const stable=simplify(points,3.5),inkLength=pathLength(stable);
  if(inkLength>definition.inkLimit)return result(run,false,'Ce trait est trop long. Essaie un chemin plus direct.');
  if(stable.some(point=>pointSegmentDistance(point,definition.from,definition.to)>definition.corridor))return result(run,false,'Reste un peu plus près du passage à relier.');
  if(activeOnDrawing(run,level,definition.id))return result(run,false,'Les compagnons ont rejoint ce trait ; laisse-les passer.');
  remember(run);run.drawings[definition.id]={points:stable,inkLength,createdAt:run.time};
  emit(run,{type:'draw',x:definition.to.x,y:definition.to.y});run.checkpoint=saveRun(run);
  return result(run,true,`${definition.label} est prêt.`,{drawingId:definition.id});
}

export function cancelStroke(run:WorldRun):void {run.activeStroke=null;}

export function getPendulumPosition(definition:DeviceDefinition,time:number):Point&{angle:number} {
  const pivot=definition.pivot??{x:definition.x,y:definition.y};
  const angle=Math.sin(time/(definition.duration??7)*Math.PI*2+(definition.phase??0))*.95;
  const length=definition.length??190;
  return {x:pivot.x+Math.sin(angle)*length,y:pivot.y+Math.cos(angle)*length,angle};
}

function updateDevices(run:WorldRun,level:WorldLevel,dt:number):void {
  for(const definition of level.devices){
    const state=run.devices[definition.id];
    state.load=definition.weightNodes?run.units.filter(unit=>definition.weightNodes!.includes(unit.nodeId)&&unit.edgeId===null&&unit.state==='waiting'&&distance(unit,stationPosition(level,unit))<=1).length
      :definition.kind==='lift'?run.units.filter(unit=>unit.state==='riding'&&edgeFor(level,unit.edgeId)?.deviceId===definition.id).length:0;
    let target=state.mode>0?1:0;
    if(definition.kind==='counterweight')target=state.mode===1||state.load>=(definition.requiredLoad??1)?1:0;
    if(definition.kind==='wind')target=state.mode===1||(definition.lockDeviceId&&run.devices[definition.lockDeviceId]?.mode===1)?1:0;
    if(definition.kind==='lift'&&!gatesSatisfied(run,definition.gates))target=state.progress;
    if(definition.kind==='lift'&&state.progress<.02&&run.units.some(unit=>unit.state==='riding'&&edgeFor(level,unit.edgeId)?.deviceId===definition.id&&unit.distance<1))target=0;
    if(definition.kind==='pendulum'){state.progress=(Math.sin(run.time/(definition.duration??7)*Math.PI*2+(definition.phase??0))+1)/2;continue;}
    const delta=dt/(definition.duration??.35);
    state.progress=target>state.progress?Math.min(target,state.progress+delta):Math.max(target,state.progress-delta);
  }
}

function canEnter(run:WorldRun,level:WorldLevel,edge:RouteEdge,unit:Creature):boolean {
  if(edge.route&&run.devices[edge.route.deviceId]?.mode!==edge.route.mode)return false;
  if(edge.drawingId&&!run.drawings[edge.drawingId])return false;
  if(!gatesSatisfied(run,edge.gates))return false;
  const destination=nodeFor(level,edge.to);
  if(destination.kind==='weight'&&destination.capacity){
    const count=run.units.filter(other=>other.id!==unit.id&&!['queued','lost','saved'].includes(other.state)
      &&((other.nodeId===destination.id&&other.edgeId===null)||(!other.returning&&edgeFor(level,other.edgeId)?.to===destination.id))).length;
    if(count>=destination.capacity)return false;
  }
  if(edge.kind==='lift'){
    const state=run.devices[edge.deviceId!];
    if(!state||state.progress>.018||state.mode!==0)return false;
    if(run.units.filter(other=>other.edgeId===edge.id&&other.state==='riding').length>=(edge.capacity??3))return false;
  }else if(run.units.some(other=>other.id!==unit.id&&other.edgeId===edge.id&&!other.returning&&!['lost','saved'].includes(other.state)&&other.distance<SPACING))return false;
  return true;
}

function depart(run:WorldRun,level:WorldLevel,unit:Creature,nodeId:string):boolean {
  const node=nodeFor(level,nodeId);
  if(node.kind==='weight'&&run.devices[node.deviceId!]?.mode!==1)return false;
  const options=level.edges.filter(edge=>edge.from===nodeId).sort((a,b)=>(b.priority??0)-(a.priority??0));
  const next=options.find(edge=>canEnter(run,level,edge,unit));
  if(!next)return false;
  unit.nodeId=nodeId;unit.edgeId=next.id;unit.distance=0;unit.waitTime=0;
  unit.returning=false;unit.returnEdges=[];
  unit.state=next.kind==='lift'?'riding':'walking';
  // Keep the feet where they are. Boarding a cradle/edge uses a short walked
  // approach in the next tick rather than snapping to the shared route origin.
  return true;
}

/** Find a real walk back to a junction whose selected route has changed.
 * Lift shafts, hazards and latched weight stations are never invented shortcuts.
 */
function returnPath(run:WorldRun,level:WorldLevel,nodeId:string):string[]|null {
  const pending=[{nodeId,edges:[] as string[]}],visited=new Set<string>();
  while(pending.length){
    const current=pending.shift()!;
    if(visited.has(current.nodeId))continue;
    visited.add(current.nodeId);
    const node=nodeFor(level,current.nodeId);
    if(node.kind==='weight'){
      const definition=deviceFor(level,node.deviceId!)!,state=run.devices[node.deviceId!];
      const approaching=run.units.filter(unit=>!unit.returning&&!['queued','saved','lost'].includes(unit.state)
        &&unit.edgeId!==null&&edgeFor(level,unit.edgeId)?.to===node.id).length;
      if(current.edges.length>0||state.mode===1||state.load+approaching>=(definition.requiredLoad??1))continue;
    }
    for(const edge of level.edges.filter(candidate=>candidate.to===current.nodeId)){
      if(!['ground','drawn'].includes(edge.kind)||(edge.drawingId&&!run.drawings[edge.drawingId]))continue;
      const edges=[...current.edges,edge.id];
      if(edge.route){
        if(run.devices[edge.route.deviceId]?.mode!==edge.route.mode)return edges;
        continue;
      }
      pending.push({nodeId:edge.from,edges});
    }
  }
  return null;
}

function recallStranded(run:WorldRun,level:WorldLevel,unit:Creature,nodeId:string):boolean {
  const edges=returnPath(run,level,nodeId);
  if(!edges?.length)return false;
  const first=edgeFor(level,edges[0])!,length=pathLength(getEdgePath(run,level,first));
  // The companions queued on this same path turn together; their spacing and
  // their feet remain where they were rather than jumping back to the junction.
  for(const companion of run.units){
    if(companion!==unit&&(companion.edgeId!==first.id||companion.returning||['queued','saved','lost','riding'].includes(companion.state)))continue;
    const oldDistance=companion.edgeId===first.id?companion.distance:length;
    companion.nodeId=first.to;companion.edgeId=first.id;companion.distance=Math.max(0,length-oldDistance);
    companion.returning=true;companion.returnEdges=[...edges];companion.state='walking';companion.waitTime=0;
  }
  run.message='L’aiguillage a changé : les compagnons bloqués reviennent à pied choisir l’autre chemin.';
  return true;
}

function arrive(run:WorldRun,level:WorldLevel,unit:Creature,edge:RouteEdge):void {
  if(unit.returning){
    const remaining=(unit.returnEdges??[]).slice(1),nodeId=edge.from;
    if(remaining.length){
      unit.nodeId=nodeId;unit.edgeId=remaining[0];unit.distance=0;
      unit.returnEdges=remaining;unit.state='walking';unit.waitTime=0;
    }else if(!depart(run,level,unit,nodeId)){
      unit.state='waiting';unit.waitTime+=FIXED_STEP;
    }
    return;
  }
  const node=nodeFor(level,edge.to);
  if(node.kind==='goal'){
    unit.state='saved';unit.savedAt=run.time;unit.edgeId=null;unit.nodeId=node.id;unit.x=node.x;unit.y=node.y;run.saved++;
    emit(run,{type:'saved',x:unit.x,y:unit.y,unitId:unit.id});return;
  }
  if(node.kind==='weight'){
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
    const unit=run.units[run.spawned];
    if(depart(run,level,unit,level.spawn)){
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
      if(node.kind==='weight'&&run.devices[node.deviceId!]?.mode===0){
        const target=stationPosition(level,unit),gap=distance(unit,target),step=Math.min(gap,level.pace*dt);
        if(gap>1){
          unit.direction=target.x>=unit.x?1:-1;unit.x+=(target.x-unit.x)*step/gap;unit.y+=(target.y-unit.y)*step/gap;
          unit.walkTime+=step/level.pace;unit.waitTime=0;continue;
        }
      }
      unit.waitTime+=dt;
      if(!depart(run,level,unit,unit.nodeId))recallStranded(run,level,unit,unit.nodeId);
      continue;
    }
    const edge=edgeFor(level,unit.edgeId)!;
    if(edge.kind==='lift'){
      const definition=deviceFor(level,edge.deviceId!)!,state=run.devices[definition.id];
      const slot=unit.id%3;
      const low=definition.low??edge.path[0],high=definition.high??edge.path[edge.path.length-1];
      const slotX=low.x+(high.x-low.x)*state.progress+(slot-1)*30;
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
      if(state.progress>=.995&&state.mode===1){
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
      if(other.distance>unit.distance+.01||(Math.abs(other.distance-unit.distance)<.01&&other.id<unit.id))target=Math.min(target,Math.max(unit.distance,other.distance-SPACING));
    }
    const moved=target-unit.distance;
    unit.distance=target;
    const position=pointAlongPath(points,target);unit.x=position.x;unit.y=position.y;unit.direction=position.direction;
    if(moved>.001){unit.state='walking';unit.walkTime+=moved/level.pace;unit.waitTime=0;}else{unit.state='waiting';unit.waitTime+=dt;}
    if(edge.kind==='hazard'&&edge.deviceId){
      const definition=deviceFor(level,edge.deviceId)!;
      const bob=getPendulumPosition(definition,run.time);
      const body={x:unit.x,y:unit.y-level.creatureHeight*.4};
      if(distance(body,bob)<(definition.radius??40)+level.creatureHeight*.22){lose(run,unit);continue;}
    }
    if(unit.distance>=length-.05)arrive(run,level,unit,edge);
  }
  if(run.spawned===level.total&&run.saved+run.lost===level.total){
    run.phase=run.saved>=level.rescueTarget?'won':'lost';
    run.message=run.phase==='won'?(run.saved===level.total?'Toute la troupe est réunie !':'Le refuge s’illumine. Tu peux revenir sauver tout le monde.'):'Le refuge attend encore des compagnons. Reprends ton dernier geste.';
    if(run.phase==='won')emit(run,{type:'win'});
  }
}

/** Fixed simulation ticks make physics, spacing and hazards independent of render cadence. */
export function updateRun(run:WorldRun,level:WorldLevel,dt:number):GameEvent[] {
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

export function saveRun(run:WorldRun):RunSnapshot {
  return {version:1,levelId:run.levelId,phase:run.phase,time:run.time,speed:run.speed,
    units:run.units.map(unit=>({...unit,returning:unit.returning===true,returnEdges:[...(unit.returnEdges??[])]})),devices:Object.fromEntries(Object.entries(run.devices).map(([id,state])=>[id,{...state}])),
    drawings:copyDrawings(run.drawings),spawned:run.spawned,saved:run.saved,lost:run.lost,nextSpawn:run.nextSpawn,accumulator:run.accumulator,edits:run.edits,retries:run.retries};
}

const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function restoreRun(raw:unknown,level:WorldLevel):WorldRun|null {
  if(!isRecord(raw)||raw.version!==1||raw.levelId!==level.id||!Array.isArray(raw.units)||raw.units.length!==level.total)return null;
  const run=createRun(level);
  if(isRecord(raw.devices))for(const definition of level.devices){
    const candidate=raw.devices[definition.id];
    if(isRecord(candidate))run.devices[definition.id]={mode:clamp(Math.floor(finite(candidate.mode,definition.initialMode)),0,definition.modes.length-1),progress:clamp(finite(candidate.progress),0,1),load:0};
  }
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
  const validStates=['queued','walking','waiting','riding','saved','lost'];
  for(let index=0;index<level.total;index++){
    const unit=raw.units[index];
    if(!isRecord(unit)||unit.id!==index||typeof unit.state!=='string'||!validStates.includes(unit.state)||typeof unit.nodeId!=='string'||!level.nodes.some(node=>node.id===unit.nodeId))return null;
    const edgeId=unit.edgeId===null?null:typeof unit.edgeId==='string'&&edgeFor(level,unit.edgeId)?unit.edgeId:null;
    if(unit.edgeId!==null&&edgeId===null)return null;
    const edge=edgeFor(level,edgeId);
    if(edge?.drawingId&&!run.drawings[edge.drawingId])return null;
    if(['walking','riding'].includes(unit.state)&&!edge)return null;
    if(unit.state==='riding'&&edge?.kind!=='lift')return null;
    const returning=unit.returning===true;
    const returnEdges=Array.isArray(unit.returnEdges)&&unit.returnEdges.every(id=>typeof id==='string'&&edgeFor(level,id))?unit.returnEdges as string[]:[];
    if(returning&&(!edge||returnEdges[0]!==edge.id||returnEdges.some((id,index)=>{
      const part=edgeFor(level,id)!;
      return !['ground','drawn'].includes(part.kind)||(part.drawingId&&!run.drawings[part.drawingId])
        ||(index>0&&edgeFor(level,returnEdges[index-1])!.from!==part.to);
    })))return null;
    const x=finite(unit.x,NaN),y=finite(unit.y,NaN);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x< -300||x>level.width+300||y< -300||y>level.height+500)return null;
    run.units[index]={...run.units[index],state:unit.state as Creature['state'],nodeId:unit.nodeId,edgeId,x,y,returning,returnEdges:returning?[...returnEdges]:[],
      distance:edge?clamp(finite(unit.distance),0,pathLength(getEdgePath(run,level,edge))):0,
      direction:unit.direction===-1?-1:1,walkTime:Math.max(0,finite(unit.walkTime)),waitTime:Math.max(0,finite(unit.waitTime)),
      savedAt:typeof unit.savedAt==='number'&&Number.isFinite(unit.savedAt)?Math.max(0,unit.savedAt):null,
      lostAt:typeof unit.lostAt==='number'&&Number.isFinite(unit.lostAt)?Math.max(0,unit.lostAt):null,fallVelocity:clamp(finite(unit.fallVelocity),-500,2000)};
  }
  run.saved=run.units.filter(unit=>unit.state==='saved').length;run.lost=run.units.filter(unit=>unit.state==='lost').length;
  run.spawned=run.units.filter(unit=>unit.state!=='queued').length;
  // Spawn identity is consecutive. A malformed save cannot silently skip a creature.
  if(run.units.some((unit,index)=>index<run.spawned?unit.state==='queued':unit.state!=='queued'))return null;
  run.time=Math.max(0,finite(raw.time));run.nextSpawn=Math.max(run.time,finite(raw.nextSpawn));run.speed=raw.speed===2?2:1;
  run.edits=Math.max(0,Math.floor(finite(raw.edits)));run.retries=Math.max(0,Math.floor(finite(raw.retries)));
  run.accumulator=clamp(finite(raw.accumulator),0,FIXED_STEP);
  run.phase=run.saved+run.lost===level.total?(run.saved>=level.rescueTarget?'won':'lost'):raw.phase==='ready'&&run.spawned===0?'ready':'paused';
  updateDevices(run,level,0);run.checkpoint=saveRun(run);run.message='Ta troupe et tes dessins ont été retrouvés. Reprends quand tu es prêt.';
  return run;
}

export function getRunSummary(run:WorldRun,level:WorldLevel){
  const inkUsed=Math.round(Object.values(run.drawings).reduce((sum,drawing)=>sum+drawing.inkLength,0));
  const mastered=run.saved===level.total&&inkUsed<=level.masteryInk&&gatesSatisfied(run,level.masteryDevices);
  const stars=run.phase==='won'?1+(run.saved===level.total?1:0)+(mastered?1:0):0;
  return {phase:run.phase,saved:run.saved,lost:run.lost,total:level.total,target:level.rescueTarget,
    remaining:level.total-run.saved-run.lost,waiting:run.units.filter(unit=>unit.state==='waiting').length,
    time:Math.floor(run.time),inkUsed,drawn:Object.keys(run.drawings).length,canUndo:run.history.length>0,
    speed:run.speed,stars,mastered,masteryGoal:level.masteryGoal,message:run.message};
}
