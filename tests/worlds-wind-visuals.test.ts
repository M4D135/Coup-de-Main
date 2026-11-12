import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {applyAction,createRun,saveRun,updateRun} from '../lib/worlds/engine';
import {authoredWind} from '../lib/worlds/renderer-authored';
import {drawMechanisms} from '../lib/worlds/renderer-mechanisms';
import {hitTestPlayTarget} from '../lib/worlds/interaction';
import type {WorldAssets} from '../lib/worlds/renderer';
import type {DeviceDefinition,Point,WorldLevel,WorldRun} from '../lib/worlds/types';

type Matrix=[number,number,number,number,number,number];
type Segment={kind:string;points:Point[]};
type Clip={matrix:Matrix;x:number;y:number;radius:number};
const point=(m:Matrix,x:number,y:number):Point=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
const product=(m:Matrix,n:Matrix):Matrix=>[
  m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],
  m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5],
];

/** Record actual Canvas output, including the transform and clipping state at
 * drawImage/stroke. This catches unconditional effects and a misplaced pivot. */
function canvasRecorder(){
  let state:{matrix:Matrix;clip:Clip|null;strokeStyle:unknown;globalAlpha:number;[key:string]:unknown}={matrix:[1,0,0,1,0,0],clip:null,strokeStyle:'',globalAlpha:1};
  const stack:typeof state[]=[],strokes:{path:Segment[];clip:Clip|null;style:unknown;alpha:number}[]=[],clips:Clip[]=[];
  const images:{args:number[];matrix:Matrix;clip:Clip|null}[]=[];
  let path:Segment[]=[],arc:{x:number;y:number;radius:number}|null=null;
  const api:Record<string,unknown>={
    save:()=>stack.push({...state,matrix:[...state.matrix]}),
    restore:()=>{state=stack.pop()!;},
    translate:(x:number,y:number)=>{state.matrix=product(state.matrix,[1,0,0,1,x,y]);},
    transform:(...matrix:Matrix)=>{state.matrix=product(state.matrix,matrix);},
    scale:(x:number,y:number)=>{state.matrix=product(state.matrix,[x,0,0,y,0,0]);},
    rotate:(angle:number)=>{const c=Math.cos(angle),s=Math.sin(angle);state.matrix=product(state.matrix,[c,s,-s,c,0,0]);},
    beginPath:()=>{path=[];arc=null;},
    moveTo:(x:number,y:number)=>path.push({kind:'move',points:[point(state.matrix,x,y)]}),
    lineTo:(x:number,y:number)=>path.push({kind:'line',points:[point(state.matrix,x,y)]}),
    bezierCurveTo:(...p:number[])=>path.push({kind:'cubic',points:[point(state.matrix,p[0],p[1]),point(state.matrix,p[2],p[3]),point(state.matrix,p[4],p[5])]}),
    quadraticCurveTo:(...p:number[])=>path.push({kind:'quad',points:[point(state.matrix,p[0],p[1]),point(state.matrix,p[2],p[3])]}),
    arc:(x:number,y:number,radius:number)=>{arc={x,y,radius};path.push({kind:'arc',points:[point(state.matrix,x,y)]});},
    clip:()=>{assert(arc,'rotor containment must use its fixed circular face');state.clip={...arc,matrix:[...state.matrix]};clips.push(state.clip);},
    stroke:()=>strokes.push({path:structuredClone(path),clip:state.clip,style:state.strokeStyle,alpha:state.globalAlpha}),
    drawImage:(_image:unknown,...args:number[])=>images.push({args,matrix:[...state.matrix],clip:state.clip}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
  };
  const context=new Proxy({}, {
    get:(_target,key:string)=>api[key]??state[key]??(()=>{}),
    set:(_target,key:string,value:unknown)=>{state[key]=value;return true;},
  }) as CanvasRenderingContext2D;
  const airflow=()=>strokes.filter(stroke=>!stroke.clip&&stroke.path.some(segment=>segment.kind==='cubic'));
  return {context,strokes,images,clips,airflow};
}

const assets={props:{image:{},cells:Array.from({length:4},(_,i)=>({
  x:i%2*627,y:Math.floor(i/2)*627,width:627,height:627,bodyWidth:i===2?465:503,centerX:313.5,baseline:523,bodyHeight:445,
}))}} as WorldAssets;
const wind=(level:WorldLevel,id:string)=>level.devices.find(device=>device.id===id)!;
function render(level:WorldLevel,run:WorldRun,device:DeviceDefinition,angle=0,wallTime=90,reduced=false){
  const canvas=canvasRecorder();authoredWind(canvas.context,level,run,assets,device,angle,wallTime,reduced);return canvas;
}
function tick(run:WorldRun,level:WorldLevel,seconds:number){for(let t=0;t<seconds;t+=.05)updateRun(run,level,.05);}
function poweredPaper(){
  const level=WORLD_LEVELS.find(level=>level.id==='plis')!,run=createRun(level),device=wind(level,'s0:wind');
  assert(applyAction(run,level,{type:'device',id:device.id,mode:1}).ok);
  assert(applyAction(run,level,{type:'start'}).ok);tick(run,level,3);
  assert.equal(run.devices[device.id].progress,1);return {level,run,device};
}

test('switching the paper fan off removes every airflow stroke even when the cleat keeps its support raised',()=>{
  const {level,run,device}=poweredPaper();
  assert.equal(render(level,run,device).airflow().length,3);
  assert(applyAction(run,level,{type:'device',id:'s0:cleat',mode:1}).ok);
  assert(applyAction(run,level,{type:'device',id:device.id,mode:0}).ok);tick(run,level,1);
  assert.equal(run.devices[device.id].progress,1,'the real latch retains the raised deck');
  assert.equal(render(level,run,device).airflow().length,0);
  const before=JSON.stringify(saveRun(run));render(level,run,device,1,1000);
  assert.equal(JSON.stringify(saveRun(run)),before,'rendering must not change a puzzle or a saved position');
});

test('all painted fans draw no airflow in their unpowered state, regardless of retained progress',()=>{
  for(const [world,id]of [['plis','s0:wind'],['plis','s2:wind'],['veilleurs','s6:wind']] as const){
    const level=WORLD_LEVELS.find(level=>level.id===world)!,run=createRun(level),device=wind(level,id);
    for(const progress of [0,.5,1]){
      run.devices[id].mode=0;run.devices[id].progress=progress;
      assert.equal(render(level,run,device).airflow().length,0,`${world} ${id}: retained height ${progress}`);
    }
    run.devices[id].mode=1;run.devices[id].progress=1;
    assert.equal(render(level,run,device).airflow().length,3,`${world} ${id}: powered state must be visible`);
    assert.equal(render(level,run,device,0,90,true).airflow().length,0,'reduced motion suppresses moving wind');
  }
});

test('airflow uses simulation time: pausing freezes its path despite advancing render time',()=>{
  const {level,run,device}=poweredPaper();
  assert(applyAction(run,level,{type:'pause'}).ok);
  const pausedTime=run.time,first=render(level,run,device,0,10).airflow();tick(run,level,5);
  assert.equal(run.time,pausedTime);assert.deepEqual(render(level,run,device,0,200).airflow(),first);
  assert(applyAction(run,level,{type:'pause'}).ok);tick(run,level,.2);
  assert.notDeepEqual(render(level,run,device,0,200).airflow(),first);
});

test('the second paper fan emits air out of its left-facing mouth',()=>{
  const level=WORLD_LEVELS.find(level=>level.id==='plis')!,run=createRun(level),device=wind(level,'s2:wind');
  run.devices[device.id].mode=1;run.devices[device.id].progress=1;
  const output=render(level,run,device),hub=output.clips[0].matrix[4];
  for(const stroke of output.airflow()){
    const first=stroke.path[0].points[0],last=stroke.path.at(-1)!.points.at(-1)!;
    assert(first.x<hub&&last.x<first.x,'the wind must leave the visible opening, away from its rear casing');
  }
});

for(const [world,id,index,cx,cy,rx,ry]of [
  ['plis','s0:wind',0,340,282,39.1,63],['plis','s2:wind',1,1147,548,31.6,45],['veilleurs','s6:wind',3,428,394,43.5,62],
] as const)test(`${world} ${id}: rotating blades stay inside the real painted opening and share its spindle`,()=>{
  const level=WORLD_LEVELS.find(level=>level.id===world)!,run=createRun(level),device=wind(level,id);
  for(const angle of [0,.6,1.5,2.7,4.5,6]){
    const output=render(level,run,device,angle),clip=output.clips[0];assert(clip);
    const centre=point(clip.matrix,0,0),imageX=(centre.x-index*3200)*1672/3200,imageY=centre.y*941/1800;
    assert(Math.abs(imageX-cx)<.01&&Math.abs(imageY-cy)<.01);
    assert(Math.abs(clip.matrix[0]*clip.radius)*1672/3200<=rx);
    assert(clip.radius*941/1800<=ry+.01);
    if(world==='plis'){
      const rotor=output.images.find(image=>image.clip);assert(rotor,'the original paper sprite is retained');
      const [, ,sw, ,dx,dy,dw]=rotor.args;
      const spindle=point(rotor.matrix,dx+320*dw/sw,dy+304*dw/sw);
      assert(Math.hypot(spindle.x-centre.x,spindle.y-centre.y)<.0001,'rotation must never orbit a rectangular sprite centre');
    }else{
      assert(output.strokes.some(stroke=>stroke.clip&&stroke.path.some(segment=>segment.kind==='cubic')),'brass blades are contained by the painted rim');
    }
  }
});

test('the live mechanism renderer freezes fan rotation on pause and when reduced motion is enabled',()=>{
  const {level,run,device}=poweredPaper();
  const draw=(wallTime:number,reducedMotion=false)=>{
    const output=canvasRecorder();
    drawMechanisms(output.context,level,run,assets,{left:0,right:3200,top:0,bottom:1800,scale:1,tableau:0},wallTime,{reducedMotion});
    return output.images.find(image=>image.clip)!.matrix;
  };
  draw(1);tick(run,level,.1);const spinning=draw(2);assert(applyAction(run,level,{type:'pause'}).ok);
  tick(run,level,1);assert.deepEqual(draw(20),spinning);
  assert(applyAction(run,level,{type:'pause'}).ok);tick(run,level,.1);
  assert.deepEqual(draw(30,true),spinning,'reducing motion keeps the existing pose instead of snapping the blades');
  tick(run,level,.1);assert.deepEqual(draw(40,true),spinning);
  tick(run,level,.1);
  assert.notDeepEqual(draw(50),spinning,'normal motion resumes when the preference is disabled');
});

test('the corrected visible spindles remain simple tap targets at mobile scales',()=>{
  for(const [world,id]of [['plis','s2:wind'],['veilleurs','s6:wind']] as const){
    const level=WORLD_LEVELS.find(level=>level.id===world)!,run=createRun(level),device=wind(level,id);
    const clip=render(level,run,device).clips[0],spindle=point(clip.matrix,0,0);
    for(const scale of [.1778,.315,.45,1])assert.deepEqual(hitTestPlayTarget(level,run,spindle,scale),{kind:'device',id});
  }
  const level=WORLD_LEVELS.find(level=>level.id==='plis')!,run=createRun(level),deflector=wind(level,'s0:wind');
  for(const scale of [.1778,.315,.45,1])assert.deepEqual(hitTestPlayTarget(level,run,deflector,scale),{kind:'device',id:deflector.id});
});
