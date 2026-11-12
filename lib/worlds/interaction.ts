import {hitTestWorld,type WorldHit} from './renderer';
import {deviceBody} from './renderer-mechanisms';
import {getDrawingEndpoints} from './engine';
import type {Point,WorldLevel,WorldRun} from './types';

export type PlayTarget=Exclude<WorldHit,null>|{kind:'companion';id:number}|null;

/** Keep the visible face distinct from the broad touch area of its platform.
 * Feet remain available for anchors; the crank itself always remains a control. */
export function hitTestPlayTarget(level:WorldLevel,run:WorldRun,point:Point,scale:number):PlayTarget {
  const radius=24/Math.max(.01,scale),hit=hitTestWorld(level,run,point,radius),height=level.creatureHeight;
  const companion=run.units.filter(unit=>!['queued','saved','lost'].includes(unit.state)
    &&point.y<unit.y-height*.22&&point.y>unit.y-height-radius*.3)
    .map(unit=>({id:unit.id,distance:Math.hypot(point.x-unit.x,point.y-(unit.y-height*.59))}))
    .filter(unit=>unit.distance<=Math.max(radius,height*.48)).sort((a,b)=>a.distance-b.distance)[0];
  if(!companion)return hit;
  if(hit?.kind==='drawing'){
    const drawing=level.drawings.find(drawing=>drawing.id===hit.id),anchor=drawing?getDrawingEndpoints(run,level,drawing)[hit.end]:undefined;
    if(anchor&&Math.hypot(point.x-anchor.x,point.y-anchor.y)<=radius*.45)return hit;
  }else if(hit?.kind==='device'){
    const device=level.devices.find(device=>device.id===hit.id)!;
    if(!['counterweight','lift'].includes(device.kind)||Math.hypot(point.x-device.x,point.y-device.y)<=radius*.55)return hit;
  }
  return {kind:'companion',id:companion.id};
}

/** A short tap on a platform shared with a drawing support operates the object.
 * Only an actual drag commits ink; both rims of a wide pan are touchable. */
export function tappedPlatform(level:WorldLevel,run:WorldRun,point:Point,scale:number):string|null {
  const tolerance=8/Math.max(.01,scale);
  return level.devices.filter(device=>device.playerControlled!==false&&device.modes.length>1
    &&(device.kind==='counterweight'||device.kind==='lift'))
    .map(device=>{
      const body=deviceBody(level,run,device),dx=Math.max(body.point.x-body.width/2-point.x,0,point.x-body.point.x-body.width/2);
      const dy=Math.max(body.point.y-body.height-point.y,0,point.y-body.point.y-24);
      return {id:device.id,distance:Math.hypot(dx,dy)};
    }).filter(device=>device.distance<=tolerance).sort((a,b)=>a.distance-b.distance)[0]?.id??null;
}
