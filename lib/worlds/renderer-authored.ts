import type {WorldAssets} from './renderer';
import type {DeviceDefinition,WorldLevel,WorldRun,Point} from './types';
import {brass,bridge,pointAt,prop,rope} from './renderer-primitives';
import {tableauIndex,windArtwork} from './tableaux';

const imagePoint=(index:number,x:number,y:number):Point=>({x:index*3200+x*3200/1672,y:y*1800/941});

/** The original dioramas already contain their housings, pillars and beams.
 * Only the moving cut-outs are placed on those real painted attachment points. */
export function authoredWind(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition,angle:number,time:number,reduced:boolean):boolean {
  const painted=windArtwork(level,device);
  if(painted){
    const radius=painted.width/2;
    context.save();context.translate(painted.center.x,painted.center.y);context.scale(painted.scaleX,1);context.rotate(angle);
    for(let i=0;i<4;i++){
      context.save();context.rotate(i*Math.PI/2);
      const fill=context.createLinearGradient(-radius*.1,-radius, radius*.65,0);
      fill.addColorStop(0,level.id==='veilleurs'?'#f4d59b':'#eac478');fill.addColorStop(.45,level.id==='veilleurs'?'#c28c45':'#dfaa58');fill.addColorStop(1,level.id==='veilleurs'?'#67401e':'#bd793c');
      context.fillStyle=fill;context.strokeStyle=level.id==='veilleurs'?'#51351d':level.palette.ink;context.lineWidth=2.5;
      context.beginPath();context.moveTo(0,0);context.bezierCurveTo(-radius*.22,-radius*.48,-radius*.25,-radius*.9,radius*.27,-radius*.88);context.bezierCurveTo(radius*.66,-radius*.91,radius*.79,-radius*.48,0,0);context.fill();context.stroke();
      context.strokeStyle=level.id==='veilleurs'?'#fff0c17a':'#f9d695';context.lineWidth=2;context.beginPath();context.moveTo(radius*.12,-radius*.17);context.quadraticCurveTo(radius*.18,-radius*.55,radius*.28,-radius*.77);context.stroke();context.restore();
    }
    brass(context,0,0,radius*.14,level.id);context.restore();return true;
  }
  if(level.id!=='plis')return false;
  const index=tableauIndex(device.x),state=run.devices[device.id];
  if(index===0){
    context.save();context.translate(650,556);context.transform(.69,-.10,0,1,0,0);
    prop(context,assets,2,0,0,256,angle,.5,.5,{x:320,y:304});context.restore();
    const flagAngle=state.mode===1?-.03:.88;
    prop(context,assets,3,1100,620,233,flagAngle,.5,.5,{x:154,y:444});
    const millAngle=(state.progress*.22+angle*.52);
    prop(context,assets,0,1982,302,470,millAngle,.5,.5,{x:312,y:309});
    // The deck is carried by the mast in the original illustration.
    bridge(context,level,[{x:1950,y:910},{x:2200,y:910}]);
    rope(context,{x:2275,y:450},{x:2200,y:907},level.id,4);
    if(!reduced){
      context.save();context.strokeStyle='#fff4de';context.lineWidth=4;context.globalAlpha=.45;
      for(let i=0;i<3;i++){
        const x=755+(time*110+i*140)%330,y=550+(i-1)*48;
        context.beginPath();context.moveTo(x,y);context.bezierCurveTo(x+60,y-22,x+130,y+22,x+205,y);context.stroke();
      }context.restore();
    }
  }else if(index===1){
    context.save();context.translate(device.x,device.y);context.transform(.66,-.06,0,1,0,0);
    prop(context,assets,2,0,0,218,angle,.5,.5,{x:320,y:304});context.restore();
  }else if(index===3){
    const wheel=imagePoint(index,808,217);
    prop(context,assets,0,wheel.x,wheel.y,350,angle*.65,.5,.5,{x:312,y:309});
  }else{
    prop(context,assets,3,device.x,device.y,210,state.mode===1?.68:-.42,.5,.5,{x:154,y:444});
  }
  return true;
}

export function authoredCounterweight(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  const center=device.low??device,width=device.width??330,state=run.devices[device.id],index=tableauIndex(device.x);
  const first=index===0,pivot=device.pivot??{x:center.x,y:center.y-440};
  if(first&&level.id==='boucles'){
    rope(context,{x:1040,y:968},{x:center.x-width*.45,y:center.y-10},level.id,5);
    rope(context,{x:center.x+width*.45,y:center.y-10},pivot,level.id,5);
    const counter={x:2255,y:1130-state.progress*110};
    rope(context,pivot,{x:counter.x,y:counter.y-105},level.id,5);
    prop(context,assets,1,counter.x,counter.y,210,0,.84);
  }else{
    // Rope is attached to a beam/overhang measured on the complete illustration.
    for(const side of [-1,1])rope(context,{x:pivot.x+side*16,y:pivot.y},{x:center.x+side*width*.43,y:center.y-12},level.id,4);
    if(!first)brass(context,pivot.x,pivot.y,15,level.id);
  }
  if(level.id==='plis')prop(context,assets,1,center.x,center.y,width,0,.82);
  else prop(context,assets,0,center.x,center.y,width,0,level.id==='veilleurs'?.28:.37);
  if(first&&level.id==='veilleurs'){
    const other={x:1665,y:520-state.progress*80};
    rope(context,{x:1685,y:225},{x:other.x-65,y:other.y-25},level.id,4);
    rope(context,{x:1685,y:225},{x:other.x+65,y:other.y-25},level.id,4);
    prop(context,assets,0,other.x,other.y,220,0,.28);
  }
}

export function authoredLift(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  if(!device.low||!device.high)return;
  const position=pointAt(device.low,device.high,run.devices[device.id]?.progress??0),width=device.width??270;
  const pivot=device.pivot??{x:device.high.x,y:device.high.y-300};
  rope(context,pivot,{x:position.x,y:position.y-130},level.id,5);
  prop(context,assets,level.id==='veilleurs'?2:1,position.x,position.y,width,0,level.id==='veilleurs'?.8:.84);
  if(level.id==='veilleurs'&&device.id==='s0:lift'){
    bridge(context,level,[{x:1180,y:920},{x:1380,y:970}]);
    bridge(context,level,[{x:1380,y:800},{x:1560,y:800}]);
  }
}
