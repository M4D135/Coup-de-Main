import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS,WORLD_NETWORKS} from '../lib/worlds/levels';
import {applyAction,createRun,getWaitingReason,saveRun,updateRun} from '../lib/worlds/engine';
import {getExpeditionView,panAroundPoint} from '../lib/worlds/camera';
import {hitTestPlayTarget,tappedPlatform} from '../lib/worlds/interaction';
import {deviceBody} from '../lib/worlds/renderer-mechanisms';
import {drawExpedition} from './worlds-expedition-walkthrough';

function waitingPorters(){
  const level=WORLD_LEVELS[0],run=createRun(level);
  for(const id of WORLD_NETWORKS.boucles[0].drawings)assert(drawExpedition(run,level,id));
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  applyAction(run,level,{type:'start'});
  for(let i=0;i<400&&run.devices['s0:balance'].load<3;i++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,3);
  assert(applyAction(run,level,{type:'device',id:'s0:balance'}).ok);
  assert(applyAction(run,level,{type:'erase',id:'s0:return-thread'}).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:fork'}).ok);
  for(let i=0;i<700;i++)updateRun(run,level,.1);
  return {level,run};
}

for(const [width,height] of [[393,700],[375,812],[320,568],[844,390]]){
  test(`three waiting porters, their crank and both pan rims are distinct touch targets in ${width} × ${height}`,()=>{
    const {level,run}=waitingPorters(),balance=level.devices.find(device=>device.id==='s0:balance')!;
    const porters=run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null);
    assert.equal(porters.length,3);assert.equal(run.units.filter(unit=>unit.x>3200).length,9);
    const zoom=width>height?1.2:1,initial=getExpeditionView(level.width,level.height,width,height,zoom,0,.5,3200);
    const pan=panAroundPoint(initial,balance,{x:width*.5,y:height*.5});
    const view=getExpeditionView(level.width,level.height,width,height,zoom,pan.panX,pan.panY,3200);
    const before=JSON.stringify(saveRun(run));
    for(const unit of porters){
      const face={x:unit.x,y:unit.y-level.creatureHeight*.59};
      assert.deepEqual(hitTestPlayTarget(level,run,face,view.scale),{kind:'companion',id:unit.id});
      assert.match(getWaitingReason(run,level,unit,true)??'',/passage de retour/i);
    }
    assert.deepEqual(hitTestPlayTarget(level,run,balance,view.scale),{kind:'device',id:balance.id});
    const panBody=deviceBody(level,run,balance);
    for(const direction of [-1,1]){
      const rim={x:panBody.point.x+direction*panBody.width/2,y:panBody.point.y};
      assert.equal(tappedPlatform(level,run,rim,view.scale),balance.id);
    }
    assert.equal(JSON.stringify(saveRun(run)),before,'inspection and greetings must not unlatch the pan or spend ink');
  });
}

test('a visible bridge support stays drawable when a companion is standing on its platform',()=>{
  const {level,run}=waitingPorters(),pan=level.nodes.find(node=>node.id==='s0:pan')!;
  const drawing=level.drawings.find(drawing=>drawing.from.x===pan.x&&drawing.from.y===pan.y)!;
  assert(drawing);assert.equal(run.drawings[drawing.id],undefined);
  for(const scale of [.315,.45,1]){
    assert.deepEqual(hitTestPlayTarget(level,run,drawing.from,scale),{kind:'drawing',id:drawing.id,end:'from'});
    assert.equal(tappedPlatform(level,run,drawing.from,scale),'s0:balance','a tap operates the pan; a drag from the same support remains a drawing');
  }
});

test('every manual mechanism retains its own precise control target in all three worlds',()=>{
  for(const level of WORLD_LEVELS){
    const run=createRun(level);
    for(const device of level.devices.filter(device=>device.playerControlled!==false&&device.modes.length>1)){
      for(const scale of [.315,.45,1])assert.deepEqual(hitTestPlayTarget(level,run,device,scale),{kind:'device',id:device.id},`${level.id} ${device.id}`);
    }
  }
});

test('focusing each mechanism through the illustrated camera keeps its real target on the correct page',()=>{
  for(const [width,height,zoom] of [[375,812,1.5],[320,568,1.5],[844,390,1.5]]){
    for(const level of WORLD_LEVELS){
      const initial=getExpeditionView(level.width,level.height,width,height,zoom,0,.5,3200);
      for(const point of level.devices.filter(device=>device.playerControlled!==false&&device.modes.length>1)){
        const pan=panAroundPoint(initial,point,{x:width*.5,y:(height-120+75)/2});
        const view=getExpeditionView(level.width,level.height,width,height,zoom,pan.panX,pan.panY,3200);
        assert.equal(view.tableauIndex,Math.floor(point.x/3200));
        const x=point.x*view.scale+view.x,y=point.y*view.scale+view.y;
        assert(x>=24&&x<=width-24,`${level.id} ${point.id}: horizontal target ${x}`);
        assert(y>=75&&y<=height-120,`${level.id} ${point.id}: target ${y} hidden by header or tools`);
      }
    }
  }
});
