import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,beginStroke,appendStroke,finishStroke,createRun,getDrawingEndpoints,getEdgeSupportPaths,getPendulumPosition,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {advanceMechanism,getDeviceAnchor,getSupportPaths,MECHANICAL_GRAVITY,supportReady,windTransfer} from '../lib/worlds/mechanics';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import type {DeviceDefinition,WorldLevel,WorldRun} from '../lib/worlds/types';

const play=(run:WorldRun,level:WorldLevel,seconds:number)=>{for(let at=0;at<seconds-1e-8;at+=1/60)updateRun(run,level,1/60);};
const close=(actual:number,expected:number,tolerance=1e-7)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);

test('a wheel receives wind only inside the forward cone and physical range',()=>{
  const level=WORLD_LEVELS[1],definition=structuredClone(level.devices.find(device=>device.id==='s0:wind')!),state={mode:1,progress:0,load:0};
  assert(windTransfer(definition,state)>0);
  const wind=definition.mechanics!.wind!,dx=wind.direction.x,dy=wind.direction.y;
  wind.target={x:wind.source.x-dx*100,y:wind.source.y-dy*100};assert.equal(windTransfer(definition,state),0,'behind the fan');
  wind.target={x:wind.source.x+dx*(wind.range+1),y:wind.source.y+dy*(wind.range+1)};assert.equal(windTransfer(definition,state),0,'beyond the range');
  wind.target={x:wind.source.x+dx*100-dy*1000,y:wind.source.y+dy*100+dx*1000};assert.equal(windTransfer(definition,state),0,'beside the cone');
  wind.target={x:wind.source.x+dx*100,y:wind.source.y+dy*100};assert(windTransfer(definition,state)>0);
  state.mode=0;assert.equal(windTransfer(definition,state),0,'switching off cuts the flux immediately');
});

test('wind does work progressively and its loaded treuil retains momentum after motor cut',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level),definition=level.devices.find(device=>device.id==='s0:wind')!,state=run.devices[definition.id];
  state.mode=1;advanceMechanism(run,level,definition,1/60);
  assert(state.progress>0&&state.progress<.01);assert((state.velocity??0)>0);
  for(let tick=0;tick<23;tick++)advanceMechanism(run,level,definition,1/60);
  const before=state.progress,speed=state.velocity!,angle=state.rotorAngle!;
  assert(applyAction(run,level,{type:'device',id:definition.id,mode:0}).ok);
  assert.equal(state.receivedForce,0,'even paused commands stop the airflow');
  advanceMechanism(run,level,definition,1/60);
  assert(state.progress>before,'the loaded drivetrain does not stop without braking');
  assert(state.velocity!<speed&&state.velocity!>0);assert(state.rotorAngle!>angle);
  for(let tick=0;tick<600;tick++)advanceMechanism(run,level,definition,1/60);
  assert.equal(state.progress,0,'gravity returns an unretained load to its lower stop');
});

test('a retaining cleat cannot catch an unfinished span and holds its completed height with no airflow',()=>{
  const level=WORLD_LEVELS[1],run=createRun(level),wind=level.devices.find(device=>device.id==='s0:wind')!,state=run.devices[wind.id];
  state.mode=1;
  while(state.progress<.98)advanceMechanism(run,level,wind,1/60);
  if(state.progress<.999)assert.equal(applyAction(run,level,{type:'device',id:'s0:cleat',mode:1}).ok,false);
  for(let tick=0;tick<600&&state.progress<1;tick++)advanceMechanism(run,level,wind,1/60);
  assert.equal(state.progress,1);assert(applyAction(run,level,{type:'device',id:'s0:cleat',mode:1}).ok);
  assert(applyAction(run,level,{type:'device',id:wind.id,mode:0}).ok);
  for(let tick=0;tick<120;tick++)advanceMechanism(run,level,wind,1/60);
  assert.equal(state.progress,1);assert.equal(state.receivedForce,0);assert.equal(state.velocity,0);
});

test('counterweight motion depends on actual mass and carries every settled foot with its plate',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),definition=level.devices.find(device=>device.id==='s0:balance')!,state=run.devices[definition.id];
  for(const id of ['s0:weight-thread','s0:return-thread','s0:high-thread']){
    const drawing=level.drawings.find(drawing=>drawing.id===id)!,ends=getDrawingEndpoints(run,level,drawing);
    assert(beginStroke(run,level,ends.from).ok);appendStroke(run,level,ends.to);assert(finishStroke(run,level).ok);
  }
  assert(applyAction(run,level,{type:'device',id:'s0:fork',mode:1}).ok);assert(applyAction(run,level,{type:'start'}).ok);
  for(let tick=0;tick<6000&&state.load<3;tick++)updateRun(run,level,1/60);
  assert.equal(state.load,3);assert(state.progress<1);assert.equal(applyAction(run,level,{type:'device',id:definition.id,mode:1}).ok,false);
  const porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null),feet=porters.map(unit=>unit.y),anchor=getDeviceAnchor(run,definition);
  play(run,level,.5);assert(state.progress>0&&state.progress<1);assert.equal(state.load,3);
  const moved=getDeviceAnchor(run,definition).y-anchor.y;
  assert(moved>0);for(let index=0;index<porters.length;index++)close(porters[index].y-feet[index],moved);
  for(let tick=0;tick<1200&&state.progress<1;tick++)updateRun(run,level,1/60);
  assert.equal(state.progress,1);assert(applyAction(run,level,{type:'device',id:definition.id,mode:1}).ok);
  assert.equal(run.lost,0);
  const insufficient=createRun(level),less=insufficient.devices[definition.id];less.load=2;
  for(let tick=0;tick<180;tick++)advanceMechanism(insufficient,level,definition,1/60);
  assert.equal(less.progress,0,'two bodies cannot overcome this three-person counterweight');
});

test('separate bridge leaves have no walkable contact before both drivers reach their stops',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),edge=level.edges.find(edge=>edge.mechanism?.drivers.length===2)!;
  const paths=getSupportPaths(run,level,edge,edge.path);assert.equal(paths.length,2);
  assert(Math.hypot(paths[0].at(-1)!.x-paths[1][0].x,paths[0].at(-1)!.y-paths[1][0].y)>10);
  assert.equal(supportReady(run,level,edge),false);
  run.devices[edge.mechanism!.drivers[0]].progress=1;assert.equal(supportReady(run,level,edge),false);
  run.devices[edge.mechanism!.drivers[1]].progress=1;assert.equal(supportReady(run,level,edge),true);
  const contact=getEdgeSupportPaths(run,level,edge);close(contact[0].at(-1)!.x,contact[1][0].x);close(contact[0].at(-1)!.y,contact[1][0].y);
});

test('a manual lift accelerates more slowly with passengers and descends under gravity when its cable is released',()=>{
  const level=WORLD_LEVELS[2],definition=level.devices.find(device=>device.kind==='lift')!,empty=createRun(level),full=createRun(level);
  const a=empty.devices[definition.id],b=full.devices[definition.id];a.mode=b.mode=1;b.load=3;
  for(let tick=0;tick<20;tick++){advanceMechanism(empty,level,definition,1/60);advanceMechanism(full,level,definition,1/60);}
  assert(a.progress>b.progress);assert(b.progress>0);assert(a.velocity!>b.velocity!);
  a.mode=0;a.progress=.7;a.velocity=0;
  advanceMechanism(empty,level,definition,1/60);assert(a.progress<.7);assert(a.velocity!<0);
});

test('scout pressure requires two physical occupants and cannot be activated by historical visits alone',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),definition=level.devices.find(device=>device.id==='s4:relay')!,state=run.devices[definition.id];
  run.visits[definition.activationNodeId!]=[0,1];state.load=0;
  for(let tick=0;tick<180;tick++)advanceMechanism(run,level,definition,1/60);
  assert.equal(state.progress,0);assert.equal(state.mode,0);
  state.load=1;for(let tick=0;tick<180;tick++)advanceMechanism(run,level,definition,1/60);assert.equal(state.progress,0);
  state.load=2;for(let tick=0;tick<180;tick++)advanceMechanism(run,level,definition,1/60);
  assert.equal(state.progress,1);assert.equal(state.mode,1);
  state.load=0;advanceMechanism(run,level,definition,1/60);assert.equal(state.progress,1,'the real ratchet stores the completed work');
});

const energy=(definition:DeviceDefinition,angle:number,velocity:number)=>{
  const length=definition.length??190;return .5*(definition.mechanics?.inertia??1)*(length*velocity)**2+MECHANICAL_GRAVITY*length*(1-Math.cos(angle));
};
test('the pendulum brake removes momentum only at an attained safe angle without pulling to the right',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level),definition=level.devices.find(device=>device.kind==='pendulum')!,state=run.devices[definition.id],brake=run.devices[definition.lockDeviceId!];
  state.angle=-.82;state.angularVelocity=.8;brake.mode=1;
  const before=energy(definition,state.angle,state.angularVelocity);
  advanceMechanism(run,level,definition,1/60);
  assert.equal(state.angle,-.82);assert.equal(state.angularVelocity,0);assert(energy(definition,state.angle,state.angularVelocity)<before);
  state.angle=.2;state.angularVelocity=1.3;
  const armedEnergy=energy(definition,state.angle,state.angularVelocity);
  const predicted=getPendulumPosition(definition,run.time+1,run);
  assert(state.angle===.2&&state.angularVelocity===1.3,'prediction must not mutate physics');
  for(let tick=0;tick<60;tick++)advanceMechanism(run,level,definition,1/60);
  assert(state.angle!>=.7);assert.equal(state.angularVelocity,0);assert(energy(definition,state.angle!,state.angularVelocity!)<armedEnergy);
  close(predicted.angle,state.angle!);
});

test('mechanical positions, velocities, wind and pendulum state survive a save and resume',()=>{
  const level=WORLD_LEVELS[2],run=createRun(level),wind=level.devices.find(device=>device.kind==='wind')!;
  assert(applyAction(run,level,{type:'device',id:wind.id,mode:1}).ok);assert(applyAction(run,level,{type:'start'}).ok);play(run,level,.7);
  const snapshot=saveRun(run),restored=restoreRun(JSON.parse(JSON.stringify(snapshot)),level);assert(restored);
  assert.equal(restored.mechanicsRevision,1);
  for(const definition of level.devices.filter(device=>device.mechanics))for(const key of ['velocity','rotorAngle','rotorVelocity','receivedForce','angle','angularVelocity','anchorOffset'] as const)
    assert.equal(restored.devices[definition.id][key],run.devices[definition.id][key],`${definition.id}/${key}`);
  const moving=run.devices[wind.id];assert((moving.velocity??0)>0);
});

test('an earlier save at the pendulum centre retains its known angular momentum and an earned brake retains its parked pose',()=>{
  const level=WORLD_LEVELS[2],definition=level.devices.find(device=>device.kind==='pendulum')!;
  const legacy=saveRun(createRun(level));delete legacy.mechanicsRevision;legacy.time=0;
  for(const state of Object.values(legacy.devices)){delete state.angle;delete state.angularVelocity;delete state.velocity;delete state.anchorOffset;}
  const restored=restoreRun(structuredClone(legacy),level);assert(restored);
  const expectedPhase=definition.phase??0,state=restored.devices[definition.id];
  close(state.angle!,Math.sin(expectedPhase)*.95);
  close(state.angularVelocity!,Math.cos(expectedPhase)*.95*Math.PI*2/(definition.duration??7));
  assert(Math.abs(state.angularVelocity!)>0);
  const before=state.angle!;advanceMechanism(restored,level,definition,1/60);assert.notEqual(state.angle,before);
  legacy.devices[definition.lockDeviceId!].mode=1;legacy.devices[definition.lockDeviceId!].progress=1;
  const parked=restoreRun(legacy,level);assert(parked);close(parked.devices[definition.id].angle!,.95);assert.equal(parked.devices[definition.id].angularVelocity,0);
  for(let tick=0;tick<120;tick++)advanceMechanism(parked,level,definition,1/60);
  close(parked.devices[definition.id].angle!,.95);
});

test('an ideal clockwork pivot remains parkable after a long puzzle session without receiving external energy',()=>{
  const level=WORLD_LEVELS[2],definition=level.devices.find(device=>device.kind==='pendulum')!,run=createRun(level),state=run.devices[definition.id];
  const before=energy(definition,state.angle!,state.angularVelocity!);
  for(let tick=0;tick<1500*60;tick++)advanceMechanism(run,level,definition,1/60);
  const after=energy(definition,state.angle!,state.angularVelocity!);
  assert(after>before*.98&&after<before*1.02,'a fixed-step ideal pivot conserves its available energy');
  run.devices[definition.lockDeviceId!].mode=1;
  for(let tick=0;tick<60*30&&state.angularVelocity!==0;tick++)advanceMechanism(run,level,definition,1/60);
  assert.equal(state.angularVelocity,0);assert(Math.abs(state.angle!)>=.7);
  assert(energy(definition,state.angle!,state.angularVelocity!)<after);
});
