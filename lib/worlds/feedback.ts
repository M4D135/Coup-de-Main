import {getDeviceStatus,getEdgePath,getWaitingReason,pathLength} from './engine';
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

export type StillnessWatch={run:WorldRun|null;signature:string|null;seconds:number;reported:Set<string>};
export const createStillnessWatch=():StillnessWatch=>({run:null,signature:null,seconds:0,reported:new Set()});

/** UI-only observation. No action, saved state, speed or pause is changed.
 * One notice is allowed per unchanged situation, even after a pause/resume. */
export function observeStillness(watch:StillnessWatch,run:WorldRun,level:WorldLevel,dt:number,group:readonly Creature[],enabled=true):WaitingNotice|null {
  if(watch.run!==run){watch.run=run;watch.signature=null;watch.seconds=0;watch.reported.clear();}
  const active=run.units.filter(unit=>!['queued','saved','lost'].includes(unit.state));
  if(!enabled||run.phase!=='playing'||!active.length||active.some(unit=>!stopped(unit))){watch.signature=null;watch.seconds=0;return null;}
  const signature=JSON.stringify([
    run.saved,run.lost,run.retries,
    active.map(unit=>[unit.id,unit.state,unit.nodeId,unit.edgeId,!!unit.returning,unit.distance.toFixed(1),unit.x.toFixed(1),unit.y.toFixed(1),getWaitingReason(run,level,unit,true)]),
    // Unrelated pendulums keep swinging while everyone waits. Only a changed
    // control or an actual change to the troupe's obstacle resets this notice.
    Object.entries(run.devices).map(([id,state])=>[id,state.mode]),
    Object.entries(run.drawings).map(([id,drawing])=>[id,drawing.inkLength.toFixed(1)]),
  ]);
  if(signature!==watch.signature){watch.signature=signature;watch.seconds=0;return null;}
  watch.seconds+=Number.isFinite(dt)?Math.max(0,Math.min(.5,dt)):0;
  if(watch.seconds<8||watch.reported.has(signature))return null;
  const notice=waitingGroupFeedback(run,level,group.some(stopped)?group:active);
  if(notice)watch.reported.add(signature);
  return notice;
}
