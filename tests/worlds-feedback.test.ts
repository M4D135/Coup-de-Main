import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {appendStroke,applyAction,beginStroke,cancelStroke,createRun,finishStroke,saveRun,updateRun} from '../lib/worlds/engine';
import {companionFeedback,createStillnessWatch,deviceFeedback,getCurrentStillnessNotice,observeStillness,waitingGroupFeedback,type StillnessWatch,type WaitingNotice} from '../lib/worlds/feedback';
import type {Creature,WorldLevel,WorldRun} from '../lib/worlds/types';
import {drawExpedition} from './worlds-expedition-walkthrough';

function advance(run:WorldRun,level:WorldLevel,seconds:number){
  for(let i=0;i<seconds*10;i++)updateRun(run,level,.1);
}

function watchFor(watch:StillnessWatch,run:WorldRun,level:WorldLevel,group:readonly Creature[],seconds:number,enabled=true):WaitingNotice[]{
  const notices:WaitingNotice[]=[];
  for(let i=0;i<seconds*10;i++){const notice=observeStillness(watch,run,level,.1,group,enabled);if(notice)notices.push(notice);}
  return notices;
}

function loadedBalance(level=WORLD_LEVELS[0]){
  const run=createRun(level);
  assert(drawExpedition(run,level,'s0:weight-thread'));
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  assert(applyAction(run,level,{type:'start'}).ok);
  advance(run,level,70);
  assert.equal(run.devices['s0:balance'].load,3);
  assert(run.units.every(unit=>unit.state==='waiting'||unit.state==='queued'));
  return {run,level};
}

function separatedGroups(){
  const {run,level}=loadedBalance();
  assert(drawExpedition(run,level,'s0:high-thread'));
  assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  advance(run,level,90);
  const porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);
  const forward=run.units.filter(unit=>unit.x>3200);
  assert.equal(porters.length,3);assert.equal(forward.length,9);
  assert(run.units.every(unit=>unit.state==='waiting'));
  return {run,level,porters,forward};
}

test('a latched balance requests its return bridge without waiting for an unrelated arrival marker',()=>{
  const {run,level}=loadedBalance();
  assert.match(deviceFeedback(run,level,'s0:balance'),/Engage son cran/);
  assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  assert.match(deviceFeedback(run,level,'s0:balance'),/^Câble retenu\..*passage de retour/);
  assert(drawExpedition(run,level,'s0:high-thread'));
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  advance(run,level,90);
  assert.equal(run.devices['s0:relay'].mode,1);
  assert.match(deviceFeedback(run,level,'s0:balance'),/^Câble retenu\..*passage de retour/);
  const before=JSON.stringify(saveRun(run));
  deviceFeedback(run,level,'s0:balance');
  assert.equal(JSON.stringify(saveRun(run)),before,'reading a balance must not toggle its crank or build a passage');
});

test('a stopped group gives its own cause rather than the other group’s obstacle',()=>{
  const {run,level,porters,forward}=separatedGroups();
  const pan=waitingGroupFeedback(run,level,porters),scouts=waitingGroupFeedback(run,level,forward);
  assert(pan&&porters.some(unit=>unit.id===pan.unitId));
  assert(scouts&&forward.some(unit=>unit.id===scouts.unitId));
  assert.match(pan.message,/passage de retour/);
  assert.match(scouts.message,/Il manque un passage devant/);
  assert.notEqual(pan.message,scouts.message);
});

test('the head of a real queue on a curved bridge may stand to the left of its followers',()=>{
  // Close only the downstream road in this test copy, so the simulation forms
  // a queue on a legal hand-drawn curve. No creature poses are fabricated.
  const level=structuredClone(WORLD_LEVELS[0]);
  level.edges.find(edge=>edge.id==='s0:far-road')!.gates=[{deviceId:'s0:relay',mode:1}];
  const {run}=loadedBalance(level),drawing=level.drawings.find(drawing=>drawing.id==='s0:high-thread')!;
  assert(beginStroke(run,level,drawing.from).ok);
  for(const point of [{x:drawing.to.x-120,y:drawing.to.y-90},{x:drawing.to.x+120,y:drawing.to.y-20},drawing.to])appendStroke(run,level,point);
  assert(finishStroke(run,level).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  advance(run,level,90);
  const queue=run.units.filter(unit=>unit.edgeId==='s0:high-thread'&&unit.state==='waiting');
  assert(queue.length>=3);
  const ordered=[...queue].sort((a,b)=>b.distance-a.distance),front=ordered[0],tail=ordered.at(-1)!;
  assert(front.x<Math.max(...queue.map(unit=>unit.x)),'this regression must actually distinguish route progress from x');
  const notice=waitingGroupFeedback(run,level,[tail]);
  assert.equal(notice?.unitId,front.id,'the visible tail identifies the head of its shared queue');
  assert.match(notice?.message??'',/repère|borne|compagnons|éclaireurs/);
  assert.doesNotMatch(notice?.message??'',/Un compagnon attend devant/);
});

test('pause preserves an existing obstacle diagnosis while a paused walker only reports the pause',()=>{
  const {run,level,porters}=separatedGroups();
  assert(applyAction(run,level,{type:'pause',paused:true}).ok);
  assert.match(companionFeedback(run,level,porters[0])??'',/^En pause\..*passage de retour/);
  const walking=createRun(level);applyAction(walking,level,{type:'start'});advance(walking,level,1);
  const walker=walking.units.find(unit=>unit.state==='walking');assert(walker);
  applyAction(walking,level,{type:'pause',paused:true});
  assert.equal(companionFeedback(walking,level,walker),'Le temps est en pause.');
});

test('eight seconds of complete stillness emits once, remains silent across pause and resets for a new obstacle',()=>{
  const {run,level}=loadedBalance(),watch=createStillnessWatch();
  const porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);
  const notices:string[]=[];
  const observe=(seconds:number,group:Creature[]=porters,enabled=true)=>{
    for(let i=0;i<seconds*10;i++){
      updateRun(run,level,.1);
      const notice=observeStillness(watch,run,level,.1,group,enabled);if(notice)notices.push(notice.message);
    }
  };
  observe(7.9);assert.equal(notices.length,0);
  observe(.3);assert.equal(notices.length,1);assert.match(notices[0],/Le câble n’est pas retenu/);
  const current=getCurrentStillnessNotice(watch);assert(current);assert.doesNotMatch(current.message,/Engage|Charge|Dessine/);
  observe(30);assert.equal(notices.length,1,'a stationary party does not produce a repeating hint');
  assert.equal(getCurrentStillnessNotice(watch),current,'the visual notice remains stable beyond a toast timeout');
  applyAction(run,level,{type:'pause',paused:true});observe(20);assert.equal(notices.length,1);assert.equal(getCurrentStillnessNotice(watch),null);
  applyAction(run,level,{type:'pause',paused:false});observe(12);assert.equal(notices.length,1,'pause/resume does not announce the same situation again');
  assert.deepEqual(getCurrentStillnessNotice(watch),current,'the same real obstacle can become visible again silently');
  assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  observe(11);assert.equal(notices.length,2);assert.match(notices[1],/passage de retour/);
  const before=JSON.stringify(saveRun(run));
  for(let i=0;i<100;i++){observeStillness(watch,run,level,.1,porters);getCurrentStillnessNotice(watch);}
  assert.equal(JSON.stringify(saveRun(run)),before);
});

test('a passive notice disappears for a menu or drawing and returns without repeating its announcement',()=>{
  const {run,level}=loadedBalance(),watch=createStillnessWatch(),porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);
  assert.equal(watchFor(watch,run,level,porters,8.2).length,1);
  const first=getCurrentStillnessNotice(watch);assert(first);
  assert.equal(observeStillness(watch,run,level,.1,porters,false),null);assert.equal(getCurrentStillnessNotice(watch),null);
  assert.equal(watchFor(watch,run,level,porters,7.9).length,0);assert.equal(getCurrentStillnessNotice(watch),null);
  assert.equal(watchFor(watch,run,level,porters,.4).length,0);assert.deepEqual(getCurrentStillnessNotice(watch),first);
  const drawing=level.drawings.find(drawing=>drawing.id==='s0:high-thread')!;
  assert(beginStroke(run,level,drawing.from).ok);
  assert.equal(observeStillness(watch,run,level,.1,porters),null);assert.equal(getCurrentStillnessNotice(watch),null);
  cancelStroke(run);
  assert.equal(watchFor(watch,run,level,porters,8.2).length,0);assert.deepEqual(getCurrentStillnessNotice(watch),first);
  assert.equal(watch.reported.size,1);
});

test('a changed visible group clears the old notice and an empty viewport never describes an offscreen group',()=>{
  const {run,level,porters,forward}=separatedGroups(),watch=createStillnessWatch();
  assert.equal(watchFor(watch,run,level,porters,8.2).length,1);
  const first=getCurrentStillnessNotice(watch);assert(first);assert.match(first.message,/passage de retour/);
  assert.equal(observeStillness(watch,run,level,.1,[...porters].reverse()),null);
  assert.equal(getCurrentStillnessNotice(watch),first,'proximity sorting does not reset a stable visible group');
  assert.equal(observeStillness(watch,run,level,.1,forward),null);assert.equal(getCurrentStillnessNotice(watch),null);
  assert.equal(watchFor(watch,run,level,forward,8.2).length,1);
  const next=getCurrentStillnessNotice(watch);assert(next);assert(forward.some(unit=>unit.id===next.unitId));
  assert.match(next.message,/Il manque un passage devant/);
  assert.equal(observeStillness(watch,run,level,.1,[]),null);assert.equal(getCurrentStillnessNotice(watch),null);
  assert.equal(watchFor(watch,run,level,[],30).length,0);assert.equal(getCurrentStillnessNotice(watch),null);
  assert.equal(watchFor(watch,run,level,porters,8.2).length,0);assert.deepEqual(getCurrentStillnessNotice(watch),first);
  assert.equal(watch.reported.size,2);
});

test('a real change to the obstacle or movement withdraws the passive notice without operating a mechanism',()=>{
  const {run,level}=loadedBalance(),watch=createStillnessWatch(),porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);
  const before=JSON.stringify(saveRun(run));
  assert.equal(watchFor(watch,run,level,porters,8.2).length,1);assert(getCurrentStillnessNotice(watch));
  assert.equal(JSON.stringify(saveRun(run)),before);
  assert.match(companionFeedback(run,level,porters[0])??'',/Engage son cran/,'a requested explanation keeps its detail');
  assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  assert.equal(observeStillness(watch,run,level,.1,porters),null);assert.equal(getCurrentStillnessNotice(watch),null);
  assert.equal(watchFor(watch,run,level,porters,8.2).length,1);assert.match(getCurrentStillnessNotice(watch)?.message??'',/passage de retour/);
  assert(drawExpedition(run,level,'s0:return-thread'));
  assert.equal(observeStillness(watch,run,level,.1,porters),null);assert.equal(getCurrentStillnessNotice(watch),null);
  advance(run,level,1);assert(porters.some(unit=>unit.state==='walking'));
  assert.equal(watchFor(watch,run,level,porters,10).length,0);assert.equal(getCurrentStillnessNotice(watch),null);
});

test('movement, an open pause menu and the visible group govern the passive notice',()=>{
  const level=WORLD_LEVELS[0],moving=createRun(level),watch=createStillnessWatch();
  applyAction(moving,level,{type:'start'});
  for(let i=0;i<100;i++){
    updateRun(moving,level,.1);
    assert.equal(observeStillness(watch,moving,level,.1,moving.units),null,'a moving party never gets a waiting notice');
  }
  const {run,porters}=separatedGroups();
  for(let i=0;i<100;i++)assert.equal(observeStillness(watch,run,level,.1,porters,false),null);
  const notices:WaitingNotice[]=[];
  for(let i=0;i<83;i++){const notice=observeStillness(watch,run,level,.1,porters);if(notice)notices.push(notice);}
  assert.equal(notices.length,1);assert.match(notices[0].message,/passage de retour/);
  assert(porters.some(unit=>unit.id===notices[0].unitId),'the passive notice describes the group currently visible');
});

test('a distant Veilleurs pendulum keeps moving without silencing a completely stopped troupe',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level),watch=createStillnessWatch();
  applyAction(run,level,{type:'start'});advance(run,level,80);
  assert(run.units.every(unit=>unit.state==='waiting'||unit.state==='riding'));
  const pendulum=level.devices.find(device=>device.kind==='pendulum')!;
  assert(pendulum);const positions=new Set<number>(),notices:WaitingNotice[]=[];
  for(let i=0;i<85;i++){
    updateRun(run,level,.1);positions.add(run.devices[pendulum.id].progress);
    const notice=observeStillness(watch,run,level,.1,run.units);if(notice)notices.push(notice);
  }
  assert(positions.size>50,'the real simulation continues animating the distant pendulum');
  assert.equal(notices.length,1);
});
