import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS} from './fixtures/worlds-v2';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getActiveAct,getActCount,getDeviceStatus,getJourneySummary,getRunSummary,isJourneyComplete,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {advanceUntil,drawPassage,setDevice,solveCurrentAct} from './worlds-walkthrough';

for(const world of WORLD_LEVELS)test(`${world.name}: all three different acts finish with the same twelve and survive saved intermissions`,t=>{
  let run=createRun(world);const durations:number[]=[];
  assert.equal(getActCount(world),3);assert.equal(applyAction(run,world,{type:'advanceAct'}).ok,false);
  for(let index=0;index<3;index++){
    assert.equal(run.actIndex,index);assert.equal(run.units.length,12);
    solveCurrentAct(run,world);durations.push(Math.round(run.time));
    assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.actResults.length,index+1);
    assert.equal(isJourneyComplete(world,run),index===2);
    assert.equal(getJourneySummary(run,world).stars,index===2?3:0,'an intermediate refuge is not a completed journey');
    const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),world);
    assert(restored);assert.equal(restored.phase,'won');assert.deepEqual(restored.actResults,run.actResults);run=restored;
    if(index<2){assert(applyAction(run,world,{type:'advanceAct'}).ok);assert.equal(run.phase,'ready');assert.equal(run.time,0);assert.equal(run.saved,0);}
  }
  const summary=getJourneySummary(run,world);
  assert.equal(summary.complete,true);assert.equal(summary.completedActs,3);assert(summary.mastered);
  assert.equal(Math.round(summary.time),Math.round(run.actResults.reduce((sum,act)=>sum+act.time,0)));
  assert.equal(applyAction(run,world,{type:'advanceAct'}).ok,false);
  t.diagnostic(`Solution exécutée : ${durations.join(' + ')} s ; total ${Math.round(summary.time)} s ; encre ${summary.inkUsed}/${summary.masteryInk}.`);
});

test('scout relays cannot be clicked open and reserve their route to exactly two companions',()=>{
  const world=WORLD_LEVELS[0],run=createRun(getActiveAct(world,{actIndex:1}));
  assert.equal(getDeviceStatus(run,world,'river-lock').actionable,false);
  assert.equal(applyAction(run,world,{type:'device',id:'river-lock',mode:1}).ok,false);
  drawPassage(run,world,'cradle-return');drawPassage(run,world,'sky-bridge');setDevice(run,world,'fork',1);applyAction(run,world,{type:'start'});
  advanceUntil(run,world,()=>run.saved===2);
  for(let frame=0;frame<60*10;frame++)updateRun(run,world,1/60);
  assert.equal(run.passages['weight-descent'].length,2);assert.equal(run.saved,2);assert.equal(run.devices['river-lock'].mode,1);
  const changedAt=run.time;setDevice(run,world,'fork',0);
  let recalledAtMerge=false;
  advanceUntil(run,world,()=>run.phase==='won',120,()=>{if(run.units.some(unit=>unit.returning&&unit.edgeId==='weight-return'))recalledAtMerge=true;});
  assert.equal(run.saved,12);assert.equal(recalledAtMerge,false,'a normal queue at the common exit cannot recall a different branch');
  assert(run.time-changedAt<55,'the main troupe must not perform accidental return loops');
});

test('the final ink puzzle requires a real safe erasure and refunds the shared resource',()=>{
  const world=WORLD_LEVELS[0],run=createRun(getActiveAct(world,{actIndex:2}));
  drawPassage(run,world,'sky-bridge');
  const second=getActiveAct(world,run).drawings.find(drawing=>drawing.id==='cradle-return')!;
  assert(beginStroke(run,world,second.from).ok);for(const point of second.suggested.slice(1))appendStroke(run,world,point);
  assert.equal(finishStroke(run,world).ok,false);assert(run.drawings['sky-bridge']);assert(!run.drawings['cradle-return']);
  applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.units.some(unit=>unit.edgeId==='upper-bridge'));
  assert.equal(applyAction(run,world,{type:'erase',id:'sky-bridge'}).ok,false);
  advanceUntil(run,world,()=>run.saved===2);assert(applyAction(run,world,{type:'erase',id:'sky-bridge'}).ok);
  assert.equal(getRunSummary(run,world).inkAvailable,650);
  assert(applyAction(run,world,{type:'undo'}).ok);assert(run.drawings['sky-bridge']);
  assert(applyAction(run,world,{type:'undo'}).ok);assert(!run.drawings['sky-bridge']);
  assert.equal(run.devices['river-lock'].mode,1,'undo cannot retract a physical relay already activated by the scouts');
  drawPassage(run,world,'cradle-return');setDevice(run,world,'fork',1);advanceUntil(run,world,()=>run.phase==='won');
  assert.equal(run.saved,12);
});

test('Veilleurs balance access closes after the latch, so sending everyone through it cannot win',()=>{
  const world=WORLD_LEVELS[2],run=createRun(world);
  for(const id of ['balance-access','balance-return','lantern-bridge'])drawPassage(run,world,id);
  assert.equal(getDeviceStatus(run,world,'balance').modes[1].enabled,false);
  setDevice(run,world,'fork',1);applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.devices.balance.load===2);
  assert.equal(getDeviceStatus(run,world,'balance').modes[1].enabled,true);setDevice(run,world,'balance',1);
  advanceUntil(run,world,()=>run.saved===2);
  for(let frame=0;frame<60*20;frame++)updateRun(run,world,1/60);
  assert.equal(run.saved,2);assert.equal(run.passages['pan-ramp'].length,2);assert.equal(run.phase,'playing');
  assert.equal(getDeviceStatus(run,world,'balance').modes[0].enabled,false);
  assert.equal(applyAction(run,world,{type:'device',id:'balance',mode:0}).ok,false,'the latch cannot be cycled to bypass the elevator or strand the troupe');
  assert.equal(run.devices.balance.mode,1);
  setDevice(run,world,'fork',0);let since:number|null=null;
  advanceUntil(run,world,()=>run.phase==='won',180,()=>{
    const lift=run.devices.lift;
    if(lift.mode===0&&lift.progress<=.01&&lift.load>0){since??=run.time;if(lift.load===3||run.time-since>4)setDevice(run,world,'lift',1);}
    else if(lift.mode===1&&lift.progress>=.99&&lift.load===0){setDevice(run,world,'lift',0);since=null;}
  });
  assert.equal(run.saved,12);assert.equal(run.passages.elevator.length,10);
});

test('the pendulum gate releases one scout per decision, then becomes a whole-troupe action after braking',()=>{
  const world=WORLD_LEVELS[2],run=createRun(getActiveAct(world,{actIndex:1}));
  drawPassage(run,world,'lower-return');applyAction(run,world,{type:'start'});
  advanceUntil(run,world,()=>run.units.some(unit=>unit.edgeId==='low-floor'&&unit.x>=944));
  advanceUntil(run,world,()=>run.time%12>=6.25&&run.time%12<6.4);
  assert.match(getDeviceStatus(run,world,'pendulum-gate').modes[1].label,/un éclaireur/);
  setDevice(run,world,'pendulum-gate',1);updateRun(run,world,1/60);
  assert.equal(run.devices['pendulum-gate'].mode,0);assert.equal(run.passages['swing-crossing'].length,1);
  for(let frame=0;frame<60;frame++)updateRun(run,world,1/60);
  assert.equal(run.passages['swing-crossing'].length,1,'a single click cannot accidentally release the queue');
  solveCurrentAct(run,world);assert.equal(run.saved,12);
  assert.match(getDeviceStatus(run,world,'pendulum-gate').modes[1].label,/la troupe/);
});

test('a lost companion remains lost across tableaux and sparse survivor IDs keep distinct seats after restart',()=>{
  const world=WORLD_LEVELS[2];let run=createRun(world);
  solveCurrentAct(run,world);assert(applyAction(run,world,{type:'advanceAct'}).ok);
  drawPassage(run,world,'lower-return');applyAction(run,world,{type:'start'});
  advanceUntil(run,world,()=>run.units.some(unit=>unit.edgeId==='low-floor'&&unit.x>=944));
  advanceUntil(run,world,()=>run.time%12>=6.25&&run.time%12<6.4);
  setDevice(run,world,'pendulum-gate',1);advanceUntil(run,world,()=>((run.visits['pendulum-exit']?.length??0)===1));
  advanceUntil(run,world,()=>run.time%12>=2&&run.time%12<2.1);
  setDevice(run,world,'pendulum-gate',1);advanceUntil(run,world,()=>run.lost===1);
  assert.equal(run.units[1].state,'lost');
  solveCurrentAct(run,world);assert.equal(run.saved,11);assert.equal(run.lost,1);
  assert(applyAction(run,world,{type:'advanceAct'}).ok);
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),world);assert(restored);run=restored;
  assert.equal(run.actIndex,2);assert.equal(run.units[1].state,'lost');assert.equal(run.units.filter(unit=>unit.state==='queued').length,11);
  for(const id of ['balance-access','balance-return','lantern-bridge','lower-return'])drawPassage(run,world,id);
  applyAction(run,world,{type:'start'});advanceUntil(run,world,()=>run.devices.balance.load===2);
  const porters=run.units.filter(unit=>unit.nodeId==='balance-pan'&&unit.edgeId===null);
  assert.deepEqual(porters.map(unit=>unit.id),[0,2]);assert.equal(new Set(porters.map(unit=>unit.formationSlot)).size,2);
  assert(Math.abs(porters[0].x-porters[1].x)>40);
  assert(applyAction(run,world,{type:'restart'}).ok);assert.equal(run.actIndex,2);assert.equal(run.lost,1);assert.equal(run.actResults.length,2);
  solveCurrentAct(run,world);const summary=getJourneySummary(run,world);
  assert(summary.complete);assert.equal(summary.saved,11);assert.equal(summary.stars,1);
});

test('old one-tableau saves migrate safely while malformed new act history is rejected',()=>{
  const world=WORLD_LEVELS[0],old={...saveRun(createRun(world)),version:1};
  const migrated=restoreRun(old,world);assert(migrated);
  assert.equal(migrated.version,3);assert.equal(migrated.actIndex,0);assert.equal(migrated.phase,'ready');assert.deepEqual(migrated.actResults,[]);
  assert.match(migrated.message,/aventure continue/);
  const invalid={...saveRun(createRun(world)),actIndex:1,actResults:[]};
  assert.equal(restoreRun(invalid,world),null);
});
