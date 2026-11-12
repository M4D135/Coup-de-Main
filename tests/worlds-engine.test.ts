import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS} from './fixtures/worlds-v2';
import {ANCHOR_RADIUS,appendStroke,applyAction,beginStroke,createRun,finishStroke,getActiveAct,getDrawingEndpoints,getEdgePath,getPendulumPosition,getRunSummary,pathLength,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {getDeviceAnchor} from '../lib/worlds/mechanics';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';
import {solveCurrentAct} from './worlds-walkthrough';
import {drawingGesture} from './worlds-expedition-walkthrough';

function tick(run:WorldRun,level:WorldLevel,seconds:number,dt=1/60){for(let t=0;t<seconds-1e-9;t+=dt)updateRun(run,level,Math.min(dt,seconds-t));}
function waitFor(run:WorldRun,level:WorldLevel,predicate:()=>boolean,limit=120){
  let time=0;while(!predicate()&&time<limit&&run.phase==='playing'){updateRun(run,level,1/60);time+=1/60;}
  assert(predicate(),`condition not reached in ${limit}s (${level.id} ${run.phase}; saved=${run.saved}, time=${run.time.toFixed(2)}, ${JSON.stringify(run.units.map(u=>({id:u.id,s:u.state,e:u.edgeId,n:u.nodeId,d:Math.round(u.distance)})))})`);
}
function draw(run:WorldRun,level:WorldLevel,id:string,reverse=false){
  const definition=level.drawings.find(item=>item.id===id)!;
  const points=reverse?[...definition.suggested].reverse():definition.suggested;
  assert(beginStroke(run,level,points[0]).ok);
  for(const point of points.slice(1))appendStroke(run,level,point);
  const result=finishStroke(run,level);assert(result.ok,result.message);
}
function device(run:WorldRun,level:WorldLevel,id:string,mode:number){const result=applyAction(run,level,{type:'device',id,mode});assert(result.ok,result.message);}

test('Boucles: split the troupe, load the counterweight, latch it and reunite all twelve',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level);
  // A fresh attempt can still earn mastery: exploration is not a hidden penalty.
  applyAction(run,level,{type:'restart'});assert.equal(run.retries,1);
  draw(run,level,'sky-bridge');draw(run,level,'cradle-return');
  device(run,level,'fork',1);applyAction(run,level,{type:'start'});
  waitFor(run,level,()=>run.devices.balance.load===3);
  assert.equal(applyAction(run,level,{type:'device',id:'balance',mode:1}).ok,true);
  device(run,level,'fork',0);
  waitFor(run,level,()=>run.phase==='won',160);
  assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.devices.balance.mode,1);
  assert.equal(getRunSummary(run,level).stars,3);
});

test('Petits Plis: mill, cleat and sheltered descent make the upper route physically available',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  draw(run,level,'paper-bridge');
  assert.equal(applyAction(run,level,{type:'device',id:'cleat',mode:1}).ok,false);
  device(run,level,'deflector',1);applyAction(run,level,{type:'start'});
  waitFor(run,level,()=>run.devices.deflector.progress>=.97);
  device(run,level,'cleat',1);device(run,level,'deflector',2);
  waitFor(run,level,()=>run.phase==='won');
  assert.equal(run.saved,12);assert.equal(run.devices.deflector.progress,1);
  assert.equal(getRunSummary(run,level).stars,3);assert.equal(getRunSummary(run,level).mastered,true);
});

test('Petits Plis offers a distinct complete lower solution, without a hidden exit condition',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  draw(run,level,'paper-detour',true);device(run,level,'fork',1);device(run,level,'deflector',2);
  applyAction(run,level,{type:'start'});waitFor(run,level,()=>run.phase==='won');
  assert.equal(run.saved,12);assert.equal(run.devices.cleat.mode,0);assert.equal(run.devices.deflector.progress,0);
  assert.equal(getRunSummary(run,level).stars,3);
  assert.equal(getRunSummary(run,level).mastered,true);
  assert.match(getRunSummary(run,level).masteryGoal,/route de ton choix/);
});

test('Boucles: a wrong first junction remains recoverable on foot, including after a mid-return save',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),originalPaths=JSON.stringify(level.edges.map(edge=>edge.path));
  draw(run,level,'sky-bridge');draw(run,level,'cradle-return');
  applyAction(run,level,{type:'start'});tick(run,level,50);
  assert.equal(run.saved,0);assert.equal(run.lost,0);assert(run.units.some(unit=>unit.state==='waiting'&&unit.edgeId==='ridge'));
  device(run,level,'fork',1);
  for(let frame=0;frame<30;frame++){
    const previous=run.units.map(unit=>({x:unit.x,y:unit.y}));
    updateRun(run,level,1/60);
    for(const unit of run.units)assert(Math.hypot(unit.x-previous[unit.id].x,unit.y-previous[unit.id].y)<=1.5,'a recall must walk without teleporting');
  }
  assert(run.units.some(unit=>unit.returning));
  const snapshot=saveRun(run),restored=restoreRun(JSON.parse(JSON.stringify(snapshot)),level)!;
  assert(restored);assert.deepEqual(restored.units,run.units);
  snapshot.units.find(unit=>unit.returning)!.returnEdges.length=0;
  assert(restored.units.some(unit=>unit.returning&&unit.returnEdges.length>0));
  applyAction(restored,level,{type:'start'});
  waitFor(restored,level,()=>restored.devices.balance.load===3);
  device(restored,level,'balance',1);device(restored,level,'fork',0);
  waitFor(restored,level,()=>restored.phase==='won');
  assert.equal(restored.saved,12);assert.equal(restored.lost,0);assert.equal(restored.retries,0);
  assert.equal(JSON.stringify(level.edges.map(edge=>edge.path)),originalPaths,'returning must not reverse the shared level geometry');
});

test('Veilleurs: two companions unlock the lift, ride groups reach the upper bridge and everyone arrives',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level);
  for(const id of ['balance-access','balance-return','lantern-bridge'])draw(run,level,id);
  device(run,level,'fork',1);applyAction(run,level,{type:'start'});
  waitFor(run,level,()=>run.devices.balance.load===2);
  device(run,level,'balance',1);device(run,level,'fork',0);
  let carryingSince:number|null=null;
  for(let i=0;i<60*240&&run.phase==='playing';i++){
    const lift=run.devices.lift;
    if(lift.mode===0&&lift.progress<=.01&&lift.load>0){
      carryingSince??=run.time;
      if(lift.load===3||run.time-carryingSince>4)device(run,level,'lift',1);
    }else if(lift.mode===1&&lift.progress>=.99&&lift.load===0){device(run,level,'lift',0);carryingSince=null;}
    updateRun(run,level,1/60);
  }
  assert.equal(run.phase,'won',JSON.stringify(run.units));assert.equal(run.saved,12);assert.equal(run.lost,0);
});

test('Veilleurs: a troop sent to the unpowered lift can return to activate the balance',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level);
  for(const id of ['balance-access','balance-return','lantern-bridge'])draw(run,level,id);
  applyAction(run,level,{type:'start'});tick(run,level,50);
  assert.equal(run.devices.balance.load,0);assert(run.units.some(unit=>unit.state==='waiting'&&unit.edgeId==='main-floor'));
  device(run,level,'fork',1);waitFor(run,level,()=>run.devices.balance.load===2);
  device(run,level,'balance',1);device(run,level,'fork',0);
  let carryingSince:number|null=null;
  for(let frame=0;frame<60*240&&run.phase==='playing';frame++){
    const lift=run.devices.lift;
    if(lift.mode===0&&lift.progress<=.01&&lift.load>0){
      carryingSince??=run.time;
      if(lift.load===3||run.time-carryingSince>4)device(run,level,'lift',1);
    }else if(lift.mode===1&&lift.progress>=.99&&lift.load===0){device(run,level,'lift',0);carryingSince=null;}
    updateRun(run,level,1/60);
  }
  assert.equal(run.phase,'won');assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
});

test('Veilleurs: the pendulum has both a safe crossing window and a dangerous timing',()=>{
  const level=getActiveAct(WORLD_LEVELS[2],{actIndex:1});
  function crossAt(time:number){
    const run=createRun(level);run.phase='playing';run.spawned=12;run.saved=11;run.time=time;
    for(const unit of run.units){
      unit.state=unit.id===0?'walking':'saved';unit.nodeId=unit.id===0?'pendulum-entry':'refuge';
      unit.edgeId=unit.id===0?'swing-crossing':null;unit.x=unit.id===0?945:1470;unit.y=unit.id===0?700:455;
    }
    for(let frame=0;frame<60*8&&run.units[0].edgeId==='swing-crossing'&&run.units[0].state!=='lost';frame++)updateRun(run,level,1/60);
    return run.units[0];
  }
  assert.notEqual(crossAt(6.25).state,'lost');
  assert.notEqual(crossAt(6.8).state,'lost','the safe interval must tolerate ordinary human timing');
  assert.equal(crossAt(2).state,'lost','the balancier must remain a real hazard');
});

test('Veilleurs: two timed scouts activate the brake and secure the lower route for the whole troupe',()=>{
  const level=getActiveAct(WORLD_LEVELS[2],{actIndex:1}),run=createRun(level);
  solveCurrentAct(run,level);
  assert.equal(run.phase,'won');assert.equal(run.saved,12);assert.equal(run.lost,0);
  assert.equal(run.devices['pendulum-brake'].mode,1);assert.equal(run.devices['pendulum-brake'].progress,1);
});

test('the troupe waits safely at a missing span, keeps its spacing, and accepts a bridge while paused',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  device(run,level,'deflector',1);applyAction(run,level,{type:'start'});tick(run,level,50);
  assert.equal(run.lost,0);assert.equal(run.saved,0);assert(run.units.some(unit=>unit.state==='waiting'));
  for(const edge of level.edges){
    const distances=run.units.filter(unit=>unit.edgeId===edge.id).map(unit=>unit.distance).sort((a,b)=>a-b);
    for(let i=1;i<distances.length;i++)assert(distances[i]-distances[i-1]>=44.9);
  }
  applyAction(run,level,{type:'pause',paused:true});const before=saveRun(run);
  tick(run,level,30);assert.equal(run.time,before.time);assert.deepEqual(run.units,before.units);
  draw(run,level,'paper-bridge');device(run,level,'cleat',1);device(run,level,'deflector',2);
  applyAction(run,level,{type:'start'});waitFor(run,level,()=>run.phase==='won');
});

test('drawing accepts touch imprecision and reversed gestures but rejects disconnected taps and scribbles',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),definition=level.drawings[0];
  assert.equal(beginStroke(run,level,{x:10,y:10}).ok,false);
  assert(beginStroke(run,level,{x:definition.from.x-ANCHOR_RADIUS+2,y:definition.from.y}).ok);
  assert.equal(finishStroke(run,level).ok,false);
  assert(beginStroke(run,level,definition.from).ok);
  appendStroke(run,level,{x:100,y:800});appendStroke(run,level,definition.to);
  assert.equal(finishStroke(run,level).ok,false);assert.equal(Object.keys(run.drawings).length,0);
  assert(beginStroke(run,level,definition.to).ok);
  appendStroke(run,level,{x:900,y:350});appendStroke(run,level,{x:definition.from.x+30,y:definition.from.y+18});
  assert(finishStroke(run,level).ok);
  assert.deepEqual(run.drawings[definition.id].points[0],definition.from);
  assert.deepEqual(run.drawings[definition.id].points.at(-1),definition.to);
});

test('undo preserves current creature progress and refuses to erase an occupied bridge',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  draw(run,level,'paper-detour');assert.equal(run.history.length,1);
  assert(applyAction(run,level,{type:'undo'}).ok);assert.equal(Object.keys(run.drawings).length,0);
  draw(run,level,'paper-detour');device(run,level,'fork',1);device(run,level,'deflector',2);
  applyAction(run,level,{type:'start'});waitFor(run,level,()=>run.units.some(unit=>unit.edgeId==='lower-fold'));
  // One final redraw of another free span creates a valid reversible edit.
  draw(run,level,'paper-bridge');const before=run.units.map(unit=>({...unit}));
  assert(applyAction(run,level,{type:'undo'}).ok);assert.deepEqual(run.units,before);
  // Put the occupied bridge addition on the top of history without changing units.
  run.history=[{drawings:{},modes:Object.fromEntries(Object.entries(run.devices).map(([id,state])=>[id,state.mode]))}];
  assert.equal(applyAction(run,level,{type:'undo'}).ok,false);assert(run.drawings['paper-detour']);assert.deepEqual(run.units,before);
});

test('fixed ticks produce the same route progress at 30 fps and 120 fps; a suspended tab is bounded',()=>{
  const level=WORLD_LEVELS[1],slow=createRun(level),fast=createRun(level);
  for(const run of [slow,fast]){draw(run,level,'paper-detour');device(run,level,'fork',1);device(run,level,'deflector',2);applyAction(run,level,{type:'start'});}
  tick(slow,level,25,1/30);tick(fast,level,25,1/120);
  assert(Math.abs(slow.time-fast.time)<1e-7);
  for(let i=0;i<12;i++){assert(Math.abs(slow.units[i].x-fast.units[i].x)<.001);assert(Math.abs(slow.units[i].y-fast.units[i].y)<.001);}
  const time=slow.time;updateRun(slow,level,60);assert(slow.time-time<.51);
});

test('save and restore retain every route, mechanism and creature and resume in a deliberate pause',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  draw(run,level,'paper-detour');device(run,level,'fork',1);device(run,level,'deflector',2);applyAction(run,level,{type:'start'});tick(run,level,21);
  const snapshot=saveRun(run),restored=restoreRun(JSON.parse(JSON.stringify(snapshot)),level)!;
  assert(restored);assert.equal(restored.phase,'paused');assert.deepEqual(restored.units,run.units);assert.deepEqual(restored.drawings,run.drawings);
  assert.equal(restored.time,run.time);assert.equal(restored.spawned,run.spawned);
  snapshot.units[0].x=-99;assert.notEqual(restored.units[0].x,-99);
  applyAction(restored,level,{type:'start'});waitFor(restored,level,()=>restored.phase==='won');assert.equal(restored.saved,12);
  assert.equal(restoreRun({...snapshot,levelId:'veilleurs'},level),null);
  assert.equal(restoreRun({...snapshot,units:[{...snapshot.units[0],x:NaN},...snapshot.units.slice(1)]},level),null);
});

test('live HMR units remain usable without optional return fields',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  draw(run,level,'paper-detour');device(run,level,'fork',1);device(run,level,'deflector',2);
  applyAction(run,level,{type:'start'});tick(run,level,8);
  for(const unit of run.units){Reflect.deleteProperty(unit,'returning');Reflect.deleteProperty(unit,'returnEdges');}
  const snapshot=saveRun(run);
  assert(snapshot.units.every(unit=>unit.returning===false&&unit.returnEdges.length===0));
  tick(run,level,1);
  assert(Number.isFinite(run.units[0].x));
  for(const unit of snapshot.units){Reflect.deleteProperty(unit,'returning');Reflect.deleteProperty(unit,'returnEdges');}
  const restored=restoreRun(snapshot,level)!;
  assert(restored);assert.equal(restored.phase,'paused');
  assert(restored.units.every(unit=>unit.returning===false&&unit.returnEdges.length===0));
  applyAction(restored,level,{type:'start'});waitFor(restored,level,()=>restored.phase==='won');
  assert.equal(restored.saved,12);
  const invalid=saveRun(run);invalid.units[0].returning=true;invalid.units[0].returnEdges=[];
  assert.equal(restoreRun(invalid,level),null,'legacy compatibility must not admit a malformed new return route');
});

test('retry returns to the last player gesture and does not silently auto-start the troupe',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);draw(run,level,'paper-detour');
  device(run,level,'fork',1);device(run,level,'deflector',2);applyAction(run,level,{type:'start'});tick(run,level,10);
  applyAction(run,level,{type:'checkpoint'});const time=run.time;tick(run,level,6);
  assert(applyAction(run,level,{type:'retry'}).ok);assert.equal(run.phase,'paused');assert.equal(run.time,time);assert.equal(run.retries,1);
  assert(run.drawings['paper-detour']);assert.equal(run.devices.fork.mode,1);
});

test('drawn approaches and fixed tails meet the physical platforms; pendulum renderer shares collision math',()=>{
  const [boucles,,veilleurs]=WORLD_LEVELS,b=createRun(boucles),v=createRun(veilleurs);
  for(const [run,level,id] of [[b,boucles,'cradle-return'],[v,veilleurs,'balance-return']] as const){
    const definition=level.drawings.find(drawing=>drawing.id===id)!,points=drawingGesture(run,level,definition);
    assert(beginStroke(run,level,points[0]).ok);
    for(const point of points.slice(1))appendStroke(run,level,point);
    const result=finishStroke(run,level);assert(result.ok,result.message);
  }
  const low=getEdgePath(b,boucles,boucles.edges.find(edge=>edge.id==='weight-return')!);
  const balance=boucles.devices.find(device=>device.id==='balance')!;
  assert.deepEqual(low[0],getDeviceAnchor(b,balance),'the fixed approach starts on the real pan, whose centre differs from the old logical node');
  const endpoints=getDrawingEndpoints(b,boucles,boucles.drawings.find(drawing=>drawing.id==='cradle-return')!);
  assert(Math.hypot(low[1].x-endpoints.from.x,low[1].y-endpoints.from.y)<1e-7,'the fixed approach meets the visible drawing support');
  assert(Math.hypot(low.at(-1)!.x-endpoints.to.x,low.at(-1)!.y-endpoints.to.y)<1e-7);
  const high=getEdgePath(v,veilleurs,veilleurs.edges.find(edge=>edge.id==='pan-return')!);
  assert.deepEqual(high[0],{x:590,y:360});assert.deepEqual(high.at(-1),{x:950,y:400});assert(pathLength(high)>300);
  const pendulum=getActiveAct(veilleurs,{actIndex:1}).devices.find(device=>device.id==='pendulum')!;
  for(const time of [0,1,2,3,10]){
    const bob=getPendulumPosition(pendulum,time);assert(Math.abs(Math.hypot(bob.x-pendulum.pivot!.x,bob.y-pendulum.pivot!.y)-pendulum.length!)<.001);
  }
});
