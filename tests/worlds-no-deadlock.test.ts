import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createRun,getDeviceStatus,updateRun} from '../lib/worlds/engine';
import {WORLD_LEVELS,WORLD_NETWORKS,type ExpeditionNetwork} from '../lib/worlds/levels';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';
import {drawHandCurve,localTroupeIsTogether,reloadHandRun} from './worlds-playability-curves-support';
import {reachedRun} from './worlds-playability-support';
import {solveExpedition} from './worlds-expedition-walkthrough';

function setMode(run:WorldRun,level:WorldLevel,id:string,mode:number):void {
  if(run.devices[id].mode===mode)return;
  const result=applyAction(run,level,{type:'device',id,mode});assert(result.ok,`${id}: ${result.message}`);
}
function liftController(level:WorldLevel,networks:ExpeditionNetwork[]):(run:WorldRun)=>void {
  const boardingSince=new Map<string,number>();
  return run=>{for(const network of networks)if(network.lift){
    const id=network.lift,state=run.devices[id];
    if(state.mode===0&&state.progress<=.001&&state.load>0){
      if(!boardingSince.has(id))boardingSince.set(id,run.time);
      if(state.load===3||run.time-boardingSince.get(id)!>4)setMode(run,level,id,1);
    }else if(state.mode===1&&state.progress>=.999&&state.load===0){
      setMode(run,level,id,0);boardingSince.delete(id);
    }
  }};
}

/** The cached entry is reached by the first companion, not the last. Finish
 * any real earlier transport before auditing this tableau's local recovery. */
function arriveWithWholeTroupe(level:WorldLevel,network:ExpeditionNetwork):WorldRun {
  const networks=WORLD_NETWORKS[level.id],index=networks.indexOf(network);
  const run=index===0?createRun(level):reachedRun(level,`${network.id}:entry`);
  if(index>0){
    for(const id of network.forks)setMode(run,level,id,0);
    const previous=networks[index-1],transport=liftController(level,networks.slice(0,index));
    for(let frame=0;frame<1800&&!localTroupeIsTogether(run,level,previous);frame++){
      transport(run);updateRun(run,level,.1);
    }
    assert(localTroupeIsTogether(run,level,previous),'all twelve must actually finish the preceding tableau');
    for(const earlier of networks.slice(0,index))for(const id of earlier.drawings)if(run.drawings[id])
      assert(applyAction(run,level,{type:'erase',id}).ok,'finished earlier bridges release their ink');
  }
  if(run.phase==='playing')assert(applyAction(run,level,{type:'pause',paused:true}).ok);
  for(const id of network.drawings)if(run.drawings[id])assert(applyAction(run,level,{type:'erase',id}).ok);
  return run;
}
function futureModes(run:WorldRun,level:WorldLevel,network:ExpeditionNetwork):Record<string,number> {
  const networks=WORLD_NETWORKS[level.id],prefixes=new Set(networks.slice(networks.indexOf(network)+1).map(item=>item.id));
  return Object.fromEntries(level.devices.filter(device=>prefixes.has(device.id.split(':')[0])).map(device=>[device.id,run.devices[device.id].mode]));
}

test('Veilleurs first tableau: switching away before two admitted porters settle remains recoverable beside a full lift',()=>{
  const level=WORLD_LEVELS.find(level=>level.id==='veilleurs')!,network=WORLD_NETWORKS.veilleurs[0];
  let run=createRun(level);assert(applyAction(run,level,{type:'start'}).ok);
  for(let frame=0;frame<600;frame++)updateRun(run,level,.1);
  assert.equal(run.spawned,12);assert.equal(run.devices[network.lift!].load,3);
  setMode(run,level,network.lift!,1);
  for(let frame=0;frame<300&&run.devices[network.lift!].load>0;frame++)updateRun(run,level,.1);
  assert.equal(run.units.filter(unit=>unit.edgeId==='s0:upper-road').length,3);
  setMode(run,level,network.lift!,0);
  for(let frame=0;frame<300&&run.devices[network.lift!].load<3;frame++)updateRun(run,level,.1);
  assert.equal(run.devices[network.lift!].load,3);assert.equal(run.passages['s0:main-road'].length,12);
  drawHandCurve(run,level,'s0:weight-thread','arch');setMode(run,level,'s0:fork',1);
  for(let frame=0;frame<400&&(run.passages['s0:weight-thread']?.length??0)<2;frame++)updateRun(run,level,.1);
  assert.equal(run.passages['s0:weight-thread'].length,2);
  assert.equal(run.units.filter(unit=>unit.edgeId==='s0:weight-thread'&&!unit.returning).length,2);
  assert.equal(run.devices['s0:balance'].load,0,'admission to a bridge is not yet weight on the plate');
  setMode(run,level,'s0:fork',0);
  for(let frame=0;frame<300;frame++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,0);assert.deepEqual(run.passages['s0:weight-thread'],[]);
  assert(!run.units.some(unit=>unit.nodeId==='s0:pan'||unit.edgeId==='s0:weight-thread'||unit.returning));
  run=reloadHandRun(run,level);setMode(run,level,'s0:fork',1);
  for(let frame=0;frame<600&&!getDeviceStatus(run,level,'s0:balance').modes[1].enabled;frame++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,2);assert.equal(run.devices['s0:balance'].mode,0);
  assert(getDeviceStatus(run,level,'s0:balance').modes[1].enabled,'routing back to the plate must regain two real settled porters');
  solveExpedition(run,level);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
});

// Veilleurs s0 has its separate four-order regression. These six cases also
// exercise the last tableaux, whose incoming entry save can precede a lift trip.
for(const level of WORLD_LEVELS)for(const network of WORLD_NETWORKS[level.id].filter(network=>network.weights.length
  &&!(level.id==='veilleurs'&&network.id==='s0')))
  test(`${level.id}/${network.id}: late cranks and erased approach bridges cannot retain the porters after everyone else leaves`,()=>{
    let run=arriveWithWholeTroupe(level,network);
    const untouched=futureModes(run,level,network),returns=network.drawings.filter(id=>id.includes(':return-'));
    const approaches=network.drawings.filter(id=>!returns.includes(id));
    for(const id of approaches)drawHandCurve(run,level,id,'arch');
    for(const id of network.forks)setMode(run,level,id,1);
    assert(applyAction(run,level,{type:'start'}).ok);
    const definitions=network.weights.map(id=>level.devices.find(device=>device.id===id)!);
    const stations=new Set(definitions.flatMap(device=>device.weightNodes??[]));
    const required=definitions.reduce((sum,device)=>sum+device.requiredLoad!,0),transport=liftController(level,[network]);
    const mainArrived=()=>run.units.filter(unit=>!stations.has(unit.nodeId)||unit.edgeId!==null)
      .every(unit=>(run.visits[network.end]??[]).includes(unit.id));
    for(let frame=0;frame<2400&&!(mainArrived()&&definitions.every(device=>run.devices[device.id].load===device.requiredLoad));frame++){
      for(const [index,device] of definitions.entries())
        setMode(run,level,network.forks[index],run.devices[device.id].load>=device.requiredLoad!?0:1);
      transport(run);updateRun(run,level,.1);
    }
    const porters=run.units.filter(unit=>stations.has(unit.nodeId)&&unit.edgeId===null);
    assert.equal(porters.length,required);assert(mainArrived(),'all non-porters must pass the exit, not merely light the marker');
    assert.equal(run.visits[network.end]?.length,12-required);
    assert(definitions.every(device=>run.devices[device.id].mode===0&&run.devices[device.id].progress===1));
    assert(returns.every(id=>!run.drawings[id]));assert.notEqual(run.autoCheckpointId,network.end);
    assert.equal(run.phase,'playing','arrivals ahead must not finish a world while porters remain');

    run=reloadHandRun(run,level);assert(applyAction(run,level,{type:'pause',paused:true}).ok);
    for(const id of approaches)assert(applyAction(run,level,{type:'erase',id}).ok,'the old approach is now genuinely empty');
    for(const id of network.weights)setMode(run,level,id,1);
    for(const id of returns){
      drawHandCurve(run,level,id,'arch',true);
      assert(applyAction(run,level,{type:'erase',id}).ok);
      drawHandCurve(run,level,id,'arch');
    }
    run=reloadHandRun(run,level);
    // No controller repairs this recovery: only the newly drawn local return
    // and the player's late crank can let the remaining porters walk out.
    for(let frame=0;frame<1200&&!localTroupeIsTogether(run,level,network);frame++)updateRun(run,level,.1);
    assert(localTroupeIsTogether(run,level,network),'all twelve must physically pass this tableau before any future command');
    assert.equal(run.visits[network.end]?.length,12);assert(network.weights.every(id=>run.devices[id].load===0));
    assert.deepEqual(futureModes(run,level,network),untouched);assert.equal(run.lost,0);assert.equal(run.retries,0);
    if(run.phase!=='won')solveExpedition(run,level);
    assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
  });

for(const level of WORLD_LEVELS)for(const network of WORLD_NETWORKS[level.id].filter(network=>network.lift&&!network.weights.length))
  test(`${level.id}/${network.id}: a missing landing bridge, loaded descent and reload leave all twelve recoverable locally`,()=>{
    let run=arriveWithWholeTroupe(level,network);
    const untouched=futureModes(run,level,network),outgoing=`${network.id}:far-thread`,transport=liftController(level,[network]);
    drawHandCurve(run,level,`${network.id}:wind-thread`,'arch');setMode(run,level,network.wind!,1);
    assert(applyAction(run,level,{type:'start'}).ok);
    for(let frame=0;frame<1200;frame++){
      if(getDeviceStatus(run,level,network.cleat!).modes[1].enabled)setMode(run,level,network.cleat!,1);
      transport(run);updateRun(run,level,.1);
    }
    assert.equal(run.spawned,12);assert.equal(run.lost,0);assert(!run.drawings[outgoing]);
    const upperQueue=run.units.filter(unit=>unit.edgeId===`${network.id}:middle-road`);
    assert(upperQueue.length>0&&upperQueue.every(unit=>unit.state==='waiting'));
    // A short landing can unload just one of a batch of three. The relevant
    // obstruction is a full stationary landing with passengers still aboard.
    assert(run.devices[network.lift!].load>0&&run.devices[network.lift!].load<=3);
    assert.equal(run.devices[network.lift!].progress,1);
    assert(run.units.every(unit=>unit.state==='waiting'||unit.state==='riding'));
    const stopped=run.units.map(unit=>[unit.x,unit.y,unit.nodeId,unit.edgeId]);
    for(let frame=0;frame<10;frame++)updateRun(run,level,.1);
    assert.deepEqual(run.units.map(unit=>[unit.x,unit.y,unit.nodeId,unit.edgeId]),stopped,'the missing bridge really leaves a stationary queue');
    assert.equal(run.visits[network.end]?.length??0,0);
    setMode(run,level,network.lift!,0);
    for(let frame=0;frame<300&&run.devices[network.lift!].progress>.65;frame++)updateRun(run,level,.1);
    assert(run.devices[network.lift!].progress>.2&&run.devices[network.lift!].progress<.7,'save a genuinely moving loaded descent');
    run=reloadHandRun(run,level);assert(applyAction(run,level,{type:'pause',paused:true}).ok);
    setMode(run,level,network.wind!,0);
    drawHandCurve(run,level,outgoing,'arch',true);assert(applyAction(run,level,{type:'erase',id:outgoing}).ok);
    drawHandCurve(run,level,outgoing,'arch');run=reloadHandRun(run,level);
    for(let frame=0;frame<1800&&!localTroupeIsTogether(run,level,network);frame++){transport(run);updateRun(run,level,.1);}
    assert(localTroupeIsTogether(run,level,network));assert.equal(run.visits[network.end]?.length,12);
    assert.equal(run.passages[outgoing].length,12);assert.equal(run.devices[network.lift!].load,0);
    assert.equal(run.devices[network.wind!].mode,0,'the earned cleat holds the lower support throughout recovery');
    assert.deepEqual(futureModes(run,level,network),untouched);assert.equal(run.lost,0);assert.equal(run.retries,0);
    solveExpedition(run,level);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
  });
