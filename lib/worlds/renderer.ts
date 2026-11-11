import {getWorldAsset} from './assets';
import {getPendulumPosition} from './engine';
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
}

export type WorldHit = {kind:'device';id:string} | {kind:'drawing';id:string;end:'from'|'to'} | null;

const caches = new Map<WorldId, Promise<WorldAssets>>();
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
    if(device.modes.length>1&&distance<Math.max(device.radius??43,radius))candidates.push({distance,hit:{kind:'device',id:device.id}});
  }
  for(const drawing of level.drawings){
    if(run.drawings[drawing.id])continue;
    const from=Math.hypot(drawing.from.x-point.x,drawing.from.y-point.y),to=Math.hypot(drawing.to.x-point.x,drawing.to.y-point.y);
    if(from<radius)candidates.push({distance:from,hit:{kind:'drawing',id:drawing.id,end:'from'}});
    if(to<radius)candidates.push({distance:to,hit:{kind:'drawing',id:drawing.id,end:'to'}});
  }
  return candidates.sort((a,b)=>a.distance-b.distance)[0]?.hit??null;
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
    if(descent&&progress>.02){
      const raised=descent.path.map((point,index)=>({x:point.x,y:point.y+(1-progress)*110*(1-index/(descent.path.length-1))}));
      bridge(context,level,raised);
    }
  }
  if(level.id==='veilleurs'){
    const additions:Point[][]=[
      [{x:570,y:460},{x:645,y:500}],
      [{x:735,y:400},{x:790,y:400}],
      [{x:360,y:460},{x:320,y:605}],
    ];
    for(const [a,b] of additions)woodenTraverse(context,assets,a,b);
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
      const motion=getPendulumPosition(device,run.time);
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

function drawDeviceHandles(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,time:number,options:RenderOptions) {
  for(const device of level.devices){
    if(device.modes.length<2)continue;
    const state=run.devices[device.id];if(!state)continue;
    const hovered=options.selectedDevice===device.id||(options.hover&&Math.hypot(options.hover.x-device.x,options.hover.y-device.y)<45);
    const radius=hovered?22:18;
    context.save();context.translate(device.x,device.y);
    context.fillStyle=level.id==='veilleurs'?'#211b18da':'#f7e8cbe8';context.strokeStyle=level.palette.accent;context.lineWidth=1.8;
    context.shadowColor=level.id==='veilleurs'?'#ffd17e60':'#3a2f2418';context.shadowBlur=hovered?17:5;
    context.beginPath();context.arc(0,0,radius,0,Math.PI*2);context.fill();context.stroke();context.shadowBlur=0;
    context.strokeStyle=level.id==='veilleurs'?'#f7dca7':level.palette.ink;context.lineWidth=2.1;context.lineCap='round';context.lineJoin='round';
    if(device.kind==='splitter'){
      context.beginPath();context.moveTo(-7,4);context.lineTo(5,state.mode===0?-5:5);context.lineTo(1,state.mode===0?-6:1);context.moveTo(5,state.mode===0?-5:5);context.lineTo(4,state.mode===0?-1:8);context.stroke();
    }else if(device.kind==='latch'||device.kind==='gate'){
      context.beginPath();context.roundRect(-6,-1,12,10,2);context.stroke();context.beginPath();context.moveTo(-4,-1);context.lineTo(-4,-5);context.quadraticCurveTo(0,-12,4,-5);if(state.mode===1)context.lineTo(4,-1);context.stroke();
    }else if(device.kind==='wind'){
      for(let row=0;row<3;row++){context.beginPath();context.moveTo(-8,row*5-5);context.lineTo(3,row*5-5);context.quadraticCurveTo(10,row*5-10,7,row*5-11);context.stroke();}
    }else{
      context.beginPath();context.arc(0,0,7,0,Math.PI*1.6);context.moveTo(4,-7);context.lineTo(9,-5);context.lineTo(7,-11);context.stroke();
    }
    context.restore();
    if(hovered){
      const text=device.modes[state.mode]??device.label;
      context.save();context.font='500 15px Georgia, serif';const width=context.measureText(text).width+25;
      context.fillStyle=level.id==='veilleurs'?'#211b18ed':'#fff4deed';context.strokeStyle=level.palette.accent+'80';context.lineWidth=1;
      context.beginPath();context.roundRect(device.x-width/2,device.y+29,width,30,15);context.fill();context.stroke();
      context.fillStyle=level.palette.ink;context.textAlign='center';context.fillText(text,device.x,device.y+49);context.restore();
    }
  }
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
  const active=options.activeStroke??run.activeStroke;
  for(const drawing of level.drawings){
    if(run.drawings[drawing.id]&&active?.drawingId!==drawing.id)continue;
    const selected=active?.drawingId===drawing.id;
    if(options.hint){
      context.save();context.globalAlpha=.32;context.strokeStyle=level.palette.accent;context.lineWidth=2;context.setLineDash([3,9]);context.lineCap='round';path(context,drawing.suggested);context.stroke();context.restore();
    }
    for(const [index,p] of [drawing.from,drawing.to].entries()){
      const hovered=options.hover&&Math.hypot(options.hover.x-p.x,options.hover.y-p.y)<44;
      const radius=selected||hovered?13:9;
      context.save();context.globalAlpha=selected||hovered?1:.82;
      if(selected){context.strokeStyle=level.palette.accent;context.globalAlpha=.20;context.lineWidth=1;context.beginPath();context.arc(p.x,p.y,21+Math.sin(time*3)*2,0,Math.PI*2);context.stroke();context.globalAlpha=1;}
      context.fillStyle=level.id==='veilleurs'?'#e6b968':'#f8ecd6';context.strokeStyle=level.id==='veilleurs'?'#fff0c9':level.palette.ink;context.lineWidth=1.8;
      context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);context.fill();context.stroke();
      context.fillStyle=level.id==='veilleurs'?'#694e2f':level.palette.accent;context.beginPath();context.arc(p.x,p.y,2.7,0,Math.PI*2);context.fill();
      if(hovered||selected){context.font='12px Georgia,serif';context.textAlign='center';context.fillStyle=level.palette.ink;context.fillText(index===0?'A':'B',p.x,p.y-23);}
      context.restore();
    }
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
  for(const unit of [...run.units].sort((a,b)=>a.y-b.y||a.id-b.id))drawCreature(context,level,run,assets,unit,time,reduced);
  if(options.drawAnchors!==false)drawAnchors(context,level,run,time,options);
  drawDeviceHandles(context,level,run,time,options);
  const tip=options.handTip??(active?.points.length?active.points[active.points.length-1]:null);
  hand(context,assets,tip,time,dt,reduced);
  context.restore();
}
