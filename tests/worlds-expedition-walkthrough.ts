import assert from 'node:assert/strict';
import {appendStroke,applyAction,beginStroke,finishStroke,gateSatisfied,getEdgePath,getPendulumPosition,pathLength,pointAlongPath,updateRun} from '../lib/worlds/engine';
import {WORLD_NETWORKS,type ExpeditionNetwork} from '../lib/worlds/levels';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';

export function drawExpedition(run:WorldRun,level:WorldLevel,id:string):boolean {
  if(run.drawings[id])return true;
  const definition=level.drawings.find(drawing=>drawing.id===id)!;
  if(Object.values(run.drawings).reduce((sum,drawing)=>sum+drawing.inkLength,0)+pathLength(definition.suggested)>(level.inkBudget??Infinity))return false;
  const result=beginStroke(run,level,definition.from);assert(result.ok,result.message);
  assert.equal(result.drawingId,id,`anchor must unambiguously select ${id}`);
  for(const point of definition.suggested.slice(1))appendStroke(run,level,point);
  const finished=finishStroke(run,level);assert(finished.ok,finished.message);return true;
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
  return ()=>{
    const living=run.units.filter(unit=>unit.state!=='lost');
    for(const network of networks){
      const complete=living.every(unit=>(run.visits[network.end]??[]).includes(unit.id));
      if(complete){
        for(const id of network.drawings)if(run.drawings[id]){
          const erased=applyAction(run,level,{type:'erase',id});assert(erased.ok,erased.message);
        }
      }
    }
    const lead=Math.max(...living.map(unit=>unit.x));
    for(const network of networks){
      const start=level.nodes.find(node=>node.id===network.start)!;
      const completed=living.every(unit=>(run.visits[network.end]??[]).includes(unit.id));
      if(completed||lead<start.x-10)continue;
      for(const id of network.drawings)drawExpedition(run,level,id);
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
          return unit.state!=='lost'&&incoming?.to===hazard.approach&&unit.distance>=pathLength(getEdgePath(run,level,incoming))-.1;
        });
        if(waiting&&safeHazardRelease(run,level,hazard,waiting.id))mode(run,level,hazard.gate,1);
      }
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
