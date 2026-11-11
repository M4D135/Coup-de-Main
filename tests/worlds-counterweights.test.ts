import test from 'node:test';
import assert from 'node:assert/strict';
import blockedReturn from './fixtures/worlds-return-queue-v4.json';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import {applyAction,createRun,getDeviceStatus,getEdgePath,getWaitingReason,pathLength,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import type {WorldRun} from '../lib/worlds/types';
import {drawExpedition,expeditionController,solveExpedition} from './worlds-expedition-walkthrough';

const level=WORLD_LEVELS[0];
function advance(run:WorldRun,seconds:number):void {for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=.1)updateRun(run,level,.1);}
function loadedPlateau():WorldRun {
  const run=createRun(level);
  for(const id of WORLD_NETWORKS.boucles[0].drawings)drawExpedition(run,level,id);
  applyAction(run,level,{type:'device',id:'s0:fork',mode:1});applyAction(run,level,{type:'start'});
  for(let frame=0;frame<500&&run.devices['s0:balance'].load<3;frame++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,3);return run;
}

for(const speed of [1,2] as const)test(`rapid junction changes and Undo release returning porter reservations at speed ${speed}`,()=>{
  const run=createRun(level),control=expeditionController(run,level);
  control();applyAction(run,level,{type:'start'});updateRun(run,level,.1);
  applyAction(run,level,{type:'speed',value:speed});
  for(const id of WORLD_NETWORKS.boucles[0].drawings)drawExpedition(run,level,id);
  let observedReturn=false;
  for(let iteration=0;iteration<28;iteration++){
    applyAction(run,level,{type:'device',id:'s0:fork'});
    if(iteration%4===0)applyAction(run,level,{type:'undo'});
    advance(run,.7+iteration%3*.3);observedReturn||=run.units.some(unit=>unit.returning);
  }
  advance(run,40);assert(observedReturn);
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);
  solveExpedition(restored,level,600);assert.equal(restored.saved,12);assert.equal(restored.lost,0);assert.equal(restored.retries,0);
});

test('the actual pre-fix blocked save resumes from its junction without resetting or auto-locking the balance',()=>{
  const run=restoreRun(structuredClone(blockedReturn),level);assert(run);
  assert.equal(run.time,blockedReturn.time);assert.equal(run.saved,0);assert.equal(run.lost,0);
  assert.deepEqual(run.units.map(unit=>[unit.id,unit.x,unit.y]),blockedReturn.units.map(unit=>[unit.id,unit.x,unit.y]));
  for(const id of [6,8]){assert.equal(run.units[id].nodeId,'s0:fork-node');assert.equal(run.units[id].edgeId,null);assert.equal(run.units[id].returning,false);}
  assert.equal(run.devices['s0:balance'].mode,0);assert.equal(run.devices['s0:balance'].load,2);
  applyAction(run,level,{type:'start'});advance(run,10);
  assert.equal(run.devices['s0:balance'].load,3);assert.equal(run.devices['s0:balance'].mode,0,'the player still has to fasten the loaded balance');
  solveExpedition(run,level,600);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
});

test('clicking or undoing an occupied counterweight cannot drop its support; changing the junction remains recoverable',()=>{
  const run=loadedPlateau();applyAction(run,level,{type:'device',id:'s0:balance',mode:1});applyAction(run,level,{type:'device',id:'s0:fork',mode:0});
  const span=level.edges.find(edge=>edge.id==='s0:high-thread')!;
  for(let frame=0;frame<600&&!run.units.some(unit=>unit.edgeId===span.id&&unit.distance>30);frame++)updateRun(run,level,.1);
  assert(run.units.some(unit=>unit.edgeId===span.id&&unit.distance>30&&unit.distance<pathLength(getEdgePath(run,level,span))));
  assert.equal(applyAction(run,level,{type:'device',id:'s0:balance',mode:0}).ok,false);
  assert(applyAction(run,level,{type:'undo'}).ok,'the recent junction choice can still be undone');
  assert.equal(applyAction(run,level,{type:'undo'}).ok,false,'the earlier fastening cannot be removed underneath a companion');
  assert.equal(run.devices['s0:balance'].mode,1);
  solveExpedition(run,level,600);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
});

test('three retained porters report the actual remote relay, then the missing return span, without changing the puzzle',()=>{
  const run=loadedPlateau();applyAction(run,level,{type:'device',id:'s0:balance',mode:1});applyAction(run,level,{type:'device',id:'s0:fork',mode:0});
  assert(applyAction(run,level,{type:'erase',id:'s0:return-thread'}).ok);advance(run,45);
  const porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);assert.equal(porters.length,3);
  assert.equal(run.devices['s2:relay'].mode,0);
  const before=JSON.stringify(saveRun(run)),reason=getDeviceStatus(run,level,'s0:balance').reason;
  assert.match(reason,/relais/);assert.doesNotMatch(reason,/peuvent sortir|Dessine|Oriente|Choisis/);
  assert.equal(getWaitingReason(run,level,porters[0],true),reason);assert.equal(JSON.stringify(saveRun(run)),before);
  for(const id of WORLD_NETWORKS.boucles[1].drawings)drawExpedition(run,level,id);
  applyAction(run,level,{type:'device',id:'s2:wind',mode:1});advance(run,3);
  assert(applyAction(run,level,{type:'device',id:'s2:cleat',mode:1}).ok);applyAction(run,level,{type:'device',id:'s2:wind',mode:0});
  for(let frame=0;frame<1600&&run.devices['s2:relay'].progress<.98;frame++)updateRun(run,level,.1);
  assert(run.devices['s2:relay'].progress>=.98);
  assert.equal(run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).length,3);
  assert.match(getWaitingReason(run,level,porters[0],true)!,/passage de retour/);
  drawExpedition(run,level,'s0:return-thread');
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);
  solveExpedition(restored,level,600);assert.equal(restored.saved,12);assert.equal(restored.lost,0);assert.equal(restored.retries,0);
});
