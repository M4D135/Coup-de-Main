import type {Point,WorldGeometry,WorldId,WorldLevel} from './types';
import measuredPlates from './tableau-plates.json';

/** A tableau is always one complete illustration. Coordinates are authored
 * against that illustration; scenery is never assembled from image fragments. */
export const TABLEAU_WIDTH=3200;
export const TABLEAU_HEIGHT=1800;
export const TABLEAU_COUNT=5;
export const tableauIndex=(x:number)=>Math.max(0,Math.min(TABLEAU_COUNT-1,Math.floor(x/TABLEAU_WIDTH)));

type XY=[number,number];
type Layout={nodes:Record<string,XY>;paths?:Record<string,XY[]>;devices?:Record<string,XY>;pivots?:Record<string,XY>;widths?:Record<string,number>;lengths?:Record<string,number>;art?:{wind?:{kind:'fan'|'mill';center:XY;width:number;scaleX:number}}};
const doubled=(points:Record<string,XY>)=>Object.fromEntries(Object.entries(points).map(([id,[x,y]])=>[id,[x*2,y*2]])) as Record<string,XY>;

const openings:Record<WorldId,Layout>={
  boucles:{
    nodes:doubled({start:[135,505],'fork-node':[490,470],pan:[800,666],near:[720,382],far:[1190,380],'return-bank':[1190,380],rest:[1570,380]}),
    paths:{entry:[[270,1010],[600,980],[780,956],[980,940]],'upper-road':[[980,940],[1180,914],[1260,876],[1340,786],[1440,764]],'far-road':[[2380,760],[2640,764],[2900,750],[3140,760]],'low-road':[[2380,760],[2640,764],[2900,750],[3140,760]]},
    devices:{fork:[980,1000],balance:[1660,1405],relay:[2415,665]},pivots:{balance:[2140,790]},
  },
  plis:{
    nodes:{start:[140,1010],near:[1560,1010],middle:[1950,910],near2:[2200,910],far:[2480,1148],rest:[3110,1148]},
    paths:{entry:[[140,1010],[480,1015],[960,1016],[1560,1010]],'far-road':[[2480,1148],[2740,1154],[3110,1148]]},
    devices:{wind:[1100,620],cleat:[2275,450],relay:[2490,1030]},
  },
  veilleurs:{
    nodes:{start:[440,848],'fork-node':[720,920],pan:[1180,720],low:[1380,970],high:[1380,800],near:[1890,800],far:[2700,895],'return-bank':[2700,895],rest:[3110,895]},
    paths:{entry:[[440,848],[580,915],[720,920]],'main-road':[[720,920],[1100,920],[1180,920],[1380,970]],'upper-road':[[1380,800],[1560,800],[1890,800]],'far-road':[[2700,895],[2890,895],[3110,895]],'low-road':[[2700,895],[2890,895],[3110,895]]},
    devices:{fork:[720,995],balance:[1180,780],lift:[1380,1020],relay:[2720,785]},
    pivots:{balance:[1200,225],lift:[1560,150]},
  },
};

/** Values below are measured on the complete 1672×941 production plates. */
const plates:Partial<Record<WorldId,Record<number,Layout>>>={
  ...(measuredPlates as unknown as Partial<Record<WorldId,Record<number,Layout>>>),
  plis:{
    1:{nodes:{start:[65,604],'fork-node':[171,603],low:[414,720],'low-far':[708,721],'switch-bank':[1170,672],near:[570,345],far:[939,345],rest:[1595,598]},
      paths:{'relay-road':[[708,721],[930,707],[1170,672]],'low-road':[[1170,672],[1440,626],[1595,598]]},devices:{fork:[171,565],wind:[1147,546],relay:[1170,617]}},
    2:{nodes:{start:[58,625],'fork-node':[176,625],pan:[410,744],near:[600,412],far:[925,412],'return-bank':[720,738],rest:[1595,615]},
      paths:{'low-road':[[720,738],[1120,685],[1595,615]]},devices:{fork:[176,580],balance:[410,779],relay:[925,360]},pivots:{balance:[410,442]}},
    3:{nodes:{start:[60,630],near:[656,630],middle:[806,630],high:[806,376],near2:[970,376],far:[1115,378],rest:[1590,524]},
      paths:{entry:[[60,630],[340,630],[656,630]],'far-road':[[1115,378],[1310,443],[1485,495],[1590,524]]},
      devices:{wind:[444,262],cleat:[1187,264],lift:[806,590],relay:[1115,330]},pivots:{lift:[808,174]}},
    4:{nodes:{start:[58,649],'fork-a-node':[164,649],'fork-b-node':[450,501],'pan-a':[415,742],'pan-b':[660,615],near:[807,290],far:[1134,292],'return-a':[715,770],'return-b':[844,584],rest:[1590,599]},
      paths:{'middle-road':[[164,649],[310,575],[450,501]],'upper-road':[[450,501],[620,401],[807,290]],'far-road':[[1134,292],[1300,422],[1475,557],[1590,599]],'low-a-road':[[715,770],[1150,688],[1590,599]],'low-b-road':[[844,584],[1210,595],[1590,599]]},
      devices:{'fork-a':[164,609],'fork-b':[450,460],'balance-a':[415,780],'balance-b':[660,653],wind:[1010,423]},pivots:{'balance-a':[415,515],'balance-b':[660,367]}},
  },
};

function movedPoint(point:Point,oldFrom:Point,oldTo:Point,newFrom:Point,newTo:Point):Point {
  const dx=oldTo.x-oldFrom.x,dy=oldTo.y-oldFrom.y,l2=dx*dx+dy*dy||1;
  const t=((point.x-oldFrom.x)*dx+(point.y-oldFrom.y)*dy)/l2;
  const cross=((point.x-oldFrom.x)*-dy+(point.y-oldFrom.y)*dx)/Math.sqrt(l2);
  const nx=newTo.x-newFrom.x,ny=newTo.y-newFrom.y,nl=Math.hypot(nx,ny)||1;
  return {x:newFrom.x+nx*t-ny/nl*cross,y:newFrom.y+ny*t+nx/nl*cross};
}

/** The simulation keeps its topology/IDs, including travellers and devices in
 * existing saves. Only the measured stage geometry changes. */
export function applyTableauGeometry(level:WorldLevel):WorldLevel {
  level.previousGeometry=structuredClone({revision:level.revision??3,width:level.width,height:level.height,pace:level.pace,creatureHeight:level.creatureHeight,inkBudget:level.inkBudget,nodes:level.nodes,edges:level.edges,devices:level.devices,drawings:level.drawings}) as WorldGeometry;
  const before=level.previousGeometry;
  level.height=TABLEAU_HEIGHT;level.revision=4;level.creatureHeight*=2;
  level.pace=130;level.inkBudget=6000;level.masteryInk=6000;
  for(const node of level.nodes)node.y*=2;
  for(const device of level.devices){device.y*=2;if(device.low)device.low.y*=2;if(device.high)device.high.y*=2;if(device.pivot)device.pivot.y*=2;
    if(device.width)device.width*=1.7;if(device.length)device.length*=2;if(device.radius)device.radius*=1.7;}
  for(let index=0;index<TABLEAU_COUNT;index++){
    const key=`s${index*2}:`,layout=index===0?openings[level.id]:plates[level.id]?.[index];if(!layout)continue;
    const sx=index===0?1:TABLEAU_WIDTH/1672,sy=index===0?1:TABLEAU_HEIGHT/941;
    const position=([x,y]:XY):Point=>({x:index*TABLEAU_WIDTH+x*sx,y:y*sy});
    for(const [id,xy] of Object.entries(layout.nodes))Object.assign(level.nodes.find(n=>n.id===key+id)!,position(xy));
    for(const [id,xy] of Object.entries(layout.devices??{})){const device=level.devices.find(d=>d.id===key+id);if(device)Object.assign(device,position(xy));}
    for(const [id,xy] of Object.entries(layout.pivots??{})){const device=level.devices.find(d=>d.id===key+id);if(device)device.pivot=position(xy);}
  }
  const refuge=level.nodes.find(n=>n.id===level.goal),last=level.nodes.find(n=>n.id==='s8:rest');if(refuge&&last)refuge.y=last.y;
  for(const edge of level.edges){
    const a=level.nodes.find(n=>n.id===edge.from)!,b=level.nodes.find(n=>n.id===edge.to)!;
    const index=tableauIndex(a.x),key=`s${index*2}:`,layout=index===0?openings[level.id]:plates[level.id]?.[index],path=layout?.paths?.[edge.id.slice(key.length)];
    const sx=index===0?1:TABLEAU_WIDTH/1672,sy=index===0?1:TABLEAU_HEIGHT/941;
    edge.path=path?path.map(([x,y])=>({x:index*TABLEAU_WIDTH+x*sx,y:y*sy})):[{x:a.x,y:a.y},{x:b.x,y:b.y}];
    if(edge.kind==='drawn'){
      const drawing=level.drawings.find(d=>d.id===edge.drawingId)!,old=before.drawings.find(d=>d.id===edge.drawingId)!;
      drawing.from={x:a.x,y:a.y};drawing.to={x:b.x,y:b.y};drawing.corridor=180;
      drawing.suggested=old.suggested.map(p=>movedPoint(p,old.from,old.to,drawing.from,drawing.to));
      drawing.inkLimit=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*1.36);
    }
  }
  for(const device of level.devices){
    if(device.kind==='counterweight'){
      const at=level.nodes.find(n=>device.weightNodes?.includes(n.id));if(at)device.low={x:at.x,y:at.y};
      device.width=(device.requiredLoad??2)*95+135;
    }
    if(device.kind==='lift'){
      const edge=level.edges.find(e=>e.deviceId===device.id&&e.kind==='lift');if(edge){const a=level.nodes.find(n=>n.id===edge.from)!,b=level.nodes.find(n=>n.id===edge.to)!;device.low={x:a.x,y:a.y};device.high={x:b.x,y:b.y};device.width=270;}
    }
    if(device.activationNodeId){const node=level.nodes.find(n=>n.id===device.activationNodeId);if(node){device.x=node.x;device.y=node.y-105;}}
    const index=tableauIndex(device.x),layout=plates[level.id]?.[index],id=device.id.slice(`s${index*2}:`.length);
    if(layout?.widths?.[id])device.width=layout.widths[id]*TABLEAU_WIDTH/1672;
    if(layout?.lengths?.[id])device.length=layout.lengths[id]*TABLEAU_HEIGHT/941;
  }
  return level;
}

export const tableauAsset=(id:WorldId,index:number)=>index===0?`worlds/${id}-scene.png`:`worlds/${id}-tableau-${index+1}.webp`;

export function windArtwork(level:WorldLevel,point:Point){
  const index=tableauIndex(point.x),art=plates[level.id]?.[index]?.art?.wind;
  return art?{...art,center:{x:index*TABLEAU_WIDTH+art.center[0]*TABLEAU_WIDTH/1672,y:art.center[1]*TABLEAU_HEIGHT/941},width:art.width*TABLEAU_WIDTH/1672}:null;
}
