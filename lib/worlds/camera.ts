import type {Point} from './types';

export interface WorldView {
  scale:number;
  x:number;
  y:number;
  /** Viewport dimensions in CSS pixels, before device-pixel-ratio scaling. */
  width:number;
  height:number;
  overflowX:number;
  overflowY:number;
  /** Complete illustration currently framed; absent for legacy continuous views. */
  tableauIndex?:number;
  tableauWidth?:number;
  worldWidth?:number;
  panMinX?:number;
  panMaxX?:number;
}

export interface WorldPan {panX:number;panY:number}

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const pan=(value:number)=>Number.isFinite(value)?clamp(value,0,1):.5;
// Transient zero/invalid DOM measurements must not introduce NaN into gestures.
const dimension=(value:number)=>Number.isFinite(value)&&value>0
  ?clamp(value,1,Number.MAX_SAFE_INTEGER/4):1;

/** Fit the whole scene at 100%, then allow a bounded pan on either overflowing axis. */
export function getWorldView(
  worldWidth:number,worldHeight:number,viewportWidth:number,viewportHeight:number,
  zoom:number,panX:number,panY:number,
):WorldView {
  const sceneWidth=dimension(worldWidth),sceneHeight=dimension(worldHeight);
  const width=dimension(viewportWidth),height=dimension(viewportHeight);
  const magnification=Number.isFinite(zoom)?clamp(zoom,1,3):1;
  const scale=Math.min(width/sceneWidth,height/sceneHeight)*magnification;
  const scenePixelsX=sceneWidth*scale,scenePixelsY=sceneHeight*scale;
  const overflowX=Math.max(0,scenePixelsX-width),overflowY=Math.max(0,scenePixelsY-height);
  return {
    scale,
    x:overflowX>0?-overflowX*pan(panX):(width-scenePixelsX)/2,
    y:overflowY>0?-overflowY*pan(panY):(height-scenePixelsY)/2,
    width,height,overflowX,overflowY,
  };
}

/** Each illustrated tableau fills the viewport and owns its camera bounds.
 * The optional width keeps the legacy continuous view available to old saves
 * and utilities. Global pan coordinates still address the entire journey. */
export function getExpeditionView(
  worldWidth:number,worldHeight:number,viewportWidth:number,viewportHeight:number,
  zoom:number,panX:number,panY:number,tableauWidth=0,
):WorldView {
  const sceneWidth=dimension(worldWidth),sceneHeight=dimension(worldHeight);
  const width=dimension(viewportWidth),height=dimension(viewportHeight);
  if(Number.isFinite(tableauWidth)&&tableauWidth>0){
    const board=Math.min(sceneWidth,tableauWidth),magnification=Number.isFinite(zoom)?clamp(zoom,1,3.4):1;
    // Cover the display with one whole composition: portrait crops horizontally,
    // wide landscape crops vertically. Neither axis exposes a flat letterbox.
    const scale=Math.max(width/board,height/sceneHeight)*magnification;
    const overflowX=Math.max(0,sceneWidth*scale-width),overflowY=Math.max(0,sceneHeight*scale-height);
    const requestedLeft=overflowX*pan(panX),centre=(requestedLeft+width/2)/scale;
    const tableauIndex=clamp(Math.floor(centre/board),0,Math.ceil(sceneWidth/board)-1);
    const minimum=tableauIndex*board*scale,maximum=Math.max(minimum,Math.min(sceneWidth,(tableauIndex+1)*board)*scale-width);
    return {scale,x:-clamp(requestedLeft,minimum,maximum),y:overflowY>0?-overflowY*pan(panY):0,
      width,height,overflowX,overflowY,tableauIndex,tableauWidth:board,worldWidth:sceneWidth,
      panMinX:overflowX?minimum/overflowX:0,panMaxX:overflowX?maximum/overflowX:0};
  }
  const magnification=Number.isFinite(zoom)?clamp(zoom,.65,3.4):1;
  const scale=Math.min(width/Math.min(sceneWidth,1400),height/sceneHeight)*magnification;
  const overflowX=Math.max(0,sceneWidth*scale-width),overflowY=Math.max(0,sceneHeight*scale-height);
  return {scale,x:overflowX>0?-overflowX*pan(panX):(width-sceneWidth*scale)/2,
    y:overflowY>0?-overflowY*pan(panY):(height-sceneHeight*scale)/2,
    width,height,overflowX,overflowY};
}

/** Keep a world point beneath a finger while changing magnification. */
export function panAroundPoint(view:WorldView,worldPoint:Point,screenPoint:Point):WorldPan {
  let left=worldPoint.x*view.scale-screenPoint.x;
  if(view.tableauWidth&&view.worldWidth){
    // Select the point's own page before clamping. A companion near an edge
    // must not disappear because the requested screen offset selected its neighbour.
    const index=clamp(Math.floor(worldPoint.x/view.tableauWidth),0,Math.ceil(view.worldWidth/view.tableauWidth)-1);
    const minimum=index*view.tableauWidth*view.scale;
    const maximum=Math.max(minimum,Math.min(view.worldWidth,(index+1)*view.tableauWidth)*view.scale-view.width);
    left=clamp(left,minimum,maximum);
  }
  return {
    panX:view.overflowX>0?clamp(left/view.overflowX,0,1):.5,
    panY:view.overflowY>0?clamp((worldPoint.y*view.scale-screenPoint.y)/view.overflowY,0,1):.5,
  };
}

function edgeVelocity(coordinate:number,extent:number):number {
  if(!Number.isFinite(coordinate)||!Number.isFinite(extent)||extent<=0)return 0;
  const border=Math.min(56,extent/2);
  const towardsStart=clamp((border-coordinate)/border,0,1);
  const towardsEnd=clamp((coordinate-(extent-border))/border,0,1);
  return (towardsEnd-towardsStart)*300;
}

/**
 * Called only while drawing. A pointer in the outer 56 CSS pixels scrolls the
 * scene smoothly, up to 300 px/s, without moving a fitted/non-overflowing axis.
 * The caller reprojects the held pointer through the returned view and appends
 * that point to the stroke, even when no new pointermove event has arrived.
 */
export function autoPanWorldView(
  view:WorldView,pointerLocal:Point,dt:number,panX:number,panY:number,
):WorldPan {
  const initialX=pan(panX),initialY=pan(panY);
  const elapsed=Number.isFinite(dt)?clamp(dt,0,.06):0;
  const overflowX=Number.isFinite(view.overflowX)&&view.overflowX>0?view.overflowX:0;
  const overflowY=Number.isFinite(view.overflowY)&&view.overflowY>0?view.overflowY:0;
  if(elapsed===0)return {panX:initialX,panY:initialY};
  return {
    panX:overflowX>0?clamp(initialX+edgeVelocity(pointerLocal.x,view.width)*elapsed/overflowX,view.panMinX??0,view.panMaxX??1):initialX,
    panY:overflowY>0?clamp(initialY+edgeVelocity(pointerLocal.y,view.height)*elapsed/overflowY,0,1):initialY,
  };
}
