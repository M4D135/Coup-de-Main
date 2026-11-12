import {getWorldAsset} from './assets';
import type {GuidanceInsets,GuidanceViewport} from './renderer-guidance';
import {drawAtmosphere,drawLandscape,drawPortal,visiblePoint,visibleWorld} from './renderer-landscape';
import {drawCompanions} from './renderer-characters';
import {deviceBody,drawMechanicalConnections,drawMechanisms} from './renderer-mechanisms';
import {bridge,clamp} from './renderer-primitives';
import type {ActiveStroke,Point,WorldId,WorldLevel,WorldRun} from './types';
import {tableauAsset,TABLEAU_WIDTH,TABLEAU_HEIGHT} from './tableaux';
import {getDrawingEndpoints,getEdgeSupportPaths} from './engine';

type Cell={x:number;y:number;width:number;height:number;centerX:number;baseline:number;bodyHeight:number;bodyWidth:number};
type Atlas={image:HTMLImageElement;cells:Cell[];referenceHeight:number};
type HandState={opacity:number;tip:Point|null;angle:number;lastTime:number};

export interface WorldAssets {
  id:WorldId;
  scene:HTMLImageElement;
  tableaux:HTMLImageElement[];
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
  /** An explicit null hides the photographic hand for touch/pen input. */
  handTip?:Point|null;
  hover?:Point|null;
  hint?:boolean;
  drawAnchors?:boolean;
  selectedDevice?:string|null;
  viewScale?:number;
  viewport?:GuidanceViewport;
  hudInsets?:GuidanceInsets;
}

export type WorldHit={kind:'device';id:string}|{kind:'drawing';id:string;end:'from'|'to'}|null;
const caches=new Map<WorldId,Promise<WorldAssets>>();
const frameScales=new WeakMap<WorldRun,number>();

function loadImage(file:string):Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{
    const image=new Image();image.decoding='async';image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error(`Le décor n’a pas pu être chargé : ${file}`));image.src=getWorldAsset(file);
  });
}

/** Stable alpha bounds keep every animation pose on its exact foot baseline. */
function atlas(image:HTMLImageElement,columns:number,rows:number):Atlas {
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d',{willReadFrequently:true}),cw=image.naturalWidth/columns,ch=image.naturalHeight/rows,cells:Cell[]=[];
  let pixels:Uint8ClampedArray|null=null;
  if(context){context.drawImage(image,0,0);try{pixels=context.getImageData(0,0,canvas.width,canvas.height).data;}catch{/* Same-origin assets normally permit alpha inspection. */}}
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const x=Math.floor(column*cw),y=Math.floor(row*ch),width=Math.floor((column+1)*cw)-x,height=Math.floor((row+1)*ch)-y;
    let left=width,right=0,top=height,bottom=0;
    if(pixels)for(let py=2;py<height-2;py++)for(let px=2;px<width-2;px++){
      if(pixels[((y+py)*canvas.width+x+px)*4+3]>90){left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);}
    }
    if(right<=left){left=0;right=width;top=0;bottom=height;}
    cells.push({x,y,width,height,centerX:(left+right)/2,baseline:bottom,bodyHeight:bottom-top,bodyWidth:right-left});
  }
  return {image,cells,referenceHeight:Math.max(...cells.map(cell=>cell.bodyHeight))};
}

export function loadWorldAssets(id:WorldId):Promise<WorldAssets> {
  const previous=caches.get(id);if(previous)return previous;
  const loading=Promise.all([
    Promise.all(Array.from({length:5},(_,index)=>loadImage(tableauAsset(id,index)))),loadImage(`worlds/${id}-sprites.png`),
    loadImage(`worlds/${id}-props.png`).catch(()=>null),loadImage('drawing-hand-hd.webp').catch(()=>null),
  ]).then(([tableaux,sprites,props,hand])=>({id,scene:tableaux[0],tableaux,sprites:atlas(sprites,4,2),props:props?atlas(props,2,2):null,hand,
    handState:{opacity:0,tip:null,angle:0,lastTime:0}}));
  caches.set(id,loading);loading.catch(()=>caches.delete(id));return loading;
}

export function clearWorldAssets(id?:WorldId){if(id)caches.delete(id);else caches.clear();}

/** minRadius is in world units. The caller supplies 24 / viewScale for a 48 CSS
 * pixel tap target; there is no world-unit floor/cap that shrinks it on phones. */
export function hitTestWorld(level:WorldLevel,run:WorldRun,point:Point,minRadius?:number):WorldHit {
  const radius=Number.isFinite(minRadius)&&minRadius!>0?minRadius!:24/(frameScales.get(run)??1);
  const candidates:{distance:number;hit:Exclude<WorldHit,null>}[]=[];
  for(const drawing of level.drawings){
    if(run.drawings[drawing.id])continue;
    const endpoints=getDrawingEndpoints(run,level,drawing);
    for(const end of ['from','to'] as const){const distance=Math.hypot(endpoints[end].x-point.x,endpoints[end].y-point.y);
      if(distance<=radius)candidates.push({distance,hit:{kind:'drawing',id:drawing.id,end}});
    }
  }
  for(const device of level.devices){
    if(device.playerControlled===false||device.modes.length<2)continue;
    const distance=Math.hypot(device.x-point.x,device.y-point.y),body=deviceBody(level,run,device);
    const left=body.point.x-body.width/2,right=body.point.x+body.width/2,top=body.point.y-body.height,bottom=body.point.y+24;
    const edgeDistance=Math.hypot(Math.max(left-point.x,0,point.x-right),Math.max(top-point.y,0,point.y-bottom));
    if(distance<=radius||edgeDistance<=Math.min(radius*.35,18))candidates.push({distance:Math.min(distance,Math.hypot(body.point.x-point.x,body.point.y-body.height*.4-point.y))+radius*.08,hit:{kind:'device',id:device.id}});
  }
  return candidates.sort((a,b)=>a.distance-b.distance)[0]?.hit??null;
}

function segmentDistance(point:Point,a:Point,b:Point):number {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/length,0,1):0;
  return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t);
}

/** Direct erasing targets the visible stroke; eligibility stays in the engine. */
export function hitTestDrawing(level:WorldLevel,run:WorldRun,point:Point,tolerance=12):string|null {
  let nearest:string|null=null,distance=Number.isFinite(tolerance)&&tolerance>0?tolerance:12;
  for(const [id,drawing] of Object.entries(run.drawings)){
    const edge=level.edges.find(edge=>edge.drawingId===id),paths=edge?getEdgeSupportPaths(run,level,edge):[drawing.points];
    for(const points of paths)for(let i=1;i<points.length;i++){
      const candidate=segmentDistance(point,points[i-1],points[i]);if(candidate<=distance){distance=candidate;nearest=id;}
    }
  }
  return nearest;
}

function drawAnchors(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,time:number,options:RenderOptions) {
  const bounds=visibleWorld(level,options),scale=bounds.scale,active=options.activeStroke??run.activeStroke;
  const focused=active?.drawingId??(options.hover?hitTestWorld(level,run,options.hover,24/scale):null)?.id;
  const anchors=new Map<string,{point:Point;selected:boolean;destination:boolean}>();
  for(const drawing of level.drawings){
    if(run.drawings[drawing.id]&&drawing.id!==active?.drawingId)continue;
    const endpoints=getDrawingEndpoints(run,level,drawing);
    for(const end of ['from','to'] as const){
      const point=endpoints[end],key=`${point.x}:${point.y}`,destination=active?.drawingId===drawing.id&&end===(active.reversed?'from':'to'),previous=anchors.get(key);
      anchors.set(key,{point,selected:previous?.selected||focused===drawing.id,destination:previous?.destination||destination});
    }
  }
  for(const {point,selected,destination} of anchors.values()){
    if(!visiblePoint(point,bounds,30))continue;
    const pulse=options.reducedMotion?0:Math.sin(time*2.7+point.x*.01)*1.2;
    context.save();context.translate(point.x,point.y);context.scale(1/scale,1/scale);
    context.globalAlpha=active&&!selected?.2:1;
    if(selected||!active){
      context.strokeStyle=level.palette.accent;context.lineWidth=destination?1.8:1;context.globalAlpha*=destination?.85:selected?.55:.22;
      context.beginPath();context.arc(0,0,(destination?16:selected?13:11)+pulse,0,Math.PI*2);context.stroke();context.globalAlpha=active&&!selected?.2:1;
    }
    context.fillStyle=destination?level.palette.accent:level.id==='veilleurs'?'#eacb8a':'#f5e7ce';context.strokeStyle=level.id==='veilleurs'?'#624526':level.palette.ink;context.lineWidth=1.4;
    context.beginPath();context.arc(0,0,destination?7:5.6,0,Math.PI*2);context.fill();context.stroke();
    context.fillStyle=destination?level.palette.paper:level.palette.accent;context.beginPath();context.arc(0,0,destination?2.2:1.7,0,Math.PI*2);context.fill();context.restore();
  }
  if(active){
    const drawing=level.drawings.find(item=>item.id===active.drawingId),tip=active.points.at(-1);
    if(drawing&&tip){
      const endpoints=getDrawingEndpoints(run,level,drawing),target=active.reversed?endpoints.from:endpoints.to;
      context.save();context.globalAlpha=.19;context.strokeStyle=level.palette.accent;context.lineWidth=1.2/scale;context.setLineDash([2/scale,8/scale]);
      context.beginPath();context.moveTo(tip.x,tip.y);context.lineTo(target.x,target.y);context.stroke();context.restore();
      const viewport=options.viewport;
      if(viewport){
        const x=target.x*scale+viewport.x,y=target.y*scale+viewport.y;
        if(x<24||x>viewport.width-24||y<55||y>viewport.height-80){
          const px=clamp(x,26,viewport.width-26),py=clamp(y,64,viewport.height-88),angle=Math.atan2(y-py,x-px);
          context.save();context.translate((px-viewport.x)/scale,(py-viewport.y)/scale);context.scale(1/scale,1/scale);context.rotate(angle);
          context.strokeStyle=level.palette.accent;context.lineWidth=2.5;context.lineCap='round';context.lineJoin='round';context.beginPath();context.moveTo(-5,-7);context.lineTo(3,0);context.lineTo(-5,7);context.moveTo(3,-7);context.lineTo(11,0);context.lineTo(3,7);context.stroke();context.restore();
        }
      }
    }
  }
}

function hand(context:CanvasRenderingContext2D,assets:WorldAssets,tip:Point|null,dt:number,reduced:boolean) {
  const state=assets.handState;
  if(tip){
    if(state.tip){const dx=tip.x-state.tip.x,dy=tip.y-state.tip.y,target=Math.hypot(dx,dy)>2?clamp(Math.atan2(dy,Math.abs(dx)+20)*.045,-.045,.045):0;state.angle+=(target-state.angle)*(1-Math.exp(-dt*15));}
    state.tip={...tip};state.opacity=reduced?1:Math.min(1,state.opacity+dt*9);
  }else state.opacity=reduced?0:Math.max(0,state.opacity-dt*7);
  if(!assets.hand||!state.tip||state.opacity<=0)return;
  const size=300,scale=size/941,lift=tip?0:1-state.opacity;
  context.save();context.globalAlpha=state.opacity;context.translate(state.tip.x+lift*45,state.tip.y-lift*55);context.rotate(-1.36+state.angle);
  context.drawImage(assets.hand,-41*scale,-226*scale,size,1672*scale);context.restore();
}

/** The caller owns DPR and the camera. Every object and walking surface uses
 * the same absolute-world coordinates as the simulation, across all sectors. */
export function renderWorld(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,options:RenderOptions={}) {
  const time=options.elapsed??run.time,reduced=options.reducedMotion??false,bounds=visibleWorld(level,options);
  const dt=clamp(options.dt??(time-assets.handState.lastTime),0,.05)||1/60;assets.handState.lastTime=time;frameScales.set(run,bounds.scale);
  context.save();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.beginPath();context.rect((bounds.tableau??0)*TABLEAU_WIDTH,0,TABLEAU_WIDTH,TABLEAU_HEIGHT);context.clip();
  drawLandscape(context,level,assets,bounds);
  drawAtmosphere(context,level,bounds,time,reduced);
  drawMechanicalConnections(context,level,run,bounds,time,reduced);
  const goal=level.nodes.find(node=>node.id===level.goal);
  if(goal&&visiblePoint(goal,bounds,200))drawPortal(context,level,assets,goal,true,time);
  drawMechanisms(context,level,run,assets,bounds,time,options);
  for(const [id,drawing] of Object.entries(run.drawings)){
    const edge=level.edges.find(edge=>edge.drawingId===id),paths=edge?getEdgeSupportPaths(run,level,edge):[drawing.points];
    for(const points of paths)if(points.some((p,i)=>visiblePoint(p,bounds,20)||i>0&&Math.min(p.x,points[i-1].x)<=bounds.right&&Math.max(p.x,points[i-1].x)>=bounds.left))bridge(context,level,points);
  }
  const active=options.activeStroke??run.activeStroke;if(active)bridge(context,level,active.points,true);
  drawCompanions(context,level,run,assets,bounds,time,reduced);
  if(options.drawAnchors!==false)drawAnchors(context,level,run,time,options);
  const tip=options.handTip===undefined?(active?.points.at(-1)??null):options.handTip;
  hand(context,assets,tip,dt,reduced);
  context.restore();
}
