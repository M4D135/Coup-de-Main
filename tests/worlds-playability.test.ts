import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction} from '../lib/worlds/engine';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import {exploratoryStroke,finishWithoutExtraLoss,playFor,reachedRun,reloadPlaying,releaseOneAtBadTime} from './worlds-playability-support';

for(const level of WORLD_LEVELS)for(const network of WORLD_NETWORKS[level.id]){
  const prefix=`${level.id}/${network.id}`;
  test(`${prefix}: reverse drawing, occupied erasing, Undo and reload preserve all twelve`,()=>{
    let run=reachedRun(level,`${network.id}:entry`);
    for(const id of [...network.drawings].reverse())exploratoryStroke(run,level,id,true);
    for(const id of network.forks)applyAction(run,level,{type:'device',id,mode:1});
    if(network.wind)applyAction(run,level,{type:'device',id:network.wind,mode:1});
    playFor(run,level,25);
    for(const id of [...network.drawings].reverse())if(run.drawings[id]){
      const erased=applyAction(run,level,{type:'erase',id});
      if(erased.ok)assert(applyAction(run,level,{type:'undo'}).ok);
    }
    for(const id of network.forks){applyAction(run,level,{type:'device',id,mode:0});applyAction(run,level,{type:'undo'});}
    playFor(run,level,25);run=reloadPlaying(run,level);
    finishWithoutExtraLoss(run,level);assert.equal(run.saved,12);
  });

  test(`${prefix}: repeated routing and wind changes cannot deadlock an unfinished reservation`,()=>{
    let run=reachedRun(level,`${network.id}:entry`);
    for(const id of network.drawings)exploratoryStroke(run,level,id);
    for(let iteration=0;iteration<28;iteration++){
      for(const id of network.forks)applyAction(run,level,{type:'device',id});
      if(network.wind)applyAction(run,level,{type:'device',id:network.wind});
      if(network.lift)applyAction(run,level,{type:'device',id:network.lift});
      if(iteration%4===0)applyAction(run,level,{type:'undo'});
      playFor(run,level,.7+iteration%3*.3);
    }
    playFor(run,level,40);run=reloadPlaying(run,level);
    finishWithoutExtraLoss(run,level);assert.equal(run.saved,12);
  });

  if(network.wind)test(`${prefix}: changing wind and cleat during charging remains recoverable after reload`,()=>{
    let run=reachedRun(level,`${network.id}:wind`);
    for(let iteration=0;iteration<20;iteration++){
      applyAction(run,level,{type:'device',id:network.wind!});
      if(network.cleat)applyAction(run,level,{type:'device',id:network.cleat});
      playFor(run,level,.4);
    }
    playFor(run,level,35);run=reloadPlaying(run,level);
    finishWithoutExtraLoss(run,level);assert.equal(run.saved,12);
  });

  if(network.lift)for(const phase of ['board','mid','top'])test(`${prefix}: reversing the lift at ${phase}, Undo and reload never lose its riders`,()=>{
    let run=reachedRun(level,`${network.id}:lift-${phase}`);
    applyAction(run,level,{type:'device',id:network.lift!,mode:0});playFor(run,level,3);
    for(let iteration=0;iteration<10;iteration++){
      applyAction(run,level,{type:'device',id:network.lift!});playFor(run,level,.3);
      if(iteration%3===0)applyAction(run,level,{type:'undo'});
    }
    applyAction(run,level,{type:'device',id:network.lift!,mode:0});playFor(run,level,12);run=reloadPlaying(run,level);
    finishWithoutExtraLoss(run,level);assert.equal(run.saved,12);
  });

  if(network.kind==='double')for(const weight of network.weights)test(`${prefix}/${weight}: redraw/erase/Undo every span around a partial double balance, reroute and save twice`,()=>{
    let run=reachedRun(level,`${network.id}:weight-${weight}`);
    assert(run.devices[weight].load>0);
    for(let phase=0;phase<2;phase++){
      for(const id of [...network.drawings].reverse()){
        exploratoryStroke(run,level,id,phase===0);
        if(run.drawings[id]&&applyAction(run,level,{type:'erase',id}).ok)applyAction(run,level,{type:'undo'});
      }
      for(const id of network.forks)applyAction(run,level,{type:'device',id});
      playFor(run,level,7+phase*3);
      applyAction(run,level,{type:'undo'});
      run=reloadPlaying(run,level);
    }
    playFor(run,level,20);finishWithoutExtraLoss(run,level);assert.equal(run.saved,12);
  });

  for(const hazard of network.hazards){
    test(`${prefix}/${hazard.gate}: pausing and reloading midway through a real pendulum crossing is safe`,()=>{
      let run=reachedRun(level,`${network.id}:hazard-${hazard.gate}-crossing`);
      applyAction(run,level,{type:'pause',paused:true});run=reloadPlaying(run,level);playFor(run,level,.8);
      finishWithoutExtraLoss(run,level);assert.equal(run.saved,12);
    });
    test(`${prefix}/${hazard.gate}: one badly timed release still lets all eleven survivors finish`,()=>{
      let run=reachedRun(level,`${network.id}:hazard-${hazard.gate}-waiting`);
      releaseOneAtBadTime(run,level,hazard);run=reloadPlaying(run,level);
      finishWithoutExtraLoss(run,level);assert.equal(run.saved,11);assert.equal(run.lost,1);
    });
  }
}
