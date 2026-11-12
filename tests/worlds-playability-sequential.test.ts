import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createRun,gateSatisfied,getEdgePath,pathLength,saveRun} from '../lib/worlds/engine';
import {WORLD_LEVELS,WORLD_NETWORKS,type ExpeditionNetwork} from '../lib/worlds/levels';
import type {WorldLevel,WorldRun} from '../lib/worlds/types';
import {safeHazardRelease} from './worlds-expedition-walkthrough';
import {drawHandCurve,humanWait,localTroupeIsTogether,reloadHandRun} from './worlds-playability-curves-support';

/** A second controller with one hard boundary: it receives exactly one
 * tableau and cannot tap any other tableau's controls. The only shared timing
 * helper predicts a visible pendulum's safe interval; it issues no commands. */
function tableauController(level:WorldLevel,network:ExpeditionNetwork):(run:WorldRun)=>void {
  const boardingSince=new Map<string,number>();
  const set=(run:WorldRun,id:string,value:number)=>{
    assert(id.startsWith(`${network.id}:`),'the audit must never operate a different tableau');
    if(run.devices[id].mode===value)return;
    const changed=applyAction(run,level,{type:'device',id,mode:value});assert(changed.ok,`${id}: ${changed.message}`);
  };
  return run=>{
    if(network.kind==='scout'){
      const feeding=level.edges.find(edge=>edge.route?.deviceId===network.forks[0]&&edge.maxPassages===2)!;
      set(run,network.forks[0],(run.passages[feeding.id]?.length??0)<2?1:0);
      if(network.wind)set(run,network.wind,run.devices[network.relay].mode?0:1);
    }
    for(const [index,id] of network.weights.entries()){
      const definition=level.devices.find(device=>device.id===id)!,state=run.devices[id];
      if(state.mode===0&&state.load>=definition.requiredLoad!)set(run,id,1);
      set(run,network.forks[index],state.mode===1?0:1);
    }
    if(network.kind==='double'&&network.wind)set(run,network.wind,run.devices[network.weights[1]].mode?0:1);
    if(network.wind&&network.cleat){
      if(run.devices[network.cleat].mode===0){
        set(run,network.wind,1);
        if(run.devices[network.wind].progress>=.98)set(run,network.cleat,1);
      }
      if(run.devices[network.cleat].mode===1)set(run,network.wind,0);
    }
    if(network.lift){
      const id=network.lift,state=run.devices[id],definition=level.devices.find(device=>device.id===id)!;
      if(definition.gates?.every(gate=>gateSatisfied(run,gate))){
        if(state.mode===0&&state.progress<.02&&state.load>0){
          if(!boardingSince.has(id))boardingSince.set(id,run.time);
          if(state.load>=3||run.time-boardingSince.get(id)!>4.7)set(run,id,1);
        }
        if(state.mode===1&&state.progress>=.99&&state.load===0){set(run,id,0);boardingSince.delete(id);}
      }
    }
    for(const hazard of network.hazards){
      const brake=run.devices[hazard.brake];
      if(brake.mode===1&&brake.progress>=.99){set(run,hazard.gate,1);continue;}
      if(brake.mode===1||run.units.some(unit=>unit.edgeId===hazard.edge&&unit.state!=='lost'))continue;
      const waiting=run.units.find(unit=>{
        if(['lost','saved','queued'].includes(unit.state))return false;
        if(unit.edgeId===null)return unit.nodeId===hazard.approach;
        const edge=level.edges.find(edge=>edge.id===unit.edgeId)!;
        return edge.to===hazard.approach&&unit.distance>=pathLength(getEdgePath(run,level,edge))-.1;
      });
      if(waiting&&safeHazardRelease(run,level,hazard,waiting.id))set(run,hazard.gate,1);
    }
  };
}

/** The first Veilleurs exit feeds directly into the next tableau's closed
 * portal. Its twelve-person physical queue can extend back over the souvenir.
 * That is a local puzzle completed with a normal queue, not a retained porter:
 * every companion must be beyond the first bridge, its pan and return span
 * empty, and the next portal visibly reached before this exception applies. */
function queuedAtNextPortal(run:WorldRun,level:WorldLevel,network:ExpeditionNetwork):boolean {
  if(level.id!=='veilleurs'||network.id!=='s0'||run.devices['s0:relay'].progress<.98)return false;
  const far=level.nodes.find(node=>node.id==='s0:far')!;
  const allowed=new Set(['s0:far-road','s0:low-road','link:1','s2:entry']);
  const entry=level.edges.find(edge=>edge.id==='s2:entry')!;
  const reachedPortal=run.units.some(unit=>unit.edgeId===entry.id&&unit.distance>=pathLength(getEdgePath(run,level,entry))-.1);
  return reachedPortal&&run.units.every(unit=>unit.state==='waiting'&&unit.edgeId!==null&&allowed.has(unit.edgeId)&&unit.x>=far.x)
    &&network.weights.every(id=>run.devices[id].load===0)&&run.devices['s0:lift'].load===0;
}

for(const level of WORLD_LEVELS)test(`${level.id}: all five tableaux finish in order with curved bridges, local controls and a reload at each boundary`,async t=>{
  let run=createRun(level);
  const networks=WORLD_NETWORKS[level.id];
  for(const [index,network] of networks.entries())await t.test(`${network.id}: finish every local route before touching the next tableau`,()=>{
    if(run.phase==='playing')assert(applyAction(run,level,{type:'pause',paused:true}).ok);
    const before=run.time;
    for(const [drawingIndex,id] of network.drawings.entries())drawHandCurve(run,level,id,index%2?'bends':'arch',drawingIndex%2===1);
    const control=tableauController(level,network);
    control(run);assert(applyAction(run,level,{type:'start'}).ok);
    let nextDecision=run.time+.83,decision=0;
    const until=run.time+240;
    while(run.phase==='playing'&&run.time<until&&!localTroupeIsTogether(run,level,network)&&!queuedAtNextPortal(run,level,network)){
      if(run.time>=nextDecision){control(run);nextDecision=run.time+[.83,1.15,.47,1.7,.62][decision++%5];}
      humanWait(run,level,.17);
    }
    const queued=queuedAtNextPortal(run,level,network);
    assert(localTroupeIsTogether(run,level,network)||queued,`${network.id} cannot finish locally: ${JSON.stringify(run.units.map(unit=>({id:unit.id,node:unit.nodeId,edge:unit.edgeId,x:Math.round(unit.x)})))}`);
    assert.equal(run.lost,0);assert.equal(run.retries,0);
    for(const future of networks.slice(index+1)){
      assert(!future.drawings.some(id=>run.drawings[id]),'a following tableau has not received any drawing');
      for(const definition of level.devices.filter(device=>device.id.startsWith(`${future.id}:`)))
        assert.equal(run.devices[definition.id].mode,definition.initialMode,`${definition.id} must remain untouched`);
    }
    // Reclaim only this now-completed tableau's ink before closing its page.
    if(run.phase==='playing')for(const id of network.drawings)assert(applyAction(run,level,{type:'erase',id}).ok);
    const checkpoint=run.autoCheckpointId,snapshot=JSON.parse(JSON.stringify(saveRun(run)));
    run=reloadHandRun(run,level);
    assert.equal(run.autoCheckpointId,checkpoint);assert.equal(run.saved,snapshot.saved);
    t.diagnostic(`${level.id}/${network.id}: ${queued?`12 beyond the solved bridge, no isolated porter; ${(run.visits[network.end]??[]).length}/12 reached the souvenir, the rest queue immediately before it at the next closed portal`:'12 reunited'} in ${(run.time-before).toFixed(1)} simulated seconds; saved and resumed; next tableaux untouched`);
  });
  for(let elapsed=0;run.phase==='playing'&&elapsed<30;elapsed+=.17)humanWait(run,level,.17);
  assert.equal(run.phase,'won');assert.equal(run.saved,12);assert.equal(run.lost,0);assert.equal(run.retries,0);
});
