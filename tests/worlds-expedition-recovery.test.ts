import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getEdgePath,pathLength,pointAlongPath,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {drawExpedition,expeditionController,solveExpedition} from './worlds-expedition-walkthrough';

test('a full porter quota at the next junction never recalls companions through an already crossed chapter',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level),control=expeditionController(run,level);
  control();applyAction(run,level,{type:'start'});
  let reachedSecondBalance=false;
  for(let i=0;i<3500&&!run.devices['s4:balance'].mode;i++){
    control();updateRun(run,level,.1);
    reachedSecondBalance||=(run.passages['s4:weight-thread']?.length??0)>0;
    assert(!run.units.some(unit=>unit.returning&&unit.returnEdges.includes('link:2')),
      'a reserved local branch must wait locally, not invent a backward trip into the scout network');
  }
  assert(reachedSecondBalance);assert.equal(run.devices['s4:balance'].mode,1);
  solveExpedition(run,level);assert.equal(run.saved,12);
});

test('a visited souvenir is not advanced while a companion is physically walking back behind it',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level),checkpoint=level.nodes.find(node=>node.id==='s0:rest')!;
  const incoming=level.edges.find(edge=>edge.to===checkpoint.id)!;
  run.phase='playing';run.spawned=level.total;run.visits[checkpoint.id]=run.units.map(unit=>unit.id);
  for(const unit of run.units){unit.state='saved';unit.nodeId=level.goal;unit.x=level.nodes.find(node=>node.id===level.goal)!.x;}
  run.saved=level.total-1;
  Object.assign(run.units[0],{state:'walking',nodeId:checkpoint.id,edgeId:incoming.id,returning:true,returnEdges:[incoming.id],distance:10,
    x:checkpoint.x-10,y:checkpoint.y});
  updateRun(run,level,.1);
  assert.equal(run.autoCheckpointId,null);assert.equal(run.checkpoint,null,'an old visit does not turn a retreat into a safe regrouping');
});

test('reloading an expedition with too many losses keeps its failed state and its retryable souvenir',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level);applyAction(run,level,{type:'start'});
  for(const unit of run.units.slice(0,3)){unit.state='lost';unit.lostAt=0;unit.y=level.height+200;}
  run.lost=3;run.spawned=3;updateRun(run,level,.1);assert.equal(run.phase,'lost');
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);assert.equal(restored.phase,'lost');
  assert(restored.checkpoint);assert(applyAction(restored,level,{type:'retry'}).ok);assert.equal(restored.lost,0);assert.equal(restored.phase,'paused');
});

for(const alreadyOnSpan of [false,true])test(`an old return with an erased ${alreadyOnSpan?'current':'later'} bridge remains recoverable at the real bank`,()=>{
  const level=WORLD_LEVELS[1],run=createRun(level),drawingId='s2:scout-thread';
  drawExpedition(run,level,drawingId);
  run.phase='playing';run.spawned=12;run.saved=11;
  for(const unit of run.units){unit.state='saved';unit.nodeId=level.goal;unit.x=level.nodes.find(node=>node.id===level.goal)!.x;}
  const returns=alreadyOnSpan?['s2:scout-thread','s2:scout-road']:['s2:relay-road','s2:scout-thread','s2:scout-road'];
  const edge=level.edges.find(edge=>edge.id===returns[0])!,path=getEdgePath(run,level,edge),distance=alreadyOnSpan?pathLength(path)*.4:0;
  Object.assign(run.units[0],{state:'walking',nodeId:edge.to,edgeId:edge.id,returning:true,returnEdges:returns,distance,
    ...pointAlongPath([...path].reverse(),distance)});
  assert.equal(applyAction(run,level,{type:'erase',id:drawingId}).ok,false,'an existing bridge on an engaged return is reserved');
  const legacy=JSON.parse(JSON.stringify(saveRun(run)));delete legacy.drawings[drawingId];
  const restored=restoreRun(legacy,level);assert(restored,'an erased return span must not discard the whole save');
  applyAction(restored,level,{type:'start'});
  const bank=level.nodes.find(node=>node.id==='s2:low-far')!;
  for(let i=0;i<300&&restored.units[0].state!=='waiting';i++)updateRun(restored,level,.1);
  assert.equal(restored.units[0].state,'waiting');assert(Math.hypot(restored.units[0].x-bank.x,restored.units[0].y-bank.y)<.1);
  assert.equal(restored.saved,11);assert.equal(restored.lost,0);assert(!restored.drawings[drawingId]);
  assert(drawExpedition(restored,level,drawingId),'the player can redraw a missing reserved span');
  for(let i=0;i<20;i++)updateRun(restored,level,.1);
  assert(restored.units[0].x<bank.x-10);assert.equal(restored.units[0].returning,true);
});

test('an unused mill cleat is reversible; a cleat that has carried the troupe survives both a tap and Undo',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  for(const id of WORLD_NETWORKS.plis[0].drawings)drawExpedition(run,level,id);
  applyAction(run,level,{type:'device',id:'s0:wind',mode:1});
  applyAction(run,level,{type:'start'});
  for(let i=0;i<30;i++)updateRun(run,level,.1);
  assert(applyAction(run,level,{type:'device',id:'s0:cleat',mode:1}).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:cleat',mode:0}).ok,'the unused mechanism is still the player’s choice');
  assert(applyAction(run,level,{type:'device',id:'s0:cleat',mode:1}).ok);
  applyAction(run,level,{type:'device',id:'s0:wind',mode:0});
  for(let i=0;i<400&&!run.passages['s0:wind-thread']?.length;i++)updateRun(run,level,.1);
  assert(run.passages['s0:wind-thread']?.length);
  assert.equal(applyAction(run,level,{type:'device',id:'s0:cleat',mode:0}).ok,false);
  assert.equal(run.devices['s0:cleat'].mode,1);
  assert(applyAction(run,level,{type:'undo'}).ok,'the wind direction can still be changed');
  const history=run.history.length;
  assert.equal(applyAction(run,level,{type:'undo'}).ok,false,'undo cannot silently unfasten an earned remote support');
  assert.equal(run.history.length,history);
  assert.equal(run.devices['s0:cleat'].mode,1);
  solveExpedition(run,level);assert.equal(run.saved,12);assert.equal(run.retries,0);
});

test('a legacy save stranded at Le courant contraire restores only its already-used retaining knot',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level),control=expeditionController(run,level);
  control();applyAction(run,level,{type:'start'});
  for(let i=0;i<2500&&!run.autoCheckpointId;i++){control();updateRun(run,level,.1);}
  assert.equal(run.autoCheckpointId,'s0:rest');
  const old=JSON.parse(JSON.stringify(saveRun(run)));
  delete old.mechanicsRevision;
  old.devices['s0:cleat'].mode=0;old.devices['s0:cleat'].progress=0;old.devices['s0:wind'].progress=0;
  const restored=restoreRun(old,level);assert(restored);
  assert.equal(restored.devices['s0:cleat'].mode,1);
  assert.equal(restored.devices['s0:wind'].progress,1);
  assert.deepEqual(restored.units.map(unit=>[unit.id,unit.state,unit.x,unit.y,unit.nodeId,unit.edgeId]),
    run.units.map(unit=>[unit.id,unit.state,unit.x,unit.y,unit.nodeId,unit.edgeId]));
  assert.deepEqual(restored.drawings,run.drawings);
  assert.deepEqual(restored.visits,run.visits);
  for(const definition of level.devices)if(!['s0:cleat','s0:wind'].includes(definition.id)){
    assert.equal(restored.devices[definition.id].mode,run.devices[definition.id].mode,'no new puzzle is solved on load');
  }
  solveExpedition(restored,level);assert.equal(restored.saved,12);assert.equal(restored.lost,0);assert.equal(restored.retries,0);
});

test('a current save preserves an unlatched wind-driven crossing rather than fastening its cleat on load',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  for(const id of WORLD_NETWORKS.plis[0].drawings)drawExpedition(run,level,id);
  applyAction(run,level,{type:'device',id:'s0:wind',mode:1});applyAction(run,level,{type:'start'});
  for(let i=0;i<800&&!(run.passages['s0:wind-thread']?.length);i++)updateRun(run,level,.1);
  assert(run.passages['s0:wind-thread']?.length,'the actual powered bridge has carried a companion');
  assert.equal(run.devices['s0:cleat'].mode,0);
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);
  assert.equal(restored.devices['s0:cleat'].mode,0,'restoring cannot insert a retaining knot the player never engaged');
  assert.equal(restored.devices['s0:wind'].mode,1);
  assert.equal(restored.devices['s0:wind'].progress,run.devices['s0:wind'].progress);
  assert.equal(restored.devices['s0:wind'].rotorAngle,run.devices['s0:wind'].rotorAngle);
  assert.deepEqual(restored.units.map(unit=>[unit.id,unit.x,unit.y]),run.units.map(unit=>[unit.id,unit.x,unit.y]));
});

for(const seed of [2,5,6,8])test(`Petits Plis recovers after exploratory drawing, toggles, erasing and Undo (sequence ${seed})`,()=>{
  const level=WORLD_LEVELS[1],run=createRun(level);
  let randomState=seed;
  const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296);
  applyAction(run,level,{type:'start'});
  for(let frame=0;frame<1500;frame++){
    if(frame%50===0){
      const lead=Math.max(...run.units.map(unit=>unit.x));
      const devices=level.devices.filter(device=>device.x<lead+2000&&device.playerControlled!==false&&device.modes.length>1);
      const drawings=level.drawings.filter(drawing=>drawing.from.x<lead+2000),choice=random();
      if(choice<.45&&devices.length)applyAction(run,level,{type:'device',id:devices[Math.floor(random()*devices.length)].id});
      else if(choice<.77&&drawings.length){
        const drawing=drawings[Math.floor(random()*drawings.length)];
        if(!run.drawings[drawing.id]&&beginStroke(run,level,drawing.from).ok){
          for(const point of drawing.suggested.slice(1))appendStroke(run,level,point);
          finishStroke(run,level);
        }
      }else if(choice<.9){
        const drawn=Object.keys(run.drawings);
        if(drawn.length)applyAction(run,level,{type:'erase',id:drawn[Math.floor(random()*drawn.length)]});
      }else applyAction(run,level,{type:'undo'});
    }
    updateRun(run,level,.1);
  }
  solveExpedition(run,level,700);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
});
