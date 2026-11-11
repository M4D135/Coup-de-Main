import {getWorldAsset} from './assets';
import {getDeviceStatus, getPendulumPosition, getWaitingReason} from './engine';
import {placeGuidanceLabels, pointInGuidance, projectGuidancePoint, type GuidanceInsets, type GuidanceLabel, type GuidanceRect, type GuidanceViewport, type PlacedGuidanceLabel} from './renderer-guidance';
import type {ActiveStroke, Creature, DeviceDefinition, Point, WorldId, WorldLevel, WorldRun} from './types';

type Cell = {x:number;y:number;width:number;height:number;centerX:number;baseline:number;bodyHeight:number;bodyWidth:number};
type Atlas = {image:HTMLImageElement;cells:Cell[];referenceHeight:number};
type HandState = {opacity:number;tip:Point|null;angle:number;lastTime:number};

export interface WorldAssets {
  id:WorldId;
  scene:HTMLImageElement;
  sprites:Atlas;
  props:Atlas|null;
  hand:HTMLImageElement|null;
  handState:HandState;
}

export interface RenderOptions {
  elapsed?:number;
  dt?:number;
  reducedMotion?:boolean;
  activeStroke?:ActiveStroke|null;
  handTip?:Point|null;
  hover?:Point|null;
  hint?:boolean;
  drawAnchors?:boolean;
  selectedDevice?:string|null;
  /** Scene scale and translation in CSS pixels; annotation text never scales with zoom. */
  viewScale?:number;
  viewport?:GuidanceViewport;
  hudInsets?:GuidanceInsets;
}

export type WorldHit = {kind:'device';id:string} | {kind:'drawing';id:string;end:'from'|'to'} | null;

const caches = new Map<WorldId, Promise<WorldAssets>>();
const guidanceHits=new WeakMap<WorldRun,{stage:string;scale:number;viewport:GuidanceViewport;labels:PlacedGuidanceLabel[]}>();
const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));
const mix = (a:number,b:number,t:number) => a+(b-a)*t;
const pointAt = (a:Point,b:Point,t:number):Point => ({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});

function loadImage(file:string):Promise<HTMLImageElement> {
  return new Promise((resolve,reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Le décor n’a pas pu être chargé : ${file}`));
    image.src = getWorldAsset(file);
  });
}

/** Read sprite extents at runtime: every frame keeps its foot baseline despite transparent margins. */
function atlas(image:HTMLImageElement,columns:number,rows:number):Atlas {
  const canvas = document.createElement('canvas');
  canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const cw=image.naturalWidth/columns,ch=image.naturalHeight/rows;
  const cells:Cell[]=[];
  let pixels:Uint8ClampedArray|null=null;
  if(context){context.drawImage(image,0,0); try{pixels=context.getImageData(0,0,canvas.width,canvas.height).data;}catch{/* Same-origin images normally permit inspection. */}}
  for(let row=0;row<rows;row++) for(let column=0;column<columns;column++) {
    const x=Math.floor(column*cw),y=Math.floor(row*ch),width=Math.floor((column+1)*cw)-x,height=Math.floor((row+1)*ch)-y;
    let left=width,right=0,top=height,bottom=0;
    if(pixels){
      for(let py=2;py<height-2;py++)for(let px=2;px<width-2;px++){
        const offset=((y+py)*canvas.width+x+px)*4;
        if(pixels[offset+3]>90){left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);}
      }
    }
    if(right<=left){left=0;right=width;top=0;bottom=height;}
    cells.push({x,y,width,height,centerX:(left+right)/2,baseline:bottom,bodyHeight:bottom-top,bodyWidth:right-left});
  }
  return {image,cells,referenceHeight:Math.max(...cells.map(cell=>cell.bodyHeight))};
}

export function loadWorldAssets(id:WorldId):Promise<WorldAssets> {
  const previous=caches.get(id);if(previous)return previous;
  const loading=Promise.all([
    loadImage(`worlds/${id}-scene.png`),
    loadImage(`worlds/${id}-sprites.png`),
    loadImage(`worlds/${id}-props.png`).catch(()=>null),
    loadImage('drawing-hand-hd.webp').catch(()=>null),
  ]).then(([scene,sprites,props,hand])=>({
    id,scene,sprites:atlas(sprites,4,2),props:props?atlas(props,2,2):null,hand,
    handState:{opacity:0,tip:null,angle:0,lastTime:0},
  }));
  caches.set(id,loading);
  loading.catch(()=>caches.delete(id));
  return loading;
}

export function clearWorldAssets(id?:WorldId) { if(id)caches.delete(id);else caches.clear(); }

export function hitTestWorld(level:WorldLevel,run:WorldRun,point:Point,minRadius=44):WorldHit {
  const radius=Math.max(44,Math.min(110,minRadius));
  const candidates:{distance:number;hit:Exclude<WorldHit,null>}[]=[];
  for(const device of level.devices){
    const distance=Math.hypot(device.x-point.x,device.y-point.y);
    if((device.modes.length>1||device.playerControlled===false)&&distance<Math.max(device.radius??43,radius))candidates.push({distance,hit:{kind:'device',id:device.id}});
  }
  for(const drawing of level.drawings){
    if(run.drawings[drawing.id])continue;
    const from=Math.hypot(drawing.from.x-point.x,drawing.from.y-point.y),to=Math.hypot(drawing.to.x-point.x,drawing.to.y-point.y);
    if(from<radius)candidates.push({distance:from,hit:{kind:'drawing',id:drawing.id,end:'from'}});
    if(to<radius)candidates.push({distance:to,hit:{kind:'drawing',id:drawing.id,end:'to'}});
  }
  const nearby=candidates.sort((a,b)=>a.distance-b.distance)[0]?.hit;
  if(nearby)return nearby;
  const cached=guidanceHits.get(run);
  if(cached?.stage===`${level.id}:${level.stageName}`){
    const projected=projectGuidancePoint(point,cached.scale,cached.viewport);
    const label=cached.labels.find(item=>item.deviceId&&pointInGuidance(projected,item));
    if(label?.deviceId)return {kind:'device',id:label.deviceId};
  }
  return null;
}

function path(context:CanvasRenderingContext2D,points:Point[]) {
  context.beginPath();
  points.forEach((point,index)=>index===0?context.moveTo(point.x,point.y):context.lineTo(point.x,point.y));
}

function rope(context:CanvasRenderingContext2D,a:Point,b:Point,world:WorldId,width=3) {
  context.save();
  context.strokeStyle=world==='boucles'?'#243456':world==='plis'?'#806545':'#2f1c12';
  context.lineWidth=width+2;context.lineCap='round';context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
  context.strokeStyle=world==='boucles'?'#d8ae54':world==='plis'?'#d2b582':'#b98b49';context.lineWidth=width;context.stroke();
  context.strokeStyle=world==='veilleurs'?'#ead09580':'#f2d79a';context.lineWidth=.9;context.setLineDash([2,5]);context.stroke();
  context.restore();
}

function prop(context:CanvasRenderingContext2D,assets:WorldAssets,index:number,x:number,y:number,width:number,rotation=0,originY=1,alpha=1,originX=.5) {
  const sheet=assets.props,cell=sheet?.cells[index];
  if(!sheet||!cell)return false;
  const factor=width/cell.bodyWidth;
  context.save();context.translate(x,y);context.rotate(rotation);context.globalAlpha*=alpha;
  const anchorY=cell.baseline-cell.bodyHeight*(1-originY);
  const anchorX=cell.centerX+cell.bodyWidth*(originX-.5);
  context.drawImage(sheet.image,cell.x,cell.y,cell.width,cell.height,-anchorX*factor,-anchorY*factor,cell.width*factor,cell.height*factor);
  context.restore();return true;
}

/** Use only the lift's bottom timber, so approaches are planks rather than small lift cages. */
function woodenTraverse(context:CanvasRenderingContext2D,assets:WorldAssets,a:Point,b:Point) {
  const length=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x);
  const sheet=assets.props,cell=sheet?.cells[2];
  context.save();context.translate(a.x,a.y);context.rotate(angle);
  context.fillStyle='#4b2e1c';context.shadowColor='#08050866';context.shadowBlur=5;context.shadowOffsetY=3;
  context.fillRect(-4,1,length+8,13);context.shadowBlur=0;context.shadowOffsetY=0;
  if(sheet&&cell){
    // The visible beam is above the small feet at the bottom of this atlas cell.
    const sourceX=cell.x+cell.centerX-cell.bodyWidth/2;
    const sourceY=cell.y+cell.baseline-cell.bodyHeight*.21;
    context.drawImage(sheet.image,sourceX,sourceY,cell.bodyWidth,cell.bodyHeight*.125,-4,0,length+8,13);
  }else{
    const grain=context.createLinearGradient(0,0,0,14);
    grain.addColorStop(0,'#bb8b55');grain.addColorStop(.3,'#946139');grain.addColorStop(1,'#674024');
    context.fillStyle=grain;context.fillRect(-4,0,length+8,13);
  }
  context.strokeStyle='#e5bb7f88';context.lineWidth=1;
  context.beginPath();context.moveTo(-4,.5);context.lineTo(length+4,.5);context.stroke();
  context.restore();
}

function bridge(context:CanvasRenderingContext2D,level:WorldLevel,points:Point[],active=false) {
  if(points.length<2)return;
  context.save();context.lineJoin='round';context.lineCap='round';
  if(level.id==='boucles'){
    path(context,points);context.strokeStyle=level.palette.ink;context.lineWidth=active?6:7;context.stroke();
    if(!active){context.translate(0,2);path(context,points);context.strokeStyle='#f4dec825';context.lineWidth=1.2;context.stroke();}
  }else if(level.id==='plis'){
    if(!active){
      context.save();context.translate(0,7);context.shadowColor='#47342845';context.shadowBlur=9;
      path(context,points);context.strokeStyle='#8f704e';context.lineWidth=11;context.stroke();context.restore();
      path(context,points);context.strokeStyle='#f7e8cf';context.lineWidth=11;context.stroke();
      path(context,points);context.strokeStyle='#cbb493';context.lineWidth=1.5;context.stroke();
      for(let index=2;index<points.length-1;index+=4){
        const point=points[index];context.beginPath();context.moveTo(point.x-2,point.y-3);context.lineTo(point.x+1,point.y+4);context.strokeStyle='#ad927960';context.lineWidth=.8;context.stroke();
      }
    }else{path(context,points);context.strokeStyle='#4f493e';context.lineWidth=3.4;context.stroke();}
  }else{
    if(!active){
      context.save();context.translate(0,9);path(context,points);context.strokeStyle='#443022';context.lineWidth=13;context.shadowColor='#0008';context.shadowBlur=10;context.stroke();context.restore();
      path(context,points);context.strokeStyle='#bca58a';context.lineWidth=12;context.stroke();
      path(context,points);context.strokeStyle='#f8e7c9';context.lineWidth=7;context.stroke();
      context.translate(0,-2);path(context,points);context.strokeStyle='#fff6e0';context.lineWidth=1.3;context.stroke();
    }else{
      path(context,points);context.shadowColor='#ffca6a';context.shadowBlur=5;context.strokeStyle='#fff0cf';context.lineWidth=4.3;context.stroke();
    }
  }
  context.restore();
}

function fallbackCradle(context:CanvasRenderingContext2D,x:number,y:number,width:number,world:WorldId) {
  context.save();context.translate(x,y);
  const fill=context.createLinearGradient(0,-10,0,25);fill.addColorStop(0,world==='veilleurs'?'#f2bc63':'#f1cc7c');fill.addColorStop(1,world==='veilleurs'?'#68431e':'#c69143');
  context.fillStyle=fill;context.strokeStyle=world==='boucles'?'#233456':'#5c4025';context.lineWidth=2.6;
  context.beginPath();context.moveTo(-width/2,-4);context.lineTo(width/2,-4);context.quadraticCurveTo(width/2-10,30,0,28);context.quadraticCurveTo(-width/2+10,30,-width/2,-4);context.fill();context.stroke();
  context.beginPath();context.moveTo(-width/2,-5);context.lineTo(width/2,-5);context.strokeStyle='#fce6ac';context.lineWidth=3;context.stroke();context.restore();
}

function drawBuiltScenery(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets) {
  // These short, authored approaches attach the movable props to the cleaned art.
  // They are part of the stage, not automatically completed player drawings.
  if(level.id==='boucles'){
    const descent=level.edges.find(edge=>edge.id==='weight-descent');
    if(descent)bridge(context,level,descent.path.slice(1));
  }
  if(level.id==='plis'){
    const descent=level.edges.find(edge=>edge.id==='windy-descent');
    const progress=run.devices.deflector?.progress??0;
    if(descent?.kind==='ground'&&progress>.02){
      const raised=descent.path.map((point,index)=>({x:point.x,y:point.y+(1-progress)*110*(1-index/(descent.path.length-1))}));
      bridge(context,level,raised);
    }
  }
  if(level.id==='veilleurs'){
    const additions:{edge:string;points:[Point,Point]}[]=[
      {edge:'main-floor',points:[{x:570,y:460},{x:645,y:500}]},
      {edge:'upper-floor',points:[{x:735,y:400},{x:790,y:400}]},
      {edge:'downstairs',points:[{x:360,y:460},{x:320,y:605}]},
    ];
    for(const addition of additions){
      if(level.edges.some(edge=>edge.id===addition.edge))woodenTraverse(context,assets,...addition.points);
    }
  }
}

function drawDevices(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,time:number,reduced:boolean) {
  const weight=level.devices.find(device=>device.kind==='counterweight');
  if(level.id==='boucles'&&weight){
    const state=run.devices[weight.id];
    const center={x:weight.low?.x??weight.x,y:weight.low?.y??weight.y};
    rope(context,{x:640,y:490},{x:center.x-145,y:center.y-18},level.id);
    rope(context,{x:center.x+145,y:center.y-18},{x:1074,y:390},level.id);
    // The path follows the inner deck, not the bottom of the painted basket.
    if(!prop(context,assets,0,center.x,center.y,340,0,.37))fallbackCradle(context,center.x,center.y,290,level.id);
    prop(context,assets,2,1074,390,94,0,.5);
    const bucket={x:1135,y:mix(570,380,state?.progress??0)};
    rope(context,{x:1100,y:385},{x:bucket.x-34,y:bucket.y-62},level.id);
    rope(context,{x:1124,y:385},{x:bucket.x+34,y:bucket.y-62},level.id);
    if(!prop(context,assets,1,bucket.x,bucket.y+6,143))fallbackCradle(context,bucket.x,bucket.y,110,level.id);
  }
  if(level.id==='plis'){
    const wind=level.devices.find(device=>device.kind==='wind');
    const mode=wind?run.devices[wind.id]?.mode??wind.initialMode:0;
    const rotation=reduced?0:time*(mode===1?.55:.12);
    prop(context,assets,0,1005,181,294,rotation,.5);
    prop(context,assets,2,298,281,131,reduced?0:time*.8,.5);
    // Its brass hinge is near the lower-left corner of the cutout. Keep that
    // hinge on the fixed peg while all three wind positions rotate around it.
    if(wind)prop(context,assets,3,wind.x,wind.y,146,[-.25,.43,1.08][mode%3],.83,1,.145);
    const progress=wind?run.devices[wind.id]?.progress??0:0;
    const bucket={x:1135,y:mix(603,450,progress)};
    rope(context,{x:1129,y:228},{x:bucket.x,y:bucket.y-92},level.id);
    if(!prop(context,assets,1,bucket.x,bucket.y+2,137,0,.84))fallbackCradle(context,bucket.x,bucket.y,110,level.id);
  }
  if(level.id==='veilleurs'&&weight){
    const progress=run.devices[weight.id]?.progress??0;
    const left={x:weight.low?.x??weight.x,y:weight.low?.y??weight.y};
    const right={x:847,y:260-progress*17};
    for(const [center,anchor,width] of [[left,{x:602,y:133},202],[right,{x:847,y:129},154]] as [Point,Point,number][]){
      rope(context,anchor,{x:center.x-width*.39,y:center.y-10},level.id,2);
      rope(context,anchor,{x:center.x+width*.39,y:center.y-10},level.id,2);
      if(!prop(context,assets,0,center.x,center.y+3,width,0,.28))fallbackCradle(context,center.x,center.y,width*.8,level.id);
    }
  }
  for(const device of level.devices){
    const state=run.devices[device.id];if(!state)continue;
    if(device.kind==='lift'&&device.low&&device.high){
      const position=pointAt(device.low,device.high,state.progress);
      const pulley=device.pivot??{x:position.x,y:Math.min(device.low.y,device.high.y)-180};
      rope(context,pulley,{x:position.x,y:position.y-80},level.id,3);
      const index=level.id==='veilleurs'?2:1;
      if(!prop(context,assets,index,position.x,position.y+2,level.id==='veilleurs'?172:139,0,level.id==='veilleurs'?.80:.84))fallbackCradle(context,position.x,position.y,118,level.id);
    }
    if(device.kind==='pendulum'){
      const pivot=device.pivot??{x:device.x,y:device.y-210};
      const motion=getPendulumPosition(device,run.time,run);
      const angle=motion.angle;
      const size=device.length??210;
      if(assets.props){
        const sheet=assets.props,cell=sheet.cells[1],height=cell.bodyHeight;
        // The brass pivot is inside the cutout, below its topmost pixel.
        // Anchor its centre and place the bob centre on the simulation's arc.
        const pivotOffset=height*.085,bobOffset=height*.80;
        const factor=size/(bobOffset-pivotOffset);
        context.save();context.translate(pivot.x,pivot.y);context.rotate(-angle);
        context.drawImage(sheet.image,cell.x,cell.y,cell.width,cell.height,-cell.centerX*factor,-(cell.baseline-height+pivotOffset)*factor,cell.width*factor,cell.height*factor);
        context.restore();
      }else{
        const bob={x:motion.x,y:motion.y};
        rope(context,pivot,bob,level.id,10);
        context.save();context.translate(bob.x,bob.y);context.rotate(-angle);context.fillStyle='#9c6738';context.strokeStyle='#e3bc76';context.lineWidth=3;context.beginPath();context.roundRect(-38,-29,76,76,18);context.fill();context.stroke();context.restore();
      }
    }
  }
}

function guidanceFrame(level:WorldLevel,options:RenderOptions) {
  const scale=typeof options.viewScale==='number'&&Number.isFinite(options.viewScale)&&options.viewScale>0?options.viewScale:1;
  const viewport=options.viewport??{x:0,y:0,width:level.width*scale,height:level.height*scale};
  return {scale,viewport};
}

function focusedDevice(level:WorldLevel,run:WorldRun,options:RenderOptions):string|null {
  if(options.selectedDevice)return options.selectedDevice;
  if(!options.hover)return null;
  const {scale}=guidanceFrame(level,options);
  const hit=hitTestWorld(level,run,options.hover,Math.max(44,22/scale));
  return hit?.kind==='device'?hit.id:null;
}

/** Reveal only the selected mechanism's real dependencies, not an all-scene circuit diagram. */
function drawMechanicalLinks(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,options:RenderOptions) {
  const selected=level.devices.find(device=>device.id===focusedDevice(level,run,options));
  if(!selected)return;
  const {scale}=guidanceFrame(level,options),targets:Point[]=[];
  const add=(point:Point|undefined)=>{if(point&&Math.hypot(point.x-selected.x,point.y-selected.y)>30&&!targets.some(old=>Math.hypot(old.x-point.x,old.y-point.y)<25))targets.push(point);};
  for(const nodeId of selected.weightNodes??[])add(level.nodes.find(node=>node.id===nodeId));
  if(selected.activationNodeId)add(level.nodes.find(node=>node.id===selected.activationNodeId));
  for(const device of level.devices){
    if(device.id===selected.id)continue;
    const linked=selected.lockDeviceId===device.id||selected.powerDeviceId===device.id||selected.holdOpenDeviceId===device.id
      ||selected.gates?.some(gate=>gate.deviceId===device.id)||device.lockDeviceId===selected.id
      ||device.powerDeviceId===selected.id||device.holdOpenDeviceId===selected.id||device.gates?.some(gate=>gate.deviceId===selected.id);
    if(linked)add(device);
  }
  context.save();context.lineCap='round';context.lineJoin='round';
  for(const edge of level.edges){
    if(edge.route?.deviceId===selected.id){
      const chosen=edge.route.mode===run.devices[selected.id]?.mode;
      context.globalAlpha=chosen?.62:.22;context.strokeStyle=level.palette.accent;context.lineWidth=(chosen?4:2)/scale;
      context.setLineDash(chosen?[]:[4/scale,6/scale]);path(context,edge.path.slice(0,3));context.stroke();
    }
    if(edge.deviceId===selected.id||edge.gates?.some(gate=>gate.deviceId===selected.id)){
      const points=edge.drawingId?run.drawings[edge.drawingId]?.points:edge.path;
      add(points?.[Math.floor(points.length/2)]??edge.path[0]);
      if(points?.length){
        context.globalAlpha=.22;context.strokeStyle=level.palette.accent;context.lineWidth=8/scale;context.setLineDash([]);path(context,points);context.stroke();
      }
    }
  }
  context.setLineDash([3/scale,6/scale]);context.strokeStyle=level.palette.accent;context.lineWidth=1.5/scale;
  for(const point of targets.slice(0,6)){
    const bow=Math.min(38/scale,Math.hypot(point.x-selected.x,point.y-selected.y)*.16);
    context.globalAlpha=.55;context.beginPath();context.moveTo(selected.x,selected.y);
    context.quadraticCurveTo((selected.x+point.x)/2,(selected.y+point.y)/2-bow,point.x,point.y);context.stroke();
    context.setLineDash([]);context.globalAlpha=.7;context.beginPath();context.arc(point.x,point.y,12/scale,0,Math.PI*2);context.stroke();context.setLineDash([3/scale,6/scale]);
  }
  context.restore();
}

function drawDeviceHandles(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,time:number,options:RenderOptions) {
  const {scale}=guidanceFrame(level,options),focus=focusedDevice(level,run,options);
  for(const device of level.devices){
    if(device.modes.length<2&&device.playerControlled!==false)continue;
    const state=run.devices[device.id];if(!state)continue;
    const selected=focus===device.id,automatic=device.playerControlled===false;
    const radius=selected?20:16;
    context.save();context.translate(device.x,device.y);context.scale(1/scale,1/scale);
    context.fillStyle=level.id==='veilleurs'?'#211b18ef':'#f7eddaef';context.strokeStyle=level.palette.accent;context.lineWidth=selected?2:1.3;
    context.shadowColor=level.id==='veilleurs'?'#ffd17e40':'#3a2f2418';context.shadowBlur=selected?12:4;
    if(automatic){
      context.beginPath();context.moveTo(0,-13);context.lineTo(13,0);context.lineTo(0,13);context.lineTo(-13,0);context.closePath();context.fill();context.stroke();
      context.shadowBlur=0;context.fillStyle=state.mode>0?level.palette.accent:level.palette.ink;context.globalAlpha=state.mode>0?1:.45;
      context.beginPath();context.arc(0,0,state.mode>0?4.5:3,0,Math.PI*2);context.fill();context.restore();continue;
    }
    context.beginPath();context.arc(0,0,radius,0,Math.PI*2);context.fill();context.stroke();context.shadowBlur=0;
    context.strokeStyle=level.palette.ink;context.lineWidth=1.7;context.lineCap='round';context.lineJoin='round';
    if(device.kind==='splitter'){
      context.beginPath();context.moveTo(-7,5);context.lineTo(6,state.mode===0?-5:5);context.lineTo(2,state.mode===0?-5:1);context.moveTo(6,state.mode===0?-5:5);context.lineTo(5,state.mode===0?-1:8);context.stroke();
    }else if(device.kind==='latch'||device.kind==='gate'){
      context.beginPath();context.roundRect(-6,-1,12,10,2);context.stroke();context.beginPath();context.moveTo(-4,-1);context.lineTo(-4,-5);context.quadraticCurveTo(0,-12,4,-5);if(state.mode===1)context.lineTo(4,-1);context.stroke();
    }else if(device.kind==='wind'){
      for(let row=0;row<3;row++){context.beginPath();context.moveTo(-8,row*4-3);context.lineTo(3,row*4-3);context.quadraticCurveTo(9,row*4-8,6,row*4-9);context.stroke();}
    }else if(device.kind==='lift'){
      context.beginPath();context.moveTo(0,-9);context.lineTo(0,9);context.moveTo(-5,-4);context.lineTo(0,-9);context.lineTo(5,-4);context.moveTo(-5,4);context.lineTo(0,9);context.lineTo(5,4);context.stroke();
    }else{
      context.beginPath();context.moveTo(-8,-4);context.lineTo(8,-4);context.moveTo(0,-8);context.lineTo(0,8);context.moveTo(-8,8);context.lineTo(8,8);context.moveTo(-7,-4);context.lineTo(-10,3);context.lineTo(-4,3);context.closePath();context.moveTo(7,-4);context.lineTo(4,3);context.lineTo(10,3);context.closePath();context.stroke();
    }
    if(selected){context.globalAlpha=.3;context.beginPath();context.arc(0,0,radius+5,0,Math.PI*2);context.stroke();}
    context.restore();
  }
  void time;
}

function focusedDrawing(level:WorldLevel,run:WorldRun,options:RenderOptions) {
  const active=options.activeStroke??run.activeStroke;
  if(active)return level.drawings.find(drawing=>drawing.id===active.drawingId);
  if(!options.hover)return undefined;
  const {scale}=guidanceFrame(level,options),radius=Math.max(44,22/scale);
  return level.drawings.find(drawing=>!run.drawings[drawing.id]&&[drawing.from,drawing.to].some(point=>Math.hypot(point.x-options.hover!.x,point.y-options.hover!.y)<radius));
}

function drawGuidance(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,options:RenderOptions) {
  const {scale,viewport}=guidanceFrame(level,options),focus=focusedDevice(level,run,options);
  const labels:GuidanceLabel[]=[],avoid:GuidanceRect[]=[];
  const project=(point:Point)=>projectGuidancePoint(point,scale,viewport);
  for(const device of level.devices){
    const state=getDeviceStatus(run,level,device.id);if(!state)continue;
    const anchor=project(device),inspectable=device.modes.length>1||device.playerControlled===false;
    avoid.push({left:anchor.x-21,top:anchor.y-21,width:42,height:42});
    labels.push({id:`device:${device.id}`,deviceId:inspectable?device.id:undefined,anchor,title:state.label,detail:state.stateLabel,kind:'device',selected:focus===device.id,priority:focus===device.id?100:70});
  }
  const source=level.nodes.find(node=>node.id===level.spawn),goal=level.nodes.find(node=>node.id===level.goal);
  if(source)labels.push({id:'departure',anchor:project({x:source.x,y:source.y-level.creatureHeight*1.1}),title:'Départ',detail:run.spawned<level.total?`${level.total-run.spawned} compagnons à venir`:'Toute la troupe est partie',kind:'place',priority:40});
  if(goal)labels.push({id:'refuge',anchor:project({x:goal.x,y:goal.y-level.creatureHeight*1.1}),title:'Refuge',detail:`${run.saved} / ${level.total} à l’abri`,kind:'place',priority:41});
  const queues=new Map<string,Creature[]>();
  for(const unit of run.units){
    if(unit.state!=='waiting'||unit.waitTime<2.8||unit.returning)continue;
    const key=unit.edgeId?`edge:${unit.edgeId}`:`node:${unit.nodeId}`,queue=queues.get(key)??[];
    queue.push(unit);queues.set(key,queue);
  }
  const waitingGroups=[...queues].map(([key,units])=>{
    const front=units.reduce((leader,unit)=>unit.distance>leader.distance||(unit.distance===leader.distance&&unit.waitTime>leader.waitTime)?unit:leader);
    return {key,units,front,reason:getWaitingReason(run,level,front)};
  }).filter(queue=>!!queue.reason).sort((a,b)=>b.front.waitTime-a.front.waitTime||b.units.length-a.units.length);
  for(const {key,units,front,reason} of waitingGroups.slice(0,2)){
    labels.push({id:`queue:${key}`,anchor:project({x:front.x,y:front.y-level.creatureHeight-8}),title:units.length===1?'Un compagnon attend':`${units.length} compagnons attendent`,detail:reason!,kind:'waiting',priority:25});
  }
  const active=options.activeStroke??run.activeStroke;
  const drawing=options.drawAnchors!==false?focusedDrawing(level,run,options):undefined;
  for(const definition of level.drawings){
    if(run.drawings[definition.id]&&definition.id!==active?.drawingId)continue;
    for(const point of [definition.from,definition.to]){const anchor=project(point);avoid.push({left:anchor.x-15,top:anchor.y-15,width:30,height:30});}
  }
  if(drawing){
    const target=active?(active.reversed?drawing.from:drawing.to):drawing.to;
    const anchor=project(target),outside=anchor.x<0||anchor.x>viewport.width||anchor.y<0||anchor.y>viewport.height;
    labels.push({id:'drawing-target',anchor:outside?{x:clamp(anchor.x,24,viewport.width-24),y:clamp(anchor.y,90,viewport.height-110)}:anchor,title:active?(outside?'L’appui est plus loin':'Termine ton trait ici'):'Deux appuis à relier',detail:drawing.label,kind:'drawing',selected:true,priority:120});
  }
  const placed=placeGuidanceLabels(labels,viewport,options.hudInsets,avoid);
  guidanceHits.set(run,{stage:`${level.id}:${level.stageName}`,scale,viewport,labels:placed.filter(label=>!!label.deviceId)});
  context.save();context.scale(1/scale,1/scale);context.translate(-viewport.x,-viewport.y);
  context.textAlign='left';context.textBaseline='alphabetic';
  const fitText=(text:string,width:number)=>{
    if(context.measureText(text).width<=width)return text;
    let clipped=text;while(clipped.length&&context.measureText(`${clipped}…`).width>width)clipped=clipped.slice(0,-1);
    return `${clipped.trimEnd()}…`;
  };
  for(const label of placed){
    const dimmed=!!active&&label.kind!=='drawing';
    context.save();context.globalAlpha=dimmed?.38:label.kind==='waiting'?.88:1;
    const nearest={x:clamp(label.anchor.x,label.left+8,label.left+label.width-8),y:clamp(label.anchor.y,label.top+5,label.top+label.height-5)};
    context.strokeStyle=level.palette.accent;context.lineWidth=label.selected?1.4:1;context.globalAlpha*=label.selected?.8:.45;
    if(Math.hypot(nearest.x-label.anchor.x,nearest.y-label.anchor.y)>18){context.beginPath();context.moveTo(label.anchor.x,label.anchor.y);context.lineTo(nearest.x,nearest.y);context.stroke();}
    context.globalAlpha=dimmed?.38:label.kind==='waiting'?.88:1;
    context.fillStyle=level.id==='veilleurs'?'#231d22ef':'#fff5e4ed';context.strokeStyle=label.selected?level.palette.accent:level.id==='veilleurs'?'#f4d9a735':'#6e573a2c';context.lineWidth=label.selected?1.35:.75;
    context.shadowColor=level.id==='veilleurs'?'#00000025':'#42331c0d';context.shadowBlur=5;context.shadowOffsetY=2;
    context.beginPath();context.roundRect(label.left,label.top,label.width,label.height,7);context.fill();context.stroke();context.shadowBlur=0;context.shadowOffsetY=0;
    context.fillStyle=level.palette.ink;context.font=`${label.selected?'600':'500'} 12px Arial, sans-serif`;
    context.fillText(fitText(label.title,label.width-22),label.left+11,label.top+14);
    if(label.detail){
      context.globalAlpha*=.84;context.font='11px Arial, sans-serif';
      context.fillText(fitText(label.detail,label.width-22),label.left+11,label.top+28);
    }
    context.restore();
  }
  context.restore();
}

function creaturePosition(unit:Creature,level:WorldLevel,run:WorldRun):Point {
  // Simulation owns all platform motion and therefore the exact foot contact.
  void level;void run;
  return {x:unit.x,y:unit.y};
}

function drawCreature(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,unit:Creature,time:number,reduced:boolean) {
  if(unit.state==='queued')return;
  const saved=unit.state==='saved',lost=unit.state==='lost';
  const age=saved?run.time-(unit.savedAt??run.time):lost?run.time-(unit.lostAt??run.time):0;
  if((saved&&age>1.1)||(lost&&age>1.8))return;
  const moving=unit.state==='walking';
  const frame=saved?7:moving?Math.floor(unit.walkTime*10)%6:6;
  const cell=assets.sprites.cells[frame];if(!cell)return;
  const p=creaturePosition(unit,level,run);
  const scale=level.creatureHeight/assets.sprites.referenceHeight;
  const breathing=reduced?0:Math.sin(time*2.5+unit.variant*6)*.006;
  const bob=!moving&&!reduced?Math.sin(time*2.4+unit.variant*6)*.8:0;
  const alpha=saved?clamp(1-age*.9,0,1):lost?clamp(1-age*.5,0,1):1;
  context.save();context.globalAlpha=alpha;
  if(level.id==='veilleurs'){
    const glow=context.createRadialGradient(p.x,p.y-level.creatureHeight*.4,2,p.x,p.y-level.creatureHeight*.4,level.creatureHeight*.8);
    glow.addColorStop(0,'#ffb94122');glow.addColorStop(1,'#ffb94100');context.fillStyle=glow;context.fillRect(p.x-level.creatureHeight,p.y-level.creatureHeight*1.5,level.creatureHeight*2,level.creatureHeight*2);
  }
  context.fillStyle=level.id==='veilleurs'?'#0f09096b':level.id==='plis'?'#5a45352b':'#23345613';
  context.beginPath();context.ellipse(p.x,p.y+3,level.creatureHeight*.28,level.creatureHeight*.048,0,0,Math.PI*2);context.fill();
  context.translate(p.x,p.y+bob-(saved?Math.sin(Math.min(1,age)*Math.PI)*13:0));
  context.scale(unit.direction*(1-breathing),1+breathing);
  if(lost)context.rotate(age*.7*unit.direction);
  if(level.id==='plis'){
    // Eight cream, two warm orange and two blue sheets in the twelve-member
    // troupe. Filter only the cutout: paper grain and dark eyes remain intact,
    // while its grounded shadow keeps the same colour as the other companions.
    if(unit.variant===1)context.filter='sepia(0.45) saturate(2.35) hue-rotate(-20deg) brightness(0.94)';
    else if(unit.variant===3)context.filter='sepia(1) saturate(1.15) hue-rotate(138deg) brightness(0.68)';
  }
  context.drawImage(assets.sprites.image,cell.x,cell.y,cell.width,cell.height,-cell.centerX*scale,-cell.baseline*scale,cell.width*scale,cell.height*scale);
  context.restore();
  if(unit.state==='waiting'&&unit.waitTime>4&&Math.floor(unit.id)%3===0&&!reduced){
    context.save();context.strokeStyle=level.palette.accent;context.lineWidth=1.8;context.lineCap='round';context.globalAlpha=.6+.25*Math.sin(time*1.8);
    const y=p.y-level.creatureHeight-8;
    context.beginPath();context.moveTo(p.x-3,y-5);context.lineTo(p.x-5,y-10);context.moveTo(p.x+3,y-7);context.lineTo(p.x+5,y-14);context.stroke();context.restore();
  }
}

function ambient(context:CanvasRenderingContext2D,level:WorldLevel,time:number,reduced:boolean) {
  if(reduced)return;
  context.save();
  if(level.id==='veilleurs'){
    for(let index=0;index<16;index++){
      const x=120+index*93+Math.sin(time*.15+index*1.7)*21;
      const y=130+(index*127)%580+Math.sin(time*.3+index*2.1)*13;
      const alpha=.12+.17*(Math.sin(time*.45+index)**2);
      context.fillStyle=`rgba(255,212,139,${alpha})`;context.beginPath();context.arc(x,y,index%4===0?1.8:.9,0,Math.PI*2);context.fill();
    }
  }else if(level.id==='plis'){
    for(let index=0;index<5;index++){
      const x=((time*(10+index)+index*291)%1800)-100,y=95+index*37+Math.sin(time*.4+index)*14;
      context.strokeStyle='#fcf4dd38';context.lineWidth=1.1;context.beginPath();context.moveTo(x,y);context.bezierCurveTo(x+15,y-8,x+30,y+7,x+45,y-1);context.stroke();
    }
  }else{
    for(let index=0;index<3;index++){
      const x=((time*(7+index)+index*521)%1800)-90,y=150+index*70+Math.sin(time*.35+index)*22;
      context.save();context.translate(x,y);context.rotate(Math.sin(time*.5+index)*.4);context.fillStyle='#cb665e45';context.beginPath();context.ellipse(0,0,5,2,0,0,Math.PI*2);context.fill();context.restore();
    }
  }
  context.restore();
}

function drawAnchors(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,time:number,options:RenderOptions) {
  const active=options.activeStroke??run.activeStroke,{scale}=guidanceFrame(level,options);
  const focus=focusedDrawing(level,run,options);
  type AnchorMark={letter:string;selected:boolean;destination:boolean};
  const anchors=new Map<string,{point:Point;marks:AnchorMark[]}>();
  for(const [number,drawing] of level.drawings.entries()){
    if(run.drawings[drawing.id]&&active?.drawingId!==drawing.id)continue;
    const selected=focus?.id===drawing.id;
    if(options.hint){
      context.save();context.globalAlpha=.32;context.strokeStyle=level.palette.accent;context.lineWidth=1.5/scale;context.setLineDash([3/scale,8/scale]);context.lineCap='round';path(context,drawing.suggested);context.stroke();context.restore();
    }
    if(active?.drawingId===drawing.id){
      const target=active.reversed?drawing.from:drawing.to,tip=active.points.at(-1);
      if(tip){
        context.save();context.globalAlpha=.35;context.strokeStyle=level.palette.accent;context.lineWidth=1/scale;context.setLineDash([3/scale,7/scale]);
        context.beginPath();context.moveTo(tip.x,tip.y);context.lineTo(target.x,target.y);context.stroke();context.restore();
      }
    }
    for(const [index,p] of [drawing.from,drawing.to].entries()){
      const destination=active?.drawingId===drawing.id&&index===(active.reversed?0:1);
      const key=`${p.x}:${p.y}`,anchor=anchors.get(key)??{point:p,marks:[]};
      anchor.marks.push({letter:String.fromCharCode(65+number),selected,destination});anchors.set(key,anchor);
    }
  }
  // Several paths can meet at one physical support. Paint that support once so
  // every available letter remains visible without shifting the actual endpoint.
  for(const {point,marks} of anchors.values()){
    const selected=marks.some(mark=>mark.selected),destination=marks.some(mark=>mark.destination);
    context.save();context.translate(point.x,point.y);context.scale(1/scale,1/scale);
    context.globalAlpha=active&&!selected?.28:selected?1:.88;
    const pulse=options.reducedMotion?0:Math.sin(time*3)*1.5;
    if(marks.length===1){
      const radius=destination?11:selected?9:7;
      if(selected){
        context.strokeStyle=level.palette.accent;context.lineWidth=destination?2:1;context.globalAlpha=destination?.7:.4;
        context.beginPath();context.arc(0,0,destination?18+pulse:14,0,Math.PI*2);context.stroke();context.globalAlpha=1;
      }
      context.fillStyle=destination?level.palette.accent:level.id==='veilleurs'?'#2e251d':'#fff3de';context.strokeStyle=destination?level.palette.paper:level.palette.accent;context.lineWidth=1.5;
      context.beginPath();context.arc(0,0,radius,0,Math.PI*2);context.fill();context.stroke();
      context.fillStyle=destination?level.palette.paper:level.palette.ink;context.font=`600 ${destination?10:8}px Arial, sans-serif`;context.textAlign='center';context.textBaseline='middle';
      context.fillText(marks[0].letter,0,.5);
    }else{
      const width=22+(marks.length-1)*20,height=22;
      if(selected){
        const margin=destination?6+pulse:4;
        context.strokeStyle=level.palette.accent;context.lineWidth=destination?2:1;context.globalAlpha=destination?.7:.4;
        context.beginPath();context.roundRect(-width/2-margin,-height/2-margin,width+margin*2,height+margin*2,height/2+margin);context.stroke();context.globalAlpha=1;
      }
      context.fillStyle=level.id==='veilleurs'?'#2e251d':'#fff3de';context.strokeStyle=level.palette.accent;context.lineWidth=1.5;
      context.beginPath();context.roundRect(-width/2,-height/2,width,height,height/2);context.fill();context.stroke();
      context.textAlign='center';context.textBaseline='middle';
      for(const [index,mark] of marks.entries()){
        const x=(index-(marks.length-1)/2)*20;
        context.save();
        if(active&&!mark.selected)context.globalAlpha*=.45;
        if(mark.selected){
          context.fillStyle=level.palette.accent;
          context.globalAlpha*=mark.destination?1:.18;
          context.beginPath();context.arc(x,0,8,0,Math.PI*2);context.fill();
          context.globalAlpha=1;
        }
        context.fillStyle=mark.destination?level.palette.paper:level.palette.ink;context.font=`${mark.selected?'700':'600'} 10px Arial, sans-serif`;
        context.fillText(mark.letter,x,.5);
        context.restore();
        if(index<marks.length-1){
          context.save();context.globalAlpha*=.6;context.fillStyle=level.palette.accent;
          context.beginPath();context.arc(x+10,0,1,0,Math.PI*2);context.fill();context.restore();
        }
      }
    }
    context.restore();
  }
}

function hand(context:CanvasRenderingContext2D,assets:WorldAssets,tip:Point|null,time:number,dt:number,reduced:boolean) {
  const state=assets.handState;
  if(tip){
    if(state.tip){
      const dx=tip.x-state.tip.x,dy=tip.y-state.tip.y;
      const target=Math.hypot(dx,dy)>2?clamp(Math.atan2(dy,Math.abs(dx)+20)*.045,-.045,.045):0;
      state.angle+=(target-state.angle)*(1-Math.exp(-dt*15));
    }
    state.tip={...tip};state.opacity=reduced?1:Math.min(1,state.opacity+dt*9);
  }else state.opacity=reduced?0:Math.max(0,state.opacity-dt*4);
  if(!assets.hand||!state.tip||state.opacity<=0)return;
  const size=350,scale=size/941,lift=tip?0:1-state.opacity;
  context.save();context.globalAlpha=state.opacity;
  context.translate(state.tip.x+lift*45,state.tip.y-lift*55);
  context.rotate(-1.36+state.angle);
  context.drawImage(assets.hand,-41*scale,-226*scale,size,1672*scale);context.restore();
}

/** Render into world coordinates. Caller owns DPR, letterboxing, camera and pointer conversion. */
export function renderWorld(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,options:RenderOptions={}) {
  const time=options.elapsed??run.time,reduced=options.reducedMotion??false;
  const dt=clamp(options.dt??(time-assets.handState.lastTime),0,.05)||1/60;assets.handState.lastTime=time;
  context.save();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(assets.scene,0,0,level.width,level.height);
  ambient(context,level,time,reduced);
  drawBuiltScenery(context,level,run,assets);
  drawDevices(context,level,run,assets,time,reduced);
  for(const drawing of Object.values(run.drawings))bridge(context,level,drawing.points);
  const active=options.activeStroke??run.activeStroke;
  if(active)bridge(context,level,active.points,true);
  drawMechanicalLinks(context,level,run,options);
  for(const unit of [...run.units].sort((a,b)=>a.y-b.y||a.id-b.id))drawCreature(context,level,run,assets,unit,time,reduced);
  if(options.drawAnchors!==false)drawAnchors(context,level,run,time,options);
  drawDeviceHandles(context,level,run,time,options);
  const tip=options.handTip??(active?.points.length?active.points[active.points.length-1]:null);
  hand(context,assets,tip,time,dt,reduced);
  drawGuidance(context,level,run,options);
  context.restore();
}
