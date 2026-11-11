import type {WorldAssets} from './renderer';
import type {Point,WorldId,WorldLevel} from './types';

export const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export const pointAt=(a:Point,b:Point,t:number):Point=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});

export function trace(context:CanvasRenderingContext2D,points:Point[]) {
  context.beginPath();for(const [index,point] of points.entries())index?context.lineTo(point.x,point.y):context.moveTo(point.x,point.y);
}

export function rope(context:CanvasRenderingContext2D,a:Point,b:Point,world:WorldId,width=3) {
  context.save();context.lineCap='round';context.strokeStyle=world==='boucles'?'#283958':world==='plis'?'#806545':'#2f1c12';context.lineWidth=width+2;
  context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
  context.strokeStyle=world==='boucles'?'#d5a451':world==='plis'?'#d2b582':'#b98b49';context.lineWidth=width;context.stroke();
  context.strokeStyle=world==='veilleurs'?'#ead09580':'#f2d79a';context.lineWidth=.8;context.setLineDash([2,5]);context.stroke();context.restore();
}

export function prop(context:CanvasRenderingContext2D,assets:WorldAssets,index:number,x:number,y:number,width:number,rotation=0,originY=1,originX=.5,sourcePivot?:Point) {
  const sheet=assets.props,cell=sheet?.cells[index];if(!sheet||!cell)return false;
  const scale=width/cell.bodyWidth,anchorX=sourcePivot?.x??cell.centerX+cell.bodyWidth*(originX-.5),anchorY=sourcePivot?.y??cell.baseline-cell.bodyHeight*(1-originY);
  context.save();context.translate(x,y);context.rotate(rotation);
  context.drawImage(sheet.image,cell.x,cell.y,cell.width,cell.height,-anchorX*scale,-anchorY*scale,cell.width*scale,cell.height*scale);context.restore();return true;
}

export function bridge(context:CanvasRenderingContext2D,level:WorldLevel,points:Point[],active=false) {
  if(points.length<2)return;
  context.save();context.lineJoin='round';context.lineCap='round';
  if(active){
    trace(context,points);context.strokeStyle=level.id==='veilleurs'?'#fff0cf':level.palette.ink;context.lineWidth=level.id==='boucles'?5:3.5;
    if(level.id==='veilleurs'){context.shadowColor='#ffca6a';context.shadowBlur=5;}context.stroke();
  }else if(level.id==='boucles'){
    context.translate(0,2.5);trace(context,points);context.strokeStyle=level.palette.ink;context.lineWidth=6;context.stroke();
    context.translate(0,1.5);trace(context,points);context.strokeStyle='#f4dec840';context.lineWidth=1.1;context.stroke();
  }else{
    context.save();context.translate(0,10);trace(context,points);context.strokeStyle=level.id==='plis'?'#8f704e':'#443022';context.lineWidth=12;context.shadowColor=level.id==='plis'?'#47342845':'#0008';context.shadowBlur=9;context.stroke();context.restore();
    context.translate(0,5);trace(context,points);context.strokeStyle=level.id==='plis'?'#f7e8cf':'#bca58a';context.lineWidth=10;context.stroke();
    if(level.id==='veilleurs'){context.strokeStyle='#f3e4c9';context.lineWidth=6;context.stroke();}
    context.translate(0,-4);trace(context,points);context.strokeStyle=level.id==='plis'?'#fff6e3':'#fff6e0';context.lineWidth=1.5;context.stroke();
  }
  context.restore();
}

export function brass(context:CanvasRenderingContext2D,x:number,y:number,radius:number,world:WorldId) {
  context.save();const gradient=context.createLinearGradient(x-radius,y-radius,x+radius,y+radius);
  gradient.addColorStop(0,world==='boucles'?'#f1cd77':'#f3cf89');gradient.addColorStop(.45,world==='boucles'?'#d9a343':'#c7944c');gradient.addColorStop(1,world==='boucles'?'#efb94f':'#7b4d2e');
  context.fillStyle=gradient;context.strokeStyle=world==='boucles'?'#25375b':'#6b492a';context.lineWidth=world==='boucles'?2.3:1.6;
  context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fill();context.stroke();context.strokeStyle='#ffe5a890';context.lineWidth=1;
  context.beginPath();context.arc(x-1,y-1,radius*.76,Math.PI,Math.PI*1.8);context.stroke();context.restore();
}
