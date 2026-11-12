import {gateSatisfied,getDeviceStatus,getPendulumPosition,getEdgeSupportPaths} from './engine';
import type {WorldAssets,RenderOptions} from './renderer';
import type {DeviceDefinition,Point,WorldLevel,WorldRun} from './types';
import {visiblePoint,type WorldBounds} from './renderer-landscape';
import {brass,clamp,mix,pointAt,prop,rope} from './renderer-primitives';
import {authoredCounterweight,authoredLift,authoredWind,windDrumAnchor} from './renderer-authored';
import {drawWindFlow} from './wind-visuals';
import {getDeviceAnchor} from './mechanics';
import {tableauIndex} from './tableaux';

const fanMotion=new WeakMap<WorldRun,Map<string,{angle:number;speed:number;time:number}>>();

function fanAngle(run:WorldRun,device:DeviceDefinition,reduced:boolean):number {
  let fans=fanMotion.get(run);if(!fans){fans=new Map();fanMotion.set(run,fans);}
  const previous=fans.get(device.id)??{angle:0,speed:0,time:run.time},dt=clamp(run.time-previous.time,0,.07);
  const powered=run.devices[device.id]?.mode===1;
  previous.speed+=(powered?3.2-previous.speed:-previous.speed)*(1-Math.exp(-dt*7));
  if(!reduced)previous.angle=(previous.angle+previous.speed*dt)%(Math.PI*2);
  previous.time=run.time;fans.set(device.id,previous);return previous.angle;
}

export function deviceBody(level:WorldLevel,run:WorldRun,device:DeviceDefinition):{point:Point;width:number;height:number} {
  if(level.id==='plis'&&device.id==='s0:wind')return {point:{x:1100,y:720},width:260,height:440};
  if(device.kind==='lift'&&device.low&&device.high)return {point:getDeviceAnchor(run,device),width:device.width??144,height:110};
  if(device.kind==='counterweight')return {point:getDeviceAnchor(run,device),width:device.width??240,height:65};
  if(device.kind==='wind')return {point:{x:device.x,y:device.y+75},width:device.width??170,height:170};
  return {point:device,width:device.kind==='splitter'?88:58,height:58};
}

function floorAnchor(level:WorldLevel,point:Point):Point {
  const floors:{point:Point;gap:number}[]=[];
  for(const edge of level.edges){if(edge.kind!=='ground')continue;
    for(let i=1;i<edge.path.length;i++){
      const a=edge.path[i-1],b=edge.path[i],length=Math.abs(b.x-a.x),t=clamp((point.x-a.x)/(b.x-a.x||1),0,1);
      // Keep the foot of a tall stand inside the real bank, rather than on a
      // nonexistent floor beneath an undrawn crossing.
      const inside=clamp(t,length>70?30/length:0,length>70?1-30/length:1),position=pointAt(a,b,inside);
      if(position.y>point.y+35)floors.push({point:position,gap:Math.abs(position.x-point.x)+Math.abs(position.y-point.y)*.025});
    }
  }
  return floors.sort((a,b)=>a.gap-b.gap)[0]?.point??{x:point.x,y:level.height};
}

const floorAt=(level:WorldLevel,point:Point)=>floorAnchor(level,point).y;

function timber(context:CanvasRenderingContext2D,a:Point,b:Point,width:number,level:WorldLevel) {
  context.save();context.lineCap='round';
  const ink=level.id==='boucles'?'#24375d':level.id==='plis'?'#967149':'#52351f';
  context.strokeStyle=ink;context.lineWidth=width+3;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
  const gradient=context.createLinearGradient(a.x-width,a.y-width,a.x+width,a.y+width);gradient.addColorStop(0,level.id==='plis'?'#f6e3bf':'#ce9a5d');gradient.addColorStop(1,level.id==='plis'?'#c7a272':'#986138');
  context.strokeStyle=gradient;context.lineWidth=width;context.stroke();context.strokeStyle='#fff0c14d';context.lineWidth=1;context.stroke();context.restore();
}

function pips(context:CanvasRenderingContext2D,point:Point,total:number,filled:number,level:WorldLevel,scale:number) {
  if(total<1)return;const count=Math.min(8,total),radius=3.4/scale,space=10/scale;
  context.save();context.strokeStyle=level.palette.accent;context.lineWidth=1.2/scale;
  for(let index=0;index<count;index++){
    context.fillStyle=index<filled?level.palette.accent:level.id==='veilleurs'?'#33251f':'#eee0c8';
    context.beginPath();context.arc(point.x+(index-(count-1)/2)*space,point.y,radius,0,Math.PI*2);context.fill();context.stroke();
  }
  context.restore();
}

function pulley(context:CanvasRenderingContext2D,level:WorldLevel,at:Point,radius:number,angle:number,held=false){
  context.save();context.translate(at.x,at.y);context.rotate(angle);
  context.fillStyle=level.id==='veilleurs'?'#573a22':'#c79c64';context.strokeStyle=level.id==='boucles'?level.palette.ink:'#76512d';context.lineWidth=3;
  context.beginPath();context.arc(0,0,radius,0,Math.PI*2);context.fill();context.stroke();
  context.strokeStyle=level.id==='veilleurs'?'#dcad61':'#f4deb3';context.lineWidth=2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3;context.beginPath();context.moveTo(Math.cos(a)*radius*.27,Math.sin(a)*radius*.27);context.lineTo(Math.cos(a)*radius*.82,Math.sin(a)*radius*.82);context.stroke();}
  brass(context,0,0,radius*.23,level.id);context.restore();
  if(held){
    context.save();context.strokeStyle=level.id==='veilleurs'?'#f0cc82':level.palette.ink;context.lineWidth=5;context.lineCap='round';
    context.beginPath();context.moveTo(at.x+radius+10,at.y-radius);context.lineTo(at.x+radius*.65,at.y-radius*.38);context.stroke();context.restore();
  }
}

/** Short physical cords stay inside their illustrated room. Distant
 * dependencies are represented by the matching latched objects, never wires
 * running across the sky or across a page boundary. */
export function drawMechanicalConnections(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,bounds:WorldBounds,_time:number,_reduced:boolean) {
  const drums=new Set<string>();
  for(const edge of level.edges){
    if(!edge.mechanism||!edge.drawingId)continue;
    const built=!!run.drawings[edge.drawingId];
    const paths=getEdgeSupportPaths(run,level,edge);
    for(const [index,id]of edge.mechanism.drivers.entries()){
      const driver=level.devices.find(device=>device.id===id),path=paths[index]??paths[0];
      if(!driver||!path?.length)continue;
      const state=run.devices[id],hinge=index===0?path[0]:path.at(-1)!,tip=index===0?path.at(-1)!:path[0];
      if(!visiblePoint(hinge,bounds,160)&&!visiblePoint(tip,bounds,160))continue;
      if(tableauIndex(driver.x)!==tableauIndex(hinge.x))continue;
      const drum=driver.kind==='wind'?windDrumAnchor(level,driver):driver.kind==='counterweight'?driver.pivot??{x:driver.x,y:driver.y-180}:driver;
      // Each guide is bolted to a bank. It never floats above the middle of a
      // gap; the two halves of a double bridge have separate real attachments.
      const bank=edge.mechanism.drivers.length>1?hinge:edge.path.at(-1)??hinge;
      const guide={x:bank.x,y:bank.y-140};
      timber(context,bank,guide,9,level);brass(context,bank.x,bank.y,10,level.id);
      rope(context,drum,guide,level.id,3);if(built)rope(context,guide,tip,level.id,3);
      pulley(context,level,guide,17,-state.progress*4);
      brass(context,hinge.x,hinge.y,13,level.id);
      if(!drums.has(id)){
        drums.add(id);
        if(driver.kind==='wind'&&driver.mechanics?.wind){
          const target=driver.mechanics.wind.target,elbow={x:drum.x,y:target.y};
          rope(context,{x:target.x,y:target.y-9},{x:elbow.x,y:elbow.y-9},level.id,3);
          rope(context,{x:target.x,y:target.y+9},{x:elbow.x,y:elbow.y+9},level.id,3);
          if(Math.abs(drum.y-target.y)>20){rope(context,{x:elbow.x-9,y:elbow.y},{x:drum.x-9,y:drum.y},level.id,3);rope(context,{x:elbow.x+9,y:elbow.y},{x:drum.x+9,y:drum.y},level.id,3);pulley(context,level,elbow,20,state.rotorAngle??0);}
        }
        pulley(context,level,drum,28,state.rotorAngle??state.progress*Math.PI*3,state.mode===1&&driver.kind==='counterweight'||!!driver.lockDeviceId&&run.devices[driver.lockDeviceId]?.mode===1);
      }
    }
  }
  for(const device of level.devices){
    if(device.kind==='lift'&&device.pivot&&device.mechanics&&visiblePoint(device,bounds,160)){
      const anchor=getDeviceAnchor(run,device),offset=(device.width??270)*.4,head=device.pivot;
      // Separate haul/return strands and a real drum lead from the crank to
      // the cabin. Their moving lengths follow the exact passenger anchor.
      rope(context,{x:device.x+45,y:device.y},{x:head.x+25,y:head.y},level.id,3);
      rope(context,{x:head.x-25,y:head.y},{x:anchor.x-offset,y:anchor.y-95},level.id,3);
      pulley(context,level,head,30,run.devices[device.id].rotorAngle??run.devices[device.id].progress*8);
    }
    if(device.kind==='pendulum'&&device.lockDeviceId&&visiblePoint(device.pivot??device,bounds,200)){
      const brake=level.devices.find(candidate=>candidate.id===device.lockDeviceId);if(!brake?.mechanics)continue;
      const anchor=getDeviceAnchor(run,brake),pivot=device.pivot??device,state=run.devices[brake.id];
      rope(context,{x:anchor.x+65,y:anchor.y+22},{x:pivot.x+32,y:pivot.y+8},level.id,2.5);
      pulley(context,level,pivot,31,run.devices[device.id].angle??0,state.mode===1);
    }
  }
}

function fan(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition,rotation:number,reduced:boolean) {
  const radius=(device.width??170)/2,cx=device.x,cy=device.y,base=floorAnchor(level,device),floor=base.y;
  context.save();
  const legFill=context.createLinearGradient(cx-radius,cy,cx+radius,floor);legFill.addColorStop(0,'#f0d9b2');legFill.addColorStop(1,'#b48e60');
  context.fillStyle=legFill;context.strokeStyle=level.id==='boucles'?level.palette.ink:'#816447';context.lineWidth=2;
  context.beginPath();context.moveTo(cx-radius*.25,cy+radius*.65);context.lineTo(base.x-radius*.34,floor);context.lineTo(base.x+radius*.34,floor);context.lineTo(cx+radius*.25,cy+radius*.65);context.closePath();context.fill();context.stroke();
  context.fillStyle='#fff1d23d';context.beginPath();context.moveTo(cx-radius*.25,cy+radius*.65);context.lineTo(base.x-radius*.34,floor);context.lineTo(base.x+radius*.08,floor);context.lineTo(cx+radius*.04,cy+radius*.65);context.closePath();context.fill();
  timber(context,{x:base.x-radius*.44,y:floor},{x:base.x+radius*.44,y:floor},12,level);
  if(floor-cy>180)timber(context,pointAt({x:cx-radius*.25,y:cy+radius*.65},{x:base.x-radius*.34,y:floor},.56),pointAt({x:cx+radius*.25,y:cy+radius*.65},{x:base.x+radius*.34,y:floor},.56),7,level);
  context.shadowColor='#4a3b2b45';context.shadowBlur=14;context.shadowOffsetY=5;
  const cavity=context.createRadialGradient(cx-radius*.2,cy-radius*.3,2,cx,cy,radius);cavity.addColorStop(0,'#75694f');cavity.addColorStop(.82,'#4c493c');cavity.addColorStop(1,'#c5a174');
  context.fillStyle=cavity;context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.fill();context.shadowBlur=0;context.shadowOffsetY=0;
  context.strokeStyle='#f4dec0';context.lineWidth=8;context.stroke();context.strokeStyle='#ab885f';context.lineWidth=1.7;context.stroke();
  if(level.id==='plis'&&assets.props){
    // The original cutout is front-facing. Its brass hub is at (320,304)
    // inside atlas cell 2: both the casing and blade rotation use that one axis.
    prop(context,assets,2,cx,cy,radius*1.72,rotation,.5,.5,{x:320,y:304});
  }else{
    context.save();context.translate(cx,cy);context.rotate(rotation);
    for(let i=0;i<4;i++){
      context.rotate(Math.PI/2);context.fillStyle=i%2?level.palette.accent:'#e7c58c';context.strokeStyle=level.palette.ink;context.lineWidth=1.6;
      context.beginPath();context.moveTo(0,0);context.quadraticCurveTo(radius*.15,-radius*.95,radius*.65,-radius*.52);context.quadraticCurveTo(radius*.75,-radius*.15,0,0);context.fill();context.stroke();
    }brass(context,0,0,radius*.14,level.id);context.restore();
  }
  context.strokeStyle='#f9e6c6';context.lineWidth=2;context.beginPath();context.arc(cx-1,cy-1,radius+.5,Math.PI*1.05,Math.PI*1.8);context.stroke();
  context.restore();
  drawWindFlow(context,level,run,device,{x:cx,y:cy},radius,1,reduced);
}

function pendulum(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  const pivot=device.pivot??device,motion=getPendulumPosition(device,run.time,run),length=device.length??190;
  if(level.id==='veilleurs'&&assets.props){
    const sheet=assets.props,cell=sheet.cells[1],radius=(device.radius??75)*1.12;
    context.save();context.translate(pivot.x,pivot.y);context.rotate(-motion.angle);
    timber(context,{x:0,y:0},{x:0,y:length-radius*.5},17,level);
    context.drawImage(sheet.image,cell.x+165,cell.y+360,280,260,-radius,length-radius*.92,radius*2,radius*1.86);
    brass(context,0,0,22,level.id);context.restore();
  }else{
    rope(context,pivot,motion,level.id,8);context.save();context.translate(motion.x,motion.y);context.rotate(-motion.angle);
    context.fillStyle=level.palette.accent;context.strokeStyle=level.palette.ink;context.lineWidth=3;context.beginPath();context.roundRect(-30,-25,60,60,18);context.fill();context.stroke();context.restore();brass(context,pivot.x,pivot.y,18,level.id);
  }
}

function control(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition,time:number,reduced:boolean) {
  const state=run.devices[device.id],automatic=device.playerControlled===false;
  if(device.kind==='wind'||device.kind==='pendulum')return;
  if(automatic){
    const driven=!!device.weightNodes?.length||level.edges.some(edge=>edge.mechanism?.drivers.includes(device.id));
    const node=level.nodes.find(node=>node.id===device.activationNodeId),at=device.weightNodes?.length?getDeviceAnchor(run,device):node??device;
    context.save();
    if(driven){
      // A stiff two-place pressure plate bears the visitors on their actual
      // walking surface. Its pawl stores their work in a visible ratchet.
      const width=190;
      context.fillStyle=level.id==='veilleurs'?'#64442b':'#b18a5b';context.strokeStyle=level.id==='boucles'?level.palette.ink:'#795737';context.lineWidth=3;
      context.beginPath();context.roundRect(at.x-width/2,at.y,width,15,5);context.fill();context.stroke();
      for(const side of [-1,1]){
        const x=at.x+side*53;context.beginPath();context.moveTo(x,at.y+16);context.lineTo(x-9,at.y+23);context.lineTo(x+9,at.y+30);context.lineTo(x,at.y+37);context.stroke();
      }
      pulley(context,level,{x:at.x+width/2+18,y:at.y+24},19,state.progress*Math.PI*.8,state.progress>.98);
      pips(context,{x:at.x,y:at.y+47},device.requiredLoad??node?.arrivalTrigger?.minVisitors??2,state.load,level,1);
    }else{
      // Arrival markers record a visit; they do not pretend to power machinery.
      context.strokeStyle=level.id==='boucles'?level.palette.ink:'#9c7849';context.lineWidth=3;
      context.beginPath();context.moveTo(at.x,at.y);context.lineTo(at.x,at.y-52);context.stroke();
      context.fillStyle=state.progress>.9?level.palette.accent:level.id==='veilleurs'?'#6e583e':'#e2caa1';
      context.beginPath();context.moveTo(at.x,at.y-52);context.lineTo(at.x+27,at.y-46);context.lineTo(at.x,at.y-36);context.closePath();context.fill();
    }
    context.restore();return;
  }
  context.save();context.translate(device.x,device.y);
  if(device.kind==='splitter'){
    const routes=level.edges.filter(edge=>edge.route?.deviceId===device.id),chosen=routes.find(edge=>edge.route?.mode===state.mode),points=chosen?.path;
    const angle=points&&points.length>1?Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x):-.25+state.mode*.5;
    timber(context,{x:0,y:0},{x:0,y:Math.max(35,floorAt(level,device)-device.y)},8,level);
    context.rotate(angle);context.fillStyle=level.id==='veilleurs'?'#ad7849':level.id==='plis'?'#f4debb':'#eabe68';context.strokeStyle=level.id==='veilleurs'?'#61452c':level.palette.ink;context.lineWidth=2;
    context.beginPath();context.moveTo(-36,-12);context.lineTo(22,-12);context.lineTo(44,0);context.lineTo(22,12);context.lineTo(-36,12);context.closePath();context.fill();context.stroke();
    context.strokeStyle=level.palette.accent;context.lineWidth=3;context.beginPath();context.moveTo(-20,0);context.lineTo(23,0);context.moveTo(16,-5);context.lineTo(24,0);context.lineTo(16,5);context.stroke();brass(context,0,0,6,level.id);
  }else if(device.kind==='lift'){
    const a=state.progress*Math.PI*4;
    brass(context,0,0,27,level.id);context.strokeStyle=level.id==='veilleurs'?'#d5aa64':level.palette.ink;context.lineWidth=6;context.lineCap='round';
    context.beginPath();context.moveTo(0,0);context.lineTo(Math.cos(a)*37,Math.sin(a)*37);context.stroke();brass(context,Math.cos(a)*37,Math.sin(a)*37,8,level.id);
  }else if(device.kind==='latch'){
    const engaged=state.mode===1;
    pulley(context,level,{x:0,y:0},23,0,engaged);
    context.strokeStyle=level.id==='veilleurs'?'#e1b667':level.palette.ink;context.lineWidth=6;context.lineCap='round';
    context.beginPath();context.moveTo(35,-35);context.lineTo(engaged?16:38,engaged?-12:-48);context.stroke();brass(context,35,-35,7,level.id);
  }else if(level.id==='veilleurs'&&assets.props&&device.kind!=='gate'){
    prop(context,assets,3,0,0,65,(state.mode?-.55:.35)+(reduced?0:Math.sin(time*2)*.009),.49);
  }else{
    brass(context,0,0,22,level.id);context.strokeStyle=level.id==='boucles'?level.palette.ink:level.id==='plis'?'#866944':'#58402b';context.lineWidth=7;context.lineCap='round';
    const angle=mix(-.75,.75,state.progress),knob={x:Math.sin(angle)*26,y:-Math.cos(angle)*26};
    context.beginPath();context.moveTo(0,3);context.lineTo(knob.x,knob.y);context.stroke();brass(context,knob.x,knob.y,9,level.id);
  }
  context.restore();
}

function barriers(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,bounds:WorldBounds) {
  const seen=new Set<string>();
  for(const edge of level.edges){
    if(edge.mechanism)continue;
    if(!edge.gates?.length||!edge.path[0]||!visiblePoint(edge.path[0],bounds))continue;
    const p=edge.path[0],key=`${p.x}:${p.y}`;if(seen.has(key))continue;seen.add(key);
    const open=edge.gates.every(gate=>gateSatisfied(run,gate));
    context.save();context.translate(p.x,p.y);context.strokeStyle=level.id==='boucles'?level.palette.ink:'#83603b';context.lineWidth=4;context.lineCap='round';
    // The crossbar opens away from the walking surface. Its foot is exactly
    // at the gated path's departure, so a waiting group has a visible cause.
    context.beginPath();context.moveTo(0,2);context.lineTo(open?-38:0,open?5:-47);context.stroke();
    context.strokeStyle=open?level.palette.glow:level.palette.accent;context.lineWidth=6;context.beginPath();context.moveTo(open?-5:0,open?5:-8);context.lineTo(open?-35:0,open?5:-43);context.stroke();brass(context,0,2,5,level.id);
    context.restore();
  }
}

export function drawMechanisms(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,bounds:WorldBounds,time:number,options:RenderOptions) {
  const reduced=options.reducedMotion??false;
  barriers(context,level,run,bounds);
  for(const device of level.devices){
    const state=run.devices[device.id];if(!state)continue;
    const body=deviceBody(level,run,device),near=visiblePoint(device,bounds,380)||visiblePoint(body.point,bounds,380);if(!near)continue;
    if(device.kind==='counterweight')authoredCounterweight(context,level,run,assets,device);
    else if(device.kind==='lift')authoredLift(context,level,run,assets,device);
    else if(device.kind==='wind'){
      const angle=fanAngle(run,device,reduced);
      if(!authoredWind(context,level,run,assets,device,angle,time,reduced))fan(context,level,run,assets,device,angle,reduced);
    }
    else if(device.kind==='pendulum')pendulum(context,level,run,assets,device);
    control(context,level,run,assets,device,time,reduced);
    const status=getDeviceStatus(run,level,device.id);
    if(device.kind==='counterweight'&&(device.requiredLoad??0)>0){
      const center=getDeviceAnchor(run,device);pips(context,{x:center.x,y:center.y+22/bounds.scale},device.requiredLoad!,status.load,level,bounds.scale);
    }else if(device.kind==='lift'){
      const capacity=level.edges.find(edge=>edge.deviceId===device.id&&edge.kind==='lift')?.capacity??3;
      pips(context,{x:body.point.x,y:body.point.y+19/bounds.scale},capacity,status.load,level,bounds.scale);
    }else if(device.kind==='splitter'){
      const branch=level.edges.find(edge=>edge.route?.deviceId===device.id&&edge.route?.mode===state.mode&&edge.maxPassages!==undefined);
      if(branch)pips(context,{x:device.x,y:device.y+24/bounds.scale},branch.maxPassages!,run.passages[branch.id]?.length??0,level,bounds.scale);
    }
    if(device.playerControlled!==false&&device.modes.length>1){
      const selected=options.selectedDevice===device.id||!!options.hover&&Math.hypot(options.hover.x-device.x,options.hover.y-device.y)<Math.max(35,24/bounds.scale);
      const radius=(device.kind==='wind'?(device.width??170)*bounds.scale/2+8:24)/bounds.scale;
      context.save();context.strokeStyle=level.palette.accent;context.lineWidth=(selected?1.8:1)/bounds.scale;
      context.globalAlpha=selected?.65:reduced?.15:.13+Math.sin(time*2+device.x)**2*.13;
      context.beginPath();context.arc(device.x,device.y,radius+(reduced?0:Math.sin(time*2+device.x)*1.5/bounds.scale),0,Math.PI*2);context.stroke();context.restore();
    }
  }
  // Small physical checkpoint pennants replace sector menus and never obstruct
  // a path. Their light turns on only after a real companion has passed.
  for(const node of level.nodes){
    if(node.kind!=='checkpoint'||!visiblePoint(node,bounds,80))continue;
    const visited=(run.visits[node.id]?.length??0)>0;
    context.save();context.strokeStyle=level.id==='veilleurs'?'#b88b58':level.palette.ink;context.lineWidth=2.5;context.beginPath();context.moveTo(node.x,node.y);context.lineTo(node.x,node.y-72);context.stroke();
    context.fillStyle=visited?level.palette.accent:level.id==='veilleurs'?'#786457':'#d5c9b3';context.beginPath();context.moveTo(node.x,node.y-72);context.lineTo(node.x+37,node.y-65);context.lineTo(node.x+26,node.y-52);context.lineTo(node.x,node.y-57);context.closePath();context.fill();
    if(visited){context.fillStyle=level.palette.glow;context.shadowColor=level.palette.glow;context.shadowBlur=10;context.beginPath();context.arc(node.x,node.y-74,3,0,Math.PI*2);context.fill();}context.restore();
  }
}
