import test from 'node:test';
import assert from 'node:assert/strict';
import {placeGuidanceLabels,pointInGuidance,projectGuidancePoint} from '../lib/worlds/renderer-guidance';
import type {GuidanceLabel,GuidanceRect,GuidanceViewport} from '../lib/worlds/renderer-guidance';

const label=(id:string,x:number,y:number,kind:GuidanceLabel['kind']='device',priority=60):GuidanceLabel=>({
  id,anchor:{x,y},title:`Mécanisme ${id}`,detail:'En attente',kind,priority,
  ...(kind==='device'?{deviceId:id}:{}),
});
const overlaps=(a:GuidanceRect,b:GuidanceRect)=>a.left<b.left+b.width&&a.left+a.width>b.left
  &&a.top<b.top+b.height&&a.top+a.height>b.top;

test('a label follows the projected world point while its card stays readable at every zoom',()=>{
  const world={x:600,y:400},cards=[];
  for(const scale of [.5,1,3]){
    const viewport={x:320-world.x*scale,y:300-world.y*scale,width:800,height:600};
    const anchor=projectGuidancePoint(world,scale,viewport);
    assert.deepEqual(anchor,{x:320,y:300});
    cards.push(placeGuidanceLabels([{...label('balance',0,0),anchor}],viewport)[0]);
  }
  assert.deepEqual(cards[0],cards[1]);
  assert.deepEqual(cards[1],cards[2]);
  const card=cards[0];
  assert(pointInGuidance({x:card.left+card.width/2,y:card.top+card.height/2},card));
});

for(const [width,height] of [[375,812],[844,390]]){
  test(`visible mechanism cards remain inside the safe screen area in ${width} × ${height}`,()=>{
    const viewport={x:0,y:0,width,height};
    const labels=[
      label('top-left',3,3),label('top-right',width-3,3),
      label('bottom-left',3,height-3),label('bottom-right',width-3,height-3),
      label('centre',width/2,height/2),
      label('entry',width*.2,height*.3,'place',30),label('exit',width*.8,height*.7,'place',30),
    ];
    const placed=placeGuidanceLabels(labels,viewport,{left:12,right:12,top:76,bottom:100});
    assert.equal(placed.length,labels.length,'an on-screen mechanism or refuge must keep its label');
    for(const card of placed){
      assert(Number.isFinite(card.left)&&Number.isFinite(card.top));
      assert(card.left>=12&&card.left+card.width<=width-12,`${card.id} escapes the horizontal safe area`);
      assert(card.top>=76&&card.top+card.height<=height-100,`${card.id} escapes the vertical safe area`);
    }
  });
}

test('objects outside the visible scene do not create clamped clickable labels on its edges',()=>{
  const viewport={x:0,y:0,width:375,height:812};
  const labels=[label('visible',150,400),label('left',-80,400),label('right',460,400),label('above',150,-80),label('below',150,900)];
  assert.deepEqual(placeGuidanceLabels(labels,viewport).map(item=>item.id),['visible']);
});

test('waiting groups never cover the selected mechanism card',()=>{
  const viewport={x:0,y:0,width:375,height:812};
  const selected={...label('selected',180,400,'device',120),selected:true};
  const alone=placeGuidanceLabels([selected],viewport)[0];
  const crowd=[label('waiting-a',180,400,'waiting',20),label('waiting-b',200,400,'waiting',20)];
  const placed=placeGuidanceLabels([...crowd,selected,label('other',220,430)],viewport);
  const target=placed.find(item=>item.id==='selected');
  assert(target);
  assert.deepEqual(target,alone,'the selected explanation should not jump when a queue appears');
  for(const item of placed.filter(item=>item.kind==='waiting'))assert(!overlaps(item,target));
});

test('a card can avoid an occupied drawing area when another nearby position is free',()=>{
  const viewport={x:0,y:0,width:1000,height:700};
  const avoid={left:410,top:320,width:180,height:65};
  const [placed]=placeGuidanceLabels([label('bridge',500,400)],viewport,{},[avoid]);
  assert(placed);
  assert(!overlaps(placed,avoid),'the explanation must leave the active drawing area clear');
});

test('layout is deterministic, preserves its inputs and does not shift when a count changes',()=>{
  const viewport:GuidanceViewport={x:0,y:0,width:1000,height:700};
  const labels=[label('balance',320,300),label('lift',620,400),label('home',850,460,'place',30)];
  const original=structuredClone(labels),first=placeGuidanceLabels(labels,viewport);
  assert.deepEqual(labels,original,'placement must not reorder or mutate the level annotations');
  assert.deepEqual(placeGuidanceLabels(labels,viewport),first);
  const updated=placeGuidanceLabels(labels.map(item=>({...item,detail:'2 / 3 compagnons'})),viewport);
  for(const card of first){
    const next=updated.find(item=>item.id===card.id)!;
    assert.deepEqual([next.left,next.top,next.width,next.height],[card.left,card.top,card.width,card.height]);
  }
});

test('only points inside the rendered card activate its hit area, including the exact border',()=>{
  const rect={left:100,top:200,width:154,height:37};
  for(const point of [{x:100,y:200},{x:254,y:237},{x:177,y:218}])assert(pointInGuidance(point,rect));
  for(const point of [{x:99,y:218},{x:255,y:218},{x:177,y:199},{x:177,y:238}])assert(!pointInGuidance(point,rect));
});
