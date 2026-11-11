import assert from 'node:assert/strict';
import {appendStroke,applyAction,beginStroke,finishStroke,gateSatisfied,getEdgePath,getPendulumPosition,pathLength,pointAlongPath,updateRun} from '../lib/worlds/engine';
import {WORLD_NETWORKS,type ExpeditionNetwork} from '../lib/worlds/levels';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';

export function drawExpedition(run:WorldRun,level:WorldLevel,id:string):boolean {
  if(run.drawings[id])return true;
  const definition=level.drawings.find(drawing=>drawing.id===id)!;
  if(Object.values(run.drawings).reduce((sum,drawing)=>sum+drawing.inkLength,0)+pathLength(definition.suggested)>(level.inkBudget??Infinity))return false;
  const result=beginStroke(run,level,definition.from);assert(result.ok,result.message);
  // Shared supports are selected by the completed gesture, not its first dot.
  for(const point of definition.suggested.slice(1))appendStroke(run,level,point);
  const finished=finishStroke(run,level);assert(finished.ok,finished.message);assert.equal(finished.drawingId,id);return true;
}
function mode(run:WorldRun,level:WorldLevel,id:string,value:number):void {
  if(run.devices[id].mode===value)return;
  applyAction(run,level,{type:'device',id,mode:value});
}
export function safeHazardRelease(run:WorldRun,level:WorldLevel,hazard:ExpeditionNetwork['hazards'][number],unitId:number,time=run.time):boolean {
  const edge=level.edges.find(edge=>edge.id===hazard.edge)!,definition=level.devices.find(device=>device.id===hazard.pendulum)!;
  const length=pathLength(edge.path),pace=level.pace*(.94+(unitId%5)*.025)*1.45;
  // The scripted walkthrough uses observed physical phases; the game provides no prediction.
  for(let elapsed=0;elapsed<=length/pace+.06;elapsed+=1/60){
    const p=pointAlongPath(edge.path,elapsed*pace),bob=getPendulumPosition(definition,time+elapsed,run);
    if(Math.hypot(p.x-bob.x,p.y-level.creatureHeight*.4-bob.y)<(definition.radius??40)+level.creatureHeight*.22+6)return false;
  }
  return true;
}
export function expeditionController(run:WorldRun,level:WorldLevel):()=>void {
  const networks=WORLD_NETWORKS[level.id],carryingSince=new Map<string,number>();
  const approaching=(id:string)=>{
    const edge=level.edges.find(edge=>edge.drawingId===id)!;
    return run.units.some(unit=>{
      if(['lost','saved'].includes(unit.state))return false;
      const current=level.edges.find(candidate=>candidate.id===unit.edgeId);
      return current?(unit.returning?current.from:current.to)===edge.from:unit.nodeId===edge.from;
    });
  };
  const drawNeeded=(id:string)=>{
    const edge=level.edges.find(edge=>edge.drawingId===id)!;
    if(run.drawings[id]||!approaching(id)||edge.gates?.some(gate=>!gateSatisfied(run,gate)))return;
    if(edge.route&&run.devices[edge.route.deviceId].mode!==edge.route.mode)return;
    if(drawExpedition(run,level,id))return;
    // A dispersed party needs the earlier bridge before its leaders need a
    // later one. Reclaim only unoccupied, presently unapproached ink, just as
    // the player's eraser allows; do not assume that a whole network is done.
    for(const candidate of Object.keys(run.drawings)){
      if(approaching(candidate)||run.units.some(unit=>!['lost','saved','queued'].includes(unit.state)
        &&level.edges.find(edge=>edge.id===unit.edgeId)?.drawingId===candidate))continue;
      applyAction(run,level,{type:'erase',id:candidate});
      if(drawExpedition(run,level,id))break;
    }
  };
  return ()=>{
    const living=run.units.filter(unit=>unit.state!=='lost');
    const complete=(network:ExpeditionNetwork)=>{
      const end=level.nodes.find(node=>node.id===network.end)!;
      return living.every(unit=>(run.visits[network.end]??[]).includes(unit.id)&&unit.x>=end.x-.05&&!unit.returning);
    };
    for(const network of networks){
      if(complete(network)){
        for(const id of network.drawings)if(run.drawings[id]){
          const erased=applyAction(run,level,{type:'erase',id});assert(erased.ok,erased.message);
        }
      }
    }
    const lead=Math.max(...living.map(unit=>unit.x));
    for(const network of networks){
      const start=level.nodes.find(node=>node.id===network.start)!;
      const completed=complete(network);
      if(completed||lead<start.x-10)continue;
      if(network.kind==='scout'){
        const route=level.edges.find(edge=>edge.route?.deviceId===network.forks[0]&&edge.maxPassages===2)!;
        mode(run,level,network.forks[0],(run.passages[route.id]?.length??0)<2?1:0);
        if(network.wind)mode(run,level,network.wind,run.devices[network.relay].mode?0:1);
      }else for(let index=0;index<network.weights.length;index++){
        const id=network.weights[index],definition=level.devices.find(device=>device.id===id)!;
        if(run.devices[id].load>=definition.requiredLoad!)mode(run,level,id,1);
        mode(run,level,network.forks[index],run.devices[id].mode===1?0:1);
      }
      if(network.wind&&network.kind==='double')mode(run,level,network.wind,run.devices[network.weights[1]].mode?0:1);
      if(network.wind&&network.cleat){
        if(run.devices[network.cleat].mode!==1){
          mode(run,level,network.wind,1);
          if(run.devices[network.wind].progress>=.98)mode(run,level,network.cleat,1);
        }
        if(run.devices[network.cleat].mode===1)mode(run,level,network.wind,0);
      }
      if(network.lift){
        const id=network.lift,state=run.devices[id],definition=level.devices.find(device=>device.id===id)!;
        if(definition.gates?.every(gate=>gateSatisfied(run,gate))){
          if(state.mode===0&&state.progress<=.01&&state.load>0){
            if(!carryingSince.has(id))carryingSince.set(id,run.time);
            if(state.load===3||run.time-carryingSince.get(id)!>4)mode(run,level,id,1);
          }else if(state.mode===1&&state.progress>=.99&&state.load===0){mode(run,level,id,0);carryingSince.delete(id);}
        }
      }
      for(const hazard of network.hazards){
        const brake=run.devices[hazard.brake];
        if(brake.mode===1&&brake.progress>=.99){mode(run,level,hazard.gate,1);continue;}
        if(brake.mode===1||run.units.some(unit=>unit.edgeId===hazard.edge&&unit.state!=='lost'))continue;
        const waiting=run.units.find(unit=>{
          const incoming=level.edges.find(edge=>edge.id===unit.edgeId);
          return !['lost','saved','queued'].includes(unit.state)&&(unit.edgeId===null?unit.nodeId===hazard.approach
            :incoming?.to===hazard.approach&&unit.distance>=pathLength(getEdgePath(run,level,incoming))-.1);
        });
        if(waiting&&safeHazardRelease(run,level,hazard,waiting.id))mode(run,level,hazard.gate,1);
      }
      for(const id of network.drawings)drawNeeded(id);
    }
  };
}
export function solveExpedition(run:WorldRun,level:WorldLevel,limit=1600):{time:number;decisions:number;peakInk:number} {
  const control=expeditionController(run,level);let peakInk=0;
  control();applyAction(run,level,{type:'start'});
  const until=run.time+limit;
  while(run.phase==='playing'&&run.time<until){
    control();peakInk=Math.max(peakInk,Object.values(run.drawings).reduce((sum,d)=>sum+d.inkLength,0));updateRun(run,level,.1);
  }
  assert.equal(run.phase,'won',`${level.id} stalled at ${run.time.toFixed(1)}s: ${JSON.stringify(run.units.map(u=>({id:u.id,s:u.state,e:u.edgeId,n:u.nodeId,x:Math.round(u.x),return:u.returning})))}\nDevices ${JSON.stringify(Object.fromEntries(Object.entries(run.devices).filter(([,s])=>s.load||s.mode).map(([k,s])=>[k,s])))}\nInk ${Object.keys(run.drawings).join(',')}`);
  return {time:run.time,decisions:run.edits,peakInk};
}
