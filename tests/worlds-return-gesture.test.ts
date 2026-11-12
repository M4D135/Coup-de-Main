import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {appendStroke,applyAction,beginStroke,createRun,finishStroke,getDeviceStatus,getDrawingEndpoints,restoreRun,saveRun,updateRun} from '../lib/worlds/engine';
import {autoPanWorldView,getExpeditionView,panAroundPoint} from '../lib/worlds/camera';
import {hitTestDrawTarget,hitTestPlayTarget} from '../lib/worlds/interaction';
import type {Point,WorldLevel,WorldRun} from '../lib/worlds/types';
import {drawExpedition,solveExpedition} from './worlds-expedition-walkthrough';

const level=WORLD_LEVELS.find(level=>level.id==='veilleurs')!;
const returnDrawing=level.drawings.find(drawing=>drawing.id==='s0:return-thread')!;
function advance(run:WorldRun,seconds:number){for(let frame=0;frame<seconds*10;frame++)updateRun(run,level,.1);}
function waitingPorters(){
  const run=createRun(level);
  for(const id of ['s0:weight-thread','s0:high-thread'])assert(drawExpedition(run,level,id));
  assert(applyAction(run,level,{type:'device',id:'s0:fork',mode:1}).ok);
  assert(applyAction(run,level,{type:'start'}).ok);advance(run,20);
  assert(getDeviceStatus(run,level,'s0:balance').modes[1].enabled);
  assert(applyAction(run,level,{type:'device',id:'s0:balance',mode:1}).ok);
  assert(applyAction(run,level,{type:'device',id:'s0:fork',mode:0}).ok);
  // The same five manual trips as the observed scene, including its last
  // single passenger. No helper changes a creature or a mechanism's state.
  for(let trip=0;trip<5;trip++){
    advance(run,10);assert(applyAction(run,level,{type:'device',id:'s0:lift',mode:1}).ok);
    advance(run,12);assert(applyAction(run,level,{type:'device',id:'s0:lift',mode:0}).ok);advance(run,5);
  }
  assert.equal(run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).length,2);
  assert.equal(new Set(run.visits['s0:rest']).size,10);
  assert.equal(run.drawings[returnDrawing.id],undefined);return run;
}

test('a nearby return anchor keeps its full 24 CSS pixel drag target despite the crank or companion tap target',()=>{
  const run=waitingPorters(),endpoints=getDrawingEndpoints(run,level,returnDrawing),before=JSON.stringify(saveRun(run));
  assert.equal(endpoints.from.y,808,'the real loaded pan is below its authored rest height');
  for(const [width,height]of [[320,568],[375,812],[844,390],[2048,1177]]){
    const {scale}=getExpeditionView(level.width,level.height,width,height,1,0,.5,3200);
    const nearCrank:Point={x:endpoints.from.x,y:endpoints.from.y-8/scale};
    if(width<1000)assert.deepEqual(hitTestPlayTarget(level,run,nearCrank,scale),{kind:'device',id:'s0:balance'},'a short tap still belongs to the crank');
    assert.deepEqual(hitTestDrawTarget(level,run,nearCrank,scale),{kind:'drawing',id:returnDrawing.id,end:'from'});
    for(const end of ['from','to'] as const)for(let x=-24;x<=24;x+=4)for(let y=-24;y<=24;y+=4){
      if(x*x+y*y>24*24)continue;
      const finger={x:endpoints[end].x+x/scale,y:endpoints[end].y+y/scale};
      assert.deepEqual(hitTestDrawTarget(level,run,finger,scale),{kind:'drawing',id:returnDrawing.id,end},`${width}×${height} ${end}: offset ${x},${y}`);
    }
    const crank=level.devices.find(device=>device.id==='s0:balance')!;
    assert.deepEqual(hitTestPlayTarget(level,run,crank,scale),{kind:'device',id:crank.id});
    for(const unit of run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null)){
      const face={x:unit.x,y:unit.y-level.creatureHeight*.59};
      assert.deepEqual(hitTestPlayTarget(level,run,face,scale),{kind:'companion',id:unit.id});
    }
    const lift=level.devices.find(device=>device.id==='s0:lift')!;
    assert.equal(hitTestDrawTarget(level,run,lift,scale),null,'a crank without a nearby missing support keeps ordinary drag-to-pan behavior');
  }
  assert.equal(JSON.stringify(saveRun(run)),before,'finding a drag target must not act on the crank, spend ink, or move a companion');
});

test('a stored drag target resolves to the current pan endpoint after the pan moves',()=>{
  const run=createRun(level);assert(drawExpedition(run,level,'s0:weight-thread'));
  assert(applyAction(run,level,{type:'device',id:'s0:fork',mode:1}).ok);assert(applyAction(run,level,{type:'start'}).ok);
  for(let frame=0;frame<400&&run.devices['s0:balance'].load<2;frame++)updateRun(run,level,.1);
  assert.equal(run.devices['s0:balance'].load,2);
  const before=getDrawingEndpoints(run,level,returnDrawing).from,target=hitTestDrawTarget(level,run,before,.315);assert(target);
  for(let frame=0;frame<200&&!getDeviceStatus(run,level,'s0:balance').modes[1].enabled;frame++)updateRun(run,level,.1);
  const now=getDrawingEndpoints(run,level,returnDrawing)[target.end];assert(now.y>before.y+30);
  assert(beginStroke(run,level,now).ok);assert.equal(run.activeStroke!.drawingId,target.id);
  assert.deepEqual(run.activeStroke!.points[0],now,'the gesture snaps to the new physical support, not its pointer-down position');
});

/** Exercise the camera/gesture boundary too: hold a finger at the screen edge
 * until the other support appears, then release on that real destination. */
function drawAcrossViewport(run:WorldRun,world:WorldLevel,width:number,height:number,end:'from'|'to'){
  const endpoints=getDrawingEndpoints(run,world,returnDrawing),from=endpoints[end],to=endpoints[end==='from'?'to':'from'];
  let view=getExpeditionView(world.width,world.height,width,height,1,0,.5,3200);
  let pan=panAroundPoint(view,from,{x:width*.5,y:height*.5});
  view=getExpeditionView(world.width,world.height,width,height,1,pan.panX,pan.panY,3200);
  const fingerDown={x:from.x,y:from.y-8/view.scale},target=hitTestDrawTarget(world,run,fingerDown,view.scale);assert(target);assert.equal(target.end,end);
  const anchor=getDrawingEndpoints(run,world,returnDrawing)[target.end];
  assert(beginStroke(run,world,anchor).ok);assert.equal(run.activeStroke!.drawingId,returnDrawing.id);
  assert.equal(run.activeStroke!.reversed,end==='to');assert.deepEqual(run.activeStroke!.points[0],anchor);
  let scrolled=false,reached=false;
  for(let frame=0;frame<300;frame++){
    const targetX=to.x*view.scale+view.x,pointerX=Math.max(16,Math.min(width-16,targetX));
    const x=(pointerX-view.x)/view.scale,t=Math.max(0,Math.min(1,(x-from.x)/(to.x-from.x)));
    const point:Point={x,y:from.y+(to.y-from.y)*t};appendStroke(run,world,point);
    if(targetX>=16&&targetX<=width-16){appendStroke(run,world,to);reached=true;break;}
    const next=autoPanWorldView(view,{x:pointerX,y:point.y*view.scale+view.y},.05,pan.panX,pan.panY);
    scrolled ||=next.panX!==pan.panX;pan=next;view=getExpeditionView(world.width,world.height,width,height,1,pan.panX,pan.panY,3200);
  }
  assert(reached,'the far support must be reachable with a single held drawing gesture');
  if(width<height)assert(scrolled,'the portrait return needs the same edge scrolling as the actual pointer handler');
  const result=finishStroke(run,world);assert(result.ok,result.message);assert.equal(result.drawingId,returnDrawing.id);
}

for(const end of ['from','to'] as const)for(const [width,height,reload]of [[320,568,false],[844,390,false],[375,812,true],[2048,1177,true]] as const){
  test(`Veilleurs return: ${end} start in ${width}×${height}${reload?' after saving and reloading':''} reunites all twelve`,()=>{
    let run=waitingPorters();
    if(reload){const restored=restoreRun(JSON.parse(JSON.stringify(saveRun(run))),level);assert(restored);run=restored;assert(applyAction(run,level,{type:'start'}).ok);}
    drawAcrossViewport(run,level,width,height,end);
    for(let frame=0;frame<500&&new Set(run.visits['s0:return-bank']).size<2;frame++)updateRun(run,level,.1);
    assert.equal(new Set(run.visits['s0:return-bank']).size,2,'both porters physically cross their newly drawn return');
    assert.equal(run.units.filter(unit=>unit.nodeId==='s0:pan'&&unit.edgeId===null).length,0);
    // The next tableau's missing bridge can hold a queue back into this one.
    // Continue by normal gestures to prove the recovery through to the refuge.
    solveExpedition(run,level);
    assert.equal(new Set(run.visits['s0:rest']).size,12);assert.equal(run.saved,12);
    assert.equal(run.lost,0);assert.equal(run.retries,0);
  });
}
