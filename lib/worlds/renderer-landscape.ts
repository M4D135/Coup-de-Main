import type {WorldAssets,RenderOptions} from './renderer';
import type {Point,WorldLevel} from './types';
import {TABLEAU_WIDTH,TABLEAU_HEIGHT,tableauIndex} from './tableaux';

export interface WorldBounds {left:number;right:number;top:number;bottom:number;scale:number;tableau?:number}
export const noise=(seed:number)=>{const value=Math.sin(seed*127.1+311.7)*43758.5453;return value-Math.floor(value);};

export function visibleWorld(level:WorldLevel,options:RenderOptions):WorldBounds {
  const scale=Number.isFinite(options.viewScale)&&options.viewScale!>0?options.viewScale!:1;
  const viewport=options.viewport??{x:0,y:0,width:TABLEAU_WIDTH*scale,height:level.height*scale};
  const index=tableauIndex((viewport.width*.5-viewport.x)/scale),start=index*TABLEAU_WIDTH;
  return {left:Math.max(start,-viewport.x/scale-180),right:Math.min(start+TABLEAU_WIDTH,(viewport.width-viewport.x)/scale+180),
    top:-viewport.y/scale-180,bottom:(viewport.height-viewport.y)/scale+180,scale,tableau:index};
}

export function visiblePoint(point:Point,bounds:WorldBounds,margin=180):boolean {
  if(bounds.tableau!==undefined&&tableauIndex(point.x)!==bounds.tableau)return false;
  return point.x>=bounds.left-margin&&point.x<=bounds.right+margin&&point.y>=bounds.top-margin&&point.y<=bounds.bottom+margin;
}

/** One drawImage, one complete composition, no tiled texture, crop, mirror,
 * stretched fragment, procedural terrain or support painted over the scenery. */
export function drawLandscape(context:CanvasRenderingContext2D,_level:WorldLevel,assets:WorldAssets,bounds:WorldBounds) {
  const index=bounds.tableau??tableauIndex((bounds.left+bounds.right)/2);
  const image=assets.tableaux[index],x=index*TABLEAU_WIDTH;
  const scale=Math.max(TABLEAU_WIDTH/image.naturalWidth,TABLEAU_HEIGHT/image.naturalHeight);
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  context.drawImage(image,x+(TABLEAU_WIDTH-width)/2,(TABLEAU_HEIGHT-height)/2,width,height);
}

/** A few quiet, world-specific particles leave the actual illustration intact. */
export function drawAtmosphere(context:CanvasRenderingContext2D,level:WorldLevel,bounds:WorldBounds,time:number,reduced:boolean) {
  if(reduced)return;
  const start=(bounds.tableau??0)*TABLEAU_WIDTH;
  context.save();
  if(level.id==='veilleurs'){
    for(let i=0;i<16;i++){
      const seed=i+(bounds.tableau??0)*31,x=start+noise(seed+17)*TABLEAU_WIDTH+Math.sin(time*.22+seed)*20,y=150+noise(seed+41)*1300+Math.sin(time*.19+seed*2)*35;
      if(!visiblePoint({x,y},bounds))continue;
      context.globalAlpha=.13+(Math.sin(time*.55+seed)+1)*.13;
      const glow=context.createRadialGradient(x,y,0,x,y,8);glow.addColorStop(0,'#ffe7a6');glow.addColorStop(1,'#ffe7a600');context.fillStyle=glow;context.fillRect(x-8,y-8,16,16);
    }
  }else{
    for(let i=0;i<3;i++){
      const seed=i+(bounds.tableau??0)*7,phase=(time*17+noise(seed+8)*1750)%1800,x=start+240+noise(seed+20)*2400+Math.sin(phase/130+seed)*35,y=phase-80;
      if(!visiblePoint({x,y},bounds))continue;
      context.save();context.translate(x,y);context.rotate(phase*.007+seed);context.globalAlpha=.45;context.fillStyle=level.palette.accent;
      context.beginPath();context.moveTo(-6,0);context.quadraticCurveTo(0,-5,9,0);context.quadraticCurveTo(0,5,-6,0);context.fill();context.restore();
    }
  }
  context.restore();
}

/** Refuge architecture belongs to the whole plate, never to a cropped sprite. */
export function drawPortal(context:CanvasRenderingContext2D,level:WorldLevel,_assets:WorldAssets,point:Point,goal:boolean,time:number) {
  if(!goal)return;
  context.save();context.globalAlpha=.06+.015*Math.sin(time*1.2);
  const glow=context.createRadialGradient(point.x,point.y-100,5,point.x,point.y-100,180);
  glow.addColorStop(0,level.palette.glow);glow.addColorStop(1,'#ffd98b00');context.fillStyle=glow;context.fillRect(point.x-180,point.y-280,360,360);context.restore();
}
