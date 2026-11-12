import test from 'node:test';
import assert from 'node:assert/strict';
import blockedDoubleBalance from './fixtures/worlds-double-balance-stuck-v4.json';
import {applyAction,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';
import {solveExpedition} from './worlds-expedition-walkthrough';
import {reachedRun,reloadPlaying} from './worlds-playability-support';
import {drawHandCurve,humanWait} from './worlds-playability-curves-support';

function waitForReturningPorters(run:WorldRun,level:WorldLevel,balanceId:string):{returned:boolean;crossedJunction:boolean} {
  let returned=false,crossedJunction=false;
  for(let frame=0;frame<1200&&run.devices[balanceId].load<2;frame++){
    const positions=run.units.map(unit=>({x:unit.x,y:unit.y}));
    updateRun(run,level,.05);
    returned||=run.units.some(unit=>unit.returning);
    crossedJunction||=run.units.some(unit=>unit.returnEdges.length>1);
    for(const unit of run.units)if(!['queued','saved','lost','riding'].includes(unit.state)){
      assert(Math.hypot(unit.x-positions[unit.id].x,unit.y-positions[unit.id].y)<=level.pace*.05*1.1+1,
        `companion ${unit.id} must walk back along its real route rather than jump to the earlier junction`);
    }
  }
  assert.equal(run.devices[balanceId].load,2,'the changed first junction must recover two actual porters');
  assert.equal(run.devices[balanceId].mode,0,'the player still has to fasten the first balance');
  return {returned,crossedJunction};
}

for(const level of WORLD_LEVELS){
  const network=WORLD_NETWORKS[level.id].find(item=>item.kind==='double')!;
  for(const secondForkMode of [0,1])test(`${level.id}: an empty first balance remains recoverable past the second junction in mode ${secondForkMode}`,()=>{
    let run=reachedRun(level,`${network.id}:entry`);
    assert(applyAction(run,level,{type:'pause',paused:true}).ok);
    drawHandCurve(run,level,`${network.id}:weight-a-thread`,'arch');
    drawHandCurve(run,level,`${network.id}:weight-b-thread`,'bends',true);
    assert(applyAction(run,level,{type:'device',id:network.forks[0],mode:0}).ok);
    assert(applyAction(run,level,{type:'device',id:network.forks[1],mode:1}).ok);
    if(network.wind)assert(applyAction(run,level,{type:'device',id:network.wind,mode:1}).ok);
    assert(applyAction(run,level,{type:'start'}).ok);
    humanWait(run,level,90);
    assert.equal(run.devices[network.weights[0]].load,0);
    assert.equal(run.devices[network.weights[1]].load,2);
    assert(applyAction(run,level,{type:'device',id:network.weights[1],mode:1}).ok);
    if(network.wind)assert(applyAction(run,level,{type:'device',id:network.wind,mode:0}).ok);
    assert(applyAction(run,level,{type:'device',id:network.forks[1],mode:secondForkMode}).ok);
    assert(applyAction(run,level,{type:'device',id:network.forks[0],mode:1}).ok);
    run=reloadPlaying(run,level);
    const recovery=waitForReturningPorters(run,level,network.weights[0]);
    assert(recovery.returned);
    if(secondForkMode===0)assert(recovery.crossedJunction,'the walk must continue through the unchanged second junction');
    assert.equal(run.devices[network.weights[1]].mode,1,'the full second balance stays fastened');
    assert.equal(run.devices[network.relay].mode,0,'the relay is not granted by the recovery');
    solveExpedition(run,level,600);assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
  });
}

test('a genuinely blocked pre-fix double-balance save resumes its curved routes without resetting or solving its devices',()=>{
  const level=WORLD_LEVELS[0],run=restoreRun(structuredClone(blockedDoubleBalance),level);assert(run);
  assert.equal(run.time,blockedDoubleBalance.time);
  assert.deepEqual(run.units.map(unit=>[unit.id,unit.x,unit.y]),blockedDoubleBalance.units.map(unit=>[unit.id,unit.x,unit.y]));
  assert.deepEqual(run.drawings,blockedDoubleBalance.drawings);
  assert.equal(run.devices['s8:balance-a'].mode,0);assert.equal(run.devices['s8:balance-a'].load,1);
  assert.equal(run.devices['s8:balance-b'].mode,1);assert.equal(run.devices['s8:relay'].mode,0);
  assert(applyAction(run,level,{type:'start'}).ok);
  assert(waitForReturningPorters(run,level,'s8:balance-a').returned);
  const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);
  solveExpedition(restored,level,600);assert.equal(restored.saved,12);assert.equal(restored.lost,0);assert.equal(restored.retries,0);
});
