import type {DeviceDefinition,Gate,Point,RouteEdge,RouteNode,WorldId,WorldLevel} from './types';
import {applyTableauGeometry} from './tableaux';
import {MECHANICAL_GRAVITY} from './mechanics';

const point=(x:number,y:number):Point=>({x,y});
const on=(deviceId:string):Gate=>({deviceId,mode:1,minProgress:.98});
export interface ExpeditionNetwork {
  id:string;kind:'weight'|'wind'|'scout'|'lift'|'double'|'hazard';
  start:string;end:string;relay:string;drawings:string[];forks:string[];weights:string[];
  wind?:string;cleat?:string;lift?:string;
  hazards:Array<{gate:string;pendulum:string;brake:string;edge:string;approach:string}>;
}
interface Builder {level:WorldLevel;networks:ExpeditionNetwork[]}

function node(b:Builder,id:string,x:number,y:number,extra:Partial<RouteNode>={}):string {
  b.level.nodes.push({id,x,y,...extra});return id;
}
function device(b:Builder,id:string,kind:DeviceDefinition['kind'],x:number,y:number,label:string,extra:Partial<DeviceDefinition>={}):string {
  b.level.devices.push({id,kind,x,y,label,description:'',modes:['Repos','Actif'],initialMode:0,...extra});return id;
}
function edge(b:Builder,id:string,from:string,to:string,extra:Partial<RouteEdge>={}):string {
  const a=b.level.nodes.find(n=>n.id===from)!,z=b.level.nodes.find(n=>n.id===to)!;
  b.level.edges.push({id,from,to,path:[point(a.x,a.y),point(z.x,z.y)],kind:'ground',...extra});return id;
}
function draw(b:Builder,n:ExpeditionNetwork,id:string,from:string,to:string,extra:Partial<RouteEdge>={}):string {
  const a=b.level.nodes.find(n=>n.id===from)!,z=b.level.nodes.find(n=>n.id===to)!;
  const fromPoint=point(a.x,a.y),toPoint=point(z.x,z.y),length=Math.hypot(z.x-a.x,z.y-a.y);
  b.level.drawings.push({id,label:'Le fil',from:fromPoint,to:toPoint,corridor:115,inkLimit:Math.ceil(length*1.28),hint:'',suggested:[fromPoint,point((a.x+z.x)/2,(a.y+z.y)/2-18),toPoint]});
  n.drawings.push(id);edge(b,id,from,to,{kind:'drawn',drawingId:id,...extra});return id;
}
function makeNetwork(b:Builder,index:number,kind:ExpeditionNetwork['kind']):{n:ExpeditionNetwork;x:number;k:string} {
  const k=`s${index*2}`,x=index*3200;
  const start=node(b,`${k}:start`,x+100,650,index===0?{kind:'spawn'}:{});
  const end=node(b,`${k}:rest`,x+3000,650,{kind:'checkpoint',checkpointLabel:b.level.sectors![index*2+1].name});
  const n:ExpeditionNetwork={id:k,kind,start,end,relay:`${k}:relay`,drawings:[],forks:[],weights:[],hazards:[]};
  b.networks.push(n);return {n,x,k};
}
function relay(b:Builder,n:ExpeditionNetwork,at:string,count=2):void {
  const target=b.level.nodes.find(node=>node.id===at)!;
  target.arrivalTrigger={deviceId:n.relay,mode:1,minVisitors:count};
  device(b,n.relay,'gate',target.x,target.y-72,'La borne',{modes:['En attente','Liée'],playerControlled:false,activationNodeId:at,duration:.7});
}
function fork(b:Builder,n:ExpeditionNetwork,id:string,at:string,modes=['Tout droit','Vers le plateau']):void {
  const atNode=b.level.nodes.find(node=>node.id===at)!;
  device(b,id,'splitter',atNode.x,atNode.y-50,'L’aiguillage',{modes});n.forks.push(id);
}
function weight(b:Builder,n:ExpeditionNetwork,id:string,at:string,count:number):void {
  const atNode=b.level.nodes.find(node=>node.id===at)!;
  Object.assign(atNode,{kind:'weight',capacity:count,deviceId:id});
  device(b,id,'counterweight',atNode.x,atNode.y-70,'Le plateau à contrepoids',{modes:['Libérer le cran','Bloquer le cran'],requiredLoad:count,weightNodes:[at],low:point(atNode.x,atNode.y),width:count*50+50,duration:1.1,
    description:`Le poids de ${count} compagnons fait descendre ce plateau et relève le pont par le câble. Bloque le cran lorsque les appuis se rejoignent, puis les porteurs peuvent repartir.`});
  n.weights.push(id);
}
function wind(b:Builder,n:ExpeditionNetwork,x:number,y:number):void {
  n.wind=`${n.id}:wind`;n.cleat=`${n.id}:cleat`;
  device(b,n.wind,'wind',x,y,'Le moulin à vent',{modes:['Arrêter le souffle','Souffler vers la roue'],lockDeviceId:n.cleat,duration:2.4,
    description:'Le souffle entraîne la roue, qui enroule le câble du pont. Le taquet peut retenir le câble une fois le pont en place.'});
  device(b,n.cleat,'latch',x+150,y+70,'Le taquet du câble',{modes:['Libérer le câble','Retenir le pont'],powerDeviceId:n.wind,gates:[{deviceId:n.wind,minProgress:.98}],
    description:'Coince le câble dans le taquet pour garder le pont à hauteur, même lorsque le vent s’arrête.'});
}

/** The visible local relay frees the porters once the leading group crosses.
 * A later tableau must never retain companions behind an already lit relay. */
function weightNetwork(b:Builder,index:number,count:number):void {
  const {n,x,k}=makeNetwork(b,index,'weight');
  const junction=node(b,`${k}:fork-node`,x+380,650),pan=node(b,`${k}:pan`,x+800,770);
  const near=node(b,`${k}:near`,x+1200,445),far=node(b,`${k}:far`,x+1820,445),returnBank=node(b,`${k}:return-bank`,x+1430,770);
  const selector=`${k}:fork`,balance=`${k}:balance`;fork(b,n,selector,junction);weight(b,n,balance,pan,count);
  edge(b,`${k}:entry`,n.start,junction);
  draw(b,n,`${k}:weight-thread`,junction,pan,{route:{deviceId:selector,mode:1},maxPassages:count,gates:[{deviceId:balance,mode:0}]});
  edge(b,`${k}:upper-road`,junction,near,{route:{deviceId:selector,mode:0},terrain:'platform'});
  draw(b,n,`${k}:high-thread`,near,far);
  edge(b,`${k}:far-road`,far,n.end,{terrain:'platform'});
  draw(b,n,`${k}:return-thread`,pan,returnBank,{gates:[on(balance)]});
  edge(b,`${k}:low-road`,returnBank,n.end);relay(b,n,far,2);
}

/** Wind does work on a receiver and its cable; the fan never pushes the troupe. */
function windNetwork(b:Builder,index:number,withLift=false):void {
  const {n,x,k}=makeNetwork(b,index,withLift?'lift':'wind');
  wind(b,n,x+1000,330);
  const near=node(b,`${k}:near`,x+900,650),middle=node(b,`${k}:middle`,x+1480,650);
  edge(b,`${k}:entry`,n.start,near);
  draw(b,n,`${k}:wind-thread`,near,middle);
  let high=middle;
  if(withLift){
    high=node(b,`${k}:high`,x+1480,390);n.lift=`${k}:lift`;
    device(b,n.lift,'lift',x+1480,570,'Le treuil de la nacelle',{modes:['Dérouler le câble','Tourner la manivelle'],low:point(x+1480,650),high:point(x+1480,390),width:155,gates:[],duration:2.2,
      description:'La manivelle enroule le câble et soulève la nacelle. Attends que les compagnons embarquent ; redescends à vide pour les suivants.'});
    edge(b,`${k}:elevator`,middle,high,{kind:'lift',deviceId:n.lift,capacity:3,terrain:'platform'});
  }
  const near2=node(b,`${k}:near2`,x+1760,withLift?390:500),far=node(b,`${k}:far`,x+2300,withLift?390:500);
  edge(b,`${k}:middle-road`,high,near2,{terrain:'platform'});
  draw(b,n,`${k}:far-thread`,near2,far);
  edge(b,`${k}:far-road`,far,n.end,{terrain:'platform'});relay(b,n,far,2);
}

/** Exactly two scouts take the lower feeder; their arrival opens the long bridge. */
function scoutNetwork(b:Builder,index:number,withWind=false):void {
  const {n,x,k}=makeNetwork(b,index,'scout');
  const junction=node(b,`${k}:fork-node`,x+370,650),low=node(b,`${k}:low`,x+800,760),lowFar=node(b,`${k}:low-far`,x+1370,760);
  const trigger=node(b,`${k}:switch-bank`,x+2200,720),near=node(b,`${k}:near`,x+1120,400),far=node(b,`${k}:far`,x+1790,400);
  const selector=`${k}:fork`;fork(b,n,selector,junction,['Sur la crête','Éclaireurs']);
  if(withWind){n.wind=`${k}:wind`;device(b,n.wind,'wind',x+900,510,'Le moulin du petit pont',{modes:['Arrêter le souffle','Souffler vers la roue'],duration:1.5,
    description:'Le ventilateur souffle vers la petite roue. Son treuil relève le passage des éclaireurs et son cliquet le retient.'});}
  edge(b,`${k}:entry`,n.start,junction);
  edge(b,`${k}:scout-road`,junction,low,{route:{deviceId:selector,mode:1},maxPassages:2});
  draw(b,n,`${k}:scout-thread`,low,lowFar);
  edge(b,`${k}:relay-road`,lowFar,trigger);edge(b,`${k}:low-road`,trigger,n.end);
  edge(b,`${k}:upper-road`,junction,near,{route:{deviceId:selector,mode:0},terrain:'platform'});
  draw(b,n,`${k}:high-thread`,near,far);
  edge(b,`${k}:far-road`,far,n.end,{terrain:'platform'});relay(b,n,trigger,2);
}

function liftNetwork(b:Builder,index:number):void {
  const {n,x,k}=makeNetwork(b,index,'lift');
  const junction=node(b,`${k}:fork-node`,x+370,650),pan=node(b,`${k}:pan`,x+800,770),low=node(b,`${k}:low`,x+1250,650),high=node(b,`${k}:high`,x+1250,390);
  const near=node(b,`${k}:near`,x+1740,390),far=node(b,`${k}:far`,x+2300,390),returnBank=node(b,`${k}:return-bank`,x+1430,770);
  const selector=`${k}:fork`,balance=`${k}:balance`;fork(b,n,selector,junction);weight(b,n,balance,pan,2);n.lift=`${k}:lift`;
  device(b,n.lift,'lift',x+1250,570,'Le treuil de la nacelle',{modes:['Dérouler le câble','Tourner la manivelle'],low:point(x+1250,650),high:point(x+1250,390),width:155,duration:2.2,gates:[],
    description:'Tourne la manivelle pour hisser la nacelle et ses passagers. La charge ralentit la montée ; les paliers arrêtent la course.'});
  edge(b,`${k}:entry`,n.start,junction);
  draw(b,n,`${k}:weight-thread`,junction,pan,{route:{deviceId:selector,mode:1},maxPassages:2,gates:[{deviceId:balance,mode:0}]});
  edge(b,`${k}:main-road`,junction,low,{route:{deviceId:selector,mode:0}});
  edge(b,`${k}:elevator`,low,high,{kind:'lift',deviceId:n.lift,capacity:3,terrain:'platform'});
  edge(b,`${k}:upper-road`,high,near,{terrain:'platform'});
  draw(b,n,`${k}:high-thread`,near,far);
  edge(b,`${k}:far-road`,far,n.end,{terrain:'platform'});
  draw(b,n,`${k}:return-thread`,pan,returnBank,{gates:[on(balance)]});
  edge(b,`${k}:low-road`,returnBank,n.end);relay(b,n,far,2);
}

/** Two separately loaded balances power the central span; one-sided routing cannot work. */
function doubleNetwork(b:Builder,index:number):void {
  const {n,x,k}=makeNetwork(b,index,'double');
  const junctionA=node(b,`${k}:fork-a-node`,x+350,650),junctionB=node(b,`${k}:fork-b-node`,x+900,520);
  const panA=node(b,`${k}:pan-a`,x+790,770),panB=node(b,`${k}:pan-b`,x+1300,620);
  const returnA=node(b,`${k}:return-a`,x+1430,770),returnB=node(b,`${k}:return-b`,x+1920,620);
  const near=node(b,`${k}:near`,x+1570,340),far=node(b,`${k}:far`,x+2260,340);
  const forkA=`${k}:fork-a`,forkB=`${k}:fork-b`,balanceA=`${k}:balance-a`,balanceB=`${k}:balance-b`;
  fork(b,n,forkA,junctionA);fork(b,n,forkB,junctionB);weight(b,n,balanceA,panA,2);weight(b,n,balanceB,panB,2);
  edge(b,`${k}:entry`,n.start,junctionA);
  draw(b,n,`${k}:weight-a-thread`,junctionA,panA,{route:{deviceId:forkA,mode:1},maxPassages:2,gates:[{deviceId:balanceA,mode:0}]});
  edge(b,`${k}:middle-road`,junctionA,junctionB,{route:{deviceId:forkA,mode:0},terrain:'platform'});
  draw(b,n,`${k}:weight-b-thread`,junctionB,panB,{route:{deviceId:forkB,mode:1},maxPassages:2,gates:[{deviceId:balanceB,mode:0}]});
  edge(b,`${k}:upper-road`,junctionB,near,{route:{deviceId:forkB,mode:0},terrain:'platform'});
  draw(b,n,`${k}:high-thread`,near,far);
  edge(b,`${k}:far-road`,far,n.end,{terrain:'platform'});
  draw(b,n,`${k}:return-a-thread`,panA,returnA,{gates:[on(balanceA)]});
  draw(b,n,`${k}:return-b-thread`,panB,returnB,{gates:[on(balanceB)]});
  edge(b,`${k}:low-a-road`,returnA,n.end);edge(b,`${k}:low-b-road`,returnB,n.end,{terrain:'platform'});relay(b,n,far,2);
}

function hazardNetwork(b:Builder,index:number,double=false):void {
  const {n,x,k}=makeNetwork(b,index,'hazard');
  const approach=node(b,`${k}:approach`,x+650,700);
  edge(b,`${k}:entry`,n.start,approach);
  const first=node(b,`${k}:entry-a`,x+1020,700);
  draw(b,n,`${k}:near-thread`,approach,first);
  const addHazard=(suffix:string,entry:string,relative:number,phase:number,period:number)=>{
    const exit=node(b,`${k}:exit-${suffix}`,x+relative+250,700),gateId=`${k}:gate-${suffix}`,pendulum=`${k}:pendulum-${suffix}`,brake=`${k}:brake-${suffix}`;
    device(b,gateId,'gate',x+relative-35,650,'La barrière',{modes:['Retenir','Un éclaireur'],autoCloseAfter:1,holdOpenDeviceId:brake});
    device(b,pendulum,'pendulum',x+relative+127,460,'Le balancier',{modes:['En mouvement'],pivot:point(x+relative+127,460),length:190,radius:44,duration:period,phase,lockDeviceId:brake});
    device(b,brake,'gate',x+relative+250,630,'Le frein',{modes:['En attente','Serré'],playerControlled:false,activationNodeId:exit,duration:1.2});
    b.level.nodes.find(node=>node.id===exit)!.arrivalTrigger={deviceId:brake,mode:1,minVisitors:2};
    const hazardEdge=edge(b,`${k}:hazard-${suffix}`,entry,exit,{kind:'hazard',deviceId:pendulum,gates:[{deviceId:gateId,mode:1}]});
    n.hazards.push({gate:gateId,pendulum,brake,edge:hazardEdge,approach:entry});
    const pocket=node(b,`${k}:safe-${suffix}`,x+relative+400,700);
    edge(b,`${k}:safe-road-${suffix}`,exit,pocket,{terrain:'platform'});return pocket;
  };
  const exitA=addHazard('a',first,1020,.8,12);
  let final=exitA;
  if(double){
    const middle=node(b,`${k}:entry-b`,x+2150,700);
    draw(b,n,`${k}:middle-thread`,exitA,middle);
    final=addHazard('b',middle,2150,2.1,14);
  }
  const last=node(b,`${k}:far`,x+2750,650);
  draw(b,n,`${k}:far-thread`,final,last);
  edge(b,`${k}:home-road`,last,n.end);relay(b,n,last,2);
}

const names:Record<WorldId,string[]>={
  boucles:['Le premier nœud','Les porteurs du ciel','Le souffle en réserve','Les liens lointains','La rivière dédoublée','Les sentinelles d’encre','Le grand balancement','La remontée bleue','Les deux plateaux','Le cercle retrouvé'],
  plis:['Le pli du vent','Le moulin immobile','Les deux messagers','Le courant contraire','Le poids du papier','Les promesses suspendues','La tour des souffles','Le retour des rubans','La double pliure','La maison des feuilles'],
  veilleurs:['La clef de la nacelle','Le premier atelier','Les battements du cuivre','Les deux éclaireurs','Le poids des étoiles','Les chaînes croisées','Le souffle des braises','Les quatre retrouvailles','Les horloges jumelles','La veilleuse du bout'],
};
const settings={
  boucles:{name:'Les Boucles',number:1,stageName:'Le grand fil',palette:{ink:'#193451',paper:'#f5e7cc',accent:'#ce664d',glow:'#e7b858'},creatureHeight:75},
  plis:{name:'Petits Plis',number:2,stageName:'Le pays des vents',palette:{ink:'#6e5845',paper:'#e9d4b1',accent:'#c7784b',glow:'#f1c77b'},creatureHeight:65},
  veilleurs:{name:'Les Veilleurs',number:3,stageName:'La longue veille',palette:{ink:'#f5dcac',paper:'#302629',accent:'#dcae64',glow:'#ffd687'},creatureHeight:70},
};

/** Mechanical topology is authored after the illustration coordinates. Every
 * cable stays in its tableau, and every driven route uses its actual pose. */
function attachMechanisms({level,networks}:Builder):void {
  const findDevice=(id:string)=>level.devices.find(device=>device.id===id)!;
  const findEdge=(id:string)=>level.edges.find(edge=>edge.id===id)!;
  const bridge=(id:string,drivers:string[])=>{
    const edge=findEdge(id);edge.mechanism={drivers,restAngle:.49};
    const drawing=level.drawings.find(drawing=>drawing.id===id);
    if(drawing){drawing.label=drivers.length===2?'Les deux demi-ponts':'Le pont articulé';
      drawing.hint='Relie les deux appuis. Le câble relève ensuite le tablier jusqu’au palier.';}
  };
  const pressure=(id:string,at:string,brake=false)=>{
    const definition=findDevice(id),node=level.nodes.find(node=>node.id===at)!;
    definition.requiredLoad=2;definition.weightNodes=[at];definition.low={x:node.x,y:node.y};definition.width=260;
    definition.mechanics={travel:14,mass:1.55,automaticRatchet:true};
    definition.label=brake?'La pédale du frein':'La pédale à deux places';
    definition.modes=['Pédale libre',brake?'Frein armé':'Câble retenu'];
    definition.description=brake?'Deux compagnons appuient sur la pédale. La tringle arme le frein, qui retient le balancier lorsqu’il s’écarte du passage.'
      :'Deux compagnons font descendre la pédale. Le câble relève le grand pont et le cliquet le retient ; les éclaireurs peuvent ensuite repartir.';
    node.kind='wait';node.capacity=2;node.deviceId=id;
  };
  // Source is the outlet, target is the receiving wheel. A deflector is drawn
  // before the first paper outlet; natural-wind intakes have visible shutters.
  const winds:Partial<Record<WorldId,Record<string,{source:Point;target:Point;range:number}>>>={
    boucles:{'s2:wind':{source:point(3450,608.289),target:point(4099.522,608.289),range:900}},
    plis:{'s0:wind':{source:point(1100,620),target:point(1982,302),range:1300},
      's2:wind':{source:point(5395.215,1048.246),target:point(4555,1050),range:1180},
      's6:wind':{source:point(10681.34,482.041),target:point(11146.411,415.09),range:700}},
    veilleurs:{'s6:wind':{source:point(10419.139,753.666),target:point(10681.34,753.666),range:420}},
  };
  for(const network of networks){
    const key=network.id;
    for(const id of network.weights){const definition=findDevice(id);
      definition.mechanics={travel:88,mass:(definition.requiredLoad??2)-.45,damping:2.8};}
    if(network.weights.length)bridge(`${key}:high-thread`,network.weights);
    if(network.kind==='scout'){
      pressure(network.relay,`${key}:switch-bank`);
      bridge(`${key}:high-thread`,[network.relay]);
    }else{
      const marker=findDevice(network.relay);marker.label='Le repère';marker.description='La troupe est passée par ce repère. Le souvenir se garde lorsque tout le monde a rejoint la sortie.';
      marker.modes=['En attente','Visité'];
    }
    if(network.wind){
      const definition=findDevice(network.wind),layout=winds[level.id]?.[network.wind];
      if(layout){
        const dx=layout.target.x-layout.source.x,dy=layout.target.y-layout.source.y,length=Math.hypot(dx,dy);
        definition.mechanics={automaticRatchet:!network.cleat,wind:{...layout,direction:point(dx/length,dy/length),cone:.16,radius:72}};
      }
      bridge(`${key}:${network.kind==='scout'?'scout':'wind'}-thread`,[network.wind]);
    }
    if(network.lift){const lift=findDevice(network.lift);lift.mechanics={mass:1.8,damping:3.1};}
    for(const hazard of network.hazards){
      const definition=findDevice(hazard.brake);pressure(hazard.brake,definition.activationNodeId!,true);
      const pendulum=findDevice(hazard.pendulum);
      // The pivot's geared wheel adds rotational inertia. An ideal bearing
      // keeps the clockwork moving until its separate parking brake engages.
      pendulum.mechanics={damping:0,inertia:MECHANICAL_GRAVITY/((pendulum.length??190)*(Math.PI*2/(pendulum.duration??7))**2)};
      pendulum.description='Le poids du balancier le fait osciller. Laisse passer un éclaireur quand le poids s’écarte ; deux éclaireurs peuvent armer sa retenue.';
      findDevice(hazard.gate).description='Ouvre le portillon pour un seul éclaireur. Il se referme derrière lui ; le frein libère ensuite le passage de toute la troupe.';
    }
  }
}

function buildWorld(id:WorldId):Builder {
  const b:Builder={level:{id,...settings[id],revision:3,width:16000,height:900,total:12,rescueTarget:10,
    description:'Une troupe, un trait, un long chemin.',objective:'Réunis les compagnons au refuge.',spawn:'s0:start',goal:'refuge',
    nodes:[],edges:[],devices:[],drawings:[],hints:[],spawnInterval:.85,pace:96,inkBudget:4400,masteryInk:4400,
    masteryGoal:'Réunis les douze compagnons. Récupère l’encre des passages quittés pour continuer.',
    sectors:names[id].map((name,index)=>({id:`s${index}`,x:index*1600,width:1600,name,style:id}))},networks:[]};
  if(id==='boucles'){
    weightNetwork(b,0,3);windNetwork(b,1);
    scoutNetwork(b,2);liftNetwork(b,3);doubleNetwork(b,4);
  }else if(id==='plis'){
    windNetwork(b,0);scoutNetwork(b,1,true);weightNetwork(b,2,3);
    windNetwork(b,3,true);doubleNetwork(b,4);
  }else{
    liftNetwork(b,0);hazardNetwork(b,1);doubleNetwork(b,2);
    windNetwork(b,3,true);hazardNetwork(b,4,true);
  }
  for(let i=1;i<b.networks.length;i++)edge(b,`link:${i}`,b.networks[i-1].end,b.networks[i].start);
  node(b,'refuge',15900,650,{kind:'goal'});edge(b,'home',b.networks.at(-1)!.end,'refuge');
  applyTableauGeometry(b.level);
  attachMechanisms(b);
  return b;
}
const built=(['boucles','plis','veilleurs'] as const).map(buildWorld);
export const WORLD_LEVELS:WorldLevel[]=built.map(item=>item.level);
/** Structural IDs for validation and repeatable walkthroughs; no scripted game solution. */
export const WORLD_NETWORKS:Record<WorldId,ExpeditionNetwork[]>=Object.fromEntries(built.map(item=>[item.level.id,item.networks])) as Record<WorldId,ExpeditionNetwork[]>;
export const getWorld=(id:WorldId):WorldLevel=>WORLD_LEVELS.find(world=>world.id===id)??WORLD_LEVELS[0];
