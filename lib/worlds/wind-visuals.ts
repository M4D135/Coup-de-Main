import type {DeviceDefinition,Point,WorldLevel,WorldRun} from './types';
import {clamp} from './renderer-primitives';
import {TABLEAU_HEIGHT,TABLEAU_WIDTH,tableauIndex} from './tableaux';

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
  return !reduced&&state?.mode===1?clamp(state.progress,0,1):0;
}

export function drawWindFlow(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,device:DeviceDefinition,
  center:Point,radius:number,direction:-1|1,reduced:boolean) {
  const strength=windFlowStrength(run,device,reduced);if(strength<=.1)return;
  // Simulation time freezes on pause. The UI's wall clock must never advance
  // wind while its blades and the companions are stopped.
  const time=run.time;
  context.save();context.strokeStyle=level.id==='veilleurs'?'#f4d4a0':'#fff4de';context.lineWidth=2.8;
  context.lineCap='round';context.globalAlpha=.35*strength;
  for(let i=0;i<3;i++){
    const start=center.x+direction*(radius+12+((time*65+i*35)%85)),y=center.y+(i-1)*Math.min(31,radius*.42);
    context.beginPath();context.moveTo(start,y);
    context.bezierCurveTo(start+direction*24,y-9,start+direction*61,y+8,start+direction*96,y-5);context.stroke();
  }
  context.restore();
}
