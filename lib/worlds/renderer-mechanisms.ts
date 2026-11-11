import {gateSatisfied,getDeviceStatus,getPendulumPosition} from './engine';
import type {WorldAssets,RenderOptions} from './renderer';
import type {DeviceDefinition,Point,WorldLevel,WorldRun} from './types';
import {visiblePoint,type WorldBounds} from './renderer-landscape';
import {brass,clamp,mix,pointAt,prop,rope,trace} from './renderer-primitives';

const fanMotion=new WeakMap<WorldRun,Map<string,{angle:number;speed:number;time:number}>>();

function fanAngle(run:WorldRun,device:DeviceDefinition,reduced:boolean):number {
  let fans=fanMotion.get(run);if(!fans){fans=new Map();fanMotion.set(run,fans);}
  const previous=fans.get(device.id)??{angle:0,speed:0,time:run.time},dt=clamp(run.time-previous.time,0,.07);
  const powered=run.devices[device.id]?.mode===1;
  previous.speed+=(powered?3.2-previous.speed:-previous.speed)*(1-Math.exp(-dt*7));
  if(!reduced)previous.angle=(previous.angle+previous.speed*dt)%(Math.PI*2);
  previous.time=run.time;fans.set(device.id,previous);return reduced?0:previous.angle;
}

function loadCentre(level:WorldLevel,device:DeviceDefinition):Point {
  return device.low??level.nodes.find(node=>device.weightNodes?.includes(node.id))??device;
}

export function deviceBody(level:WorldLevel,run:WorldRun,device:DeviceDefinition):{point:Point;width:number;height:number} {
  if(device.kind==='lift'&&device.low&&device.high)return {point:pointAt(device.low,device.high,run.devices[device.id]?.progress??0),width:device.width??144,height:110};
  if(device.kind==='counterweight')return {point:loadCentre(level,device),width:device.width??240,height:65};
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

/** All dependencies are actual engine data; a cable joins the controlling
 * object and the gate/platform it powers. Long cables remain behind the action. */
export function drawMechanicalConnections(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,bounds:WorldBounds,time:number,reduced:boolean) {
  const links:{from:Point;to:Point;active:boolean;key:string}[]=[],keys=new Set<string>();
  const add=(from:Point,to:Point,active:boolean,key:string)=>{
    if(keys.has(key)||Math.hypot(from.x-to.x,from.y-to.y)<48)return;
    if(Math.max(from.x,to.x)<bounds.left||Math.min(from.x,to.x)>bounds.right)return;
    keys.add(key);links.push({from,to,active,key});
  };
  for(const device of level.devices){
    for(const id of [device.powerDeviceId,device.lockDeviceId,device.holdOpenDeviceId,...(device.gates??[]).map(gate=>gate.deviceId)]){
      if(!id)continue;const controller=level.devices.find(item=>item.id===id);if(controller)add(controller,device,(run.devices[id]?.progress??0)>.9,[id,device.id].sort().join(':'));
    }
    if(device.activationNodeId){const node=level.nodes.find(item=>item.id===device.activationNodeId);if(node)add(node,device,(run.devices[device.id]?.progress??0)>.9,`relay:${device.id}`);}
  }
  for(const edge of level.edges)for(const gate of edge.gates??[]){
    const controller=level.devices.find(device=>device.id===gate.deviceId),target=edge.path[0];
    if(controller&&target)add(controller,target,gateSatisfied(run,gate),`${gate.deviceId}:${target.x}:${target.y}`);
  }
  context.save();context.lineJoin='round';context.lineCap='round';
  for(const link of links){
    const long=Math.abs(link.to.x-link.from.x)>900;
    const y=long?112+Math.abs(link.from.x%3)*7:Math.min(link.from.y,link.to.y)-64;
    const points=[link.from,{x:link.from.x,y},{x:link.to.x,y},link.to];
    trace(context,points);context.strokeStyle=level.id==='boucles'?'#344965':level.id==='plis'?'#927b5d':'#714e35';context.globalAlpha=long?.24:.4;context.lineWidth=3;context.stroke();
    context.strokeStyle=link.active?level.palette.accent:level.id==='veilleurs'?'#ac8659':'#c6b28d';context.globalAlpha=link.active?.7:.46;context.lineWidth=1.2;context.stroke();
    if(link.active&&!reduced){
      const span=Math.abs(link.to.x-link.from.x),direction=Math.sign(link.to.x-link.from.x)||1;
      for(let index=0;index<Math.ceil(span/400);index++){
        const travelled=(time*44+index*400)%Math.max(1,span),x=link.from.x+direction*travelled;if(x<bounds.left||x>bounds.right)continue;
        context.globalAlpha=.66;context.fillStyle=level.palette.accent;context.beginPath();context.arc(x,y,2.4,0,Math.PI*2);context.fill();
      }
    }
    context.globalAlpha=.65;context.fillStyle=level.palette.accent;
    for(const point of [link.from,link.to]){context.beginPath();context.arc(point.x,point.y,3.3,0,Math.PI*2);context.fill();}
  }
  context.restore();
}

function fan(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,device:DeviceDefinition,progress:number,rotation:number,time:number,reduced:boolean) {
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
  if(progress>.1&&!reduced){
    context.strokeStyle=level.id==='veilleurs'?'#f4d4a0':'#fcf1dc';context.lineWidth=2;context.globalAlpha=.35*progress;
    for(let i=0;i<3;i++){
      const start=cx+radius+12+((time*65+i*35)%85),y=cy+(i-1)*31;
      context.beginPath();context.moveTo(start,y);context.bezierCurveTo(start+20,y-9,start+52,y+8,start+84,y-5);context.stroke();
    }
  }
  context.restore();
}

function counterweight(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  const center=loadCentre(level,device),width=device.width??240,progress=run.devices[device.id]?.progress??0;
  const pivot=device.pivot??{x:center.x,y:center.y-210},secondary={x:center.x+width*.8,y:center.y-75-progress*95};
  timber(context,{x:center.x-width*.68,y:center.y+32},{x:center.x-width*.68,y:pivot.y},15,level);
  timber(context,{x:center.x-width*.68,y:pivot.y},{x:secondary.x+24,y:pivot.y},17,level);
  for(const side of [-1,1])rope(context,{x:center.x+side*width*.23,y:pivot.y+8},{x:center.x+side*width*.43,y:center.y-9},level.id,2.5);
  if(level.id==='plis'){
    context.fillStyle='#e5cfaa';context.strokeStyle='#80633e';context.lineWidth=2;context.beginPath();context.moveTo(center.x-width/2,center.y);context.lineTo(center.x+width/2,center.y);context.lineTo(center.x+width*.42,center.y+27);context.lineTo(center.x-width*.42,center.y+27);context.closePath();context.fill();context.stroke();
  }else if(!prop(context,assets,0,center.x,center.y,width,0,level.id==='veilleurs'?.28:.37)){
    context.fillStyle='#d0a454';context.fillRect(center.x-width/2,center.y,width,22);
  }
  rope(context,{x:secondary.x,y:pivot.y+7},{x:secondary.x,y:secondary.y-55},level.id);
  if(level.id==='boucles')prop(context,assets,1,secondary.x,secondary.y,80,0,.84);
  else if(level.id==='veilleurs')prop(context,assets,0,secondary.x,secondary.y,80,0,.28);
  else {context.fillStyle='#ba9165';context.strokeStyle='#73583e';context.lineWidth=2;context.fillRect(secondary.x-25,secondary.y-40,50,40);context.strokeRect(secondary.x-25,secondary.y-40,50,40);}
  brass(context,secondary.x,pivot.y,17,level.id);
}

function lift(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  if(!device.low||!device.high)return;
  const progress=run.devices[device.id]?.progress??0,position=pointAt(device.low,device.high,progress),width=device.width??144;
  const pivot=device.pivot??{x:device.high.x,y:device.high.y-145};
  const bottom=Math.max(device.low.y,device.high.y);
  for(const side of [-1,1]){
    const a={x:pivot.x+side*(width*.62),y:pivot.y},b={x:device.low.x+side*(width*.62),y:bottom+35};
    timber(context,a,b,10,level);
  }
  timber(context,{x:pivot.x-width*.68,y:pivot.y},{x:pivot.x+width*.68,y:pivot.y},14,level);
  rope(context,pivot,{x:position.x,y:position.y-72},level.id,3);
  brass(context,pivot.x,pivot.y,18,level.id);
  if(!prop(context,assets,level.id==='veilleurs'?2:1,position.x,position.y,width,0,level.id==='veilleurs'?.8:.84)){
    context.fillStyle='#c19a69';context.fillRect(position.x-width/2,position.y,width,20);
  }
}

function pendulum(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition) {
  const pivot=device.pivot??device,motion=getPendulumPosition(device,run.time,run),length=device.length??190;
  if(level.id==='veilleurs'&&assets.props){
    const sheet=assets.props,cell=sheet.cells[1],height=cell.bodyHeight,pivotOffset=height*.085,bobOffset=height*.80,scale=length/(bobOffset-pivotOffset);
    context.save();context.translate(pivot.x,pivot.y);context.rotate(-motion.angle);
    context.drawImage(sheet.image,cell.x,cell.y,cell.width,cell.height,-cell.centerX*scale,-(cell.baseline-height+pivotOffset)*scale,cell.width*scale,cell.height*scale);context.restore();
  }else{
    rope(context,pivot,motion,level.id,8);context.save();context.translate(motion.x,motion.y);context.rotate(-motion.angle);
    context.fillStyle=level.palette.accent;context.strokeStyle=level.palette.ink;context.lineWidth=3;context.beginPath();context.roundRect(-30,-25,60,60,18);context.fill();context.stroke();context.restore();brass(context,pivot.x,pivot.y,18,level.id);
  }
}

function control(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,device:DeviceDefinition,time:number,reduced:boolean) {
  const state=run.devices[device.id],automatic=device.playerControlled===false;
  if(device.kind==='wind'||device.kind==='pendulum')return;
  context.save();context.translate(device.x,device.y);
  if(device.kind==='splitter'){
    const routes=level.edges.filter(edge=>edge.route?.deviceId===device.id),chosen=routes.find(edge=>edge.route?.mode===state.mode),points=chosen?.path;
    const angle=points&&points.length>1?Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x):-.25+state.mode*.5;
    timber(context,{x:0,y:0},{x:0,y:Math.max(35,floorAt(level,device)-device.y)},8,level);
    context.rotate(angle);context.fillStyle=level.id==='veilleurs'?'#ad7849':level.id==='plis'?'#f4debb':'#eabe68';context.strokeStyle=level.id==='veilleurs'?'#61452c':level.palette.ink;context.lineWidth=2;
    context.beginPath();context.moveTo(-36,-12);context.lineTo(22,-12);context.lineTo(44,0);context.lineTo(22,12);context.lineTo(-36,12);context.closePath();context.fill();context.stroke();
    context.strokeStyle=level.palette.accent;context.lineWidth=3;context.beginPath();context.moveTo(-20,0);context.lineTo(23,0);context.moveTo(16,-5);context.lineTo(24,0);context.lineTo(16,5);context.stroke();brass(context,0,0,6,level.id);
  }else if(automatic){
    context.fillStyle=level.id==='veilleurs'?'#51402c':'#d9c39d';context.strokeStyle=level.id==='boucles'?level.palette.ink:'#7e6342';context.lineWidth=2;
    context.beginPath();context.moveTo(0,-27);context.lineTo(23,-4);context.lineTo(17,25);context.lineTo(-17,25);context.lineTo(-23,-4);context.closePath();context.fill();context.stroke();
    context.fillStyle=state.progress>.9?level.palette.accent:level.id==='veilleurs'?'#352933':'#a9a69a';
    if(state.progress>.9){context.shadowColor=level.palette.accent;context.shadowBlur=12;}context.beginPath();context.arc(0,-3,9,0,Math.PI*2);context.fill();context.shadowBlur=0;
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
    if(device.kind==='counterweight')counterweight(context,level,run,assets,device);
    else if(device.kind==='lift')lift(context,level,run,assets,device);
    else if(device.kind==='wind')fan(context,level,assets,device,state.mode===1?state.progress:0,fanAngle(run,device,reduced),time,reduced);
    else if(device.kind==='pendulum')pendulum(context,level,run,assets,device);
    control(context,level,run,assets,device,time,reduced);
    const status=getDeviceStatus(run,level,device.id);
    if(device.kind==='counterweight'&&(device.requiredLoad??0)>0){
      const center=loadCentre(level,device);pips(context,{x:center.x,y:center.y+22/bounds.scale},device.requiredLoad!,status.load,level,bounds.scale);
    }else if(device.kind==='lift'){
      const capacity=level.edges.find(edge=>edge.deviceId===device.id&&edge.kind==='lift')?.capacity??3;
      pips(context,{x:body.point.x,y:body.point.y+19/bounds.scale},capacity,status.load,level,bounds.scale);
    }else if(device.activationNodeId){
      const node=level.nodes.find(item=>item.id===device.activationNodeId),required=node?.arrivalTrigger?.minVisitors??2;
      pips(context,{x:device.x,y:device.y+35/bounds.scale},required,run.visits[device.activationNodeId]?.length??0,level,bounds.scale);
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
