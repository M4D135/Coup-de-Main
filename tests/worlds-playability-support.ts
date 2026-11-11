import assert from 'node:assert/strict';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getEdgePath,getPendulumPosition,pathLength,pointAlongPath,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {WORLD_NETWORKS,type ExpeditionNetwork} from '../lib/worlds/levels';
import type {Creature,RunSnapshot,WorldLevel,WorldRun} from '../lib/worlds/types';
import {expeditionController,solveExpedition} from './worlds-expedition-walkthrough';

const reached=new Map<string,Map<string,RunSnapshot>>();

/** Advance the actual simulation. No test moves a creature, changes its
 * reservation, grants a relay, or assigns a device's runtime state. */
export function playFor(run:WorldRun,level:WorldLevel,seconds:number):void {
  for(let time=0;time<seconds-1e-8&&run.phase==='playing';time+=.1)updateRun(run,level,.1);
}

function waitingAt(run:WorldRun,level:WorldLevel,nodeId:string):Creature|undefined {
  return run.units.find(unit=>{
    if(['lost','saved','queued'].includes(unit.state))return false;
    if(unit.edgeId===null)return unit.nodeId===nodeId;
    const edge=level.edges.find(candidate=>candidate.id===unit.edgeId)!;
    return edge.to===nodeId&&unit.distance>=pathLength(getEdgePath(run,level,edge))-.1;
  });
}

/** Cache saves from genuinely reached moments. Restoring them is the same
 * public reload operation as reopening the game, never a fabricated fixture. */
function collectReachedStates(level:WorldLevel):Map<string,RunSnapshot> {
  const previous=reached.get(level.id);if(previous)return previous;
  const snapshots=new Map<string,RunSnapshot>(),run=createRun(level),control=expeditionController(run,level);
  const capture=(key:string)=>{if(!snapshots.has(key))snapshots.set(key,JSON.parse(JSON.stringify(saveRun(run))) as RunSnapshot);};
  control();applyAction(run,level,{type:'start'});
  for(let frame=0;frame<16000&&run.phase==='playing';frame++){
    for(const network of WORLD_NETWORKS[level.id]){
      const prefix=network.id;
      if(run.units.some(unit=>unit.edgeId===`${prefix}:entry`))capture(`${prefix}:entry`);
      for(const id of network.weights){const state=run.devices[id];if(state.load>0&&state.mode===0)capture(`${prefix}:weight-${id}`);}
      if(network.wind){const state=run.devices[network.wind];if(state.progress>.2&&state.progress<.9)capture(`${prefix}:wind`);}
      if(network.lift){
        const state=run.devices[network.lift];
        if(state.load>0&&state.progress<.02)capture(`${prefix}:lift-board`);
        if(state.load>0&&state.progress>.25&&state.progress<.75)capture(`${prefix}:lift-mid`);
        if(state.load>0&&state.progress>.99)capture(`${prefix}:lift-top`);
      }
      for(const hazard of network.hazards){
        if(waitingAt(run,level,hazard.approach))capture(`${prefix}:hazard-${hazard.gate}-waiting`);
        if(run.units.some(unit=>unit.edgeId===hazard.edge&&unit.distance>5&&unit.state!=='lost'))capture(`${prefix}:hazard-${hazard.gate}-crossing`);
      }
    }
    control();updateRun(run,level,.1);
  }
  assert.equal(run.phase,'won',`${level.id}: the reference journey must reach the actual end`);
  assert.equal(run.saved,12);reached.set(level.id,snapshots);return snapshots;
}

export function reachedRun(level:WorldLevel,key:string):WorldRun {
  const snapshot=collectReachedStates(level).get(key);assert(snapshot,`${level.id}: sensitive moment ${key} must be physically reached`);
  const run=restoreRun(snapshot,level);assert(run,'the game must reload its own public save');
  assert(applyAction(run,level,{type:'start'}).ok);return run;
}

export function reloadPlaying(run:WorldRun,level:WorldLevel):WorldRun {
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored,'a player save must remain reloadable after exploration');
  assert(applyAction(restored,level,{type:'start'}).ok);return restored;
}

/** Reverse input is deliberately independent from the controller's normal
 * gesture. An occupied span or exhausted ink may legitimately reject it. */
export function exploratoryStroke(run:WorldRun,level:WorldLevel,id:string,reverse=false):boolean {
  if(run.drawings[id])return false;
  const definition=level.drawings.find(drawing=>drawing.id===id)!;
  const points=definition.suggested.map(point=>({...point}));if(reverse)points.reverse();
  if(!beginStroke(run,level,points[0]).ok)return false;
  for(const point of points.slice(1))appendStroke(run,level,point);
  return finishStroke(run,level).ok;
}

export function finishWithoutExtraLoss(run:WorldRun,level:WorldLevel):void {
  const losses=run.lost,retries=run.retries;
  solveExpedition(run,level,1800);
  assert.equal(run.saved,level.total-losses);assert.equal(run.lost,losses);
  assert.equal(run.retries,retries,'recoverable exploratory choices must not require a restart');
  for(const network of WORLD_NETWORKS[level.id]){
    const visitors=new Set(run.visits[network.end]??[]);
    assert(run.units.filter(unit=>unit.state==='saved').every(unit=>visitors.has(unit.id)),`${network.id}: all survivors physically crossed the tableau`);
  }
}

/** Select a genuinely dangerous observed phase, then issue exactly one tap.
 * The conservative walkthrough's rejection also includes near misses, so this
 * audit uses a twelve-unit collision margin to test a real lost companion. */
export function releaseOneAtBadTime(run:WorldRun,level:WorldLevel,hazard:ExpeditionNetwork['hazards'][number]):void {
  const baseline=run.lost;let released=false;
  applyAction(run,level,{type:'device',id:hazard.gate,mode:0});
  for(let frame=0;frame<500&&run.lost===baseline&&run.phase==='playing';frame++){
    const unit=waitingAt(run,level,hazard.approach);
    if(unit&&!released){
      const edge=level.edges.find(candidate=>candidate.id===hazard.edge)!,pendulum=level.devices.find(device=>device.id===hazard.pendulum)!;
      const pace=level.pace*(.94+(unit.id%5)*.025)*1.45,span=pathLength(edge.path);let margin=Infinity;
      for(let elapsed=0;elapsed<span/pace+.02;elapsed+=1/60){
        const point=pointAlongPath(edge.path,elapsed*pace),bob=getPendulumPosition(pendulum,run.time+elapsed,run);
        margin=Math.min(margin,Math.hypot(point.x-bob.x,point.y-level.creatureHeight*.4-bob.y)-((pendulum.radius??40)+level.creatureHeight*.22));
      }
      if(margin< -12){assert(applyAction(run,level,{type:'device',id:hazard.gate,mode:1}).ok);released=true;}
    }
    updateRun(run,level,.1);
  }
  assert(released,'a genuinely unsafe interval exists');
  assert.equal(run.lost,baseline+1,'one badly timed release causes exactly one real collision');
}
