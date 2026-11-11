import type {WorldAssets} from './renderer';
import type {Creature,WorldLevel,WorldRun} from './types';
import {noise,visiblePoint,type WorldBounds} from './renderer-landscape';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const cycle=(value:number,length:number)=>(value%length+length)%length;
const pulse=(value:number)=>value>0&&value<1?Math.sin(value*Math.PI):0;
type MoodKind='hello'|'startle'|'relief';
type Mood={kind:MoodKind;start:number;duration:number;facing?:-1|1};
type RememberedUnit={state:Creature['state'];wait:number;direction:-1|1;reactedAt:number};
type AnimationBook={time:number;runTime:number;moods:Map<number,Mood>;units:Map<number,RememberedUnit>;devices:Map<string,{mode:number;charged:boolean}>};
const books=new WeakMap<WorldRun,AnimationBook>();

function animationBook(run:WorldRun):AnimationBook {
  let book=books.get(run);
  if(!book){book={time:0,runTime:run.time,moods:new Map(),units:new Map(),devices:new Map()};books.set(run,book);}
  return book;
}

/** A touch is a greeting, never a command to the puzzle simulation. All animation
 * memory is transient; saving, undoing or replaying cannot change the solution. */
export function reactCompanion(run:WorldRun,id:number):boolean {
  const unit=run.units.find(candidate=>candidate.id===id);
  if(!unit||unit.state==='queued'||unit.state==='saved'||unit.state==='lost')return false;
  const book=animationBook(run),previous=book.moods.get(id);
  if(previous?.kind==='hello'&&book.time-previous.start<.3)return true;
  book.moods.set(id,{kind:'hello',start:book.time,duration:1.25});
  const memory=book.units.get(id);if(memory)memory.reactedAt=book.time;
  return true;
}

function rememberFrame(level:WorldLevel,run:WorldRun,time:number):AnimationBook {
  let book=animationBook(run);
  if(run.time+.05<book.runTime||time+.05<book.time){
    books.delete(run);book=animationBook(run);
  }
  book.time=time;book.runTime=run.time;
  for(const [id,mood] of book.moods)if(time>mood.start+mood.duration)book.moods.delete(id);
  for(const unit of run.units){
    const previous=book.units.get(unit.id);
    // A long wait ending deserves a little relieved spring, with the whole
    // troupe's response staggered naturally by their own departure times.
    if(previous?.state==='waiting'&&previous.wait>2&&unit.state==='walking'&&!book.moods.has(unit.id)){
      book.moods.set(unit.id,{kind:'relief',start:time,duration:.55});
    }
    book.units.set(unit.id,{state:unit.state,wait:unit.waitTime,direction:unit.direction,reactedAt:previous?.reactedAt??-10});
  }
  for(const device of level.devices){
    const state=run.devices[device.id];if(!state)continue;
    const previous=book.devices.get(device.id),charged=state.progress>=.97;
    const changed=previous&&(previous.mode!==state.mode||!previous.charged&&charged&&device.kind!=='wind');
    book.devices.set(device.id,{mode:state.mode,charged});
    if(!changed)continue;
    // Only the two neighbours of the moving object react. A faraway lever
    // must not make the entire cast jump in unison.
    const nearby=run.units.filter(unit=>unit.state!=='queued'&&unit.state!=='saved'&&unit.state!=='lost')
      .map(unit=>({unit,distance:Math.hypot(unit.x-device.x,(unit.y-level.creatureHeight*.5)-device.y)}))
      .filter(item=>item.distance<level.creatureHeight*4.5).sort((a,b)=>a.distance-b.distance).slice(0,2);
    for(const [index,{unit}] of nearby.entries()){
      const memory=book.units.get(unit.id)!;
      if(time-memory.reactedAt<3||book.moods.get(unit.id)?.kind==='hello')continue;
      memory.reactedAt=time;
      book.moods.set(unit.id,{kind:'startle',start:time+index*.12,duration:.8,facing:device.x<unit.x?-1:1});
    }
  }
  return book;
}

type Aside={kind:'curious'|'eager'|'sleepy'|'shy'|'joker'|'reply';progress:number;facing:-1|1};

/** One little exchange per visible group, with quiet time between exchanges.
 * Waiting characters stand still instead of running a second walk cycle. */
function waitingAside(units:Creature[],time:number,reduced:boolean):Map<number,Aside> {
  const asides=new Map<number,Aside>();if(reduced)return asides;
  const waiting=units.filter(unit=>unit.state==='waiting'&&unit.waitTime>3);
  const beat=cycle(time,10.5);if(!waiting.length||beat<6.7||beat>9.25)return asides;
  const actor=waiting[Math.floor(time/10.5)%waiting.length],sizeRange=320;
  const partner=waiting.filter(unit=>unit.id!==actor.id&&Math.abs(unit.x-actor.x)<sizeRange&&Math.abs(unit.y-actor.y)<100)
    .sort((a,b)=>Math.abs(a.x-actor.x)-Math.abs(b.x-actor.x))[0];
  const kinds:Aside['kind'][]=['curious','eager','sleepy','shy','joker'];
  if(beat<8.85)asides.set(actor.id,{kind:kinds[actor.variant%5],progress:(beat-6.7)/2.15,facing:partner?(partner.x<actor.x?-1:1):actor.direction});
  if(partner&&beat>7.65)asides.set(partner.id,{kind:'reply',progress:(beat-7.65)/1.6,facing:actor.x<partner.x?-1:1});
  return asides;
}

/** Foot contacts follow travelled distance, while short, optional performances
 * use render time. The approved atlas supplies every pose and every face. */
export function drawCompanions(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,bounds:WorldBounds,time:number,reduced:boolean) {
  const book=rememberFrame(level,run,time);
  const units=run.units.filter(unit=>unit.state!=='queued'&&visiblePoint(unit,bounds,level.creatureHeight*1.5)).sort((a,b)=>a.y-b.y||a.id-b.id);
  const asides=waitingAside(units,time,reduced);
  for(const unit of units)drawCompanion(context,level,run,assets,unit,time,reduced,book.moods.get(unit.id),asides.get(unit.id));
}

function drawCompanion(context:CanvasRenderingContext2D,level:WorldLevel,run:WorldRun,assets:WorldAssets,unit:Creature,time:number,reduced:boolean,mood?:Mood,aside?:Aside) {
  const saved=unit.state==='saved',lost=unit.state==='lost',moving=unit.state==='walking',waiting=unit.state==='waiting',riding=unit.state==='riding';
  const age=saved?run.time-(unit.savedAt??run.time):lost?run.time-(unit.lostAt??run.time):0;
  if(saved&&age>1.65||lost&&age>1.8)return;
  const size=level.creatureHeight,seed=unit.id*17.3+unit.variant*.61;
  const stride=unit.walkTime*level.pace/(size*(.58+unit.variant*.014)),stridePhase=cycle(stride,1);
  const reaction=mood?clamp((time-mood.start)/mood.duration,0,1):0,reacting=!!mood&&time>=mood.start&&reaction<1;
  const greeting=reacting&&mood!.kind==='hello',startled=reacting&&mood!.kind==='startle',relieved=reacting&&mood!.kind==='relief';
  const performing=!saved&&!lost&&!reacting?aside:undefined;
  const facing=reacting&&mood?.facing?mood.facing:performing?.facing??unit.direction;
  let frame=saved||greeting||startled||lost&&age<.5?7:moving?Math.floor(stridePhase*6):6;
  let squash=0,lean=0,hop=0,rotation=0;
  let marks:'hello'|'surprise'|'sigh'|null=greeting?'hello':startled?'surprise':null;

  if(!reduced){
    const breath=Math.sin(time*(level.id==='veilleurs'?1.5:1.8)+seed)*.006;
    squash=moving?Math.cos(stridePhase*Math.PI*4)*.022:breath;
    lean=moving?Math.sin(stridePhase*Math.PI*2)*.018:0;
    // The eager one occasionally skips; the others keep their feet on the path.
    if(moving&&unit.variant===1&&Math.floor(stride)%5===0)hop=pulse(stridePhase)*size*.055;
    if(waiting&&unit.waitTime<.3)squash+=pulse(unit.waitTime/.3)*.075;
    if(riding){lean=Math.sin(time*2.8+seed)*.018;squash+=.01;}
    if(greeting){
      const shyness=unit.variant===3?.55:1;
      hop=pulse((reaction-.1)/.43)*size*.13*shyness;
      lean=Math.sin(reaction*Math.PI*4)*.04*shyness;
      squash+=pulse(reaction/.12)*.07-pulse((reaction-.12)/.3)*.035;
    }else if(startled){
      hop=pulse(reaction/.58)*size*.095;
      squash-=pulse(reaction/.3)*.045;lean=-pulse(reaction)*.045;
    }else if(relieved){
      hop=pulse(reaction)*size*.07;
      lean=pulse(reaction)*.022;
    }
    if(performing){
      const p=performing.progress;
      if(performing.kind==='curious'){
        lean=pulse(p)*.07;squash-=pulse(p)*.018;
        if(p>.48&&p<.7){frame=7;marks='hello';}
      }else if(performing.kind==='eager'){
        frame=p>.12&&p<.78?7:6;
        hop=(pulse((p-.13)/.23)+pulse((p-.49)/.23))*size*.09;
        if(p>.14&&p<.75)marks='hello';
      }else if(performing.kind==='sleepy'){
        squash+=pulse(p/.5)*.075;
        lean=-pulse(p/.5)*.05;
        if(p>.36&&p<.77){frame=7;squash-=pulse((p-.36)/.41)*.035;}
        if(p>.66&&p<.95)marks='sigh';
      }else if(performing.kind==='shy'){
        lean=pulse(p)*.05;squash+=pulse((p-.62)/.32)*.04;
        if(p>.28&&p<.55){frame=7;marks='hello';}
      }else if(performing.kind==='joker'){
        squash+=pulse(p/.36)*.055;
        lean=pulse(p/.36)*.09;
        if(p>.37&&p<.85){frame=7;lean=Math.sin((p-.37)*Math.PI*6)*.045;marks='hello';}
      }else if(performing.kind==='reply'){
        if(p>.1&&p<.72){frame=7;marks='hello';}
        lean=pulse(p)*.035;
      }
    }
    if(saved){hop=pulse(age/.64)*size*.3;squash=pulse((age-.55)/.24)*.06;lean=Math.sin(age*8)*.018;}
    if(lost){rotation=age*.75*unit.direction;squash=-pulse(age/.3)*.06;marks=age<.45?'surprise':null;}
  }
  // A walking greeting uses the raised-arm pose only while airborne. Holding
  // that standing pose for the whole greeting would make feet slide.
  if(moving&&(greeting||startled)&&(reduced||hop<size*.012))frame=Math.floor(stridePhase*6);
  const cell=assets.sprites.cells[frame];if(!cell)return;
  const pixelScale=size/assets.sprites.referenceHeight;
  const alpha=saved?clamp((1.65-age)/.65,0,1):lost?clamp((1.8-age)/.8,0,1):1;

  context.save();context.globalAlpha=alpha;
  if(level.id==='veilleurs'){
    const warmth=reacting?.22:.12,radius=size*(reacting?.88:.72);
    const glow=context.createRadialGradient(unit.x,unit.y-size*.48-hop,1,unit.x,unit.y-size*.48-hop,radius);
    glow.addColorStop(0,`rgba(255,201,103,${warmth})`);glow.addColorStop(1,'#ffc96700');context.fillStyle=glow;
    context.fillRect(unit.x-radius,unit.y-size*.48-hop-radius,radius*2,radius*2);
  }
  if(!lost){
    context.fillStyle=level.id==='veilleurs'?'#09070b70':level.id==='plis'?'#58433338':'#25365a1e';
    context.beginPath();context.ellipse(unit.x,unit.y+2,size*(.27-hop/size*.16),size*.044,0,0,Math.PI*2);context.fill();
  }
  context.translate(unit.x,unit.y-hop);
  // All deformations pivot on the feet. No synthetic eyes are painted over
  // the original ink, folds or illuminated ceramic faces.
  context.scale(facing*(1+squash*.5),1-squash);
  context.rotate(rotation);context.transform(1,0,lean,1,0,0);
  if(level.id==='plis'){
    if(unit.variant===1)context.filter='sepia(0.45) saturate(2.35) hue-rotate(-20deg) brightness(0.94)';
    else if(unit.variant===3)context.filter='sepia(1) saturate(1.15) hue-rotate(138deg) brightness(0.68)';
  }
  context.drawImage(assets.sprites.image,cell.x,cell.y,cell.width,cell.height,-cell.centerX*pixelScale,-cell.baseline*pixelScale,cell.width*pixelScale,cell.height*pixelScale);
  context.restore();

  if(marks&&!reduced){
    context.save();context.globalAlpha=alpha*(marks==='sigh'?.38:.76);context.strokeStyle=level.palette.accent;
    context.lineWidth=Math.max(1.5,size*.017);context.lineCap='round';
    const top=unit.y-size-hop;
    if(marks==='sigh'){
      const x=unit.x+facing*size*.4,y=unit.y-size*.57;
      context.beginPath();context.moveTo(x,y);context.bezierCurveTo(x+facing*size*.11,y-size*.015,x+facing*size*.13,y-size*.09,x+facing*size*.21,y-size*.075);context.stroke();
    }else{
      const count=marks==='surprise'?3:2;
      for(let i=0;i<count;i++){
        const angle=-Math.PI*.72+(i/(count-1))*Math.PI*.44;
        const radius=size*.15,x=unit.x+facing*size*.2;
        context.beginPath();context.moveTo(x+Math.cos(angle)*radius,top+Math.sin(angle)*radius);
        context.lineTo(x+Math.cos(angle)*(radius+size*.09),top+Math.sin(angle)*(radius+size*.09));context.stroke();
      }
    }
    context.restore();
  }
  if(saved&&!reduced&&age<1.05){
    context.save();context.globalAlpha=clamp(1-age/1.05,0,1);context.fillStyle=level.palette.accent;
    for(let i=0;i<4;i++){
      const direction=(i/4)*Math.PI*2+noise(unit.id)*Math.PI,radius=size*(.2+age*.55);
      context.save();context.translate(unit.x+Math.cos(direction)*radius,unit.y-size*.65+Math.sin(direction)*radius-age*size*.3);context.rotate(direction+age*2);
      context.beginPath();context.ellipse(0,0,size*.026,size*.014,0,0,Math.PI*2);context.fill();context.restore();
    }
    context.restore();
  }
}
