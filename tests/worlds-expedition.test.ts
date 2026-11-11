import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import {TABLEAU_HEIGHT} from '../lib/worlds/tableaux';
import {appendStroke,applyAction,beginStroke,finishStroke,createRun,getActCount,getJourneySummary,getStageProgress,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {drawExpedition,expeditionController,solveExpedition} from './worlds-expedition-walkthrough';

for(const level of WORLD_LEVELS)test(`${level.name}: one continuous expedition reunites all twelve through five linked networks`,t=>{
  const run=createRun(level),report=solveExpedition(run,level);
  assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(getActCount(level),1);
  assert.equal(getJourneySummary(run,level).complete,true);assert.equal(getStageProgress(run,level).progress,1);
  assert(report.decisions>=25,'the world requires substantial active decisions, not just a long walk');
  assert(Object.values(run.passages).some(ids=>ids.length===2));
  assert.equal(applyAction(run,level,{type:'advanceAct'}).ok,false);
  for(const network of WORLD_NETWORKS[level.id])assert.equal(run.visits[network.end]?.length,12);
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);assert.equal(restored.saved,12);
  t.diagnostic(`Full solution: ${Math.round(report.time)}s simulation; ${report.decisions} gestures; peak ink ${Math.round(report.peakInk)}/${level.inkBudget}.`);
});

test('every expedition is ten physical sectors, all supporting paths meet nodes, and quotas have physical controls',()=>{
  for(const level of WORLD_LEVELS){
    assert.equal(level.width,16000);assert.equal(level.height,TABLEAU_HEIGHT);assert.equal(level.sectors?.length,10);assert.equal(level.acts,undefined);
    assert.equal(level.hints.length,0);assert(level.devices.every(device=>device.modes.length<=2));
    for(const edge of level.edges){
      const from=level.nodes.find(node=>node.id===edge.from)!,to=level.nodes.find(node=>node.id===edge.to)!;
      assert.deepEqual(edge.path[0],{x:from.x,y:from.y});assert.deepEqual(edge.path.at(-1),{x:to.x,y:to.y});
      if(edge.drawingId){const drawing=level.drawings.find(d=>d.id===edge.drawingId)!;assert.deepEqual(drawing.from,edge.path[0]);assert.deepEqual(drawing.to,edge.path.at(-1));}
      if(edge.maxPassages!==undefined){assert(edge.route,'a finite route is visibly attached to a selector');assert(level.devices.some(d=>d.id===edge.route!.deviceId&&d.kind==='splitter'));}
    }
    const links=level.edges.flatMap(edge=>edge.gates??[]).filter(gate=>{
      const device=level.devices.find(d=>d.id===gate.deviceId)!;
      return level.edges.some(edge=>edge.gates?.includes(gate)&&Math.abs(edge.path[0].x-device.x)>2000);
    });assert(links.length>0,'physical dependencies must cross sector boundaries');
    const totalInk=level.drawings.reduce((sum,d)=>sum+Math.hypot(d.to.x-d.from.x,d.to.y-d.from.y),0);
    assert(totalInk>level.inkBudget!,'the entire journey cannot be drawn before launch');
  }
});

test('one-sided routing cannot bypass weights, scouts, lifts or the two independent final balances',()=>{
  for(const level of WORLD_LEVELS){
    const run=createRun(level),network=WORLD_NETWORKS[level.id][0];
    for(const id of network.drawings)drawExpedition(run,level,id);
    applyAction(run,level,{type:'start'});
    for(let i=0;i<900;i++)updateRun(run,level,.1);
    assert.equal(run.saved,0);assert.equal(run.lost,0);assert.equal(run.phase,'playing');
    const progress=getStageProgress(run,level);assert(progress.furthestX<3200);
  }
});

test('a physical souvenir survives subsequent edits, serialization, a bad route and a paused retry',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),control=expeditionController(run,level);
  control();applyAction(run,level,{type:'start'});
  while(!run.autoCheckpointId&&run.time<700){control();updateRun(run,level,.1);}
  assert(run.autoCheckpointId);const checkpoint=JSON.stringify(run.checkpoint),checkpointTime=run.checkpoint!.time;
  const device=level.devices.find(d=>d.kind==='splitter'&&d.x>6500)!;
  assert(applyAction(run,level,{type:'device',id:device.id}).ok);
  for(let i=0;i<10;i++)updateRun(run,level,.1);
  assert.equal(JSON.stringify(run.checkpoint),checkpoint,'a wrong tap cannot replace the last safe souvenir');
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level)!;assert(restored);
  assert.equal(restored.checkpoint?.time,checkpointTime);assert(applyAction(restored,level,{type:'retry'}).ok);
  assert.equal(restored.time,checkpointTime);assert.equal(restored.phase,'paused');
  assert.equal(restored.autoCheckpointId,run.autoCheckpointId);assert.equal(restored.saved,run.checkpoint!.saved);
});

test('V1 and V2 saves reset safely into the continuous V3 graph',()=>{
  const level=WORLD_LEVELS[0];
  for(const version of [1,2]){
    const migrated=restoreRun({...saveRun(createRun(level)),version},level)!;assert(migrated);
    assert.equal(migrated.version,3);assert.equal(migrated.phase,'ready');assert.equal(migrated.time,0);assert.equal(migrated.autoCheckpointId,null);
    assert(migrated.units.every(unit=>unit.nodeId===level.spawn));
  }
});

test('the distant mill must release the original porters before the first physical souvenir is safe',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),network=WORLD_NETWORKS.boucles[0];
  for(const id of network.drawings)drawExpedition(run,level,id);
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);applyAction(run,level,{type:'start'});
  for(let i=0;i<400&&run.devices['s0:balance'].load<3;i++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,3);assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  for(let i=0;i<700;i++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:relay'].mode,1);assert.equal(run.devices['s2:relay'].mode,0);
  assert.equal(run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).length,3);
  assert.equal(run.autoCheckpointId,null,'nine forward scouts cannot abandon three porters in a checkpoint');
  assert(getStageProgress(run,level).furthestX>4000);
  assert(getStageProgress(run,level).rearmostX<level.nodes.find(node=>node.id==='s0:far')!.x,'the original porters remain behind the first high bridge');
  assert.equal(applyAction(run,level,{type:'device',id:'s2:relay'}).ok,false,'distant arrival mechanisms cannot be clicked open');
  solveExpedition(run,level);assert.equal(run.saved,12);
});

test('a troupe sent entirely to the unpowered main road can recover on foot in both weight-led worlds',()=>{
  for(const level of [WORLD_LEVELS[0],WORLD_LEVELS[2]]){
    const run=createRun(level);
    for(const id of WORLD_NETWORKS[level.id][0].drawings)drawExpedition(run,level,id);
    applyAction(run,level,{type:'start'});for(let i=0;i<600;i++)updateRun(run,level,.1);
    assert.equal(run.devices['s0:balance'].load,0);assert.equal(run.saved,0);
    solveExpedition(run,level);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
  }
});

test('three losses finish an impossible expedition promptly and its safe souvenir remains recoverable',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level);applyAction(run,level,{type:'start'});
  const snapshotTime=run.checkpoint!.time;
  // The state after three collisions must not remain indefinitely blocked by a two-scout relay.
  for(const unit of run.units.slice(0,3)){unit.state='lost';unit.lostAt=0;unit.y=1100;}
  run.lost=3;run.spawned=3;updateRun(run,level,.1);
  assert.equal(run.phase,'lost');assert.equal(run.checkpoint!.time,snapshotTime);
  assert(applyAction(run,level,{type:'retry'}).ok);assert.equal(run.phase,'paused');assert.equal(run.lost,0);
  assert.equal(run.units.filter(unit=>unit.state==='queued').length,12);
});

test('each V3 balancier has a generous safe interval and a genuinely dangerous interval at expedition pace',()=>{
  const level=WORLD_LEVELS[2];
  for(const network of WORLD_NETWORKS.veilleurs)for(const hazard of network.hazards){
    const edge=level.edges.find(edge=>edge.id===hazard.edge)!,definition=level.devices.find(device=>device.id===hazard.pendulum)!;
    const crossAt=(time:number)=>{
      const run=createRun(level);run.phase='playing';run.time=time;run.spawned=12;run.saved=11;
      for(const unit of run.units){unit.state=unit.id===0?'walking':'saved';unit.nodeId=unit.id===0?edge.from:level.goal;unit.edgeId=unit.id===0?edge.id:null;}
      Object.assign(run.units[0],edge.path[0]);
      for(let frame=0;frame<300&&run.units[0].edgeId===edge.id&&run.units[0].state!=='lost';frame++)updateRun(run,level,1/60);
      return run.units[0].state!=='lost';
    };
    const results=Array.from({length:Math.ceil(definition.duration!/.2)},(_,i)=>crossAt(i*.2));
    assert(results.some(Boolean),`${hazard.pendulum}: there must be a safe passage`);
    assert(results.some(result=>!result),`${hazard.pendulum}: the bob must really collide at a bad timing`);
    let longest=0,current=0;
    for(const safe of [...results,...results]){current=safe?current+.2:0;longest=Math.max(longest,current);}
    assert(longest>=1.4,`${hazard.pendulum}: a real human must have a broad release window (${longest}s)`);
  }
});

test('continuous scoring is solely 10, 11 or 12 arrivals, with no retry or time penalty',()=>{
  const level=WORLD_LEVELS[0];
  for(const saved of [10,11,12]){
    const run=createRun(level);run.saved=saved;run.lost=12-saved;run.spawned=12;run.phase='playing';run.time=1234;run.retries=99;
    for(const unit of run.units){unit.state=unit.id<saved?'saved':'lost';unit.nodeId=level.goal;unit.y=unit.state==='lost'?1100:650;}
    updateRun(run,level,1/60);assert.equal(getJourneySummary(run,level).stars,saved-9);
  }
});

test('ten survivors still solve the downstream double balances, lifts and final paired pendulums',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level),control=expeditionController(run,level),hazard=WORLD_NETWORKS.veilleurs[1].hazards[0];
  const entry=level.nodes.find(node=>node.id===hazard.approach)!;
  const waiting=()=>run.units.some(unit=>unit.state!=='lost'&&Math.abs(unit.x-entry.x)<.1&&Math.abs(unit.y-entry.y)<.1);
  control();applyAction(run,level,{type:'start'});
  for(let i=0;i<3000&&!waiting();i++){control();updateRun(run,level,.1);}
  assert(waiting());
  for(let expected=1;expected<=2;expected++){
    for(let i=0;i<300&&!(waiting()&&run.time%12>=3&&run.time%12<3.2);i++)updateRun(run,level,.1);
    assert(waiting());assert(applyAction(run,level,{type:'device',id:hazard.gate,mode:1}).ok);
    for(let i=0;i<80&&run.lost<expected;i++)updateRun(run,level,.1);
    assert.equal(run.lost,expected,'a bad observed timing must cause the actual collision');
  }
  solveExpedition(run,level);assert.equal(run.saved,10);assert.equal(run.lost,2);assert.equal(getJourneySummary(run,level).stars,1);
  for(const id of ['s4:balance-a','s4:balance-b','s8:brake-a','s8:brake-b'])assert(run.devices[id].progress>.99);
  assert.equal(run.passages['s6:elevator'].length,10,'all ten survivors physically ride the later lift');
});

test('recalling an incomplete weight party frees its reserved places and cannot strand the queue',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),network=WORLD_NETWORKS.boucles[0];
  for(const id of network.drawings)drawExpedition(run,level,id);
  applyAction(run,level,{type:'device',id:'s0:fork',mode:1});applyAction(run,level,{type:'start'});
  for(let i=0;i<100&&!(run.passages['s0:weight-thread']?.length);i++)updateRun(run,level,.1);
  assert.equal(run.passages['s0:weight-thread'].length,1);
  applyAction(run,level,{type:'device',id:'s0:fork',mode:0});
  for(let i=0;i<600;i++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,0);
  assert.equal(run.passages['s0:weight-thread'].length,0,'the returning porter has relinquished its unfinished place');
  solveExpedition(run,level);assert.equal(run.saved,12);assert.equal(run.retries,0);
});


test('shared supports accept either destination, so a return bridge can be drawn before the incoming bridge',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),drawing=level.drawings.find(d=>d.id==='s0:return-thread')!;
  assert(beginStroke(run,level,drawing.from).ok);
  appendStroke(run,level,drawing.suggested[1]);
  assert.equal(run.activeStroke?.drawingId,drawing.id,'the glow and ink meter follow the gesture before release');
  for(const point of drawing.suggested.slice(2))appendStroke(run,level,point);
  const finished=finishStroke(run,level);assert(finished.ok,finished.message);assert.equal(finished.drawingId,drawing.id);
  assert(run.drawings[drawing.id]);assert(!run.drawings['s0:weight-thread']);
});
