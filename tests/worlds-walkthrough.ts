import assert from 'node:assert/strict';
import {appendStroke,applyAction,beginStroke,finishStroke,getActiveAct,getEdgePath,pathLength,updateRun} from '../lib/worlds/engine';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';

export function advanceUntil(run:WorldRun,world:WorldLevel,predicate:()=>boolean,limit=240,controller?:()=>void):void {
  let elapsed=0;
  while(!predicate()&&run.phase==='playing'&&elapsed<limit){controller?.();updateRun(run,world,1/60);elapsed+=1/60;}
  assert(predicate(),`${world.id}/${run.actIndex+1} stalled at ${run.time.toFixed(1)}s: ${JSON.stringify(run.units.map(u=>({id:u.id,state:u.state,node:u.nodeId,edge:u.edgeId,d:Math.round(u.distance)})))}`);
}
export function drawPassage(run:WorldRun,world:WorldLevel,id:string,reverse=false):void {
  if(run.drawings[id])return;
  const definition=getActiveAct(world,run).drawings.find(item=>item.id===id)!;
  assert(definition,`unknown drawing ${id}`);
  const points=reverse?[...definition.suggested].reverse():definition.suggested;
  const started=beginStroke(run,world,points[0]);assert(started.ok,started.message);
  for(const point of points.slice(1))appendStroke(run,world,point);
  const ended=finishStroke(run,world);assert(ended.ok,`${id}: ${ended.message}`);
}
export function setDevice(run:WorldRun,world:WorldLevel,id:string,mode:number):void {
  const action=applyAction(run,world,{type:'device',id,mode});assert(action.ok,`${id}: ${action.message}`);
}

/** Walkthroughs perform the same drawing and device actions as the player. */
export function solveCurrentAct(run:WorldRun,world:WorldLevel):void {
  const act=run.actIndex;
  if(world.id==='boucles'){
    if(act===0){
      drawPassage(run,world,'sky-bridge');drawPassage(run,world,'cradle-return');setDevice(run,world,'fork',1);
      applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.devices.balance.load===3);
      setDevice(run,world,'balance',1);setDevice(run,world,'fork',0);
    }else if(act===1){
      drawPassage(run,world,'cradle-return');setDevice(run,world,'fork',1);applyAction(run,world,{type:'start'});
      advanceUntil(run,world,()=>run.saved>=2);
      drawPassage(run,world,'sky-bridge');setDevice(run,world,'fork',0);
    }else{
      drawPassage(run,world,'sky-bridge');applyAction(run,world,{type:'start'});
      advanceUntil(run,world,()=>run.saved>=2);
      const erased=applyAction(run,world,{type:'erase',id:'sky-bridge'});assert(erased.ok,erased.message);
      drawPassage(run,world,'cradle-return');setDevice(run,world,'fork',1);
    }
  }else if(world.id==='plis'){
    if(act===0){
      drawPassage(run,world,'paper-detour');setDevice(run,world,'fork',1);setDevice(run,world,'deflector',2);applyAction(run,world,{type:'start'});
    }else if(act===1){
      drawPassage(run,world,'paper-bridge');drawPassage(run,world,'paper-descent');setDevice(run,world,'deflector',1);
      applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.devices.deflector.progress>=.97);
      setDevice(run,world,'cleat',1);setDevice(run,world,'deflector',2);
    }else{
      drawPassage(run,world,'paper-detour');drawPassage(run,world,'paper-bridge');setDevice(run,world,'fork',1);setDevice(run,world,'deflector',2);
      applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>((run.visits.low?.length??0)>=2));
      setDevice(run,world,'deflector',1);advanceUntil(run,world,()=>run.devices.deflector.progress>=.97);
      setDevice(run,world,'cleat',1);setDevice(run,world,'deflector',2);setDevice(run,world,'fork',0);
    }
  }else if(act===0){
    for(const id of ['balance-access','balance-return','lantern-bridge'])drawPassage(run,world,id);
    setDevice(run,world,'fork',1);applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.devices.balance.load===2);
    setDevice(run,world,'balance',1);setDevice(run,world,'fork',0);
    let carryingSince:number|null=null;
    advanceUntil(run,world,()=>run.phase==='won',240,()=>{
      const lift=run.devices.lift;
      if(lift.mode===0&&lift.progress<=.01&&lift.load>0){carryingSince??=run.time;if(lift.load===3||run.time-carryingSince>4)setDevice(run,world,'lift',1);}
      else if(lift.mode===1&&lift.progress>=.99&&lift.load===0){setDevice(run,world,'lift',0);carryingSince=null;}
    });
  }else if(act===1){
    drawPassage(run,world,'lower-return');applyAction(run,world,{type:'start'});
    let lastPulse=-1;
    advanceUntil(run,world,()=>run.phase==='won',240,()=>{
      const phase=run.time%12,cycle=Math.floor(run.time/12),brake=run.devices['pendulum-brake'];
      if(brake.mode===1&&brake.progress>=.99){if(run.devices['pendulum-gate'].mode===0)setDevice(run,world,'pendulum-gate',1);return;}
      const window=phase>=6.25&&phase<6.45?0:phase>=10&&phase<10.2?1:-1;
      if(window<0||lastPulse===cycle*2+window)return;
      const level=getActiveAct(world,run),approach=level.edges.find(edge=>edge.id==='low-floor')!;
      const waiting=run.units.some(unit=>unit.edgeId===approach.id&&unit.distance>=pathLength(getEdgePath(run,level,approach))-.1);
      if(waiting){setDevice(run,world,'pendulum-gate',1);lastPulse=cycle*2+window;}
    });
  }else{
    for(const id of ['balance-access','balance-return','lantern-bridge','lower-return'])drawPassage(run,world,id);
    applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.devices.balance.load===2);
    setDevice(run,world,'balance',1);advanceUntil(run,world,()=>run.devices['pendulum-brake'].progress>=.99);
    setDevice(run,world,'fork',1);
  }
  advanceUntil(run,world,()=>run.phase==='won');
}
