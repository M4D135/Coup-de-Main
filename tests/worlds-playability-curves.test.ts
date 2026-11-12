import test from 'node:test';
import assert from 'node:assert/strict';
import retainedBeforeFix from './fixtures/worlds-playability-curved-v311.json';
import {applyAction,getEdgePath,pathLength,restoreRun} from '../lib/worlds/engine';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import type {WorldId} from '../lib/worlds/types';
import {assertLocalReunion,drawHandCurve,humanWait,localTroupeIsTogether,operateLocalWeights,prepareLocalWeights,reloadHandRun,type HandCurve} from './worlds-playability-curves-support';

const cases:Array<{world:WorldId;network:string;next:string}>=[
  {world:'boucles',network:'s0',next:'s2'},
  {world:'plis',network:'s4',next:'s6'},
  {world:'veilleurs',network:'s4',next:'s6'},
];

test('an actual 3.1.1 save with curved bridges and the local relay lit releases all three porters without a new puzzle action',()=>{
  const level=WORLD_LEVELS[0],network=WORLD_NETWORKS.boucles[0];
  const run=restoreRun(structuredClone(retainedBeforeFix),level);assert(run);
  assert.equal(run.devices['s0:relay'].mode,1);assert.equal(run.devices['s2:relay'].mode,0);
  assert.equal(run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).length,3);
  assert.deepEqual(run.units.map(unit=>[unit.id,unit.x,unit.y]),retainedBeforeFix.units.map(unit=>[unit.id,unit.x,unit.y]));
  assert.deepEqual(run.drawings,retainedBeforeFix.drawings);
  const modes=Object.fromEntries(Object.entries(run.devices).map(([id,state])=>[id,state.mode]));
  assert(applyAction(run,level,{type:'start'}).ok);
  for(let elapsed=0;elapsed<100&&!localTroupeIsTogether(run,level,network);elapsed+=.71)humanWait(run,level,.71);
  assertLocalReunion(run,level,network,'s2');
  assert.deepEqual(Object.fromEntries(Object.entries(run.devices).map(([id,state])=>[id,state.mode])),modes,'loading does not solve or toggle another mechanism');
  assert.equal(run.autoCheckpointId,'s0:rest');
});

for(const scenario of cases)for(const shape of ['arch','bends'] as HandCurve[])test(`${scenario.world}/${scenario.network}: ${shape} bridges, human timing and three live reloads reunite the troupe locally`,()=>{
  const level=WORLD_LEVELS.find(level=>level.id===scenario.world)!,network=WORLD_NETWORKS[scenario.world].find(network=>network.id===scenario.network)!;
  let run=prepareLocalWeights(level,network,shape);
  const saved=new Set<string>();
  let nextDecision=run.time+1.35,decision=0;
  const until=run.time+180;
  while(run.phase==='playing'&&run.time<until&&!localTroupeIsTogether(run,level,network)){
    if(!saved.has('partial')&&network.weights.some(id=>run.devices[id].mode===0&&run.devices[id].load>0&&run.devices[id].load<level.devices.find(device=>device.id===id)!.requiredLoad!)){
      run=reloadHandRun(run,level);saved.add('partial');
    }
    if(!saved.has('relay')&&run.devices[network.relay].mode===1){run=reloadHandRun(run,level);saved.add('relay');}
    const onReturn=run.units.find(unit=>{
      if(!unit.edgeId?.startsWith(`${network.id}:return-`))return false;
      const edge=level.edges.find(edge=>edge.id===unit.edgeId)!;
      const length=pathLength(getEdgePath(run,level,edge));
      return unit.distance>length*.2&&unit.distance<length*.75;
    });
    if(!saved.has('return')&&onReturn){
      assert.equal(applyAction(run,level,{type:'erase',id:onReturn.edgeId!}).ok,false,'a curved bridge occupied by a returning porter is protected');
      run=reloadHandRun(run,level);saved.add('return');
    }
    if(run.time>=nextDecision){operateLocalWeights(run,level,network);nextDecision=run.time+[.85,1.7,.62,2.1][decision++%4];}
    humanWait(run,level,.19);
  }
  assert.deepEqual([...saved].sort(),['partial','relay','return']);
  assertLocalReunion(run,level,network,scenario.next);
});

for(const scenario of cases)test(`${scenario.world}/${scenario.network}: late reverse return curves, Undo and a save need no off-screen action`,()=>{
  const level=WORLD_LEVELS.find(level=>level.id===scenario.world)!,network=WORLD_NETWORKS[scenario.world].find(network=>network.id===scenario.network)!;
  let run=prepareLocalWeights(level,network,'bends',true),nextDecision=run.time+1.2;
  const until=run.time+160;
  while(run.phase==='playing'&&run.time<until&&run.devices[network.relay].progress<.98){
    if(run.time>=nextDecision){operateLocalWeights(run,level,network);nextDecision=run.time+1.1;}
    humanWait(run,level,.21);
  }
  assert(run.devices[network.relay].progress>=.98);
  const stations=new Set(network.weights.flatMap(id=>level.devices.find(device=>device.id===id)!.weightNodes??[]));
  const expected=network.weights.reduce((sum,id)=>sum+level.devices.find(device=>device.id===id)!.requiredLoad!,0);
  assert.equal(run.units.filter(unit=>stations.has(unit.nodeId)&&unit.edgeId===null).length,expected);
  humanWait(run,level,4.3);run=reloadHandRun(run,level);
  for(const id of network.drawings.filter(id=>id.includes(':return-'))){
    drawHandCurve(run,level,id,'bends',true,2.35);
    assert(applyAction(run,level,{type:'undo'}).ok,'an unoccupied just-finished curve can be undone');
    assert(!run.drawings[id]);
    drawHandCurve(run,level,id,'arch',false,1.7);
  }
  run=reloadHandRun(run,level);
  for(let elapsed=0;elapsed<120&&!localTroupeIsTogether(run,level,network);elapsed+=.93)humanWait(run,level,.93);
  assertLocalReunion(run,level,network,scenario.next);
});

for(const speed of [1,2] as const)test(`Boucles first tableau: curved paths survive hesitant routing, Undo and a reload at speed ${speed}`,()=>{
  const level=WORLD_LEVELS[0],network=WORLD_NETWORKS.boucles[0];
  let run=prepareLocalWeights(level,network,'bends');
  assert(applyAction(run,level,{type:'speed',value:speed}).ok);
  humanWait(run,level,6.3);
  for(const [index,delay] of [1.4,.75,2.8,1.1,3.2,.55,1.7].entries()){
    assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
    humanWait(run,level,delay);
    if(index===2||index===5)applyAction(run,level,{type:'undo'});
    if(index===3)run=reloadHandRun(run,level);
  }
  let nextDecision=run.time+1.25;
  const until=run.time+180;
  while(run.phase==='playing'&&run.time<until&&!localTroupeIsTogether(run,level,network)){
    if(run.time>=nextDecision){operateLocalWeights(run,level,network);nextDecision=run.time+1.25;}
    humanWait(run,level,.23);
  }
  assertLocalReunion(run,level,network,'s2');
});
