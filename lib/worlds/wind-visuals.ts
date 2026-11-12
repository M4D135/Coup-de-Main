import type {DeviceDefinition,Point,WorldLevel,WorldRun} from './types';
import {clamp} from './renderer-primitives';
import {TABLEAU_HEIGHT,TABLEAU_WIDTH,tableauIndex} from './tableaux';
import {windTransfer} from './mechanics';

export interface InsetWindRotor {
  center:Point;
  radius:number;
  scaleX:number;
  shearY:number;
  direction:-1|1;
  material:'paper'|'brass';
}

/** These are the open faces of the existing complete paintings, not new
 * simulation positions. Their rims must remain in front of every blade. */
export function insetWindRotor(level:WorldLevel,device:DeviceDefinition):InsetWindRotor|null {
  const index=tableauIndex(device.x),sx=TABLEAU_WIDTH/1672,sy=TABLEAU_HEIGHT/941;
  const at=(x:number,y:number,radius:number,scaleX:number,shearY:number,direction:-1|1,material:'paper'|'brass'):InsetWindRotor=>({
    center:{x:index*TABLEAU_WIDTH+x*sx,y:y*sy},radius:radius*sy,scaleX,shearY,direction,material,
  });
  if(level.id==='plis'&&index===0)return at(340,282,63,.62,-.03,1,'paper');
  if(level.id==='plis'&&index===1)return at(1147,548,45,-.70,.04,-1,'paper');
  if(level.id==='veilleurs'&&index===3)return at(428,394,62,.70,-.04,1,'brass');
  return null;
}

/** progress can remain at one when a cleat holds the raised support. Only the
 * selected powered mode represents airflow; retained mechanical height does not. */
export function windFlowStrength(run:WorldRun,device:DeviceDefinition,reduced:boolean):number {
  const state=run.devices[device.id];
  if(reduced||state?.mode!==1)return 0;
  return device.mechanics?.wind?clamp(windTransfer(device,state)/(device.mechanics.driveForce??1300),0,1):clamp(state.progress,0,1);
}

export function windSourcePose(level:WorldLevel,device:DeviceDefinition){
  const inset=insetWindRotor(level,device),rig=device.mechanics?.wind;if(!inset||!rig)return null;
  const aim=level.id==='plis'&&device.id==='s0:wind'?rig.source:rig.target;
  const heading=Math.atan2(aim.y-inset.center.y,aim.x-inset.center.x),depth=inset.radius*.58;
  return {...inset,heading,mouth:{x:inset.center.x+Math.cos(heading)*depth,y:inset.center.y+Math.sin(heading)*depth}};
}

/** The first inlet reaches a real deflector before it turns toward the mill.
 * All other jets have one source and one receiver on the same tableau. */
export function windFlowRoute(level:WorldLevel,device:DeviceDefinition):Point[]{
  const rig=device.mechanics?.wind;if(!rig)return [];
  const source=windSourcePose(level,device);
  return source&&level.id==='plis'&&device.id==='s0:wind'?[source.mouth,rig.source,rig.target]:[source?.mouth??rig.source,rig.target];
}

export function drawWindFlow(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,device:DeviceDefinition,
  center:Point,radius:number,direction:-1|1,reduced:boolean) {
  const strength=windFlowStrength(run,device,reduced);if(strength<=.1)return;
  // Simulation time freezes on pause. The UI's wall clock must never advance
  // wind while its blades and the companions are stopped.
  const time=run.time;
  context.save();context.strokeStyle=level.id==='veilleurs'?'#f4d4a0':'#fff4de';context.lineWidth=2.8;
  context.lineCap='round';context.globalAlpha=.35*strength;
  const route=windFlowRoute(level,device);
  if(route.length>1){
    for(let segment=1;segment<route.length;segment++){
      const a=route[segment-1],b=route[segment],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
      for(let lane=-1;lane<=1;lane++){
        const spread=lane*Math.min(27,(device.mechanics?.wind?.radius??60)*.4),ripple=Math.sin(time*4+lane+segment)*6;
        context.beginPath();context.moveTo(a.x+nx*spread,a.y+ny*spread);
        context.bezierCurveTo(a.x+dx*.3+nx*(spread+ripple),a.y+dy*.3+ny*(spread+ripple),a.x+dx*.72+nx*(spread-ripple),a.y+dy*.72+ny*(spread-ripple),b.x+nx*spread*.65,b.y+ny*spread*.65);context.stroke();
        const flight=((time*1.3+lane*.28)%1+1)%1,t0=clamp(flight,0,.93),t1=Math.min(1,t0+.065);
        context.globalAlpha=.62*strength;context.beginPath();context.moveTo(a.x+dx*t0+nx*spread,a.y+dy*t0+ny*spread);
        context.lineTo(a.x+dx*t1+nx*spread,a.y+dy*t1+ny*spread);context.stroke();context.globalAlpha=.35*strength;
      }
    }
  }else for(let i=0;i<3;i++){
      const start=center.x+direction*(radius+12+((time*65+i*35)%85)),y=center.y+(i-1)*Math.min(31,radius*.42);
      context.beginPath();context.moveTo(start,y);
      context.bezierCurveTo(start+direction*24,y-9,start+direction*61,y+8,start+direction*96,y-5);context.stroke();
  }
  context.restore();
}
