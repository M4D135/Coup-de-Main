import test from 'node:test';
import assert from 'node:assert/strict';
import {autoPanWorldView,getWorldView,getExpeditionView,panAroundPoint} from '../lib/worlds/camera';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {getActiveAct,getActCount} from '../lib/worlds/engine';

const TABLEAUX=WORLD_LEVELS.flatMap(world=>Array.from({length:getActCount(world)},(_,actIndex)=>getActiveAct(world,{actIndex})));

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const close=(actual:number,expected:number)=>assert(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

for(const [width,height] of [[375,812],[844,390]]){
  test(`all authored drawing anchors and mechanisms stay reachable at 100% and 300% in ${width} × ${height}`,()=>{
    for(const level of TABLEAUX)for(const zoom of [1,3]){
      const fitted=getExpeditionView(level.width,level.height,width,height,zoom,.5,.5);
      const points=[...level.drawings.flatMap(drawing=>[drawing.from,drawing.to]),...level.devices.filter(device=>device.modes.length>1)];
      for(const point of points){
        const panX=fitted.overflowX>0?clamp((point.x*fitted.scale-width/2)/fitted.overflowX):.5;
        const panY=fitted.overflowY>0?clamp((point.y*fitted.scale-height/2)/fitted.overflowY):.5;
        const view=getExpeditionView(level.width,level.height,width,height,zoom,panX,panY);
        const screenX=point.x*view.scale+view.x,screenY=point.y*view.scale+view.y;
        assert(screenX>=16&&screenX<=width-16,`${level.id} x=${point.x} is not touch-reachable at zoom ${zoom}`);
        assert(screenY>=16&&screenY<=height-16,`${level.id} y=${point.y} is not touch-reachable at zoom ${zoom}`);
      }
    }
  });

  test(`panning cannot expose space beyond the scene at ${width} × ${height}`,()=>{
    for(const zoom of [1,3])for(const panX of [-5,0,.5,1,5])for(const panY of [-5,0,.5,1,5]){
      const view=getWorldView(1600,900,width,height,zoom,panX,panY);
      if(view.overflowX>0){assert(view.x<=0&&view.x>=-view.overflowX);}
      else close(view.x,(width-1600*view.scale)/2);
      if(view.overflowY>0){assert(view.y<=0&&view.y>=-view.overflowY);}
      else close(view.y,(height-900*view.scale)/2);
    }
  });
}

test('a held drawing pointer reveals another part of a continuous expedition without jumping',()=>{
  let panX=.2,panY=.5;
  let view=getExpeditionView(16000,900,844,390,2,panX,panY);
  const pointer={x:view.width,y:view.height/2};
  let previousWorldX=(pointer.x-view.x)/view.scale;
  const start=previousWorldX;
  for(let frame=0;frame<100;frame++){
    ({panX,panY}=autoPanWorldView(view,pointer,1/60,panX,panY));
    view=getExpeditionView(16000,900,844,390,2,panX,panY);
    const worldX=(pointer.x-view.x)/view.scale;
    assert(worldX>=previousWorldX&&worldX-previousWorldX<=5/view.scale+1e-6);
    previousWorldX=worldX;
  }
  assert(previousWorldX>start+400,'a held finger must reveal the continuation');
});

test('edge scrolling is gradual, time based, bounded after suspension and idle away from the edges',()=>{
  const view=getWorldView(1600,900,844,390,3,.5,.5);
  assert.deepEqual(autoPanWorldView(view,{x:422,y:195},1/60,.5,.5),{panX:.5,panY:.5});
  const edge={x:view.width,y:view.height};
  const small=autoPanWorldView(view,edge,.02,.5,.5);
  close((small.panX-.5)*view.overflowX,6);close((small.panY-.5)*view.overflowY,6);
  const capped=autoPanWorldView(view,edge,15,.5,.5);
  close((capped.panX-.5)*view.overflowX,18);close((capped.panY-.5)*view.overflowY,18);
  const halfway=autoPanWorldView(view,{x:view.width-28,y:view.height-28},.02,.5,.5);
  close((halfway.panX-.5)*view.overflowX,3);close((halfway.panY-.5)*view.overflowY,3);
  for(const fps of [30,120]){
    let panX=.5,panY=.5;
    for(let frame=0;frame<fps/2;frame++)({panX,panY}=autoPanWorldView(view,edge,1/fps,panX,panY));
    close((panX-.5)*view.overflowX,150);close((panY-.5)*view.overflowY,150);
  }
  assert.deepEqual(autoPanWorldView(view,edge,.06,1,1),{panX:1,panY:1});
  assert.deepEqual(autoPanWorldView(view,{x:-100,y:-100},.06,0,0),{panX:0,panY:0});
});

test('a fitted axis does not scroll, including portrait with only horizontal overflow',()=>{
  const fit=getWorldView(1600,900,375,812,1,.2,.8);
  assert.deepEqual(autoPanWorldView(fit,{x:375,y:812},.06,.2,.8),{panX:.2,panY:.8});
  const portrait=getWorldView(1600,900,375,812,3,.5,.5);
  assert.equal(portrait.overflowY,0);assert(portrait.overflowX>0);
  const next=autoPanWorldView(portrait,{x:375,y:812},.06,.5,.5);
  assert(next.panX>.5);assert.equal(next.panY,.5);
});

test('invalid dimensions, pans, time and pointer coordinates cannot poison the camera with NaN',()=>{
  const invalid=[NaN,Infinity,-Infinity,0,-1,Number.MAX_VALUE];
  for(const value of invalid){
    const view=getWorldView(value,value,value,value,value,value,value);
    for(const number of Object.values(view))assert(Number.isFinite(number));
    assert(view.scale>0&&view.width>0&&view.height>0);
    const next=autoPanWorldView(view,{x:value,y:value},value,value,value);
    assert(Number.isFinite(next.panX)&&next.panX>=0&&next.panX<=1);
    assert(Number.isFinite(next.panY)&&next.panY>=0&&next.panY<=1);
  }
  const view=getWorldView(1600,900,844,390,3,.5,.5);
  assert.deepEqual(autoPanWorldView(view,{x:NaN,y:Infinity},.06,.3,.7),{panX:.3,panY:.7});
  for(const dt of [NaN,Infinity,-1,0])assert.deepEqual(autoPanWorldView(view,{x:844,y:390},dt,.3,.7),{panX:.3,panY:.7});
});

for(const [width,height,zoom] of [[375,812,2.6],[320,568,2.6],[844,390,1.8],[1363,934,1]]){
  test(`a long map remains legible and every sector is reachable in ${width} × ${height}`,()=>{
    const view=getExpeditionView(16000,900,width,height,zoom,0,.5);
    assert(view.scale*70>=29,'companions must not shrink to specks to fit the whole world');
    assert(view.width/view.scale<2200,'the initial camera frames a landscape, not all ten sectors');
    for(let sector=0;sector<10;sector++){
      const target={x:sector*1600+800,y:500},screen={x:width*.5,y:height*.5};
      const pos=panAroundPoint(view,target,screen);
      const moved=getExpeditionView(16000,900,width,height,zoom,pos.panX,pos.panY);
      assert(target.x*moved.scale+moved.x>=24&&target.x*moved.scale+moved.x<=width-24);
      assert(target.y*moved.scale+moved.y>=24&&target.y*moved.scale+moved.y<=height-24);
    }
  });
  test(`pinching preserves the world point beneath the fingers in ${width} × ${height}`,()=>{
    const before=getExpeditionView(16000,900,width,height,zoom,.42,.5),finger={x:width*.4,y:height*.52};
    const anchor={x:(finger.x-before.x)/before.scale,y:(finger.y-before.y)/before.scale};
    const next=getExpeditionView(16000,900,width,height,Math.min(3.4,zoom*1.2),.42,.5);
    const pos=panAroundPoint(next,anchor,finger),after=getExpeditionView(16000,900,width,height,Math.min(3.4,zoom*1.2),pos.panX,pos.panY);
    close(anchor.x*after.scale+after.x,finger.x);
    if(after.overflowY>0)close(anchor.y*after.scale+after.y,finger.y);
  });
}

test('the lowest expedition platform can sit above the landscape phone controls',()=>{
  const initial=getExpeditionView(16000,900,844,390,1.8,0,.5);
  const position=panAroundPoint(initial,{x:800,y:770},{x:844*.43,y:390*.54});
  const view=getExpeditionView(16000,900,844,390,1.8,position.panX,position.panY);
  const feet=770*view.scale+view.y;
  assert.ok(feet<390-90,`low platform at ${feet} overlaps the controls`);
  assert.ok(feet-70*view.scale>75,'the companion remains below the header');
});
