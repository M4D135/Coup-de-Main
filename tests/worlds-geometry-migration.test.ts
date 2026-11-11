import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getEdgePath,pathLength,pointAlongPath,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import type {Point,WorldLevel,WorldRun} from '../lib/worlds/types';
import {drawExpedition,expeditionController,safeHazardRelease,solveExpedition} from './worlds-expedition-walkthrough';

function previousLevel(index:number):WorldLevel {
  const current=WORLD_LEVELS[index];
  return structuredClone({...current,...current.previousGeometry,previousGeometry:undefined,revision:3,pace:96});
}
function authoredLevel(source:WorldLevel):WorldLevel {
  const level=structuredClone(source),map=(p:Point):Point=>({x:p.x<3200?p.x*.9+60:p.x,y:p.y*2});
  level.previousGeometry={revision:3,width:source.width,height:source.height,creatureHeight:source.creatureHeight,inkBudget:source.inkBudget,pace:source.pace,
    nodes:structuredClone(source.nodes),edges:structuredClone(source.edges),devices:structuredClone(source.devices),drawings:structuredClone(source.drawings)};
  level.revision=4;level.height=1800;level.creatureHeight=140;level.pace=130;level.inkBudget=6000;
  level.nodes=level.nodes.map(node=>({...node,...map(node)}));
  level.edges=level.edges.map(edge=>({...edge,path:edge.path.map(map)}));
  level.devices=level.devices.map(device=>({...device,...map(device),
    low:device.low?map(device.low):undefined,high:device.high?map(device.high):undefined,pivot:device.pivot?map(device.pivot):undefined,
    length:device.length?device.length*2:undefined,width:device.width?device.width*2:undefined,radius:device.radius?device.radius*2:undefined}));
  level.drawings=level.drawings.map(drawing=>{
    const from=map(drawing.from),to=map(drawing.to);
    return {...drawing,from,to,corridor:160,inkLimit:Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)*1.28),suggested:drawing.suggested.map(map)};
  });
  return level;
}
function legacySnapshot(run:WorldRun){
  const snapshot=JSON.parse(JSON.stringify(saveRun(run)));
  const removeRevision=(value:Record<string,unknown>)=>{delete value.geometryRevision;if(value.checkpoint)removeRevision(value.checkpoint as Record<string,unknown>);};
  removeRevision(snapshot);return snapshot;
}
function assertProjectedPath(oldRun:WorldRun,oldLevel:WorldLevel,newRun:WorldRun,newLevel:WorldLevel,id:number):void {
  const old=oldRun.units[id],next=newRun.units[id];
  const oldEdge=oldLevel.edges.find(edge=>edge.id===old.edgeId)!,edge=newLevel.edges.find(edge=>edge.id===next.edgeId)!;
  const oldPath=getEdgePath(oldRun,oldLevel,oldEdge),path=getEdgePath(newRun,newLevel,edge);
  assert(Math.abs(next.distance/pathLength(path)-old.distance/pathLength(oldPath))<1e-8);
  const position=pointAlongPath(next.returning?[...path].reverse():path,next.distance);
  assert(Math.hypot(next.x-position.x,next.y-position.y)<1e-7);
  assert.equal(next.returning,old.returning);assert.deepEqual(next.returnEdges,old.returnEdges);
}

test('an unlabelled V3 journey moves its existing curved bridge and walking companion onto the authored scene exactly once',()=>{
  const oldLevel=previousLevel(1),run=createRun(oldLevel),control=expeditionController(run,oldLevel);
  control();applyAction(run,oldLevel,{type:'start'});
  for(let i=0;i<1500;i++){
    control();updateRun(run,oldLevel,.1);
    const unit=run.units[0],edge=oldLevel.edges.find(edge=>edge.id===unit.edgeId);
    if(edge?.kind==='drawn'&&unit.distance/pathLength(getEdgePath(run,oldLevel,edge))>.35)break;
  }
  const edge=oldLevel.edges.find(edge=>edge.id===run.units[0].edgeId)!;assert.equal(edge.kind,'drawn');
  const nextLevel=authoredLevel(oldLevel),restored=restoreRun(legacySnapshot(run),nextLevel);assert(restored);
  assert.equal(restored.geometryRevision,4);assert.equal(restored.time,run.time);assert.equal(restored.saved,run.saved);
  assert.deepEqual(restored.visits,run.visits);assert.deepEqual(restored.passages,run.passages);
  assertProjectedPath(run,oldLevel,restored,nextLevel,0);
  for(const [id,drawing] of Object.entries(restored.drawings)){
    const definition=nextLevel.drawings.find(drawing=>drawing.id===id)!;
    assert.deepEqual(drawing.points[0],definition.from);assert.deepEqual(drawing.points.at(-1),definition.to);
    assert.equal(drawing.points.length,run.drawings[id].points.length);
    assert.equal(drawing.createdAt,run.drawings[id].createdAt);
  }
  const twice=restoreRun(JSON.parse(JSON.stringify(saveRun(restored))),nextLevel);assert(twice);
  assert.deepEqual(twice.units,restored.units);assert.deepEqual(twice.drawings,restored.drawings);
});

test('a companion already walking back keeps its actual return path during geometry migration',()=>{
  const oldLevel=previousLevel(0),run=createRun(oldLevel);
  for(const id of WORLD_NETWORKS.boucles[0].drawings)drawExpedition(run,oldLevel,id);
  applyAction(run,oldLevel,{type:'start'});
  for(let i=0;i<600;i++)updateRun(run,oldLevel,.1);
  applyAction(run,oldLevel,{type:'device',id:'s0:fork',mode:1});
  for(let i=0;i<20;i++)updateRun(run,oldLevel,.1);
  const returning=run.units.find(unit=>unit.returning&&unit.distance>1);assert(returning);
  const nextLevel=authoredLevel(oldLevel),restored=restoreRun(legacySnapshot(run),nextLevel);assert(restored);
  assertProjectedPath(run,oldLevel,restored,nextLevel,returning.id);
});

test('a carried troupe remains on its moving lift and loaded helpers stay on their wider plateau',()=>{
  const oldLevel=previousLevel(2),run=createRun(oldLevel),control=expeditionController(run,oldLevel);
  control();applyAction(run,oldLevel,{type:'start'});
  for(let i=0;i<1500;i++){
    control();updateRun(run,oldLevel,.1);
    if(run.devices['s0:lift'].progress>.35&&run.devices['s0:lift'].progress<.8&&run.units.some(unit=>unit.state==='riding'))break;
  }
  const riders=run.units.filter(unit=>unit.state==='riding'),porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);
  assert(riders.length);assert.equal(porters.length,2);
  const nextLevel=authoredLevel(oldLevel),restored=restoreRun(legacySnapshot(run),nextLevel);assert(restored);
  const lift=nextLevel.devices.find(device=>device.id==='s0:lift')!,progress=run.devices['s0:lift'].progress;
  for(const rider of riders){
    const next:WorldRun['units'][number]=restored.units[rider.id];assert.equal(next.state,'riding');
    assert.equal(next.y,lift.low!.y+(lift.high!.y-lift.low!.y)*progress);
    assert.equal(next.x,lift.low!.x+(lift.high!.x-lift.low!.x)*progress+((rider.formationSlot??0)-1)*72);
  }
  const oldPan=oldLevel.nodes.find(node=>node.id==='s0:pan')!,pan=nextLevel.nodes.find(node=>node.id==='s0:pan')!;
  for(const porter of porters){const next:WorldRun['units'][number]=restored.units[porter.id];assert.equal(next.x,pan.x+(porter.x-oldPan.x)*2);assert(Math.abs(next.y-pan.y)<=2);}
  assert.equal(restored.devices['s0:balance'].mode,1);assert.equal(restored.devices['s0:balance'].load,2);
});

test('the physical checkpoint is reprojected with the journey and retry keeps its earned progress',()=>{
  const oldLevel=previousLevel(1),run=createRun(oldLevel),control=expeditionController(run,oldLevel);
  control();applyAction(run,oldLevel,{type:'start'});
  for(let i=0;i<2500&&!run.autoCheckpointId;i++){control();updateRun(run,oldLevel,.1);}
  assert(run.checkpoint);assert.equal(run.autoCheckpointId,'s0:rest');
  const nextLevel=authoredLevel(oldLevel),restored=restoreRun(legacySnapshot(run),nextLevel);assert(restored);
  assert.equal(restored.checkpoint?.geometryRevision,4);assert.equal(restored.checkpoint?.time,run.checkpoint.time);
  const checkpointUnits=restored.checkpoint!.units;
  assert(applyAction(restored,nextLevel,{type:'retry'}).ok);
  assert.equal(restored.geometryRevision,4);assert.equal(restored.autoCheckpointId,'s0:rest');assert.equal(restored.phase,'paused');
  assert.deepEqual(restored.units,checkpointUnits);
});

test('migration preserves an oversized old drawing without granting more ink for a new gesture',()=>{
  const oldLevel=previousLevel(1),run=createRun(oldLevel),drawing=oldLevel.drawings[0];
  drawExpedition(run,oldLevel,drawing.id);
  const nextLevel=authoredLevel(oldLevel);nextLevel.inkBudget=10;
  const restored=restoreRun(legacySnapshot(run),nextLevel);assert(restored);
  assert(restored.migratedInkLimit!>10);assert(restored.drawings[drawing.id]);
  const twice=restoreRun(JSON.parse(JSON.stringify(saveRun(restored))),nextLevel);assert(twice);assert(twice.drawings[drawing.id]);
  const other=nextLevel.drawings.find(candidate=>candidate.id!==drawing.id)!;
  assert(beginStroke(twice,nextLevel,other.from).ok);
  for(const point of other.suggested.slice(1))appendStroke(twice,nextLevel,point);
  assert.equal(finishStroke(twice,nextLevel).ok,false);assert(!twice.drawings[other.id]);
  assert(twice.drawings[drawing.id]);
});

for(const [index,level] of WORLD_LEVELS.entries())test(`${level.name}: early, middle and late V3 saves complete the actual authored world without losing anyone`,()=>{
  assert(level.previousGeometry,'the production scene must retain the previous coordinates');
  const oldLevel=previousLevel(index);
  for(const seconds of [20,80,160]){
    const run=createRun(oldLevel),control=expeditionController(run,oldLevel);
    control();applyAction(run,oldLevel,{type:'start'});
    for(let frame=0;frame<seconds*10;frame++){control();updateRun(run,oldLevel,.1);}
    const restored=restoreRun(legacySnapshot(run),level);assert(restored,`the ${seconds}s journey must load`);
    assert.equal(restored.time,run.time);assert.equal(restored.geometryRevision,level.revision);
    assert.deepEqual(restored.visits,run.visits);assert.deepEqual(restored.passages,run.passages);
    solveExpedition(restored,level);assert.equal(restored.saved,12);assert.equal(restored.lost,0);assert.equal(restored.retries,0);
  }
});

test('previously safe pendulum crossings stay alive after migration, with newly unsafe ones waiting for a fresh player release',t=>{
  const level=WORLD_LEVELS[2],oldLevel=previousLevel(2);let checked=0,returnedToBank=0;
  for(const network of WORLD_NETWORKS.veilleurs)for(const hazard of network.hazards){
    const oldEdge=oldLevel.edges.find(edge=>edge.id===hazard.edge)!,edge=level.edges.find(edge=>edge.id===hazard.edge)!;
    const period=oldLevel.devices.find(device=>device.id===hazard.pendulum)!.duration!;
    for(let time=0;time<period;time+=.5)for(const fraction of [.2,.5,.8]){
      const run=createRun(oldLevel);run.phase='playing';run.time=time;run.spawned=12;run.saved=11;
      const goal=oldLevel.nodes.find(node=>node.id===oldLevel.goal)!;
      for(const unit of run.units){unit.state='saved';unit.nodeId=goal.id;unit.x=goal.x;unit.y=goal.y;}
      Object.assign(run.units[0],{state:'walking',nodeId:oldEdge.from,edgeId:oldEdge.id,...oldEdge.path[0]});run.passages[oldEdge.id]=[0];
      if(!safeHazardRelease(run,oldLevel,hazard,0,time))continue;
      const elapsed=pathLength(oldEdge.path)/(oldLevel.pace*.94*1.45)*fraction;
      for(let before=0;before<elapsed;before+=1/60)updateRun(run,oldLevel,1/60);
      const restored=restoreRun(legacySnapshot(run),level);assert(restored);assert.equal(restored.time,run.time);
      applyAction(restored,level,{type:'start'});
      if(restored.units[0].edgeId===null){
        returnedToBank++;
        const bank=level.nodes.find(node=>node.id===edge.from)!;
        assert.equal(restored.units[0].nodeId,bank.id);assert.equal(restored.units[0].x,bank.x);assert.equal(restored.units[0].y,bank.y);
        assert.equal(restored.devices[hazard.gate].mode,0);assert(!restored.visits[edge.to]?.includes(0),'migration never completes a dangerous passage');
        for(let frame=0;frame<60;frame++)updateRun(restored,level,1/60);
        assert.equal(restored.units[0].edgeId,null,'the companion waits for the player');
        for(let frame=0;frame<period*120&&!safeHazardRelease(restored,level,hazard,0);frame++)updateRun(restored,level,1/60);
        assert(safeHazardRelease(restored,level,hazard,0));assert(applyAction(restored,level,{type:'device',id:hazard.gate,mode:1}).ok);
        updateRun(restored,level,1/60);assert.equal(restored.units[0].edgeId,edge.id);
      }
      for(let frame=0;frame<480&&restored.units[0].edgeId===edge.id&&restored.units[0].state!=='lost';frame++)updateRun(restored,level,1/60);
      assert.equal(restored.lost,0,`${hazard.edge} at ${time}s/${fraction}: moving the artwork must not create a death`);
      assert(restored.visits[edge.to]?.includes(0),'the companion physically finishes the crossing');checked++;
    }
  }
  assert.equal(checked,99);t.diagnostic(`${checked} safe legacy crossings checked; ${returnedToBank} wait at the entry bank for a new timed release.`);
});
