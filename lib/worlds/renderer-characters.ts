import type {WorldAssets} from './renderer';
import type {Creature,WorldLevel,WorldRun} from './types';
import {noise,visiblePoint,type WorldBounds} from './renderer-landscape';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const cycle=(value:number,length:number)=>(value%length+length)%length;

/** Animation is keyed to travelled distance. Feet do not keep walking when the
 * simulation queues a companion, and the contact baseline never bobs in idle. */
export function drawCompanions(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,bounds:WorldBounds,time:number,reduced:boolean) {
  const units=run.units.filter(unit=>unit.state!=='queued'&&visiblePoint(unit,bounds,100)).sort((a,b)=>a.y-b.y||a.id-b.id);
  for(const unit of units)drawCompanion(context,level,run,assets,unit,time,reduced);
}

function drawCompanion(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,unit:Creature,time:number,reduced:boolean) {
  const saved=unit.state==='saved',lost=unit.state==='lost',moving=unit.state==='walking',waiting=unit.state==='waiting',riding=unit.state==='riding';
  const age=saved?run.time-(unit.savedAt??run.time):lost?run.time-(unit.lostAt??run.time):0;
  if(saved&&age>1.65||lost&&age>1.8)return;
  const characterSize=level.creatureHeight,stride=unit.walkTime*level.pace/41,seed=unit.id*17.3+unit.variant*.61;
  const stridePhase=cycle(stride,1),idlePhase=cycle(time+seed,8.7);
  const neighbour=waiting&&unit.waitTime>3?run.units.find(other=>other.id!==unit.id&&other.state==='waiting'&&Math.abs(other.x-unit.x)<115&&Math.abs(other.y-unit.y)<35):undefined;
  const greeting=!reduced&&!!neighbour&&idlePhase>6.9&&idlePhase<7.5;
  const lookBack=!reduced&&!!neighbour&&idlePhase>5.4&&idlePhase<6.5;
  const facing=lookBack?(neighbour!.x<unit.x?-1:1):unit.direction;
  const frame=saved||greeting?7:moving?Math.floor(stridePhase*6):6;
  const cell=assets.sprites.cells[frame];if(!cell)return;
  const pixelScale=characterSize/assets.sprites.referenceHeight;
  const sway=reduced?0:moving?Math.sin(stridePhase*Math.PI*2)*.012:Math.sin(time*1.9+seed)*.008;
  const anticipation=!reduced&&waiting&&unit.waitTime<.45?Math.sin(unit.waitTime/.45*Math.PI):0;
  const squash=reduced?0:moving?Math.cos(stridePhase*Math.PI*4)*.017:anticipation*.055+Math.sin(time*2.1+seed)*.009;
  const savedHop=saved&&!reduced?Math.sin(clamp(age/.68,0,1)*Math.PI)*characterSize*.36:0;
  const alpha=saved?clamp((1.65-age)/.65,0,1):lost?clamp(1-age*.55,0,1):1;
  const blinkPhase=cycle(time+noise(seed)*7,3.8+noise(seed+4)*2.7);
  const blink=!reduced&&!saved&&blinkPhase<.14;

  context.save();context.globalAlpha=alpha;
  if(level.id==='veilleurs'){
    const glow=context.createRadialGradient(unit.x,unit.y-characterSize*.48,1,unit.x,unit.y-characterSize*.48,characterSize*.72);
    glow.addColorStop(0,'#ffc96723');glow.addColorStop(1,'#ffc96700');context.fillStyle=glow;context.fillRect(unit.x-characterSize,unit.y-characterSize*1.4,characterSize*2,characterSize*1.8);
  }
  if(!lost){
    context.fillStyle=level.id==='veilleurs'?'#09070b70':level.id==='plis'?'#58433338':'#25365a1e';
    context.beginPath();context.ellipse(unit.x,unit.y+2,characterSize*(.27-savedHop/characterSize*.12),characterSize*.044,0,0,Math.PI*2);context.fill();
  }
  context.translate(unit.x,unit.y-savedHop);
  // Every deformation is around the foot contact, not the sprite centre.
  context.scale(facing*(1+squash*.55),1-squash);
  if(lost)context.rotate(age*.9*unit.direction);
  else context.transform(1,0,sway,1,0,0);
  if(level.id==='plis'){
    if(unit.variant===1)context.filter='sepia(0.45) saturate(2.35) hue-rotate(-20deg) brightness(0.94)';
    else if(unit.variant===3)context.filter='sepia(1) saturate(1.15) hue-rotate(138deg) brightness(0.68)';
  }
  context.drawImage(assets.sprites.image,cell.x,cell.y,cell.width,cell.height,-cell.centerX*pixelScale,-cell.baseline*pixelScale,cell.width*pixelScale,cell.height*pixelScale);
  // A tiny eyelid follows the original printed eyes. It is intentionally kept
  // within their own area, preserving the approved face and material texture.
  if(blink&&frame!==7){
    const w=cell.bodyWidth*pixelScale,h=cell.bodyHeight*pixelScale;
    const eyeY=level.id==='boucles'?-h*.84:level.id==='plis'?-h*.66:-h*.62;
    const eyes=level.id==='boucles'?[w*.16,w*.29]:level.id==='plis'?[w*.10,w*.24]:[w*.18,w*.31];
    context.lineCap='round';
    for(const x of eyes){
      context.strokeStyle=level.id==='boucles'?'#25395f':level.id==='plis'?'#ead2ae':'#d7b28a';
      context.lineWidth=level.id==='boucles'?characterSize*.092:level.id==='plis'?characterSize*.065:characterSize*.08;
      context.beginPath();context.moveTo(x-characterSize*.025,eyeY);context.lineTo(x+characterSize*.025,eyeY);context.stroke();
      context.strokeStyle=level.id==='veilleurs'?'#fff0b8':level.id==='boucles'?'#f5e5c8':'#4c3a28';context.lineWidth=characterSize*.016;
      context.beginPath();context.moveTo(x-characterSize*.032,eyeY);context.quadraticCurveTo(x,eyeY+characterSize*.02,x+characterSize*.032,eyeY);context.stroke();
    }
  }
  context.restore();

  if(!reduced&&(greeting||riding&&cycle(time+seed,6)<.65)){
    context.save();context.strokeStyle=level.palette.accent;context.lineWidth=1.6;context.globalAlpha=.65;
    const y=unit.y-characterSize-5;
    for(let i=0;i<2;i++){const x=unit.x+facing*(characterSize*.32+i*5);context.beginPath();context.moveTo(x,y+4);context.lineTo(x+facing*3,y-3-i*2);context.stroke();}
    context.restore();
  }
  if(saved&&!reduced&&age<1.2){
    context.save();context.globalAlpha=clamp(1-age/1.2,0,1);context.fillStyle=level.palette.accent;
    for(let i=0;i<5;i++){
      const direction=(i/5)*Math.PI*2+noise(unit.id)*Math.PI;
      const radius=14+age*42,x=unit.x+Math.cos(direction)*radius,y=unit.y-characterSize*.65+Math.sin(direction)*radius-age*24;
      context.save();context.translate(x,y);context.rotate(direction+age*2);context.fillRect(-2,-1.5,4,3);context.restore();
    }
    context.restore();
  }
}
