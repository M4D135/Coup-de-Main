import type {DeviceDefinition,DeviceState,Point,RouteEdge,WorldLevel,WorldRun} from './types';

export const MECHANICS_REVISION=1;
export const MECHANICAL_GRAVITY=520;
export const WIND_DRIVE_FORCE=1300;
const TAU=Math.PI*2;
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=(value:number|undefined,fallback=0)=>Number.isFinite(value)?value!:fallback;
const copy=(point:Point):Point=>({x:point.x,y:point.y});
const magnitude=(point:Point)=>Math.hypot(point.x,point.y);

/** Force received by a wheel, not a permission flag. A wheel behind the outlet,
 * outside its cone or beyond its reach receives no force. The motor command
 * cuts the airflow immediately; stored mechanical momentum is separate. */
export function windTransfer(definition:DeviceDefinition,state:DeviceState):number {
  const wind=definition.mechanics?.wind;
  if(!wind||state.mode!==1||wind.range<=0)return 0;
  const norm=magnitude(wind.direction);if(norm<1e-8)return 0;
  const dx=wind.target.x-wind.source.x,dy=wind.target.y-wind.source.y;
  const forward=(dx*wind.direction.x+dy*wind.direction.y)/norm;
  if(forward<=0||forward>=wind.range)return 0;
  const sideways=Math.abs(dx*wind.direction.y-dy*wind.direction.x)/norm;
  const aperture=Math.max(1,wind.radius)+forward*Math.tan(clamp(wind.cone,0,Math.PI*.45));
  if(sideways>=aperture)return 0;
  const alignment=Math.max(0,1-(sideways/aperture)**2);
  const attenuation=Math.pow(1-forward/wind.range,.35);
  return Math.max(0,definition.mechanics?.driveForce??WIND_DRIVE_FORCE)*alignment*attenuation;
}

/** One point of contact is shared by drawing, hit testing and passenger feet. */
export function getDeviceAnchor(run:WorldRun,definition:DeviceDefinition):Point {
  const state=run.devices[definition.id],progress=clamp(state?.progress??0);
  const low=definition.low??definition;
  if(definition.kind==='lift'&&definition.high)return {
    x:low.x+(definition.high.x-low.x)*progress,
    y:low.y+(definition.high.y-low.y)*progress,
  };
  if(definition.mechanics&&definition.weightNodes?.length)return {
    x:low.x,y:low.y+(definition.mechanics.travel??88)*progress+finite(state?.anchorOffset),
  };
  return copy(low);
}

function rotate(points:Point[],pivot:Point,angle:number):Point[] {
  const sine=Math.sin(angle),cosine=Math.cos(angle);
  return points.map(point=>({x:pivot.x+(point.x-pivot.x)*cosine-(point.y-pivot.y)*sine,
    y:pivot.y+(point.x-pivot.x)*sine+(point.y-pivot.y)*cosine}));
}

function splitPath(points:Point[]):[Point[],Point[]] {
  const lengths=points.slice(1).map((point,index)=>Math.hypot(point.x-points[index].x,point.y-points[index].y));
  const half=lengths.reduce((sum,length)=>sum+length,0)/2;
  let before=0;
  for(let index=0;index<lengths.length;index++){
    const length=lengths[index];
    if(before+length>=half){
      const fraction=length?(half-before)/length:0,a=points[index],b=points[index+1];
      const centre={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
      return [[...points.slice(0,index+1).map(copy),centre],[copy(centre),...points.slice(index+1).map(copy)]];
    }
    before+=length;
  }
  return [points.map(copy),[copy(points.at(-1)!)]];
}

/** Deck leaves stay separate until their free ends meet. Traversal order is
 * preserved: the second leaf runs from its free end towards the far bank. */
export function getSupportPaths(run:WorldRun,_level:WorldLevel,edge:RouteEdge,points:Point[]):Point[][] {
  const linkage=edge.mechanism;
  if(!linkage||points.length<2)return [points.map(copy)];
  const angle=(index:number)=>linkage.restAngle*(1-clamp(run.devices[linkage.drivers[index]]?.progress??0));
  if(linkage.drivers.length<2)return [rotate(points,points[0],angle(0))];
  const [left,right]=splitPath(points);
  return [rotate(left,left[0],angle(0)),rotate(right,right.at(-1)!,-angle(1))];
}

/** Alignment and slow contact open a deck, independently of a switch label. */
export function supportReady(run:WorldRun,level:WorldLevel,edge:RouteEdge):boolean {
  if(!edge.mechanism)return true;
  if(!edge.mechanism.drivers.length)return false;
  if(edge.mechanism.drivers.some(id=>{
    const state=run.devices[id];return !state||state.progress<.995||Math.abs(state.velocity??0)>.035;
  }))return false;
  const paths=getSupportPaths(run,level,edge,edge.path);
  const first=paths[0],last=paths.at(-1)!;
  if(!first.length||!last.length)return false;
  const gap=paths.length>1?Math.hypot(first.at(-1)!.x-last[0].x,first.at(-1)!.y-last[0].y)
    :Math.hypot(last.at(-1)!.x-edge.path.at(-1)!.x,last.at(-1)!.y-edge.path.at(-1)!.y);
  return gap<=Math.max(5,level.creatureHeight*.045);
}

export function initializeMechanism(definition:DeviceDefinition,state:DeviceState,time=0):void {
  if(!definition.mechanics)return;
  state.velocity=finite(state.velocity);state.rotorAngle=finite(state.rotorAngle);
  state.rotorVelocity=finite(state.rotorVelocity);state.receivedForce=finite(state.receivedForce);
  state.anchorOffset=finite(state.anchorOffset);
  if(definition.kind==='pendulum'){
    const length=Math.max(20,definition.length??190),phase=definition.phase??0;
    const legacyAngle=Math.sin(time/(definition.duration??7)*TAU+phase)*.95;
    if(!Number.isFinite(state.angle))state.angle=legacyAngle;
    if(!Number.isFinite(state.angularVelocity)){
      const inertia=Math.max(.05,definition.mechanics?.inertia??1);
      const energySpeed=Math.sqrt(Math.max(0,2*MECHANICAL_GRAVITY/length/inertia*(Math.cos(state.angle!)-Math.cos(.95))));
      state.angularVelocity=Math.sign(Math.cos(time/(definition.duration??7)*TAU+phase))*energySpeed;
    }
  }
}

function integratePosition(state:DeviceState,acceleration:number,damping:number,dt:number,maximum=1):void {
  let velocity=finite(state.velocity),position=clamp(state.progress);
  velocity=(velocity+acceleration*dt)/(1+Math.max(0,damping)*dt);
  const next=position+velocity*dt;
  if(next<=0){position=0;velocity=Math.max(0,velocity);}
  else if(next>=maximum){position=maximum;velocity=Math.min(0,velocity);}
  else position=next;
  state.progress=position;state.velocity=clamp(velocity,-4,4);
}

export function pendulumParked(definition:DeviceDefinition,state:DeviceState):boolean {
  return Math.abs(state.angle??0)>=.7&&Math.abs(state.angularVelocity??0)<1e-7;
}

/** An armed ratchet waits for an already safe angle and removes momentum.
 * It never pulls a pendulum towards an artificial parking position. */
function pendulumTick(definition:DeviceDefinition,angle:number,velocity:number,dt:number,armed:boolean):{angle:number;velocity:number;parked:boolean} {
  if(armed&&Math.abs(angle)>=.7)return {angle,velocity:0,parked:true};
  const length=Math.max(20,definition.length??190);
  const acceleration=-MECHANICAL_GRAVITY/length/Math.max(.05,definition.mechanics?.inertia??1)*Math.sin(angle);
  velocity=(velocity+acceleration*dt)/(1+Math.max(0,definition.mechanics?.damping??0)*dt);
  angle+=velocity*dt;
  if(armed&&Math.abs(angle)>=.7)return {angle,velocity:0,parked:true};
  return {angle,velocity,parked:false};
}

export function predictPendulum(definition:DeviceDefinition,state:DeviceState,timeDelta:number,armed:boolean):{angle:number;angularVelocity:number;parked:boolean} {
  const initial={...state};initializeMechanism(definition,initial);
  let angle=finite(initial.angle),velocity=finite(initial.angularVelocity),remaining=Math.max(0,Math.min(30,timeDelta)),parked=false;
  if(remaining===0)return {angle,angularVelocity:velocity,parked:armed&&pendulumParked(definition,initial)};
  while(remaining>1e-9){const dt=Math.min(1/60,remaining),next=pendulumTick(definition,angle,velocity,dt,armed);angle=next.angle;velocity=next.velocity;parked=next.parked;remaining-=dt;}
  return {angle,angularVelocity:velocity,parked};
}

/** A force-based update of one constrained local mechanism. Other apparatus
 * can contribute only through the linkage declared in the same tableau. */
export function advanceMechanism(run:WorldRun,level:WorldLevel,definition:DeviceDefinition,dt:number):void {
  const state=run.devices[definition.id],physics=definition.mechanics;
  if(!state||!physics)return;
  initializeMechanism(definition,state);
  if(dt<=0)return;
  if(definition.kind==='pendulum'){
    const brake=definition.lockDeviceId?run.devices[definition.lockDeviceId]:undefined;
    const next=predictPendulum(definition,state,dt,brake?.mode===1);
    state.angle=next.angle;state.angularVelocity=next.angularVelocity;state.progress=(Math.sin(next.angle)+1)/2;
    return;
  }
  const isPressure=definition.kind==='gate'&&!!definition.weightNodes?.length;
  if(definition.kind==='counterweight'||isPressure){
    const pendulum=isPressure?level.devices.find(candidate=>candidate.kind==='pendulum'&&candidate.lockDeviceId===definition.id&&candidate.mechanics):undefined;
    const caught=pendulum?pendulumParked(pendulum,run.devices[pendulum.id]):true;
    if(state.mode===1&&(!pendulum||state.progress>=.999)){state.velocity=0;return;}
    const counterMass=Math.max(.1,physics.mass??((definition.requiredLoad??2)-.45));
    // An armed brake's small final travel is stored by its loaded ratchet.
    // This also carries the earned work of an earlier saved brake command.
    const load=pendulum&&state.mode===1?Math.max(state.load,definition.requiredLoad??2):state.load;
    const travel=Math.max(1,physics.travel??88),mass=Math.max(.2,counterMass+load);
    const acceleration=(load-counterMass)*MECHANICAL_GRAVITY/(mass*travel);
    integratePosition(state,acceleration,physics.damping??2.8,dt,pendulum&&!caught?.98:1);
    if(physics.automaticRatchet&&state.load>=(definition.requiredLoad??2)){
      if(pendulum&&state.progress>=.975)state.mode=1;
      if(state.progress>=.999){state.progress=1;state.velocity=0;state.mode=1;}
    }
    return;
  }
  if(definition.kind==='wind'){
    state.receivedForce=windTransfer(definition,state);
    const lock=definition.lockDeviceId?run.devices[definition.lockDeviceId]:undefined;
    const retained=lock?.mode===1||(physics.automaticRatchet&&state.progress>=.999);
    if(retained){state.velocity=0;state.rotorVelocity=0;return;}
    const travel=Math.max(1,physics.travel??180),mass=Math.max(.2,physics.mass??1.5);
    const acceleration=(state.receivedForce-mass*MECHANICAL_GRAVITY*.25)/(mass*travel);
    integratePosition(state,acceleration,physics.damping??3.6,dt);
    state.rotorVelocity=finite(state.velocity)*TAU*2.5;
    state.rotorAngle=finite(state.rotorAngle)+state.rotorVelocity*dt;
    return;
  }
  if(definition.kind==='lift'){
    const baseMass=Math.max(.2,physics.mass??1.8),mass=baseMass+state.load;
    const travel=Math.max(1,Math.hypot((definition.high?.x??definition.x)-(definition.low?.x??definition.x),(definition.high?.y??definition.y)-(definition.low?.y??definition.y)));
    const handForce=state.mode===1?(physics.driveForce??(baseMass+3)*MECHANICAL_GRAVITY*1.8):0;
    const acceleration=(handForce-mass*MECHANICAL_GRAVITY)/(mass*travel);
    integratePosition(state,acceleration,physics.damping??3.1,dt);
    state.receivedForce=handForce;state.rotorVelocity=finite(state.velocity)*TAU*2;
    state.rotorAngle=finite(state.rotorAngle)+state.rotorVelocity*dt;
  }
}
