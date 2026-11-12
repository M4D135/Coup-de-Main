import test from 'node:test';
import assert from 'node:assert/strict';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getDrawingEndpoints,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import type {WorldRun} from '../lib/worlds/types';

const level=WORLD_LEVELS[2];
const play=(run:WorldRun,seconds:number)=>{
  for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=.1)updateRun(run,level,.1);
};
const set=(run:WorldRun,id:string,mode:number)=>{
  const changed=applyAction(run,level,{type:'device',id,mode});assert(changed.ok,changed.message);
};

function draw(run:WorldRun,id:string):void {
  const drawing=level.drawings.find(drawing=>drawing.id===id)!,{from,to}=getDrawingEndpoints(run,level,drawing);
  const started=beginStroke(run,level,from);assert(started.ok,started.message);
  appendStroke(run,level,{x:(from.x+to.x)/2,y:(from.y+to.y)/2-32});appendStroke(run,level,to);
  const finished=finishStroke(run,level);assert(finished.ok,finished.message);assert.equal(finished.drawingId,id);
}

for(const earlyReturn of [false,true])for(const earlyLock of [false,true])test(`Veilleurs 1: ${earlyReturn?'an early':'a late'} return and ${earlyLock?'an early':'a late'} retaining notch recover every porter after a reload`,()=>{
  let run=createRun(level);
  draw(run,'s0:weight-thread');draw(run,'s0:high-thread');
  if(earlyReturn)draw(run,'s0:return-thread');
  set(run,'s0:fork',1);assert(applyAction(run,level,{type:'start'}).ok);play(run,20);
  assert.equal(run.devices['s0:balance'].load,2);assert.equal(run.devices['s0:balance'].progress,1);
  const porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).map(unit=>unit.id);
  assert.equal(porters.length,2);
  if(earlyLock)set(run,'s0:balance',1);
  set(run,'s0:fork',0);

  // An explicit human sequence, with no solver choosing a missing drawing,
  // locking the plateau or waiting for an ideal three-passenger final batch.
  for(let cycle=0;cycle<5;cycle++){
    play(run,10);set(run,'s0:lift',1);play(run,12);set(run,'s0:lift',0);play(run,5);
  }
  assert.equal(run.devices['s0:lift'].load,0);assert.equal(run.devices['s0:lift'].progress,0);
  if(!earlyReturn||!earlyLock){
    // This is the reported screen: two helpers remain, ten have moved right.
    assert.equal(run.devices['s0:balance'].load,2);
    assert.equal(run.visits['s0:rest']?.length,10);
    assert(porters.every(id=>run.units[id].nodeId==='s0:pan'&&run.units[id].edgeId===null));
  }
  const snapshot=JSON.parse(JSON.stringify(saveRun(run))),restored=restoreRun(snapshot,level);assert(restored);
  for(const id of porters){assert.equal(restored.units[id].x,run.units[id].x);assert.equal(restored.units[id].y,run.units[id].y);}
  assert.equal(restored.devices['s0:balance'].mode,earlyLock?1:0);
  assert.equal(!!restored.drawings['s0:return-thread'],earlyReturn);
  run=restored;assert(applyAction(run,level,{type:'start'}).ok);

  if(!earlyReturn)draw(run,'s0:return-thread');
  if(!earlyLock)set(run,'s0:balance',1);
  play(run,40);
  assert.equal(run.devices['s0:balance'].load,0);
  assert.equal(run.devices['s0:balance'].mode,1);
  assert.equal(run.lost,0);assert.equal(run.retries,0);
  for(const id of porters){
    assert(run.passages['s0:return-thread'].includes(id),'each original helper walked its actual return');
    assert(run.visits['s0:return-bank'].includes(id),'each original helper reached the far landing');
  }
  // The next closed portal queues the last companion just before the souvenir.
  // Require all twelve beyond this tableau's mechanisms, not a fabricated visit.
  const landing=level.nodes.find(node=>node.id==='s0:far')!,exits=new Set(['s0:far-road','s0:low-road','link:1','s2:entry']);
  assert(run.units.every(unit=>unit.x>=landing.x&&unit.edgeId!==null&&exits.has(unit.edgeId)),
    JSON.stringify(run.units.map(unit=>({id:unit.id,node:unit.nodeId,edge:unit.edgeId,x:unit.x}))));
  assert.equal(run.units.length,12);
  assert.equal(run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).length,0);
});
