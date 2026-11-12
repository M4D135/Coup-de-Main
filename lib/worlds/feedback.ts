import {getDeviceStatus,getEdgePath,getWaitingReason,pathLength} from './engine';
import {supportReady} from './mechanics';
import type {Creature,WorldLevel,WorldRun} from './types';

export type WaitingNotice={unitId:number;message:string};
const stopped=(unit:Creature)=>unit.state==='waiting'||unit.state==='riding';
const withPause=(run:WorldRun,message:string)=>run.phase==='paused'?`En pause. ${message}`:message;

export function companionFeedback(run:WorldRun,level:WorldLevel,unit:Creature):string|null {
  const reason=getWaitingReason(run,level,unit,true);
  return reason?withPause(run,reason):run.phase==='paused'?'Le temps est en pause.':null;
}

/** A crank's position and the passage it holds are two different facts. */
export function deviceFeedback(run:WorldRun,level:WorldLevel,id:string):string {
  const status=getDeviceStatus(run,level,id),device=level.devices.find(device=>device.id===id);
  const message=device&&['counterweight','wind','lift','latch'].includes(device.kind)
    ?`${status.stateLabel}. ${status.reason}`
    :`${status.label} · ${status.stateLabel}`;
  return withPause(run,message);
}

/** The front of a queue is measured along its real path, including a bend that
 * comes back to the left. A visible tail may belong to a queue whose head is
 * just outside the viewport, so inspect the entire shared edge. */
export function waitingGroupFeedback(run:WorldRun,level:WorldLevel,group:readonly Creature[]):WaitingNotice|null {
  const heads:Creature[]=[],seen=new Set<number>();
  for(const member of group.filter(stopped)){
    const head=member.edgeId===null?member:run.units.filter(unit=>stopped(unit)
      &&unit.edgeId===member.edgeId&&!!unit.returning===!!member.returning)
      .reduce((first,unit)=>unit.distance>first.distance+.01||(Math.abs(unit.distance-first.distance)<.01&&unit.id<first.id)?unit:first,member);
    if(!seen.has(head.id)){heads.push(head);seen.add(head.id);}
  }
  const atObstacle=(unit:Creature)=>{
    const edge=level.edges.find(edge=>edge.id===unit.edgeId);
    return !edge||edge.kind==='lift'||unit.distance>=pathLength(getEdgePath(run,level,edge))-.1;
  };
  // A companion already at the obstruction describes it; an upstream queue
  // merely knows that someone is standing in front of it.
  heads.sort((a,b)=>Number(atObstacle(b))-Number(atObstacle(a)));
  for(const head of heads){const message=companionFeedback(run,level,head);if(message)return {unitId:head.id,message};}
  return null;
}

/** Passive feedback names the physical obstruction. Instructions remain in
 * the explanation the player explicitly requests by touching a companion. */
function passiveWaitingNotice(run:WorldRun,level:WorldLevel,group:readonly Creature[]):WaitingNotice|null {
  const notice=waitingGroupFeedback(run,level,group);if(!notice)return null;
  const unit=run.units.find(unit=>unit.id===notice.unitId)!;
  const current=level.edges.find(edge=>edge.id===unit.edgeId);
  if(current&&unit.distance<pathLength(getEdgePath(run,level,current))-.1)return notice;
  const nodeId=current?(unit.returning?current.from:current.to):unit.nodeId;
  const balance=level.devices.find(device=>device.kind==='counterweight'&&device.weightNodes?.includes(nodeId));
  if(balance){
    const state=run.devices[balance.id];
    if(state.mode===0&&state.load>=(balance.requiredLoad??1)&&state.progress>=.999)
      return {unitId:notice.unitId,message:'Le plateau est en butée. Le câble n’est pas retenu.'};
  }
  const bridge=level.edges.find(edge=>edge.from===nodeId&&edge.mechanism
    &&(!edge.route||run.devices[edge.route.deviceId]?.mode===edge.route.mode)
    &&(!edge.drawingId||!!run.drawings[edge.drawingId]));
  if(bridge&&!supportReady(run,level,bridge))return {unitId:notice.unitId,message:bridge.mechanism!.drivers.length>1
    ?'Les deux demi-ponts ne sont pas encore raccordés.':'Le pont n’est pas encore raccordé à son palier.'};
  return notice;
}

export type StillnessWatch={run:WorldRun|null;signature:string|null;seconds:number;reported:Set<string>;current:WaitingNotice|null};
export const createStillnessWatch=():StillnessWatch=>({run:null,signature:null,seconds:0,reported:new Set(),current:null});
/** Read the persistent visual state without emitting another announcement. */
export const getCurrentStillnessNotice=(watch:StillnessWatch):WaitingNotice|null=>watch.current;

/** UI-only observation. No action, saved state, speed or pause is changed.
 * The return value is a one-time announcement; current is the persistent
 * visible state. A resumed obstacle may reappear without being announced again. */
export function observeStillness(watch:StillnessWatch,run:WorldRun,level:WorldLevel,dt:number,group:readonly Creature[],enabled=true):WaitingNotice|null {
  if(watch.run!==run){watch.run=run;watch.signature=null;watch.seconds=0;watch.current=null;watch.reported.clear();}
  const active=run.units.filter(unit=>!['queued','saved','lost'].includes(unit.state));
  const visible=group.filter(stopped);
  if(!enabled||run.phase!=='playing'||run.activeStroke||!active.length||!visible.length||active.some(unit=>!stopped(unit))){watch.signature=null;watch.seconds=0;watch.current=null;return null;}
  const signature=JSON.stringify([
    run.saved,run.lost,run.retries,
    [...new Set(visible.map(unit=>unit.id))].sort((a,b)=>a-b),
    active.map(unit=>[unit.id,unit.state,unit.nodeId,unit.edgeId,!!unit.returning,unit.distance.toFixed(1),unit.x.toFixed(1),unit.y.toFixed(1),getWaitingReason(run,level,unit,true)]),
    // Unrelated pendulums keep swinging while everyone waits. Only a changed
    // control or an actual change to the troupe's obstacle resets this notice.
    Object.entries(run.devices).map(([id,state])=>[id,state.mode]),
    Object.entries(run.drawings).map(([id,drawing])=>[id,drawing.inkLength.toFixed(1)]),
  ]);
  if(signature!==watch.signature){watch.signature=signature;watch.seconds=0;watch.current=null;return null;}
  watch.seconds+=Number.isFinite(dt)?Math.max(0,Math.min(.5,dt)):0;
  if(watch.seconds<8)return null;
  if(!watch.current)watch.current=passiveWaitingNotice(run,level,visible);
  if(!watch.current||watch.reported.has(signature))return null;
  watch.reported.add(signature);
  return watch.current;
}
