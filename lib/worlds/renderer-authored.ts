import type {WorldAssets} from './renderer';
import type {DeviceDefinition,WorldLevel,WorldRun,Point} from './types';
import {brass,bridge,prop,rope} from './renderer-primitives';
import {tableauIndex,windArtwork} from './tableaux';
import {drawWindFlow,insetWindRotor,windSourcePose,type InsetWindRotor} from './wind-visuals';
import {getDeviceAnchor} from './mechanics';

const imagePoint=(index:number,x:number,y:number):Point=>({x:index*3200+x*3200/1672,y:y*1800/941});

/** A short side-facing shroud makes the real air axis visible. It is attached
 * to the existing housing, so no scenery or painted stand is reconstructed. */
function profiledInlet(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,device:DeviceDefinition,angle:number){
  const pose=windSourcePose(level,device);if(!pose)return;
  const r=pose.radius,front=r*.58,back=-r*.37,height=r*.74;
  context.save();context.translate(pose.center.x,pose.center.y);context.rotate(pose.heading);
  const shade=context.createLinearGradient(0,-height,0,height);
  shade.addColorStop(0,level.id==='veilleurs'?'#d9ad65':'#f6e0b9');
  shade.addColorStop(.42,level.id==='veilleurs'?'#9b682f':'#dfbd8e');
  shade.addColorStop(1,level.id==='veilleurs'?'#51351f':'#9d7b54');
  context.fillStyle=shade;context.strokeStyle=level.id==='veilleurs'?'#4b301e':'#8b6946';context.lineWidth=2.6;
  context.beginPath();context.moveTo(back,-height*.94);context.lineTo(front,-height);
  context.quadraticCurveTo(front+r*.2,0,front,height);context.lineTo(back,height*.94);
  context.quadraticCurveTo(back-r*.14,0,back,-height*.94);context.closePath();context.fill();context.stroke();
  context.strokeStyle=level.id==='veilleurs'?'#f3ce8790':'#fff5dd';context.lineWidth=1.8;
  context.beginPath();context.moveTo(back,-height*.77);context.lineTo(front,-height*.83);context.stroke();
  context.translate(front,0);context.scale(.26,1);
  context.fillStyle=level.id==='veilleurs'?'#302821':'#6d5b40';context.strokeStyle=level.id==='veilleurs'?'#e6bc72':'#f6e2bf';context.lineWidth=5;
  context.beginPath();context.arc(0,0,height,0,Math.PI*2);context.fill();context.stroke();
  context.save();context.beginPath();context.arc(0,0,height*.89,0,Math.PI*2);context.clip();
  if(level.id==='plis')prop(context,assets,2,0,0,height*1.66,angle,.5,.5,{x:320,y:304});
  else{
    context.rotate(angle);context.fillStyle='#c08c46';context.strokeStyle='#67431e';context.lineWidth=2;
    for(let i=0;i<4;i++){context.rotate(Math.PI/2);context.beginPath();context.moveTo(0,0);context.quadraticCurveTo(height*.14,-height*.95,height*.62,-height*.43);context.quadraticCurveTo(height*.72,-height*.06,0,0);context.fill();context.stroke();}
    brass(context,0,0,height*.13,level.id);
  }
  context.restore();context.restore();
}

function windReceiver(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition){
  const rig=device.mechanics?.wind;if(!rig)return;
  const heading=Math.atan2(rig.target.y-rig.source.y,rig.target.x-rig.source.x),state=run.devices[device.id];
  const radius=level.id==='plis'&&device.id==='s0:wind'?230:level.id==='plis'&&device.id==='s6:wind'?115:level.id==='boucles'?150:78;
  if(level.id==='plis'&&device.id==='s2:wind'){
    const bank=level.nodes.find(node=>node.id==='s2:low-far');
    if(bank){
      context.save();context.strokeStyle='#98744d';context.lineWidth=14;context.lineCap='round';
      context.beginPath();context.moveTo(rig.target.x,rig.target.y);context.lineTo(rig.target.x,bank.y);context.stroke();
      context.strokeStyle='#eed3a8';context.lineWidth=8;context.stroke();context.strokeStyle='#fff1d2';context.lineWidth=2;
      context.beginPath();context.moveTo(rig.target.x-3,rig.target.y);context.lineTo(rig.target.x-3,bank.y);context.stroke();
      context.strokeStyle='#b58d5f';context.lineWidth=12;context.beginPath();context.moveTo(rig.target.x-32,bank.y);context.lineTo(rig.target.x+32,bank.y);context.stroke();context.restore();
      brass(context,rig.target.x,bank.y,9,level.id);
    }
  }
  context.save();context.translate(rig.target.x,rig.target.y);context.rotate(heading);
  // The axle continues behind the receiver into the transmission. Its air-facing
  // disk is a narrow ellipse, with the same normal as the incoming stream.
  context.strokeStyle=level.id==='veilleurs'?'#b28a50':level.id==='plis'?'#a67b4b':level.palette.ink;context.lineWidth=11;
  context.beginPath();context.moveTo(0,0);context.lineTo(radius*.64,0);context.stroke();
  context.scale(.42,1);context.rotate(state.rotorAngle??state.progress*Math.PI*4);
  if(level.id==='plis')prop(context,assets,0,0,0,radius*1.65,0,.5,.5,{x:312,y:309});
  else{
    for(let i=0;i<6;i++){
      context.save();context.rotate(i*Math.PI/3);
      const fill=context.createLinearGradient(-radius*.2,-radius,radius*.6,0);
      fill.addColorStop(0,level.id==='veilleurs'?'#e7c57f':'#f0d8a2');fill.addColorStop(1,level.id==='veilleurs'?'#8d5e2c':'#b18c54');
      context.fillStyle=fill;context.strokeStyle=level.id==='veilleurs'?'#67431e':level.palette.ink;context.lineWidth=2;
      context.beginPath();context.moveTo(0,-radius*.13);context.lineTo(-radius*.17,-radius*.83);context.quadraticCurveTo(radius*.17,-radius*1.02,radius*.39,-radius*.74);context.lineTo(radius*.14,-radius*.12);context.closePath();context.fill();context.stroke();context.restore();
    }
    brass(context,0,0,radius*.16,level.id);
  }
  context.restore();
}

export function windDrumAnchor(level:WorldLevel,device:DeviceDefinition):Point{
  return level.devices.find(item=>item.id===device.lockDeviceId)??device.mechanics?.wind?.target??device;
}

function insetRotor(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,frame:InsetWindRotor,angle:number) {
  const {center,radius,scaleX,shearY}=frame;
  context.save();context.translate(center.x,center.y);context.transform(scaleX,shearY,0,1,0,0);
  context.beginPath();context.arc(0,0,radius,0,Math.PI*2);context.clip();
  if(frame.material==='paper'){
    // The atlas pivot is the brass spindle, not the rectangular alpha bounds.
    // A margin inside the circular clip contains all five blades at every angle.
    prop(context,assets,2,0,0,radius*1.78,angle,.5,.5,{x:320,y:304});
  }else{
    context.rotate(angle);
    for(let i=0;i<4;i++){
      context.save();context.rotate(i*Math.PI/2);
      const fill=context.createLinearGradient(-radius*.1,-radius,radius*.65,0);
      fill.addColorStop(0,'#ebc779');fill.addColorStop(.45,'#ad7836');fill.addColorStop(1,'#62401f');
      context.fillStyle=fill;context.strokeStyle='#67431e';context.lineWidth=2;
      context.beginPath();context.moveTo(0,0);
      context.bezierCurveTo(-radius*.18,-radius*.45,-radius*.19,-radius*.80,radius*.25,-radius*.82);
      context.bezierCurveTo(radius*.59,-radius*.83,radius*.69,-radius*.43,0,0);context.fill();context.stroke();
      context.strokeStyle='#f7dc9e80';context.lineWidth=1.5;context.beginPath();context.moveTo(radius*.10,-radius*.18);
      context.quadraticCurveTo(radius*.16,-radius*.50,radius*.26,-radius*.71);context.stroke();context.restore();
    }
    brass(context,0,0,radius*.14,level.id);
  }
  context.restore();
}

/** The original dioramas already contain their housings, pillars and beams.
 * Only the moving cut-outs are placed on those real painted attachment points. */
export function authoredWind(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition,angle:number,_time:number,reduced:boolean):boolean {
  if(device.mechanics?.wind){
    const rig=device.mechanics.wind;
    profiledInlet(context,level,assets,device,angle);
    if(level.id==='plis'&&device.id==='s0:wind'){
      const state=run.devices[device.id];
      prop(context,assets,3,device.x,device.y,233,state.mode===1?-.03:.88,.5,.5,{x:154,y:444});
      bridge(context,level,[{x:1950,y:910},{x:2200,y:910}]);
    }
    // Natural wind is admitted by a small shutter on the existing mill/vanes;
    // there is no invented front-facing electrical fan in those landscapes.
    if(!windSourcePose(level,device)){
      context.save();context.translate(device.x,device.y);context.rotate(run.devices[device.id].mode===1?-.55:.45);
      context.fillStyle=level.id==='boucles'?'#e8c681':'#e6c89c';context.strokeStyle=level.palette.ink;context.lineWidth=2;
      context.beginPath();context.roundRect(-28,-10,56,20,5);context.fill();context.stroke();brass(context,0,0,7,level.id);context.restore();
    }
    drawWindFlow(context,level,run,device,rig.source,rig.radius,rig.direction.x<0?-1:1,reduced);
    windReceiver(context,level,run,assets,device);return true;
  }
  const inset=insetWindRotor(level,device);
  if(inset){
    insetRotor(context,level,assets,inset,angle);
    drawWindFlow(context,level,run,device,inset.center,inset.radius*Math.abs(inset.scaleX),inset.direction,reduced);
    // The first paper fan and its deflector share one control; retain the
    // original flag, windmill, bridge and rope below.
    if(level.id!=='plis'||tableauIndex(device.x)!==0)return true;
  }
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
    const flagAngle=state.mode===1?-.03:.88;
    prop(context,assets,3,1100,620,233,flagAngle,.5,.5,{x:154,y:444});
    const millAngle=(state.progress*.22+angle*.52);
    prop(context,assets,0,1982,302,470,millAngle,.5,.5,{x:312,y:309});
    // The deck is carried by the mast in the original illustration.
    bridge(context,level,[{x:1950,y:910},{x:2200,y:910}]);
    rope(context,{x:2275,y:450},{x:2200,y:907},level.id,4);
  }else if(index===3){
    const wheel=imagePoint(index,808,217);
    prop(context,assets,0,wheel.x,wheel.y,350,angle*.65,.5,.5,{x:312,y:309});
  }else{
    prop(context,assets,3,device.x,device.y,210,state.mode===1?.68:-.42,.5,.5,{x:154,y:444});
  }
  return true;
}

/** The loaded strand is shared with the drum renderer: its measured payout,
 * including a slanted suspension, is what turns the fixed wheel. */
export function counterweightDriveRope(level:WorldLevel,device:DeviceDefinition,center:Point):[Point,Point]{
  const width=device.width??330,rest=device.low??center,pivot=device.pivot??{x:rest.x,y:rest.y-440};
  if(tableauIndex(device.x)===0&&level.id==='boucles')return [{...pivot},{x:center.x+width*.45,y:center.y-10}];
  return [{x:pivot.x-16,y:pivot.y},{x:center.x-width*.43,y:center.y-12}];
}

export function authoredCounterweight(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  const center=getDeviceAnchor(run,device),width=device.width??330,state=run.devices[device.id],index=tableauIndex(device.x);
  const first=index===0,pivot=device.pivot??{x:center.x,y:center.y-440};
  const [drivePivot,drivePan]=counterweightDriveRope(level,device,center);
  if(first&&level.id==='boucles'){
    rope(context,{x:1040,y:968},{x:center.x-width*.45,y:center.y-10},level.id,5);
    rope(context,drivePan,drivePivot,level.id,5);
    const counter={x:2255,y:1130-(center.y-(device.low?.y??center.y))};
    rope(context,pivot,{x:counter.x,y:counter.y-105},level.id,5);
    prop(context,assets,1,counter.x,counter.y,210,0,.84);
  }else{
    // Rope is attached to a beam/overhang measured on the complete illustration.
    rope(context,drivePivot,drivePan,level.id,4);
    rope(context,{x:pivot.x+16,y:pivot.y},{x:center.x+width*.43,y:center.y-12},level.id,4);
    if(!first)brass(context,pivot.x,pivot.y,15,level.id);
  }
  if(level.id==='plis')prop(context,assets,1,center.x,center.y,width,0,.82);
  else prop(context,assets,0,center.x,center.y,width,0,level.id==='veilleurs'?.28:.37);
  if(first&&level.id==='veilleurs'){
    const other={x:1665,y:520-(center.y-(device.low?.y??center.y))};
    rope(context,{x:1685,y:225},{x:other.x-65,y:other.y-25},level.id,4);
    rope(context,{x:1685,y:225},{x:other.x+65,y:other.y-25},level.id,4);
    prop(context,assets,0,other.x,other.y,220,0,.28);
  }
}

export function authoredLift(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  if(!device.low||!device.high)return;
  const position=getDeviceAnchor(run,device),width=device.width??270;
  const pivot=device.pivot??{x:device.high.x,y:device.high.y-300};
  rope(context,pivot,{x:position.x,y:position.y-130},level.id,5);
  prop(context,assets,level.id==='veilleurs'?2:1,position.x,position.y,width,0,level.id==='veilleurs'?.8:.84);
  if(level.id==='veilleurs'&&device.id==='s0:lift'){
    bridge(context,level,[{x:1180,y:920},{x:1380,y:970}]);
    bridge(context,level,[{x:1380,y:800},{x:1560,y:800}]);
  }
}
