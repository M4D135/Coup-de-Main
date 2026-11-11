import test from 'node:test';
import assert from 'node:assert/strict';
import {autoPanWorldView,getWorldView} from '../lib/worlds/camera';
import {WORLD_LEVELS} from '../lib/worlds/levels';

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const close=(actual:number,expected:number)=>assert(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

for(const [width,height] of [[375,812],[844,390]]){
  test(`all authored drawing anchors and mechanisms stay reachable at 100% and 300% in ${width} × ${height}`,()=>{
    for(const level of WORLD_LEVELS)for(const zoom of [1,3]){
      const fitted=getWorldView(level.width,level.height,width,height,zoom,.5,.5);
      const points=[...level.drawings.flatMap(drawing=>[drawing.from,drawing.to]),...level.devices.filter(device=>device.modes.length>1)];
      for(const point of points){
        const panX=fitted.overflowX>0?clamp((point.x*fitted.scale-width/2)/fitted.overflowX):.5;
        const panY=fitted.overflowY>0?clamp((point.y*fitted.scale-height/2)/fitted.overflowY):.5;
        const view=getWorldView(level.width,level.height,width,height,zoom,panX,panY);
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

test('a held drawing pointer can reveal the lower Veilleurs return anchor in landscape',()=>{
  const level=WORLD_LEVELS[2],anchor=level.drawings.find(drawing=>drawing.id==='lower-return')!.from;
  let panX=.5,panY=.5;
  let view=getWorldView(level.width,level.height,844,390,3,panX,panY);
  assert(anchor.y*view.scale+view.y>view.height,'this regression starts with the anchor off screen');
  const pointer={x:view.width/2,y:view.height};
  let previousWorldY=(pointer.y-view.y)/view.scale;
  for(let frame=0;frame<80;frame++){
    ({panX,panY}=autoPanWorldView(view,pointer,1/60,panX,panY));
    view=getWorldView(level.width,level.height,844,390,3,panX,panY);
    const worldY=(pointer.y-view.y)/view.scale;
    assert(worldY>=previousWorldY&&worldY-previousWorldY<=5/view.scale+1e-7,'scrolling preserves continuous stroke coordinates');
    previousWorldY=worldY;
  }
  const screenY=anchor.y*view.scale+view.y;
  assert(screenY>=56&&screenY<=view.height-56,`the lower anchor remains hidden at ${screenY}`);
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
