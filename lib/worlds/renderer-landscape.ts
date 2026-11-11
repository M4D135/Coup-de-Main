import type {WorldAssets,RenderOptions} from './renderer';
import type {Point,RouteEdge,WorldId,WorldLevel} from './types';

export interface WorldBounds {left:number;right:number;top:number;bottom:number;scale:number}
type Materials={paper:CanvasPattern|null;sky:CanvasPattern|null;wood:CanvasPattern|null};
type TileCache={level:WorldLevel;tiles:Map<number,HTMLCanvasElement>};
const materialCache=new WeakMap<WorldAssets,Materials>();
const landscapeCache=new WeakMap<WorldAssets,TileCache>();
const vignetteCache=new WeakMap<WorldAssets,Map<string,HTMLCanvasElement>>();
const TILE=1600;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export const noise=(seed:number)=>{const value=Math.sin(seed*127.1+311.7)*43758.5453;return value-Math.floor(value);};
const idSeed=(id:string)=>[...id].reduce((seed,char)=>(seed*31+char.charCodeAt(0))%100003,7);

export function visibleWorld(level:WorldLevel,options:RenderOptions):WorldBounds {
  const scale=Number.isFinite(options.viewScale)&&options.viewScale!>0?options.viewScale!:1;
  const viewport=options.viewport??{x:0,y:0,width:Math.min(level.width,TILE)*scale,height:level.height*scale};
  return {left:clamp(-viewport.x/scale-180,0,level.width),right:clamp((viewport.width-viewport.x)/scale+180,0,level.width),
    top:-viewport.y/scale-180,bottom:(viewport.height-viewport.y)/scale+180,scale};
}

export function visiblePoint(point:Point,bounds:WorldBounds,margin=180):boolean {
  return point.x>=bounds.left-margin&&point.x<=bounds.right+margin&&point.y>=bounds.top-margin&&point.y<=bounds.bottom+margin;
}

function line(context:CanvasRenderingContext2D,points:Point[]) {
  context.beginPath();for(const [i,p] of points.entries())i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y);
}

function cropPattern(context:CanvasRenderingContext2D,assets:WorldAssets,rect:[number,number,number,number],size=256):CanvasPattern|null {
  const tile=document.createElement('canvas');tile.width=size*2;tile.height=size*2;
  const ctx=tile.getContext('2d');if(!ctx)return null;
  const image=assets.scene,[x,y,w,h]=rect,sx=x*image.naturalWidth,sy=y*image.naturalHeight,sw=w*image.naturalWidth,sh=h*image.naturalHeight;
  // Mirrored swatches keep the approved material grain without visible tile seams.
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
    ctx.save();ctx.translate(col?size*2:0,row?size*2:0);ctx.scale(col?-1:1,row?-1:1);
    ctx.drawImage(image,sx,sy,sw,sh,0,0,size,size);ctx.restore();
  }
  return context.createPattern(tile,'repeat');
}

function materials(context:CanvasRenderingContext2D,assets:WorldAssets):Materials {
  const cached=materialCache.get(assets);if(cached)return cached;
  const paper=cropPattern(context,assets,assets.id==='boucles'?[.56,.06,.22,.18]:assets.id==='plis'?[.27,.445,.065,.07]:[.72,.025,.06,.045],192);
  const sky=cropPattern(context,assets,assets.id==='boucles'?[.56,.06,.22,.18]:assets.id==='plis'?[.79,.255,.14,.14]:[.48,.185,.105,.2],256);
  const wood=assets.id==='veilleurs'?cropPattern(context,assets,[.23,.515,.12,.018],128):null;
  const value={paper,sky,wood};materialCache.set(assets,value);return value;
}

function artVignette(context:CanvasRenderingContext2D,assets:WorldAssets,rect:[number,number,number,number],x:number,y:number,width:number,height:number,opacity=1,flip=false) {
  let cache=vignetteCache.get(assets);if(!cache){cache=new Map();vignetteCache.set(assets,cache);}
  const fadeTop=y>0,key=`${rect.join(':')}:${fadeTop?'soft-top':'world-top'}`;let tile=cache.get(key);
  if(!tile){
    tile=document.createElement('canvas');const image=assets.scene,[sx,sy,sw,sh]=rect;
    tile.width=Math.max(1,Math.round(image.naturalWidth*sw));tile.height=Math.max(1,Math.round(image.naturalHeight*sh));
    const ink=tile.getContext('2d');if(!ink)return;
    ink.drawImage(image,sx*image.naturalWidth,sy*image.naturalHeight,sw*image.naturalWidth,sh*image.naturalHeight,0,0,tile.width,tile.height);
    // A soft compositing edge lets painted details live in the continuous
    // landscape. The PNG remains untouched and no old platform is sampled.
    ink.globalCompositeOperation='destination-in';
    const horizontal=ink.createLinearGradient(0,0,tile.width,0);
    horizontal.addColorStop(0,'#0000');horizontal.addColorStop(.12,'#000');horizontal.addColorStop(.85,'#000');horizontal.addColorStop(1,'#0000');
    ink.fillStyle=horizontal;ink.fillRect(0,0,tile.width,tile.height);
    const vertical=ink.createLinearGradient(0,0,0,tile.height);
    vertical.addColorStop(0,fadeTop?'#0000':'#000');if(fadeTop)vertical.addColorStop(.16,'#000');vertical.addColorStop(.72,'#000');vertical.addColorStop(1,'#0000');
    ink.fillStyle=vertical;ink.fillRect(0,0,tile.width,tile.height);cache.set(key,tile);
  }
  context.save();context.globalAlpha=opacity;context.translate(flip?x+width:x,y);context.scale(flip?-1:1,1);context.drawImage(tile,0,0,width,height);context.restore();
}

function leaf(context:CanvasRenderingContext2D,x:number,y:number,size:number,angle:number,color:string,paper:boolean) {
  context.save();context.translate(x,y);context.rotate(angle);context.fillStyle=color;
  context.beginPath();context.moveTo(0,0);context.quadraticCurveTo(size*.9,-size*.8,size*1.55,0);context.quadraticCurveTo(size*.6,size*.8,0,0);context.fill();
  if(paper){context.fillStyle='#fff4d42b';context.beginPath();context.moveTo(0,0);context.lineTo(size*1.55,0);context.quadraticCurveTo(size*.9,-size*.8,0,0);context.fill();}
  else{context.strokeStyle='#fff4de36';context.lineWidth=.8;context.beginPath();context.moveTo(0,0);context.lineTo(size*1.3,0);context.stroke();}
  context.restore();
}

function sprig(context:CanvasRenderingContext2D,x:number,y:number,size:number,seed:number,world:WorldId) {
  context.save();context.translate(x,y);context.rotate((noise(seed)-.5)*.42);
  const ink=world==='boucles'?'#253a61':world==='plis'?'#9c4e36':'#655064';
  context.strokeStyle=ink;context.lineWidth=world==='boucles'?2.5:2;context.lineCap='round';
  context.beginPath();context.moveTo(0,0);context.quadraticCurveTo(-size*.15,-size*.55,size*.08,-size);context.stroke();
  for(let i=0;i<5;i++){
    const py=-size*(.17+i*.16),side=i%2?1:-1;
    leaf(context,-size*.035,py,size*(.12+noise(seed+i)*.045),side<0?-2.4:-.7,ink,world==='plis');
  }
  context.restore();
}

function tree(context:CanvasRenderingContext2D,x:number,y:number,seed:number,world:WorldId,scale=1) {
  context.save();context.translate(x,y);context.scale(scale,scale);
  const ink=world==='boucles'?'#24385c':world==='plis'?'#755039':'#3b2c30';
  context.strokeStyle=ink;context.lineWidth=world==='boucles'?19:13;context.lineCap='round';
  const direction=seed%2?-1:1;
  context.beginPath();context.moveTo(0,180);context.bezierCurveTo(direction*12,90,direction*73,4,direction*210,-46);context.stroke();
  for(let b=0;b<4;b++){
    const bx=direction*(28+b*45),by=75-b*30;
    context.lineWidth=8-b;context.beginPath();context.moveTo(bx,by);context.quadraticCurveTo(bx+direction*38,by-48,bx+direction*83,by-59);context.stroke();
    for(let i=0;i<8;i++){
      const lx=bx+direction*(8+i*12),ly=by-14-i*5+(i%2?15:-8);
      leaf(context,lx,ly,13+noise(seed+b*19+i)*14,(i%2?-2.2:-.7)+(direction<0?Math.PI:0),
        world==='boucles'?(i%3===0?'#24385c':'#cc6a56'):world==='plis'?(i%3===0?'#b65a3e':'#963f2e'):(i%3?'#675267':'#9d694b'),world==='plis');
    }
  }
  if(world==='boucles'){
    context.strokeStyle='#f6dfbb';context.lineWidth=2;context.globalAlpha=.4;
    for(let i=0;i<5;i++){context.beginPath();context.moveTo(-6+i*3,155);context.quadraticCurveTo(direction*40+i*3,30,direction*150,-26);context.stroke();}
  }
  context.restore();
}

/** Only atmosphere/material fragments from the approved art are used here;
 * walkable platforms are always supplied by the route graph below. */
function background(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,start:number,end:number) {
  const mats=materials(context,assets),height=level.height,world=level.id;
  context.fillStyle=mats.sky??level.palette.paper;context.fillRect(start,0,end-start,height);
  if(world==='veilleurs'){
    context.fillStyle='#141322b0';context.fillRect(start,0,end-start,height);
    for(let index=Math.floor(start/340)-1;index<=Math.ceil(end/340);index++){
      const x=index*340+noise(index+7)*65;
      const gradient=context.createLinearGradient(x,0,x+80,0);gradient.addColorStop(0,'#08080d00');gradient.addColorStop(.55,'#69504830');gradient.addColorStop(1,'#08080d65');
      context.fillStyle=gradient;context.fillRect(x,0,115,height);
      context.strokeStyle='#98714c18';context.lineWidth=2;context.beginPath();context.moveTo(x+75,0);context.lineTo(x+65,height);context.stroke();
    }
    for(let sector=Math.floor(start/TILE)-1;sector<=Math.floor(end/TILE)+1;sector++){
      const x=sector*TILE+250+(sector%3)*137,y=100+noise(sector+4)*80;
      if(sector%2===0){
        context.save();context.globalAlpha=.68;context.beginPath();context.ellipse(x,y+110,126,155,0,0,Math.PI*2);context.clip();
        const image=assets.scene;context.drawImage(image,image.naturalWidth*.105,image.naturalHeight*.05,image.naturalWidth*.17,image.naturalHeight*.31,x-126,y-45,252,310);context.restore();
      }else{
        context.save();context.globalAlpha=.4;context.fillStyle='#886347';context.fillRect(x-125,y+184,390,15);
        for(let bottle=0;bottle<5;bottle++){
          const bx=x-80+bottle*67,bh=60+noise(sector+bottle)*85;
          context.fillStyle=bottle%2?'#73726744':'#65788a30';context.strokeStyle='#adad9855';context.lineWidth=2;
          context.beginPath();context.roundRect(bx,y+180-bh,40,bh,9);context.fill();context.stroke();context.fillStyle='#6b4a31';context.fillRect(bx+10,y+170-bh,20,13);
        }context.restore();
      }
      const glow=context.createRadialGradient(x+560,y+180,5,x+560,y+180,320);glow.addColorStop(0,'#ba793e1c');glow.addColorStop(1,'#ba793e00');
      context.fillStyle=glow;context.fillRect(x+240,y-140,640,640);
      artVignette(context,assets,[0,0,.34,.14],sector*TILE-60,-5,670,170,.95,sector%2===1);
      artVignette(context,assets,[.63,.08,.215,.30],sector*TILE+950,70,520,340,.62,sector%3===2);
    }
  }else{
    if(world==='plis'){
      context.fillStyle='#c6d0cb2b';context.fillRect(start,0,end-start,height);
      for(let layer=0;layer<3;layer++){
        context.beginPath();context.moveTo(start-240,height);
        for(let x=Math.floor((start-240)/210)*210;x<end+420;x+=210){const y=145+layer*150+noise(x/210+layer*71)*180;context.lineTo(x,y);}
        context.lineTo(end+420,height);context.closePath();context.fillStyle=['#c8d0cc','#9bafb2','#718c9926'][layer];context.globalAlpha=layer===2?.8:.28;context.fill();
        context.strokeStyle='#f8ecd24a';context.lineWidth=1.5;context.stroke();context.globalAlpha=1;
      }
    }else{
      for(let layer=0;layer<3;layer++){
        context.strokeStyle=layer===0?'#536a8a22':'#536a8a14';context.lineWidth=layer===0?1.5:1;
        context.beginPath();context.moveTo(start-300,600+layer*65);
        for(let x=Math.floor((start-300)/360)*360;x<end+400;x+=360){const y=570+layer*75+noise(x/360+layer*9)*90;context.quadraticCurveTo(x+150,y-110,x+360,y);}
        context.stroke();
      }
    }
    for(let sector=Math.floor(start/TILE)-1;sector<=Math.floor(end/TILE)+1;sector++){
      const x=sector*TILE+80+(sector%3)*190;
      if(world==='boucles')artVignette(context,assets,[0,0,.52,.385],sector*TILE-80,-12,900,366,.98,sector%2===1);
      else artVignette(context,assets,[0,0,.355,.195],sector*TILE-40,-8,650,210,.98,sector%2===1);
      if(sector%3===2)tree(context,x+950,-25,sector+21,world,.62);
      if(world==='plis'){
        context.save();context.translate(sector*TILE+990,95+noise(sector+2)*35);context.fillStyle='#f4e4ce';context.shadowColor='#3c485b30';context.shadowBlur=16;context.shadowOffsetY=10;
        context.beginPath();context.moveTo(-140,24);context.bezierCurveTo(-154,-8,-106,-35,-68,-21);context.bezierCurveTo(-48,-76,25,-64,40,-26);context.bezierCurveTo(80,-42,135,-10,123,21);context.quadraticCurveTo(10,48,-140,24);context.fill();context.shadowBlur=0;
        context.clip();context.fillStyle=mats.paper??'#f4e4ce';context.globalAlpha=.65;context.fillRect(-170,-90,340,170);context.fillStyle='#fff8e550';context.fillRect(-170,-90,340,170);context.restore();
      }else if(sector%3===1){
        artVignette(context,assets,[.795,.512,.205,.25],sector*TILE+970,520,460,260,.48);
      }
      if(world==='boucles')artVignette(context,assets,[0,.77,.24,.23],sector*TILE+260+(sector%2)*650,height-190,440,260,.85,sector%2===1);
    }
  }
}

function terrainPolygon(context:CanvasRenderingContext2D,edge:RouteEdge,height:number,world:WorldId) {
  line(context,edge.path);
  const thickness=world==='boucles'?39:26;
  if(edge.terrain==='platform'){
    const reverse=[...edge.path].reverse();
    for(let i=0;i<reverse.length-1;i++){
      const a=reverse[i],b=reverse[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/42));
      for(let step=0;step<steps;step++){
        const t=step/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
        context.lineTo(x,y+thickness+(world==='veilleurs'?0:noise(x*.3+idSeed(edge.id))*10));
      }
    }
    const last=reverse.at(-1)!;context.lineTo(last.x,last.y+thickness);
  }
  else {context.lineTo(edge.path.at(-1)!.x,height+40);context.lineTo(edge.path[0].x,height+40);}
  context.closePath();
}

function foundationAt(level:WorldLevel,edge:RouteEdge,x:number,top:number):number {
  let foundation=level.height+45;
  for(const other of level.edges){
    if(other.id===edge.id||other.kind!=='ground')continue;
    for(let i=1;i<other.path.length;i++){
      const a=other.path[i-1],b=other.path[i];if(x<Math.min(a.x,b.x)||x>Math.max(a.x,b.x))continue;
      const t=(x-a.x)/(b.x-a.x||1),y=a.y+(b.y-a.y)*t;
      if(y>top+80&&y<foundation)foundation=y+8;
    }
  }
  return foundation;
}

function platformSupports(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,edges:RouteEdge[]) {
  const world=level.id,mats=materials(context,assets);
  for(const edge of edges){
    if(edge.terrain!=='platform')continue;
    for(let segment=1;segment<edge.path.length;segment++){
      const a=edge.path[segment-1],b=edge.path[segment],length=Math.hypot(b.x-a.x,b.y-a.y),count=Math.max(1,Math.floor(length/290));
      if(length<100)continue;
      for(let index=0;index<count;index++){
        const t=(index+.5)/count,point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},seed=idSeed(edge.id)+segment*23+index*19;
        if(level.devices.some(device=>device.kind==='lift'&&Math.abs((device.low?.x??device.x)-point.x)<(device.width??150)*.75))continue;
        const bottom=foundationAt(level,edge,point.x,point.y),height=bottom-point.y,width=world==='veilleurs'?25:world==='plis'?52:63;
        context.save();context.shadowColor=world==='veilleurs'?'#00000065':'#4d463328';context.shadowBlur=world==='boucles'?0:10;context.shadowOffsetX=6;context.shadowOffsetY=5;
        context.beginPath();
        if(world==='boucles'){
          context.moveTo(point.x-width*.6,point.y+17);context.lineTo(point.x+width*.6,point.y+17);
          context.lineTo(point.x+width*.42,point.y+height*.25);context.lineTo(point.x+width*.65,bottom);
          context.lineTo(point.x-width*.55,bottom);context.lineTo(point.x-width*.29,point.y+height*.48);context.closePath();
        }else if(world==='plis'){
          context.moveTo(point.x-width*.55,point.y+15);context.lineTo(point.x+width*.55,point.y+15);
          context.lineTo(point.x+width*.7,bottom);context.lineTo(point.x-width*.65,bottom);context.closePath();
        }else context.rect(point.x-width/2,point.y+13,width,height-13);
        context.fillStyle=world==='veilleurs'?'#795033':mats.paper??level.palette.paper;context.fill();context.shadowBlur=0;context.shadowOffsetX=0;context.shadowOffsetY=0;
        context.strokeStyle=world==='boucles'?'#2c4164':world==='plis'?'#b18b6240':'#4e321e';context.lineWidth=world==='boucles'?2:1.5;context.stroke();
        context.save();context.clip();
        if(world==='plis'){
          context.fillStyle='#8e684d30';context.beginPath();context.moveTo(point.x+width*.1,point.y+10);context.lineTo(point.x+width*.7,bottom);context.lineTo(point.x-width*.1,bottom);context.lineTo(point.x-width*.18,point.y+height*.52);context.closePath();context.fill();
          context.fillStyle='#fff4d749';context.beginPath();context.moveTo(point.x-width*.55,point.y);context.lineTo(point.x+width*.1,point.y);context.lineTo(point.x-width*.18,point.y+height*.52);context.lineTo(point.x-width*.65,bottom);context.closePath();context.fill();
          context.strokeStyle='#b898704f';context.lineWidth=1.2;context.beginPath();context.moveTo(point.x+width*.1,point.y+10);context.lineTo(point.x-width*.18,point.y+height*.52);context.lineTo(point.x+width*.7,bottom);context.stroke();
        }else if(world==='boucles'){
          context.strokeStyle='#263b646b';context.lineWidth=1.4;
          for(let lineIndex=0;lineIndex<12;lineIndex++){
            const x=point.x-width*.6+lineIndex*7,y=point.y+30+noise(seed+lineIndex)*height*.45;
            context.beginPath();context.moveTo(x,y);context.lineTo(x-20,Math.min(bottom,y+35+noise(seed+lineIndex+2)*height*.5));context.stroke();
          }
        }else{
          const image=assets.scene;context.globalAlpha=.9;
          context.drawImage(image,image.naturalWidth*.3,image.naturalHeight*.18,image.naturalWidth*.023,image.naturalHeight*.27,point.x-width/2,point.y,width,height);context.globalAlpha=1;
          context.strokeStyle='#e8b47577';context.lineWidth=1.5;context.beginPath();context.moveTo(point.x-width/2+2,point.y);context.lineTo(point.x-width/2+2,bottom);context.stroke();
        }
        context.restore();
        if(world==='veilleurs'||world==='plis'){
          for(const side of [-1,1]){
            const braceTop={x:point.x+side*Math.min(75,length*.23),y:point.y+18+side*(b.y-a.y)/length*55};
            context.strokeStyle=world==='veilleurs'?'#4b2f20':'#ad8a60';context.lineWidth=world==='veilleurs'?12:14;context.beginPath();context.moveTo(point.x,point.y+Math.min(85,height*.45));context.lineTo(braceTop.x,braceTop.y);context.stroke();
            context.strokeStyle=world==='veilleurs'?'#b17b47':'#ebd5b0';context.lineWidth=world==='veilleurs'?8:11;context.stroke();
          }
          context.fillStyle=world==='veilleurs'?'#c89a58':'#b38c59';context.beginPath();context.arc(point.x,point.y+28,world==='veilleurs'?4:3,0,Math.PI*2);context.fill();
        }
        context.restore();
      }
    }
  }
}

function hangingLantern(context:CanvasRenderingContext2D,x:number,y:number,seed:number) {
  const drop=33+noise(seed)*24;
  context.save();context.strokeStyle='#9e764a';context.lineWidth=2;context.beginPath();context.moveTo(x,y);context.lineTo(x,y+drop);context.stroke();
  context.translate(x,y+drop);const glow=context.createRadialGradient(0,15,3,0,15,65);glow.addColorStop(0,'#ffb74242');glow.addColorStop(1,'#ffb74200');context.fillStyle=glow;context.fillRect(-65,-50,130,130);
  context.fillStyle='#efbd63';context.strokeStyle='#815a32';context.lineWidth=2;context.beginPath();context.moveTo(-9,0);context.lineTo(9,0);context.lineTo(12,22);context.lineTo(-12,22);context.closePath();context.fill();context.stroke();
  context.fillStyle='#fff0ba';context.fillRect(-5,5,10,12);context.strokeStyle='#6c4b2b';context.lineWidth=2.5;context.beginPath();context.moveTo(-13,0);context.lineTo(13,0);context.moveTo(-13,23);context.lineTo(13,23);context.stroke();context.restore();
}

function ground(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,start:number,end:number) {
  const mats=materials(context,assets),world=level.id,height=level.height;
  const edges=level.edges.filter(edge=>(edge.kind==='ground'||edge.kind==='hazard')&&edge.path.length>1&&edge.path.some((p,i)=>p.x>=start-40&&p.x<=end+40||i>0&&Math.min(edge.path[i-1].x,p.x)<=end&&Math.max(edge.path[i-1].x,p.x)>=start))
    .map(edge=>edge.kind==='hazard'?{...edge,terrain:'platform' as const}:edge);
  platformSupports(context,level,assets,edges);
  // Fill solids first, then the readable top surfaces. A platform never fills
  // the space below it, so a lower playable route cannot disappear behind it.
  for(const edge of edges){
    const index=idSeed(edge.id);
    const minX=Math.min(...edge.path.map(p=>p.x)),maxX=Math.max(...edge.path.map(p=>p.x)),top=Math.min(...edge.path.map(p=>p.y));
    context.save();terrainPolygon(context,edge,height,world);context.clip();
    if(world==='veilleurs'){
      const gradient=context.createLinearGradient(0,top,0,height);gradient.addColorStop(0,'#704c32');gradient.addColorStop(1,'#251d20');context.fillStyle=gradient;context.fillRect(minX,top,maxX-minX,height-top+40);
      if(edge.terrain!=='platform')for(let x=Math.floor(minX/125)*125;x<maxX;x+=125){
        context.fillStyle='#33251f';context.fillRect(x,top,20,height);context.strokeStyle='#a7784260';context.lineWidth=2;context.beginPath();context.moveTo(x+2,top);context.lineTo(x+2,height);context.stroke();
      }
    }else{
      context.fillStyle=mats.paper??level.palette.paper;context.fillRect(minX,top,maxX-minX,height-top+40);
      if(world==='plis'){
        for(let x=Math.floor(minX/160)*160;x<maxX+160;x+=160){
          const seed=x/160+index*11,foldX=x+40+noise(seed)*90,foldY=top+110+noise(seed+1)*200;
          context.fillStyle=noise(seed+2)>.5?'#a9825228':'#fff8e84a';context.beginPath();context.moveTo(x,top);context.lineTo(foldX,foldY);context.lineTo(x+180,height+40);context.lineTo(x+80,height+40);context.closePath();context.fill();
          context.strokeStyle='#9c785332';context.lineWidth=.8;context.beginPath();context.moveTo(x,top);context.lineTo(foldX,foldY);context.lineTo(x+180,height+40);context.stroke();
        }
      }else{
        context.strokeStyle='#273d6260';context.lineWidth=1.3;
        for(let x=Math.floor(minX/14)*14;x<maxX;x+=14){
          const seed=x/14+index*9,strokeTop=top+30+noise(seed)*140;
          context.globalAlpha=.25+noise(seed+3)*.4;context.beginPath();context.moveTo(x,strokeTop);context.lineTo(x-12-noise(seed+1)*25,strokeTop+25+noise(seed+2)*95);context.stroke();
        }context.globalAlpha=1;
      }
    }
    context.restore();
  }
  for(const edge of edges){
    const edgeIndex=idSeed(edge.id);
    if(world==='veilleurs'){
      for(let i=1;i<edge.path.length;i++){
        const a=edge.path[i-1],b=edge.path[i],length=Math.hypot(b.x-a.x,b.y-a.y);
        context.save();context.translate(a.x,a.y);context.rotate(Math.atan2(b.y-a.y,b.x-a.x));
        context.shadowColor='#08040f70';context.shadowBlur=8;context.shadowOffsetY=8;context.fillStyle='#5a3824';context.fillRect(-2,1,length+4,25);context.shadowBlur=0;context.shadowOffsetY=0;
        context.fillStyle=mats.wood??'#a87647';context.fillRect(-2,0,length+4,23);
        context.strokeStyle='#e4b877a0';context.lineWidth=2.2;context.beginPath();context.moveTo(-2,0);context.lineTo(length+2,0);context.stroke();
        for(let x=18;x<length;x+=120){context.fillStyle='#34281d';context.beginPath();context.arc(x,12,2.7,0,Math.PI*2);context.fill();context.fillStyle='#d5a163';context.beginPath();context.arc(x-.6,11,1.3,0,Math.PI*2);context.fill();}
        context.restore();
      }
    }else{
      context.save();context.lineCap='round';context.lineJoin='round';
      if(world==='plis'){
        context.shadowColor='#4b3b3540';context.shadowBlur=8;context.shadowOffsetY=8;line(context,edge.path);context.lineWidth=13;context.strokeStyle='#bda181';context.stroke();context.shadowBlur=0;context.shadowOffsetY=0;
        line(context,edge.path);context.strokeStyle='#faecd2';context.lineWidth=10;context.stroke();
        context.strokeStyle='#fff7e6';context.lineWidth=2;context.stroke();
      }else{
        line(context,edge.path);context.strokeStyle='#25395e';context.lineWidth=4.5;context.stroke();
        context.translate(0,2);line(context,edge.path);context.lineWidth=1.1;context.strokeStyle='#f7e5c7';context.globalAlpha=.65;context.stroke();
      }
      context.restore();
    }
    for(let i=1;i<edge.path.length;i++){
      const a=edge.path[i-1],b=edge.path[i],length=Math.hypot(b.x-a.x,b.y-a.y),clusters=Math.floor(length/210);
      for(let cluster=0;cluster<clusters;cluster++){
        const t=(cluster+.4+noise(edgeIndex+cluster)*.25)/Math.max(1,clusters),p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
        if(level.devices.some(device=>Math.hypot(device.x-p.x,device.y-p.y)<100))continue;
        context.save();context.globalAlpha=world==='veilleurs'?.68:.85;sprig(context,p.x-5,p.y+2,25+noise(p.x+3)*27,p.x,world);context.restore();
        if(world==='veilleurs'&&edge.terrain==='platform'&&cluster%2===0)hangingLantern(context,p.x+40,p.y+24,edgeIndex+cluster);
      }
    }
  }
}

function sceneryTile(level:WorldLevel,assets:WorldAssets,index:number):HTMLCanvasElement {
  let cached=landscapeCache.get(assets);
  if(!cached||cached.level!==level){cached={level,tiles:new Map()};landscapeCache.set(assets,cached);}
  const previous=cached.tiles.get(index);if(previous){cached.tiles.delete(index);cached.tiles.set(index,previous);return previous;}
  const tile=document.createElement('canvas');tile.width=Math.min(TILE,level.width-index*TILE);tile.height=level.height;
  const context=tile.getContext('2d');
  if(context){context.translate(-index*TILE,0);background(context,level,assets,index*TILE,(index+1)*TILE);ground(context,level,assets,index*TILE,(index+1)*TILE);}
  cached.tiles.set(index,tile);while(cached.tiles.size>5)cached.tiles.delete(cached.tiles.keys().next().value!);
  return tile;
}

export function drawLandscape(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,bounds:WorldBounds) {
  const first=Math.max(0,Math.floor(bounds.left/TILE)),last=Math.min(Math.ceil(level.width/TILE)-1,Math.floor(bounds.right/TILE));
  for(let index=first;index<=last;index++)context.drawImage(sceneryTile(level,assets,index),index*TILE,0);
}

export function drawAtmosphere(context:CanvasRenderingContext2D,level:WorldLevel,bounds:WorldBounds,time:number,reduced:boolean) {
  if(reduced)return;
  const first=Math.floor(bounds.left/210),last=Math.ceil(bounds.right/210);
  context.save();
  for(let index=first;index<=last;index++){
    const x=index*210+Math.sin(time*.2+index)*40,y=80+noise(index+31)*620+Math.sin(time*.28+index*2)*12;
    if(level.id==='veilleurs'){
      context.fillStyle=`rgba(255,211,140,${.13+Math.sin(time*.8+index)**2*.25})`;context.beginPath();context.arc(x,y,index%3?1.3:2.1,0,Math.PI*2);context.fill();
    }else if(level.id==='plis'){
      context.globalAlpha=.32;context.strokeStyle='#fff4dc';context.lineWidth=1.2;context.beginPath();context.moveTo(x,y);context.bezierCurveTo(x+20,y-9,x+38,y+12,x+63,y-1);context.stroke();
    }else if(index%3===0){context.globalAlpha=.45;leaf(context,x,y,5,Math.sin(time*.6+index),level.palette.accent,false);}
  }
  context.restore();
}

export function drawPortal(context:CanvasRenderingContext2D,level:WorldLevel,assets:WorldAssets,point:Point,goal:boolean,time:number) {
  const world=level.id,height=goal?145:135,width=goal?165:150;
  context.save();context.translate(point.x,point.y);
  if(world==='boucles'){
    if(goal){
      context.strokeStyle=level.palette.ink;context.lineWidth=9;context.beginPath();context.ellipse(0,-59,48,60,-.08,Math.PI,Math.PI*3);context.stroke();
      context.lineWidth=2;context.globalAlpha=.7;context.beginPath();context.ellipse(2,-59,52,62,.03,Math.PI,Math.PI*3);context.stroke();context.globalAlpha=1;
      sprig(context,-60,0,68,8,world);sprig(context,60,0,76,13,world);
      context.strokeStyle=level.palette.accent;context.lineWidth=3;context.lineCap='round';
      for(let i=0;i<3;i++){const x=(i-1)*16;context.beginPath();context.moveTo(x,-138);context.lineTo(x*1.25,-150-(i===1?7:0));context.stroke();}
    }
  }else{
    // Portal silhouettes are cropped from the approved illustration; their
    // painted floor is omitted so only the graph supplies the walking surface.
    const image=assets.scene;
    const rect=world==='plis'?(goal?[.84,.421,.16,.215]:[.0,.276,.137,.285]):goal?[.849,.265,.15,.227]:[.0,.29,.143,.272];
    const [x,y,w,h]=rect;
    context.save();context.beginPath();
    if(world==='plis'){
      context.moveTo(-width*.5,0);context.lineTo(-width*.5,-height*.57);context.lineTo(-width*.15,-height);context.lineTo(width*.45,-height*.8);context.lineTo(width*.5,0);context.closePath();
    }else context.roundRect(-width/2,-height,width,height,goal?50:16);
    context.clip();context.drawImage(image,image.naturalWidth*x,image.naturalHeight*y,image.naturalWidth*w,image.naturalHeight*h,-width/2,-height,width,height);context.restore();
    if(goal){const glow=context.createRadialGradient(0,-40,3,0,-40,80);glow.addColorStop(0,`rgba(255,189,82,${.12+Math.sin(time*1.4)*.025})`);glow.addColorStop(1,'#ffba5200');context.fillStyle=glow;context.fillRect(-80,-120,160,160);}
  }
  context.restore();
}
