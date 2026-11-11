import type {DrawingDefinition, Point, WorldAct, WorldLevel, WorldObjective} from './types';

const p=(x:number,y:number):Point=>({x,y});
const drawing=(id:string,label:string,from:Point,to:Point,inkLimit:number,hint:string,suggested?:Point[]):DrawingDefinition=>({
  id,label,from,to,inkLimit,hint,corridor:145,suggested:suggested??[from,p((from.x+to.x)/2,(from.y+to.y)/2-35),to],
});

const BASE_LEVELS:WorldLevel[]=[
  {
    id:'boucles',number:1,name:'Les Boucles',stageName:'Le poids de l’entraide',
    description:'Une vallée d’encre, une nacelle et douze petits caractères.',
    objective:'Guide les Boucles jusqu’à l’arche. Leur poids peut soulever le passage.',
    width:1600,height:900,total:12,rescueTarget:10,spawn:'source',goal:'refuge',
    palette:{ink:'#193451',paper:'#f5e7cc',accent:'#ce664d',glow:'#e7b858'},
    creatureHeight:75,spawnInterval:1.15,pace:48,masteryInk:930,
    masteryGoal:'Réunis les douze Boucles avec au plus 930 unités d’encre.',
    nodes:[
      {id:'source',...p(135,505),kind:'spawn'},
      {id:'fork',...p(490,470)},
      {id:'upper',...p(720,382),kind:'wait'},
      {id:'cradle',...p(800,666),kind:'weight',deviceId:'balance',capacity:3},
      {id:'landing',...p(1190,380)},
      {id:'refuge',...p(1470,375),kind:'goal'},
    ],
    devices:[
      {id:'fork',kind:'splitter',...p(490,505),label:'Aiguillage',description:'Choisis quel chemin la troupe emprunte.',modes:['Vers le pont','Vers la nacelle'],initialMode:0},
      {id:'balance',kind:'counterweight',...p(835,710),label:'Le contrepoids',description:'Trois Boucles abaissent la nacelle. Le cliquet maintient ensuite le passage et libère les porteuses.',modes:['Nacelle libre','Cliquet enclenché'],initialMode:0,requiredLoad:3,weightNodes:['cradle'],duration:2.2,low:p(835,666),high:p(835,565)},
    ],
    drawings:[
      drawing('sky-bridge','La passerelle',p(720,382),p(1190,380),650,'Relie les deux rives au-dessus de la nacelle.'),
      drawing('cradle-return','Le retour des porteuses',p(860,666),p(1190,380),620,'Un second trait permet aux porteuses de rejoindre la sortie.',[p(860,666),p(1000,565),p(1095,455),p(1190,380)]),
    ],
    edges:[
      {id:'entry',from:'source',to:'fork',kind:'ground',path:[p(135,505),p(300,490),p(390,478),p(490,470)]},
      {id:'ridge',from:'fork',to:'upper',kind:'ground',path:[p(490,470),p(590,457),p(630,438),p(670,393),p(720,382)],route:{deviceId:'fork',mode:0}},
      {id:'weight-descent',from:'fork',to:'cradle',kind:'ground',path:[p(490,470),p(550,490),p(610,555),p(655,650),p(800,666)],route:{deviceId:'fork',mode:1}},
      {id:'upper-bridge',from:'upper',to:'landing',kind:'drawn',path:[p(720,382),p(1190,380)],drawingId:'sky-bridge',gates:[{deviceId:'balance',minProgress:.96}]},
      {id:'weight-return',from:'cradle',to:'landing',kind:'drawn',path:[p(860,666),p(1190,380)],drawingId:'cradle-return',gates:[{deviceId:'balance',mode:1,minProgress:.96}]},
      {id:'home',from:'landing',to:'refuge',kind:'ground',path:[p(1190,380),p(1320,382),p(1470,375)]},
    ],
    hints:[
      'Observe les cordes : la nacelle et le passage sont reliés. Un groupe peut aider l’autre.',
      'Oriente l’aiguillage vers la nacelle. Trois Boucles suffisent pour soulever le mécanisme ; les suivantes attendent leur tour.',
      'Une fois la nacelle chargée, enclenche son cliquet. Dessine le grand pont puis le retour des porteuses, et renvoie le reste de la troupe vers le pont.',
    ],
  },
  {
    id:'plis',number:2,name:'Petits Plis',stageName:'Le vent a ses raisons',
    description:'Dans le théâtre de papier, le vent transporte autant qu’il bouscule.',
    objective:'Trouve une route vers l’enveloppe. Le vent peut faire tourner le moulin ou protéger le passage bas.',
    width:1600,height:900,total:12,rescueTarget:10,spawn:'source',goal:'refuge',
    palette:{ink:'#6e5845',paper:'#e9d4b1',accent:'#c7784b',glow:'#f1c77b'},
    creatureHeight:65,spawnInterval:1.15,pace:47,masteryInk:660,
    masteryGoal:'Réunis les douze Plis, bloque le taquet du moulin, mets le vent à l’abri et utilise au plus 660 unités d’encre.',
    masteryDevices:[{deviceId:'cleat',mode:1},{deviceId:'deflector',mode:2,minProgress:.96}],
    nodes:[
      {id:'source',...p(70,510),kind:'spawn'},
      {id:'fork',...p(685,510)},
      {id:'upper',...p(785,510),kind:'wait'},
      {id:'upper-end',...p(1175,450),kind:'wait'},
      {id:'low',...p(1000,690)},
      {id:'landing',...p(1280,580)},
      {id:'refuge',...p(1440,585),kind:'goal'},
    ],
    devices:[
      {id:'deflector',kind:'wind',...p(552,305),label:'Le déflecteur',description:'Le souffle peut viser le moulin, traverser le chemin ou être écarté.',modes:['Vent de face','Vers le moulin','À l’abri'],initialMode:0,duration:3.3,lockDeviceId:'cleat'},
      {id:'fork',kind:'splitter',...p(680,558),label:'Le pli de direction',description:'Choisis la passerelle haute ou le grand détour.',modes:['Passage haut','Détour en bas'],initialMode:0},
      {id:'cleat',kind:'latch',...p(1138,326),label:'Le taquet du moulin',description:'Bloque la corde lorsque la passerelle est en haut, puis écarte le vent.',modes:['Corde libre','Corde bloquée'],initialMode:0,gates:[{deviceId:'deflector',minProgress:.96}]},
    ],
    drawings:[
      drawing('paper-bridge','Le pont de papier',p(785,510),p(1175,450),580,'Dessine un pont vers la passerelle du moulin.'),
      drawing('paper-detour','Le pli du grand détour',p(685,510),p(1000,690),600,'Une longue rampe rejoint le passage inférieur.',[p(685,510),p(790,565),p(900,645),p(1000,690)]),
    ],
    edges:[
      {id:'entry',from:'source',to:'fork',kind:'ground',path:[p(70,510),p(260,511),p(485,513),p(685,510)]},
      {id:'upper-rim',from:'fork',to:'upper',kind:'ground',path:[p(685,510),p(785,510)],route:{deviceId:'fork',mode:0},gates:[{deviceId:'deflector',notMode:0}]},
      {id:'upper-crossing',from:'upper',to:'upper-end',kind:'drawn',path:[p(785,510),p(1175,450)],drawingId:'paper-bridge',gates:[{deviceId:'deflector',minProgress:.96}]},
      {id:'windy-descent',from:'upper-end',to:'landing',kind:'ground',path:[p(1175,450),p(1215,495),p(1240,560),p(1280,580)],gates:[{deviceId:'deflector',mode:2}]},
      {id:'lower-fold',from:'fork',to:'low',kind:'drawn',path:[p(685,510),p(1000,690)],drawingId:'paper-detour',route:{deviceId:'fork',mode:1},gates:[{deviceId:'deflector',mode:2}]},
      {id:'lower-approach',from:'low',to:'landing',kind:'ground',path:[p(1000,690),p(1140,668),p(1195,640),p(1240,585),p(1280,580)]},
      {id:'home',from:'landing',to:'refuge',kind:'ground',path:[p(1280,580),p(1360,583),p(1440,585)]},
    ],
    hints:[
      'La longue route et la route du moulin sont toutes les deux possibles. Regarde où souffle le vent.',
      'La route basse demande une rampe et le déflecteur en position « À l’abri ». Pour maîtriser le monde et gagner la troisième étoile, fais aussi fonctionner le moulin et bloque son taquet.',
      'Route haute : souffle vers le moulin, attends la montée, bloque le taquet, puis place le déflecteur à l’abri. Le pont dessiné reste alors soutenu.',
    ],
  },
  {
    id:'veilleurs',number:3,name:'Les Veilleurs',stageName:'La mécanique du soir',
    description:'Douze petites lumières explorent un atelier qui s’éveille.',
    objective:'Répartis les Veilleurs, commande l’ascenseur et réunis la troupe devant la maison.',
    width:1600,height:900,total:12,rescueTarget:10,spawn:'source',goal:'refuge',
    palette:{ink:'#f5dcac',paper:'#302629',accent:'#dcae64',glow:'#ffd687'},
    creatureHeight:70,spawnInterval:1.2,pace:45,masteryInk:1150,
    masteryGoal:'Réunis les douze Veilleurs avec au plus 1 150 unités d’encre.',
    nodes:[
      {id:'source',...p(220,424),kind:'spawn'},
      {id:'fork',...p(360,460)},
      {id:'balance-pan',...p(590,360),kind:'weight',deviceId:'balance',capacity:2},
      {id:'lift-entry',...p(645,500),kind:'wait'},
      {id:'lift-top',...p(735,400)},
      {id:'upper',...p(950,400),kind:'wait'},
      {id:'underpass',...p(500,700)},
      {id:'pendulum-entry',...p(945,700),kind:'wait'},
      {id:'pendulum-exit',...p(1195,700)},
      {id:'low-end',...p(1300,700),kind:'wait'},
      {id:'landing',...p(1350,455)},
      {id:'refuge',...p(1470,455),kind:'goal'},
    ],
    devices:[
      {id:'fork',kind:'splitter',...p(365,505),label:'Le répartiteur',description:'Envoie les Veilleurs vers la balance, l’ascenseur ou le passage inférieur.',modes:['Vers l’ascenseur','Vers la balance','Passage inférieur'],initialMode:0},
      {id:'balance',kind:'counterweight',...p(590,310),label:'La balance',description:'Deux Veilleurs libèrent le frein de l’ascenseur. Le cran de sécurité garde ce réglage et libère les porteuses.',modes:['Balance libre','Cran de sécurité'],initialMode:0,requiredLoad:2,weightNodes:['balance-pan'],duration:2.5,low:p(590,360),high:p(590,315)},
      {id:'lift',kind:'lift',...p(690,540),label:'L’ascenseur',description:'Trois passagers à la fois. Descends chercher les suivants après leur arrivée en haut.',modes:['Descendre','Monter'],initialMode:0,gates:[{deviceId:'balance',minProgress:.96}],powerDeviceId:'balance',duration:2.5,low:p(690,500),high:p(690,400)},
      {id:'pendulum-gate',kind:'gate',...p(920,650),label:'La barrière du balancier',description:'Retiens le groupe puis libère-le lorsque le balancier s’éloigne du chemin.',modes:['Attendre','Passer'],initialMode:0},
      {id:'pendulum',kind:'pendulum',...p(1072,460),label:'Le balancier',description:'Observe son mouvement. Libère un petit groupe quand il s’éloigne, puis referme la barrière. La route supérieure contourne ce danger.',modes:['En mouvement'],initialMode:0,pivot:p(1072,460),length:190,radius:44,duration:12,phase:.8},
    ],
    drawings:[
      drawing('balance-access','La rampe de la balance',p(360,460),p(590,360),390,'Une petite rampe mène au plateau de la balance.'),
      drawing('balance-return','Le retour des lumières',p(625,360),p(790,400),300,'Relie la balance au palier supérieur pour récupérer les porteuses.'),
      drawing('lantern-bridge','Le pont lumineux',p(950,400),p(1350,455),600,'Trace la passerelle jusqu’à la maison.'),
      drawing('lower-return','L’escalier de lumière',p(1300,700),p(1350,455),490,'Un trait près du refuge remonte depuis le passage bas.',[p(1300,700),p(1220,620),p(1260,530),p(1350,455)]),
    ],
    edges:[
      {id:'entry',from:'source',to:'fork',kind:'ground',path:[p(220,424),p(300,460),p(360,460)]},
      {id:'pan-ramp',from:'fork',to:'balance-pan',kind:'drawn',path:[p(360,460),p(590,360)],drawingId:'balance-access',route:{deviceId:'fork',mode:1}},
      {id:'main-floor',from:'fork',to:'lift-entry',kind:'ground',path:[p(360,460),p(570,460),p(615,485),p(645,500)],route:{deviceId:'fork',mode:0}},
      {id:'elevator',from:'lift-entry',to:'lift-top',kind:'lift',deviceId:'lift',capacity:3,path:[p(690,500),p(690,400)],gates:[{deviceId:'balance',minProgress:.96}]},
      {id:'upper-floor',from:'lift-top',to:'upper',kind:'ground',path:[p(735,400),p(790,400),p(950,400)]},
      {id:'pan-return',from:'balance-pan',to:'upper',kind:'drawn',path:[p(625,360),p(790,400),p(950,400)],drawingId:'balance-return',gates:[{deviceId:'balance',mode:1}]},
      {id:'home-bridge',from:'upper',to:'landing',kind:'drawn',path:[p(950,400),p(1350,455)],drawingId:'lantern-bridge'},
      {id:'downstairs',from:'fork',to:'underpass',kind:'ground',path:[p(360,460),p(320,605),p(400,650),p(500,700)],route:{deviceId:'fork',mode:2}},
      {id:'low-floor',from:'underpass',to:'pendulum-entry',kind:'ground',path:[p(500,700),p(945,700)]},
      {id:'swing-crossing',from:'pendulum-entry',to:'pendulum-exit',kind:'hazard',deviceId:'pendulum',path:[p(945,700),p(1195,700)],gates:[{deviceId:'pendulum-gate',mode:1}]},
      {id:'low-home',from:'pendulum-exit',to:'low-end',kind:'ground',path:[p(1195,700),p(1300,700)]},
      {id:'lower-ramp',from:'low-end',to:'landing',kind:'drawn',path:[p(1300,700),p(1350,455)],drawingId:'lower-return'},
      {id:'home',from:'landing',to:'refuge',kind:'ground',path:[p(1350,455),p(1470,455)]},
    ],
    hints:[
      'Le chemin du haut est sûr mais demande de l’entraide. Le chemin du bas est plus direct et passe sous le balancier.',
      'Trace la rampe de la balance et envoie deux Veilleurs dessus. Enclenche son cran, puis prépare leur retour et le pont lumineux.',
      'Ramène l’aiguillage vers l’ascenseur. Attends trois passagers, monte, laisse-les sortir puis redescends. Les deux porteuses rejoignent le palier par leur trait.',
    ],
  },
];

const objective=(id:string,label:string,conditions:WorldObjective['conditions']):WorldObjective=>({id,label,conditions});
const arrivals=():WorldObjective=>objective('arrivals','Réunir tous les compagnons encore en route',[{kind:'arrivals'}]);
const asAct=(base:WorldLevel,key:string,title:string,changes:Partial<WorldAct>={}):WorldAct=>{
  const copied=structuredClone(base);
  return {key,title,description:copied.description,objective:copied.objective,nodes:copied.nodes,edges:copied.edges,
    devices:copied.devices,drawings:copied.drawings,hints:copied.hints,masteryInk:copied.masteryInk,
    masteryGoal:copied.masteryGoal,masteryDevices:copied.masteryDevices,...changes};
};

function bouclesActs(base:WorldLevel):WorldAct[]{
  const first=asAct(base,'entraide','Le poids de l’entraide',{
    objective:'Envoie trois Boucles dans la nacelle, bloque le cliquet, puis prépare le passage du reste et le retour des porteuses.',
    inkBudget:1250,
    objectives:[
      objective('balance','Charger la nacelle et bloquer son cliquet',[{kind:'device',gate:{deviceId:'balance',mode:1}}]),
      objective('bridges','Dessiner le grand pont et le retour des porteuses',[{kind:'drawing',id:'sky-bridge'},{kind:'drawing',id:'cradle-return'}]),arrivals(),
    ],
  });
  first.edges.find(edge=>edge.id==='weight-descent')!.gates=[{deviceId:'balance',mode:0}];
  first.edges.find(edge=>edge.id==='weight-descent')!.maxPassages=3;
  first.devices.find(device=>device.id==='balance')!.description='Trois porteuses suffisent. Bloque le cliquet : l’accès de la nacelle se ferme, son retour s’ouvre et le grand pont est soutenu.';

  const second=asAct(base,'eclaireurs','Les éclaireurs des rives',{
    objective:'Deux éclaireurs doivent atteindre l’autre rive par le bas. Ils ouvrent le passage du groupe resté en haut.',
    inkBudget:1200,masteryInk:960,masteryGoal:'Réunis la troupe en laissant au plus 960 unités d’encre sur les deux passages.',
    objectives:[objective('scouts','Faire arriver deux éclaireurs par la nacelle',[{kind:'visitors',nodeId:'landing',count:2}]),
      objective('upper-route','Tracer le pont ouvert par les éclaireurs',[{kind:'drawing',id:'sky-bridge'}]),arrivals()],
    hints:['Le petit groupe ouvre le passage du grand. La borne de l’autre rive indique 0/2, puis 1/2 et 2/2.',
      'Dessine le retour depuis la nacelle et oriente la troupe vers le bas. Ce chemin accepte deux éclaireurs seulement.',
      'Lorsque les deux éclaireurs ont atteint la rive droite, oriente le reste vers le pont et dessine ce passage. Les compagnons coincés font demi-tour.'],
  });
  second.nodes=second.nodes.map(node=>node.id==='cradle'?{id:node.id,x:node.x,y:node.y,kind:'wait'}:node.id==='landing'?{...node,arrivalTrigger:{deviceId:'river-lock',mode:1,minVisitors:2}}:node);
  second.devices=[second.devices[0],{...second.devices[1],label:'La nacelle fixe',description:'Le passage bas accueille les deux éclaireurs.',modes:['Nacelle stabilisée'],requiredLoad:0,weightNodes:[]},
    {id:'river-lock',kind:'gate',x:1190,y:335,label:'La borne de la rive',description:'Deux éclaireurs arrivés ici libèrent le grand pont. Oriente ensuite le reste de la troupe vers le haut.',modes:['Deux éclaireurs attendus','Grand pont ouvert'],initialMode:0,playerControlled:false,activationNodeId:'landing'}];
  second.edges=second.edges.map(edge=>edge.id==='weight-descent'?{...edge,maxPassages:2,gates:[{deviceId:'river-lock',mode:0}]}:
    edge.id==='upper-bridge'?{...edge,gates:[{deviceId:'river-lock',mode:1}]}:edge.id==='weight-return'?{...edge,gates:undefined}:edge);

  const third=asAct(base,'dernier-fil','Le dernier fil',{
    objective:'Deux éclaireurs passent en haut. Récupère ensuite l’encre de leur pont pour tracer la descente du reste de la troupe.',
    inkBudget:650,masteryInk:490,masteryGoal:'Réunis la troupe avec au plus 490 unités d’encre laissées sur le dernier passage.',
    objectives:[objective('scouts','Envoyer deux éclaireurs par le pont du haut',[{kind:'visitors',nodeId:'landing',count:2}]),
      objective('return-ink','Récupérer l’encre puis tracer le chemin du bas',[{kind:'drawing',id:'cradle-return'}]),arrivals()],
    hints:['Il n’y a pas assez d’encre pour garder les deux ponts à la fois. La gomme récupère l’encre d’un trait libre.',
      'Dessine d’abord le grand pont. Deux éclaireurs peuvent le franchir ; les autres attendent. La borne de droite libère alors le passage bas.',
      'Attends que les deux éclaireurs aient quitté le pont, efface ce pont avec la gomme, choisis la nacelle et dessine son retour vers la rive droite.'],
  });
  third.nodes=second.nodes.map(node=>node.id==='landing'?{...node,arrivalTrigger:{deviceId:'river-lock',mode:1,minVisitors:2}}:structuredClone(node));
  third.devices=structuredClone(second.devices);
  third.devices.find(device=>device.id==='river-lock')!.description='Deux éclaireurs du haut ouvrent le passage bas. Le pont du haut peut alors être effacé pour récupérer son encre.';
  third.devices.find(device=>device.id==='river-lock')!.modes=['Deux éclaireurs attendus','Passage bas ouvert'];
  third.edges=third.edges.map(edge=>edge.id==='upper-bridge'?{...edge,maxPassages:2,gates:[{deviceId:'river-lock',mode:0}]}:
    edge.id==='weight-descent'?{...edge,gates:[{deviceId:'river-lock',mode:1}]}:edge.id==='weight-return'?{...edge,gates:[{deviceId:'river-lock',mode:1}]}:edge);
  return [first,second,third];
}

function plisActs(base:WorldLevel):WorldAct[]{
  const first=asAct(base,'premier-souffle','Le vent a ses raisons',{
    objective:'Choisis une route : abrite le détour inférieur, ou fais travailler le moulin pour soutenir la passerelle haute.',
    inkBudget:950,masteryDevices:undefined,
    masteryGoal:'Réunis les douze Plis avec au plus 660 unités d’encre, par la route de ton choix.',
    objectives:[objective('shelter','Mettre le passage à l’abri du vent',[{kind:'device',gate:{deviceId:'deflector',mode:2}}]),arrivals()],
    hints:['Deux solutions sont possibles. Le détour inférieur fonctionne dès que le vent est écarté.',
      'Route basse : place le déflecteur à l’abri, oriente la troupe en bas, puis dessine la rampe.',
      'Route haute : dirige le vent vers le moulin, bloque son taquet une fois la corde en haut, puis mets le vent à l’abri et dessine le pont.'],
  });
  const second=asAct(base,'moulin-verrou','Le moulin et le verrou',{
    objective:'Le passage inférieur est fermé. Monte la passerelle avec le moulin, bloque sa corde et relie les deux coupures.',
    inkBudget:800,masteryInk:660,masteryDevices:undefined,
    masteryGoal:'Réunis la troupe avec au plus 660 unités d’encre sur les deux coupures.',
    objectives:[objective('mill','Faire monter le mécanisme et bloquer le taquet',[{kind:'device',gate:{deviceId:'cleat',mode:1}}]),
      objective('two-spans','Relier le pont et la descente à l’abri',[{kind:'drawing',id:'paper-bridge'},{kind:'drawing',id:'paper-descent'},{kind:'device',gate:{deviceId:'deflector',mode:2}}]),arrivals()],
    hints:['Le moulin doit d’abord soulever le support. La corde doit ensuite rester bloquée lorsque le vent change.',
      'Dirige le vent vers le moulin, attends la montée complète et bloque le taquet. Tu peux maintenant mettre le vent à l’abri.',
      'Dessine le grand pont puis la petite descente entre la passerelle haute et la rive de la maison.'],
  });
  second.devices=second.devices.map(device=>device.id==='fork'?{...device,label:'La voie haute',description:'La voie du moulin est la seule ouverte dans ce tableau.',modes:['Vers le moulin'],initialMode:0}:device);
  second.edges=second.edges.filter(edge=>!['lower-fold','lower-approach'].includes(edge.id)).map(edge=>edge.id==='windy-descent'?{...edge,kind:'drawn',drawingId:'paper-descent'}:edge);
  second.drawings=[second.drawings[0],drawing('paper-descent','La descente abritée',p(1175,450),p(1280,580),260,'Relie la passerelle haute à la rive de la maison.',[p(1175,450),p(1215,495),p(1240,560),p(1280,580)])];

  const third=asAct(base,'deux-equipes','Les deux équipes',{
    objective:'Deux Plis ouvrent le verrou depuis le chemin bas. Prépare ensuite le moulin pour faire traverser le reste en haut.',
    inkBudget:1000,masteryInk:820,masteryDevices:undefined,
    masteryGoal:'Réunis les deux équipes avec au plus 820 unités d’encre.',
    objectives:[objective('scouts','Envoyer deux éclaireurs jusqu’au verrou inférieur',[{kind:'visitors',nodeId:'low',count:2}]),
      objective('mill','Faire monter le moulin puis bloquer le taquet',[{kind:'device',gate:{deviceId:'cleat',mode:1}}]),
      objective('safe-wind','Mettre le vent à l’abri pour la réunion',[{kind:'device',gate:{deviceId:'deflector',mode:2}}]),arrivals()],
    hints:['Le verrou du pont se commande depuis le chemin inférieur. Seuls deux éclaireurs peuvent prendre ce détour.',
      'Mets le vent à l’abri, choisis le bas et dessine la rampe. Attends que deux Plis atteignent la borne 2/2.',
      'Dirige ensuite le vent vers le moulin, bloque le taquet en haut, remets le vent à l’abri et dirige le reste vers le pont dessiné.'],
  });
  third.nodes=third.nodes.map(node=>node.id==='low'?{...node,arrivalTrigger:{deviceId:'fold-lock',mode:1,minVisitors:2}}:node);
  third.devices.push({id:'fold-lock',kind:'gate',x:1000,y:645,label:'Le verrou des deux plis',description:'Deux éclaireurs sur le chemin bas libèrent l’ancrage de la passerelle haute.',modes:['Deux éclaireurs attendus','Ancrage libéré'],initialMode:0,playerControlled:false,activationNodeId:'low'});
  third.edges=third.edges.map(edge=>edge.id==='lower-fold'?{...edge,maxPassages:2,gates:[{deviceId:'deflector',mode:2},{deviceId:'fold-lock',mode:0}]}:
    edge.id==='upper-crossing'?{...edge,gates:[{deviceId:'deflector',minProgress:.96},{deviceId:'fold-lock',mode:1}]}:edge);
  return [first,second,third];
}

function veilleursActs(base:WorldLevel):WorldAct[]{
  const first=asAct(base,'atelier','La mécanique du soir',{
    objective:'Deux porteurs débloquent l’ascenseur. Verrouille la balance puis transporte le reste, trois passagers à la fois.',
    inkBudget:1300,
    objectives:[objective('balance','Charger la balance et engager son cran',[{kind:'device',gate:{deviceId:'balance',mode:1}}]),
      objective('bridges','Dessiner le retour des porteurs et la passerelle',[{kind:'drawing',id:'balance-return'},{kind:'drawing',id:'lantern-bridge'}]),arrivals()],
    hints:['Deux porteurs vont sur la balance. Le cran la verrouille et referme son accès ; le reste utilise l’ascenseur.',
      'Dessine la rampe de la balance, son retour et le pont lumineux. Oriente deux Veilleurs vers la balance puis engage le cran.',
      'Oriente les suivants vers l’ascenseur. Fais monter trois passagers, attends leur sortie et redescends chercher le groupe suivant.'],
  });
  first.edges=first.edges.filter(edge=>!['downstairs','low-floor','swing-crossing','low-home','lower-ramp'].includes(edge.id));
  first.edges.find(edge=>edge.id==='pan-ramp')!.gates=[{deviceId:'balance',mode:0}];
  first.edges.find(edge=>edge.id==='pan-ramp')!.maxPassages=2;
  first.devices=first.devices.filter(device=>!['pendulum','pendulum-gate'].includes(device.id));
  first.devices.find(device=>device.id==='fork')!.modes=['Vers l’ascenseur','Vers la balance'];
  first.devices.find(device=>device.id==='balance')!.description='Deux porteurs lèvent le frein. Engage le cran : la balance garde ce réglage, ses porteurs sortent et son accès se ferme aux suivants.';
  first.drawings=first.drawings.filter(item=>item.id!=='lower-return');

  const second=asAct(base,'balancier','Le passage du balancier',{
    objective:'Fais traverser deux éclaireurs au bon moment. Ils serrent le frein du balancier pour sécuriser le passage de tous les autres.',
    inkBudget:550,masteryInk:390,masteryGoal:'Réunis les douze Veilleurs avec au plus 390 unités d’encre.',
    objectives:[objective('brake','Faire atteindre le frein à deux éclaireurs',[{kind:'visitors',nodeId:'pendulum-exit',count:2}]),
      objective('ascent','Tracer la remontée vers la maison',[{kind:'drawing',id:'lower-return'}]),arrivals()],
    hints:['Tu n’as besoin de négocier le balancier que pour les deux premiers. La borne à droite du passage affiche leur progression.',
      'Attends que le balancier s’éloigne du chemin puis libère un éclaireur. La barrière se referme toute seule. Recommence pour le second.',
      'Une fois la borne 2/2 atteinte, le frein range le balancier sur le côté. Ouvre la barrière pour le reste et dessine la remontée finale.'],
  });
  second.nodes=second.nodes.map(node=>node.id==='pendulum-exit'?{...node,arrivalTrigger:{deviceId:'pendulum-brake',mode:1,minVisitors:2}}:node);
  second.edges=second.edges.filter(edge=>['entry','downstairs','low-floor','swing-crossing','low-home','lower-ramp','home'].includes(edge.id)).map(edge=>edge.id==='downstairs'?{...edge,route:undefined}:edge);
  second.devices=second.devices.filter(device=>['pendulum-gate','pendulum'].includes(device.id));
  Object.assign(second.devices.find(device=>device.id==='pendulum-gate')!,{modes:['Attendre','Laisser passer un éclaireur'],autoCloseAfter:1,holdOpenDeviceId:'pendulum-brake',description:'Un clic libère un seul éclaireur puis la barrière se referme. Lorsque les deux éclaireurs ont serré le frein, elle laisse passer toute la troupe.'});
  second.devices.find(device=>device.id==='pendulum')!.lockDeviceId='pendulum-brake';
  second.devices.push({id:'pendulum-brake',kind:'gate',x:1195,y:650,label:'Le frein des éclaireurs',description:'Deux éclaireurs arrivés de l’autre côté serrent le frein. Le balancier se range ensuite hors du chemin.',modes:['Deux éclaireurs attendus','Frein serré'],initialMode:0,duration:1.2,playerControlled:false,activationNodeId:'pendulum-exit'});
  second.drawings=second.drawings.filter(item=>item.id==='lower-return');

  const third=asAct(base,'unisson','L’atelier à l’unisson',{
    objective:'Deux porteurs passent par le haut et serrent le frein du balancier. Le reste de la troupe rejoint alors la maison par le passage bas sécurisé.',
    inkBudget:1500,masteryInk:1250,masteryGoal:'Réunis les deux groupes avec au plus 1 250 unités d’encre.',
    objectives:[objective('balance','Verrouiller la balance avec deux porteurs',[{kind:'device',gate:{deviceId:'balance',mode:1}}]),
      objective('scouts','Faire arriver les deux porteurs près de la maison',[{kind:'visitors',nodeId:'landing',count:2}]),
      objective('last-ramp','Tracer la remontée du groupe resté en bas',[{kind:'drawing',id:'lower-return'}]),arrivals()],
    hints:['Le premier groupe ouvre le chemin du second. Deux porteurs seulement peuvent prendre la balance.',
      'Dessine l’accès à la balance, son retour et le pont lumineux. Charge les deux porteurs et engage le cran. Attends qu’ils atteignent la borne près de la maison.',
      'Le frein se serre alors et sécurise le balancier. Oriente le reste vers le passage inférieur et dessine la remontée finale.'],
  });
  third.nodes=third.nodes.map(node=>node.id==='landing'?{...node,arrivalTrigger:{deviceId:'pendulum-brake',mode:1,minVisitors:2}}:node);
  third.devices=third.devices.filter(device=>!['lift','pendulum-gate'].includes(device.id));
  const fork=third.devices.find(device=>device.id==='fork')!;
  fork.modes=['Vers la balance','Passage inférieur'];fork.initialMode=0;fork.description='Les deux porteurs vont d’abord à la balance. Quand ils ont libéré le frein, oriente les autres vers le bas.';
  third.devices.find(device=>device.id==='pendulum')!.lockDeviceId='pendulum-brake';
  third.devices.push({id:'pendulum-brake',kind:'gate',x:1350,y:405,label:'La borne du frein',description:'Les deux porteurs arrivés près de la maison serrent le frein et ouvrent l’accès du groupe inférieur.',modes:['Deux porteurs attendus','Passage inférieur sûr'],initialMode:0,duration:1.2,playerControlled:false,activationNodeId:'landing'});
  third.edges=third.edges.filter(edge=>!['main-floor','elevator','upper-floor'].includes(edge.id)).map(edge=>edge.id==='pan-ramp'?{...edge,maxPassages:2,route:{deviceId:'fork',mode:0},gates:[{deviceId:'balance',mode:0}]}:
    edge.id==='downstairs'?{...edge,route:{deviceId:'fork',mode:1},gates:[{deviceId:'pendulum-brake',mode:1,minProgress:.99}]}:
    edge.id==='swing-crossing'?{...edge,gates:[{deviceId:'pendulum-brake',mode:1,minProgress:.99}]}:edge);
  return [first,second,third];
}

export const WORLD_LEVELS:WorldLevel[]=BASE_LEVELS.map(base=>{
  const acts=base.id==='boucles'?bouclesActs(base):base.id==='plis'?plisActs(base):veilleursActs(base);
  const first=acts[0],masteryInk=acts.reduce((sum,act)=>sum+act.masteryInk,0);
  return {...base,stageName:first.title,description:first.description,objective:first.objective,nodes:first.nodes,edges:first.edges,
    devices:first.devices,drawings:first.drawings,hints:first.hints,inkBudget:first.inkBudget,objectives:first.objectives,acts,
    masteryInk,masteryGoal:`Réunis les douze compagnons au terme des trois tableaux avec au plus ${masteryInk.toLocaleString('fr-FR')} unités d’encre au total.`};
});
export const getWorldLevel=(id:string):WorldLevel|undefined=>WORLD_LEVELS.find(level=>level.id===id);
