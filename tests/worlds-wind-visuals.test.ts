import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {applyAction,createRun,saveRun,updateRun,getEdgeSupportPaths,getDrawingEndpoints} from '../lib/worlds/engine';
import {authoredWind,authoredCounterweight,authoredLift} from '../lib/worlds/renderer-authored';
import {drawMechanicalConnections,drawMechanisms} from '../lib/worlds/renderer-mechanisms';
import {hitTestPlayTarget} from '../lib/worlds/interaction';
import {hitTestDrawing,type WorldAssets} from '../lib/worlds/renderer';
import {getDeviceAnchor} from '../lib/worlds/mechanics';
import type {DeviceDefinition,Point,WorldLevel,WorldRun} from '../lib/worlds/types';

type Matrix=[number,number,number,number,number,number];
type Segment={kind:string;points:Point[];radius?:number};
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
    arc:(x:number,y:number,radius:number)=>{arc={x,y,radius};path.push({kind:'arc',points:[point(state.matrix,x,y)],radius});},
    roundRect:(x:number,y:number,width:number,height:number)=>path.push({kind:'rect',points:[point(state.matrix,x,y),point(state.matrix,x+width,y+height)]}),
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
const near=(a:Point,b:Point,tolerance=.001)=>Math.hypot(a.x-b.x,a.y-b.y)<tolerance;
function renderTransmission(level:WorldLevel,run:WorldRun,tableau:number,withControls=false){
  const output=canvasRecorder(),bounds={left:tableau*3200,right:(tableau+1)*3200,top:0,bottom:1800,scale:1,tableau};
  drawMechanicalConnections(output.context,level,run,bounds,run.time,false);
  if(withControls)drawMechanisms(output.context,level,run,assets,bounds,run.time,{});
  return output;
}
function straightLines(output:ReturnType<typeof canvasRecorder>){
  return output.strokes.filter(stroke=>stroke.path.length===2&&stroke.path[0].kind==='move'&&stroke.path[1].kind==='line')
    .map(stroke=>({from:stroke.path[0].points[0],to:stroke.path[1].points[0]}));
}
function wheelSpoke(output:ReturnType<typeof canvasRecorder>,centre:Point,radius:number){
  const spoke=straightLines(output).find(line=>Math.abs(Math.hypot(line.from.x-centre.x,line.from.y-centre.y)-radius*.27)<.001
    &&Math.abs(Math.hypot(line.to.x-centre.x,line.to.y-centre.y)-radius*.82)<.001);
  assert(spoke,`the wheel at ${centre.x},${centre.y} must have visible spokes`);
  return {x:spoke.to.x-centre.x,y:spoke.to.y-centre.y};
}
function poweredPaper(){
  const level=WORLD_LEVELS.find(level=>level.id==='plis')!,run=createRun(level),device=wind(level,'s0:wind');
  assert(applyAction(run,level,{type:'device',id:device.id,mode:1}).ok);
  assert(applyAction(run,level,{type:'start'}).ok);
  for(let n=0;n<120&&run.devices[device.id].progress<.999;n++)tick(run,level,.1);
  assert.equal(run.devices[device.id].progress,1);return {level,run,device};
}

test('switching the paper fan off removes every airflow stroke even when the cleat keeps its support raised',()=>{
  const {level,run,device}=poweredPaper();
  assert.equal(render(level,run,device).airflow().length,6,'inlet reaches the deflector, then the receiving wheel');
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
    assert.equal(render(level,run,device).airflow().length,id==='s0:wind'?6:3,`${world} ${id}: powered state must be visible`);
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
    assert(Math.abs(first.x-hub)<2&&last.x<first.x,'the wind must leave the visible opening, away from its rear casing');
  }
});

for(const [world,id,index,cx,cy,maximumShift]of [
  ['plis','s0:wind',0,340,282,75],['plis','s2:wind',1,1147,548,55],['veilleurs','s6:wind',3,428,394,75],
] as const)test(`${world} ${id}: profile inlet is anchored to its painted housing and its spindle never orbits`,()=>{
  const level=WORLD_LEVELS.find(level=>level.id===world)!,run=createRun(level),device=wind(level,id);
  for(const angle of [0,.6,1.5,2.7,4.5,6]){
    const output=render(level,run,device,angle),clip=output.clips[0];assert(clip);
    const centre=point(clip.matrix,0,0),painted={x:index*3200+cx*3200/1672,y:cy*1800/941};
    assert(Math.hypot(centre.x-painted.x,centre.y-painted.y)<maximumShift,'the short shroud stays attached to the original socket');
    const faceWidth=Math.hypot(clip.matrix[0],clip.matrix[1]),faceHeight=Math.hypot(clip.matrix[2],clip.matrix[3]);
    assert(faceWidth/faceHeight<.3,'the visible fan must have a real side profile, not a frontal rotor');
    const aim=id==='s0:wind'?device.mechanics!.wind!.source:device.mechanics!.wind!.target;
    const ray={x:aim.x-painted.x,y:aim.y-painted.y},length=Math.hypot(ray.x,ray.y);
    assert((clip.matrix[0]*ray.x+clip.matrix[1]*ray.y)/(faceWidth*length)>.999,'inlet axis must aim at the next physical receiver');
    if(world==='plis'){
      const rotor=output.images.find(image=>image.clip);assert(rotor,'the original paper sprite is retained');
      const [, ,sw, ,dx,dy,dw]=rotor.args;
      const spindle=point(rotor.matrix,dx+320*dw/sw,dy+304*dw/sw);
      assert(Math.hypot(spindle.x-centre.x,spindle.y-centre.y)<.0001,'rotation must never orbit a rectangular sprite centre');
    }else{
      assert(output.strokes.some(stroke=>stroke.clip&&stroke.path.some(segment=>segment.kind==='quad')),'brass blades are contained by the side-facing shroud');
    }
  }
});

test('every wind system draws its air all the way to a distinct local receiving wheel',()=>{
  for(const level of WORLD_LEVELS)for(const device of level.devices.filter(device=>device.mechanics?.wind)){
    const run=createRun(level),rig=device.mechanics!.wind!;run.devices[device.id].mode=1;
    const air=render(level,run,device).airflow();assert(air.length>=3);
    const middle=air.at(-2)!,arrival=middle.path.at(-1)!.points.at(-1)!;
    assert(Math.hypot(arrival.x-rig.target.x,arrival.y-rig.target.y)<.001);
    assert.equal(Math.floor(rig.source.x/3200),Math.floor(rig.target.x/3200));
    assert(Math.hypot(rig.source.x-rig.target.x,rig.source.y-rig.target.y)>200,'receiver must be visually separate from its source');
  }
});

test('scout and brake pedals visibly pull their mechanism through the hub on the actual moving plate',()=>{
  let bridges=0,brakes=0;
  for(const level of WORLD_LEVELS)for(const device of level.devices.filter(device=>device.kind==='gate'&&device.weightNodes?.length)){
    const edge=level.edges.find(edge=>edge.mechanism?.drivers.includes(device.id));
    const pendulum=level.devices.find(candidate=>candidate.kind==='pendulum'&&candidate.lockDeviceId===device.id);
    assert(edge||pendulum);
    const run=createRun(level),tableau=Math.floor(device.x/3200);
    if(edge)run.drawings[edge.drawingId!]={points:edge.path.map(point=>({...point})),inkLength:700,createdAt:0};
    for(const progress of [0,.5,1]){
      run.devices[device.id].progress=progress;
      const anchor=getDeviceAnchor(run,device),output=renderTransmission(level,run,tableau,true),lines=straightLines(output);
      const plate=output.strokes.flatMap(stroke=>stroke.path).find(segment=>segment.kind==='rect'
        &&Math.abs(segment.points[0].y-anchor.y)<.001&&Math.abs((segment.points[0].x+segment.points[1].x)/2-anchor.x)<.001
        &&Math.abs(segment.points[1].x-segment.points[0].x-190)<.001);
      assert(plate,'the loaded plate itself must be drawn at the actual support height');
      const [a,b]=plate.points,hub=output.strokes.flatMap(stroke=>stroke.path).find(segment=>segment.kind==='arc'&&segment.radius===19
        &&segment.points[0].x>b.x&&segment.points[0].x<b.x+30&&segment.points[0].y>b.y&&segment.points[0].y<b.y+30)?.points[0];
      assert(hub,'the pressure plate has its own visible output hub');
      assert(lines.some(line=>near(line.to,hub)&&line.from.x>=a.x&&line.from.x<=b.x&&line.from.y>=a.y&&line.from.y<=b.y),
        'the plate must be physically connected to its hub');
      const cable=lines.find(line=>near(line.from,hub)&&Math.hypot(line.to.x-hub.x,line.to.y-hub.y)>100);
      assert(cable,'the transmission cable must start at that same hub, not at the former floating relay');
      if(edge){
        const tip=getEdgeSupportPaths(run,level,edge)[0].at(-1)!;
        assert(lines.some(line=>near(line.from,cable.to)&&near(line.to,tip)),'the other side of the guide reaches the actual bridge tip');
      }else{
        const pivot=pendulum!.pivot??pendulum!;
        assert(near(cable.to,{x:pivot.x+32,y:pivot.y+8}),'the brake cable reaches the real pendulum pivot');
      }
    }
    if(edge)bridges++;else brakes++;
  }
  assert.equal(bridges,2);assert.equal(brakes,3);
});

test('the fourth Veilleurs wind bridge uses its own cleat and never shares a pulley with the manually cranked lift',()=>{
  const level=WORLD_LEVELS.find(level=>level.id==='veilleurs')!,run=createRun(level),fan=wind(level,'s6:wind');
  const cleat=level.devices.find(device=>device.id===fan.lockDeviceId)!,lift=level.devices.find(device=>device.id==='s6:lift')!,head=lift.pivot!;
  const before=renderTransmission(level,run,3,true),oldHead=wheelSpoke(before,head,30);
  assert(applyAction(run,level,{type:'device',id:fan.id,mode:1}).ok);assert(applyAction(run,level,{type:'start'}).ok);
  for(let frame=0;frame<100&&run.devices[fan.id].progress<.4;frame++)updateRun(run,level,.05);
  assert(run.devices[fan.id].progress>.1);assert.equal(run.devices[lift.id].progress,0);
  const output=renderTransmission(level,run,3,true),arcs=output.strokes.flatMap(stroke=>stroke.path).filter(segment=>segment.kind==='arc');
  assert(arcs.some(arc=>arc.radius===28&&near(arc.points[0],cleat)),'the wind drum is carried by its actual cleat');
  assert(!arcs.some(arc=>arc.radius===28&&near(arc.points[0],head)),'only the lift owns the head pulley');
  const windCable=straightLines(output).find(line=>near(line.from,cleat)&&Math.hypot(line.to.x-cleat.x,line.to.y-cleat.y)>100);
  assert(windCable);assert(Math.hypot(windCable.to.x-lift.x,windCable.to.y-lift.y)>80,'the bridge guide must also stay clear of the lift crank');
  assert.deepEqual(wheelSpoke(output,head,30),oldHead,'turning the fan must not turn the manual lift pulley');
  assert.notDeepEqual(wheelSpoke(output,cleat,28),wheelSpoke(before,cleat,28),'the wind turns its own distinct drum');
  assert.notDeepEqual(wheelSpoke(output,cleat,23),wheelSpoke(before,cleat,23),'the foreground cleat wheel must preserve the driven drum rotation');
});

test('all counterweight drums turn by the actual suspension cable payout while retaining the same axle',()=>{
  let checked=0;
  for(const level of WORLD_LEVELS)for(const device of level.devices.filter(device=>device.kind==='counterweight'&&device.mechanics)){
    const run=createRun(level),pivot=device.pivot!,tableau=Math.floor(device.x/3200);let previous:{length:number;spoke:Point}|undefined;
    assert.equal(run.devices[device.id].rotorAngle,0,'counterweight state has an initialized receiver field, but no powered rotor');
    for(const progress of [0,.25,.5,.75,1]){
      run.devices[device.id].progress=progress;
      const anchor=getDeviceAnchor(run,device),output=renderTransmission(level,run,tableau),pan=canvasRecorder();
      authoredCounterweight(pan.context,level,run,assets,device);
      const cable=straightLines(pan).find(line=>(near(line.from,pivot,20)&&Math.abs(line.to.y-anchor.y)<20)
        ||(near(line.to,pivot,20)&&Math.abs(line.from.y-anchor.y)<20));
      assert(cable,'the measured payout comes from a rendered suspension strand');
      const length=Math.hypot(cable.to.x-cable.from.x,cable.to.y-cable.from.y),spoke=wheelSpoke(output,pivot,28);
      if(previous){
        const turn=Math.atan2(previous.spoke.x*spoke.y-previous.spoke.y*spoke.x,previous.spoke.x*spoke.x+previous.spoke.y*spoke.y);
        assert(turn<-.05,`${level.id} ${device.id}: a descending load must turn its drum`);
        assert(Math.abs(-turn*28-(length-previous.length))<.001,'drum rim travel equals the cable drawn out of the actual suspension');
      }
      previous={length,spoke};
    }
    checked++;
  }
  assert.equal(checked,10);
});

test('counterweight sprites and their draw targets descend by the same physical travel',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),device=level.devices.find(device=>device.id==='s0:balance')!;
  const feeder=level.drawings.find(drawing=>drawing.id==='s0:weight-thread')!;
  run.drawings[feeder.id]={points:[feeder.from,feeder.to],inkLength:700,createdAt:0};
  for(const progress of [0,.35,1]){
    run.devices[device.id].progress=progress;
    const expected={x:device.low!.x,y:device.low!.y+device.mechanics!.travel!*progress};
    assert.deepEqual(getDeviceAnchor(run,device),expected);
    const output=canvasRecorder();authoredCounterweight(output.context,level,run,assets,device);
    assert(output.images.some(image=>Math.hypot(image.matrix[4]-expected.x,image.matrix[5]-expected.y)<.001));
    const drawing=level.drawings.find(drawing=>drawing.id==='s0:return-thread')!,endpoints=getDrawingEndpoints(run,level,drawing);
    assert(Math.abs(endpoints.from.y-expected.y)<.001);
    assert.deepEqual(hitTestPlayTarget(level,run,endpoints.from,.315),{kind:'drawing',id:drawing.id,end:'from'});
  }
});

test('a moving cabin uses the identical anchor as its passenger surface',()=>{
  const level=WORLD_LEVELS.find(level=>level.id==='veilleurs')!,run=createRun(level),device=level.devices.find(device=>device.id==='s0:lift')!;
  for(const progress of [0,.5,1]){
    run.devices[device.id].progress=progress;
    const output=canvasRecorder();authoredLift(output.context,level,run,assets,device);
    const expected=getDeviceAnchor(run,device);
    assert(output.images.some(image=>Math.hypot(image.matrix[4]-expected.x,image.matrix[5]-expected.y)<.001));
  }
});

test('eraser follows a real hanging bridge and never targets the empty join between two moving leaves',()=>{
  const level=WORLD_LEVELS[0],run=createRun(level),edge=level.edges.find(edge=>edge.id==='s8:high-thread')!;
  run.drawings[edge.drawingId!]={points:edge.path.map(point=>({...point})),inkLength:700,createdAt:0};
  const [left,right]=getEdgeSupportPaths(run,level,edge),leftTip=left.at(-1)!,rightTip=right[0];
  const midpoint={x:(leftTip.x+rightTip.x)/2,y:(leftTip.y+rightTip.y)/2};
  assert(Math.hypot(leftTip.x-rightTip.x,leftTip.y-rightTip.y)>10);
  assert.equal(hitTestDrawing(level,run,midpoint,2),null,'the open air between the leaves is not a bridge');
  const onLeaf={x:(left[0].x+leftTip.x)/2,y:(left[0].y+leftTip.y)/2};
  assert.equal(hitTestDrawing(level,run,onLeaf,2),edge.drawingId);
  const originalMiddle={x:(edge.path[0].x+edge.path.at(-1)!.x)/2,y:(edge.path[0].y+edge.path.at(-1)!.y)/2};
  assert.equal(hitTestDrawing(level,run,originalMiddle,2),null,'the old flat path is not visible or erasable');
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
