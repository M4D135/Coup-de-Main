import type {Point} from './types';

/** All guidance geometry is in CSS pixels, independently of scene zoom or DPR. */
export interface GuidanceViewport extends Point {width:number;height:number}
export interface GuidanceInsets {top?:number;right?:number;bottom?:number;left?:number}
export interface GuidanceRect {left:number;top:number;width:number;height:number}
export interface GuidanceLabel {
  id:string;
  anchor:Point;
  title:string;
  detail:string;
  kind:'device'|'place'|'waiting'|'drawing';
  selected?:boolean;
  deviceId?:string;
  priority:number;
}
export interface PlacedGuidanceLabel extends GuidanceLabel,GuidanceRect {}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const overlap=(a:GuidanceRect,b:GuidanceRect)=>Math.max(0,Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left))
  *Math.max(0,Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top));

export function projectGuidancePoint(point:Point,scale:number,viewport:GuidanceViewport):Point {
  return {x:point.x*scale+viewport.x,y:point.y*scale+viewport.y};
}

/**
 * Fixed card widths prevent labels from sliding when load/state text changes.
 * Placement depends on mechanisms and other labels, never moving characters.
 */
export function placeGuidanceLabels(
  labels:GuidanceLabel[],viewport:GuidanceViewport,insets:GuidanceInsets={},avoid:GuidanceRect[]=[],
):PlacedGuidanceLabel[] {
  const bounds={
    left:insets.left??12,
    top:Math.min(insets.top??76,viewport.height*.23),
    right:viewport.width-(insets.right??12),
    bottom:viewport.height-Math.min(insets.bottom??100,viewport.height*.28),
  };
  const placed:PlacedGuidanceLabel[]=[];
  for(const label of [...labels].sort((a,b)=>b.priority-a.priority)){
    const {x,y}=label.anchor;
    if(x<-20||x>viewport.width+20||y<-20||y>viewport.height+20)continue;
    const width=Math.min(label.kind==='device'?154:label.kind==='waiting'?172:142,Math.max(60,bounds.right-bounds.left));
    const height=label.detail?37:25;
    const starts:Point[]=[
      {x:x-width/2,y:y-height-27},
      {x:x+27,y:y-height/2},
      {x:x-width-27,y:y-height/2},
      {x:x-width/2,y:y+27},
    ];
    for(let row=1;row<=3;row++){
      starts.push({x:x-width/2,y:y-height-27-row*(height+8)});
      starts.push({x:x-width/2,y:y+27+row*(height+8)});
    }
    let best:GuidanceRect|null=null,bestCost=Infinity;
    for(const [index,start] of starts.entries()){
      const candidate={left:clamp(start.x,bounds.left,Math.max(bounds.left,bounds.right-width)),top:clamp(start.y,bounds.top,Math.max(bounds.top,bounds.bottom-height)),width,height};
      const conflicts=placed.reduce((sum,other)=>sum+overlap(candidate,{left:other.left-4,top:other.top-4,width:other.width+8,height:other.height+8}),0);
      const obscured=avoid.reduce((sum,other)=>sum+overlap(candidate,other),0);
      const shift=Math.hypot(candidate.left-start.x,candidate.top-start.y);
      const cost=conflicts*100+obscured*4+shift*.2+index;
      if(cost<bestCost){bestCost=cost;best=candidate;}
    }
    if(!best)continue;
    // A queue bubble is secondary; never let it cover a mechanism label.
    if(label.kind==='waiting'&&placed.some(other=>overlap(best!,other)>0))continue;
    placed.push({...label,...best});
  }
  return placed;
}

export function pointInGuidance(point:Point,rect:GuidanceRect):boolean {
  return point.x>=rect.left&&point.x<=rect.left+rect.width&&point.y>=rect.top&&point.y<=rect.top+rect.height;
}
