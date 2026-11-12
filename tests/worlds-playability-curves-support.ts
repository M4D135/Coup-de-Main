import assert from 'node:assert/strict';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getDeviceStatus,pathLength,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import type {ExpeditionNetwork} from '../lib/worlds/levels';
import type {DrawingDefinition,Point,WorldLevel,WorldRun} from '../lib/worlds/types';
import {reachedRun} from './worlds-playability-support';
import {drawingGesture} from './worlds-expedition-walkthrough';

export type HandCurve='arch'|'bends';

/** Uneven frames and deliberate human delays; never change simulation state
 * directly to reach a position, grant a passage, or activate a relay. */
export function humanWait(run:WorldRun,level:WorldLevel,seconds:number):void {
  const frames=[.016,.033,.08,.125,.05,.2,.025];
  for(let elapsed=0,index=0;elapsed<seconds-1e-8&&run.phase==='playing';index++){
    const dt=Math.min(frames[index%frames.length],seconds-elapsed);
    updateRun(run,level,dt);elapsed+=dt;
  }
}

/** Construct an actual hand gesture, independently of drawing.suggested.
 * The broad S curve deliberately uses appreciably more ink than a chord. */
export function handPoints(definition:DrawingDefinition,level:WorldLevel,shape:HandCurve,reverse=false):Point[] {
  const dx=definition.to.x-definition.from.x,dy=definition.to.y-definition.from.y,length=Math.hypot(dx,dy);
  const withAmplitude=(amplitude:number)=>Array.from({length:49},(_,index)=>{
    const t=index/48;
    const bend=shape==='arch'?Math.sin(Math.PI*t)+.08*Math.sin(3*Math.PI*t):Math.sin(2*Math.PI*t)+.06*Math.sin(5*Math.PI*t)*Math.sin(Math.PI*t);
    const offset=bend*amplitude;
    return {x:definition.from.x+dx*t-dy/length*offset,y:definition.from.y+dy*t+dx/length*offset};
  });
  let low=0,high=definition.corridor*.83;
  for(let iteration=0;iteration<32;iteration++){
    const mid=(low+high)/2,points=withAmplitude(mid);
    const legal=pathLength(points)<definition.inkLimit*.975&&points.every(point=>point.x>=0&&point.x<=level.width&&point.y>=80&&point.y<=level.height-90);
    if(legal)low=mid;else high=mid;
  }
  assert(low>35,`${definition.id}: the gesture must contain a substantial visible curve`);
  const points=withAmplitude(low);if(reverse)points.reverse();return points;
}

export function drawHandCurve(run:WorldRun,level:WorldLevel,id:string,shape:HandCurve,reverse=false,duration=0):void {
  const definition=level.drawings.find(drawing=>drawing.id===id)!;
  const points=drawingGesture(run,level,definition,handPoints(definition,level,shape,reverse));
  const started=beginStroke(run,level,points[0]);assert(started.ok,`${id}: ${started.message}`);
  for(const point of points.slice(1)){
    appendStroke(run,level,point);
    if(duration)humanWait(run,level,duration/(points.length-1));
  }
  const finished=finishStroke(run,level);assert(finished.ok,`${id}: ${finished.message}`);assert.equal(finished.drawingId,id);
  const actual=run.drawings[id];
  assert(actual.points.length>=5,`${id}: curved input must survive simplification`);
  assert(actual.inkLength>Math.hypot(definition.to.x-definition.from.x,definition.to.y-definition.from.y)*1.015);
}

export function reloadHandRun(run:WorldRun,level:WorldLevel):WorldRun {
  const snapshot=JSON.parse(JSON.stringify(saveRun(run))),restored=restoreRun(snapshot,level);assert(restored);
  assert.equal(restored.time,run.time);
  assert.deepEqual(restored.units.map(unit=>[unit.id,unit.x,unit.y]),run.units.map(unit=>[unit.id,unit.x,unit.y]));
  assert.deepEqual(restored.drawings,run.drawings,'reloading must preserve the player’s curved bridges');
  assert.equal(restored.lost,run.lost);assert.equal(restored.retries,run.retries);
  if(restored.phase!=='won')assert(applyAction(restored,level,{type:'start'}).ok);return restored;
}

export function prepareLocalWeights(level:WorldLevel,network:ExpeditionNetwork,shape:HandCurve,omitReturns=false):WorldRun {
  // Later tableaux are reached through real play. The reference controller is
  // used only before this starting save, never while testing local completion.
  const run=network.id==='s0'?createRun(level):reachedRun(level,`${network.id}:entry`);
  if(run.phase==='playing')assert(applyAction(run,level,{type:'pause',paused:true}).ok);
  for(const id of network.drawings)if(run.drawings[id])assert(applyAction(run,level,{type:'erase',id}).ok);
  for(const [index,id] of network.drawings.entries()){
    if(omitReturns&&id.includes(':return-'))continue;
    drawHandCurve(run,level,id,shape,index%2===1);
  }
  for(const id of network.forks)if(run.devices[id].mode!==1)assert(applyAction(run,level,{type:'device',id,mode:1}).ok);
  assert(applyAction(run,level,{type:'start'}).ok);return run;
}

/** Observe a load, tap its local crank, then change its local junction. No
 * command knows about, or touches, the following tableau’s mechanisms. */
export function operateLocalWeights(run:WorldRun,level:WorldLevel,network:ExpeditionNetwork):void {
  for(const [index,id] of network.weights.entries()){
    const definition=level.devices.find(device=>device.id===id)!,state=run.devices[id];
    if(state.mode===0&&state.load>=definition.requiredLoad!&&getDeviceStatus(run,level,id).modes[1].enabled)assert(applyAction(run,level,{type:'device',id,mode:1}).ok);
    const fork=network.forks[index],mode=state.mode===1?0:1;
    if(run.devices[fork].mode!==mode)assert(applyAction(run,level,{type:'device',id:fork,mode}).ok);
  }
}

export function localTroupeIsTogether(run:WorldRun,level:WorldLevel,network:ExpeditionNetwork):boolean {
  const end=level.nodes.find(node=>node.id===network.end)!;
  return run.spawned===level.total&&run.units.filter(unit=>unit.state!=='lost').every(unit=>
    (run.visits[network.end]??[]).includes(unit.id)&&unit.x>=end.x-.05&&!unit.returning);
}

export function assertLocalReunion(run:WorldRun,level:WorldLevel,network:ExpeditionNetwork,nextPrefix:string):void {
  assert(localTroupeIsTogether(run,level,network),`${level.id}/${network.id}: every companion must leave this tableau without solving the next one; ${JSON.stringify(run.units.map(unit=>({id:unit.id,node:unit.nodeId,edge:unit.edgeId,x:Math.round(unit.x)})))}`);
  assert.equal(run.lost,0);assert.equal(run.retries,0);
  assert.equal(run.devices[`${nextPrefix}:relay`].mode,0,'the next tableau’s relay must remain untouched');
  assert(!Object.keys(run.drawings).some(id=>id.startsWith(`${nextPrefix}:`)),'no bridge in the next tableau was drawn');
  for(const device of level.devices.filter(device=>device.playerControlled!==false&&device.id.startsWith(`${nextPrefix}:`)))
    assert.equal(run.devices[device.id].mode,device.initialMode,'all next-tableau controls remain at their initial setting');
}
