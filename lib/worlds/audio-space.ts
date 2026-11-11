export interface SoundPosition {x?:number;y?:number;unitId?:number;deviceId?:string}
/** Centre and visible dimensions, in world coordinates, never screen pixels. */
export interface SoundListener {x:number;y:number;width:number;height?:number}
export interface SoundPlacement {gain:number;pan:number}

export const soundVolume=(value:number,fallback=.5)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:fallback));

export function getSoundPlacement(position:SoundPosition|undefined,listener:SoundListener|null):SoundPlacement {
  if(!listener||!Number.isFinite(listener.x)||!Number.isFinite(listener.y)||position?.x===undefined||!Number.isFinite(position.x))return {gain:1,pan:0};
  const width=Math.max(1,Number.isFinite(listener.width)?listener.width:1600);
  const dx=(position.x-listener.x)/(width*.5);
  const height=Math.max(1,Number.isFinite(listener.height)?listener.height!:width*.6);
  const dy=position.y!==undefined&&Number.isFinite(position.y)?(position.y-listener.y)/(height*.5):0;
  const distance=Math.max(Math.abs(dx),Math.abs(dy));
  const pan=Math.max(-.82,Math.min(.82,dx*.76));
  if(distance>=1.55)return {gain:0,pan};
  if(distance<=1)return {gain:1-distance*.12,pan};
  const fade=(distance-1)/.55,smooth=fade*fade*(3-2*fade);
  return {gain:.88*(1-smooth),pan};
}
