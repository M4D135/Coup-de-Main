"use client";

import {useCallback,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,ChevronRight,Eraser,Expand,Hand,HelpCircle,Home,Keyboard,Lightbulb,LocateFixed,Menu,Minus,Pause,Pencil,Play,Plus,RotateCcw,RotateCw,Settings2,ShieldCheck,Sparkles,Star,Undo2,Users,Volume2,VolumeX,X} from 'lucide-react';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {createRun,updateRun,applyAction,beginStroke,appendStroke,finishStroke,cancelStroke,saveRun,restoreRun,getRunSummary,getActiveAct,getActCount,getJourneySummary,getDeviceStatus,isJourneyComplete} from '../lib/worlds/engine';
import {loadWorldAssets,renderWorld,hitTestWorld,type WorldAssets} from '../lib/worlds/renderer';
import {WorldAudio,type WorldSound} from '../lib/worlds/audio';
import {getWorldAsset,WORLD_IDENTITIES} from '../lib/worlds/assets';
import {getWorldView,autoPanWorldView} from '../lib/worlds/camera';
import {SESSION_KEY,SHORTCUTS,defaultBindings,readBindings,normalizedKey,keyLabel,type ShortcutId,type ShortcutBindings} from '../lib/worlds/session';
import type {ActionResult,GameAction,GameEvent,Point,WorldRun} from '../lib/worlds/types';
import {WorldGate,type WorldRecords} from '../components/worlds/world-gate';
import {DrawingInventory,DrawingMeter,JourneyGuide,JourneyRecap,MechanismCard} from '../components/worlds/journey-tools';

type Panel='menu'|'settings'|'keys'|'hints'|'help'|'book'|'restart'|'restartJourney'|null;
type View={phase:WorldRun['phase'];saved:number;lost:number;time:number;speed:1|2;edits:number;retries:number;undo:number;drawn:number;inkUsed:number;stars:number;mastered:boolean;message:string;journey:ReturnType<typeof getJourneySummary>;stroke:{label:string;letter:string;used:number;limit:number}|null};
type Session={runs:Record<string,unknown>;records:WorldRecords;muted:boolean;volume:number;reduced:boolean;bindings:ShortcutBindings;hints:Record<string,number>};
const snapshot=(run:WorldRun):View=>{
  const world=WORLD_LEVELS.find(level=>level.id===run.levelId)!,active=getActiveAct(world,run);
  const summary=getRunSummary(run,active),journey=getJourneySummary(run,world);
  const stroke=run.activeStroke,definition=active.drawings.find(d=>d.id===stroke?.drawingId);
  const used=stroke?.points.reduce((sum,point,index,points)=>index?sum+Math.hypot(point.x-points[index-1].x,point.y-points[index-1].y):0,0)??0;
  return {phase:run.phase,saved:run.saved,lost:run.lost,time:run.time,speed:run.speed,edits:run.edits,retries:run.retries,undo:run.history.length,drawn:Object.keys(run.drawings).length,inkUsed:summary.inkUsed,stars:journey.stars,mastered:journey.mastered,message:run.message,journey,stroke:stroke&&definition?{label:definition.label,letter:String.fromCharCode(65+active.drawings.indexOf(definition)),used,limit:Math.floor(Math.min(definition.inkLimit,active.inkBudget===undefined?Infinity:Math.max(0,active.inkBudget-summary.inkUsed+(run.drawings[definition.id]?.inkLength??0))))}:null};
};
const emptySession=():Session=>({runs:{},records:{},muted:false,volume:45,reduced:false,bindings:defaultBindings(),hints:{}});
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
const eventSound:Partial<Record<GameEvent['type'],WorldSound>>={spawn:'start',step:'step',wait:'wait',draw:'draw-end',device:'device',saved:'save',lost:'loss',win:'win',retry:'undo',undo:'undo'};

function Switch({label,value,onChange}:{label:string;value:boolean;onChange:()=>void}){
  return <button className={`toggle${value?' on':''}`} role="switch" aria-label={label} aria-checked={value} onClick={onChange}><span/></button>;
}

export default function HomePage(){
  const [screen,setScreen]=useState<'gate'|'play'>('gate');
  const [levelIndex,setLevelIndex]=useState(0);
  const [view,setView]=useState<View>(()=>snapshot(createRun(WORLD_LEVELS[0])));
  const [panel,setPanel]=useState<Panel>(null);
  const [entry,setEntry]=useState(false);
  const [migrationNotice,setMigrationNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [muted,setMuted]=useState(false);
  const [volume,setVolume]=useState(45);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [systemReduced,setSystemReduced]=useState(false);
  const [records,setRecords]=useState<WorldRecords>({});
  const [bindings,setBindings]=useState<ShortcutBindings>(defaultBindings);
  const [binding,setBinding]=useState<{action:ShortcutId;slot:0|1}|null>(null);
  const [bindingWarning,setBindingWarning]=useState('');
  const [hintCounts,setHintCounts]=useState<Record<string,number>>({});
  const [drawMode,setDrawMode]=useState(true);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState(.5);
  const [panY,setPanY]=useState(.5);
  const [portrait,setPortrait]=useState(false);
  const [drawing,setDrawing]=useState(false);
  const [panning,setPanning]=useState(false);
  const [status,setStatus]=useState({text:'',error:false});
  const [storageOk,setStorageOk]=useState(true);
  const [selectedDevice,setSelectedDevice]=useState<string|null>(null);
  const [erasing,setErasing]=useState(false);
  const [hydrated,setHydrated]=useState(false);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const shellRef=useRef<HTMLElement>(null);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const runRef=useRef(createRun(WORLD_LEVELS[0]));
  const assetsRef=useRef<WorldAssets|null>(null);
  const audioRef=useRef<WorldAudio|null>(null);
  const sessionRef=useRef<Session>(emptySession());
  const requestRef=useRef(0);
  const hoverRef=useRef<Point|null>(null);
  const handRef=useRef<Point|null>(null);
  const drawPointerRef=useRef<Point|null>(null);
  const lastDrawRef=useRef<{point:Point;at:number}|null>(null);
  const gestureRef=useRef<{id:number;kind:'draw'|'pan';startX:number;startY:number;pan:number;panY:number}|null>(null);
  const frameRef=useRef({scale:1,x:0,y:0,width:1600,height:900,overflowX:0,overflowY:0});
  const winRef=useRef(false);
  const renderErrorRef=useRef(false);
  const latestRef=useRef({screen,levelIndex,panel,entry,loading,drawMode,zoom,pan,panY,portrait,selectedDevice,erasing,reducedMotion:reducedMotion||systemReduced,bindings});
  latestRef.current={screen,levelIndex,panel,entry,loading,drawMode,zoom,pan,panY,portrait,selectedDevice,erasing,reducedMotion:reducedMotion||systemReduced,bindings};
  const world=WORLD_LEVELS[levelIndex],level=getActiveAct(world,runRef.current),identity=WORLD_IDENTITIES[levelIndex];
  const journey=view.journey;
  const rescuedAll=journey.saved===world.total&&journey.lost===0;
  const nextAct=view.phase==='won'&&!journey.complete;
  const mechanism=selectedDevice?getDeviceStatus(runRef.current,level,selectedDevice):null;
  const stars=view.stars;

  const flush=useCallback(()=>{
    try{localStorage.setItem(SESSION_KEY,JSON.stringify(sessionRef.current));setStorageOk(true);}catch{setStorageOk(false);}
  },[]);
  const persist=useCallback(()=>{
    if(latestRef.current.screen==='play')sessionRef.current.runs[WORLD_LEVELS[latestRef.current.levelIndex].id]=saveRun(runRef.current);
    flush();
  },[flush]);
  const unlock=useCallback(()=>{void audioRef.current?.unlock();},[]);
  const notify=useCallback((result:ActionResult)=>{setStatus({text:result.message,error:!result.ok});setView(snapshot(runRef.current));},[]);
  const releaseGesture=useCallback((cancel=true)=>{
    const gesture=gestureRef.current;
    if(cancel)cancelStroke(runRef.current);
    gestureRef.current=null;handRef.current=null;drawPointerRef.current=null;lastDrawRef.current=null;
    setDrawing(false);setPanning(false);audioRef.current?.endPencil();
    if(gesture&&canvasRef.current?.hasPointerCapture(gesture.id))canvasRef.current.releasePointerCapture(gesture.id);
  },[]);
  const act=useCallback((action:GameAction)=>{
    unlock();
    if(['pause','restart','retry','undo','advanceAct','erase'].includes(action.type))releaseGesture();
    const result=applyAction(runRef.current,WORLD_LEVELS[latestRef.current.levelIndex],action);
    notify(result);
    if(result.ok){
      if(action.type==='start')audioRef.current?.play('start');
      if(action.type==='undo'||action.type==='restart'||action.type==='retry'||action.type==='erase')audioRef.current?.play('undo');
      if(action.type==='device')audioRef.current?.play('device');
    }
    persist();return result;
  },[unlock,releaseGesture,notify,persist]);
  const openPanel=useCallback((next:Panel)=>{releaseGesture();setBinding(null);setBindingWarning('');setPanel(next);persist();},[releaseGesture,persist]);
  const goHome=useCallback(()=>{
    persist();releaseGesture();requestRef.current++;setPanel(null);setEntry(false);setScreen('gate');setLoadError('');setLoading(false);assetsRef.current=null;audioRef.current?.endPencil();
  },[persist,releaseGesture]);

  const enterWorld=useCallback(async(index:number,fresh=false)=>{
    persist();releaseGesture();unlock();
    const bounded=Math.max(0,Math.min(WORLD_LEVELS.length-1,index));
    const next=WORLD_LEVELS[bounded],request=++requestRef.current;
    const stored=sessionRef.current.runs[next.id];
    const restored=fresh?null:restoreRun(stored,next);
    const resumed=restored&&!isJourneyComplete(next,restored)?restored:null;
    runRef.current=resumed??createRun(next);
    if(runRef.current.phase==='playing')applyAction(runRef.current,next,{type:'pause',paused:true});
    assetsRef.current=null;winRef.current=false;renderErrorRef.current=false;
    const migrated=!!resumed&&!!stored&&typeof stored==='object'&&'version' in stored&&stored.version!==2;
    setMigrationNotice(migrated?'Les énigmes ont changé : ce voyage reprend au premier tableau. Tes réglages restent conservés.':'');
    setLevelIndex(bounded);setScreen('play');setPanel(null);setLoading(true);setLoadError('');setEntry(!resumed||migrated);setView(snapshot(runRef.current));
    setDrawMode(true);setSelectedDevice(null);setErasing(false);setStatus({text:resumed?runRef.current.message||'Ton voyage reprend ici, au calme.':getActiveAct(next,runRef.current).objective,error:false});
    const isPortrait=window.innerHeight>window.innerWidth;setZoom(isPortrait?2.2:1);setPan(isPortrait?0:.5);setPanY(.5);
    audioRef.current?.setWorld(next.id);
    try{
      const assets=await loadWorldAssets(next.id);
      if(request!==requestRef.current)return;
      assetsRef.current=assets;setLoading(false);
    }catch(error){
      if(request!==requestRef.current)return;
      setLoading(false);setLoadError(error instanceof Error?error.message:'Le décor n’a pas pu être chargé.');
    }
  },[persist,releaseGesture,unlock]);

  useEffect(()=>{
    audioRef.current=new WorldAudio();
    try{
      const value=JSON.parse(localStorage.getItem(SESSION_KEY)??'null');
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        const next=emptySession();
        if(value.runs&&typeof value.runs==='object'&&!Array.isArray(value.runs))next.runs=value.runs;
        for(const world of WORLD_LEVELS){
          const record=value.records?.[world.id];
          if(record&&Number.isInteger(record.rescued)&&record.rescued>=0&&record.rescued<=world.total&&Number.isFinite(record.time)&&record.time>=0){
            next.records[world.id]={rescued:record.rescued,time:record.time,stars:Math.max(0,Math.min(3,Number(record.stars)||0)),completed:record.completed===true,revision:record.revision===2?2:1};
          }
          for(let i=0;i<getActCount(world);i++){const key=`${world.id}:${i}`;next.hints[key]=Math.max(0,Math.min(3,Math.floor(Number(value.hints?.[key])||0)));}
        }
        next.muted=value.muted===true;next.volume=typeof value.volume==='number'&&Number.isFinite(value.volume)?Math.max(0,Math.min(100,value.volume)):45;
        next.reduced=value.reduced===true;next.bindings=readBindings(value.bindings);sessionRef.current=next;
        setRecords(next.records);setMuted(next.muted);setVolume(next.volume);setReducedMotion(next.reduced);setBindings(next.bindings);setHintCounts(next.hints);
      }
    }catch{setStorageOk(false);}
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion=()=>setSystemReduced(motion.matches);onMotion();motion.addEventListener('change',onMotion);
    const onResize=()=>setPortrait(window.innerHeight>window.innerWidth);onResize();window.addEventListener('resize',onResize);
    setHydrated(true);
    return()=>{audioRef.current?.dispose();motion.removeEventListener('change',onMotion);window.removeEventListener('resize',onResize);};
  },[]);
  useEffect(()=>{
    audioRef.current?.setMuted(muted);audioRef.current?.setVolume(volume/100);
    if(!hydrated)return;
    Object.assign(sessionRef.current,{muted,volume,reduced:reducedMotion,bindings,hints:hintCounts,records});flush();
  },[muted,volume,reducedMotion,bindings,hintCounts,records,hydrated,flush]);
  useEffect(()=>{
    const dialog=dialogRef.current;if(!dialog)return;
    if(panel&&!dialog.open)dialog.showModal();
    else if(!panel&&dialog.open)dialog.close();
  },[panel]);
  useEffect(()=>{
    const hide=()=>{
      if(document.hidden&&latestRef.current.screen==='play'){
        releaseGesture();if(runRef.current.phase==='playing')applyAction(runRef.current,WORLD_LEVELS[latestRef.current.levelIndex],{type:'pause',paused:true});setView(snapshot(runRef.current));persist();
      }
    };
    window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',hide);
    const timer=window.setInterval(persist,7000);
    return()=>{window.removeEventListener('pagehide',persist);document.removeEventListener('visibilitychange',hide);window.clearInterval(timer);};
  },[persist,releaseGesture]);

  useEffect(()=>{
    let request=0,previous=0,elapsed=0,lastView=0;
    const frame=(at:number)=>{
      request=requestAnimationFrame(frame);
      const dt=previous?Math.min(.06,Math.max(0,(at-previous)/1000)):0;previous=at;
      const latest=latestRef.current,canvas=canvasRef.current,assets=assetsRef.current;
      if(latest.screen!=='play'||!canvas||!assets)return;
      const currentWorld=WORLD_LEVELS[latest.levelIndex],run=runRef.current,current=getActiveAct(currentWorld,run);
      const blocked=!!latest.panel||latest.entry||latest.loading;
      if(!blocked){
        const events=updateRun(run,currentWorld,dt);
        for(const event of events){const sound=eventSound[event.type];if(sound)audioRef.current?.play(sound);}
      }
      if(!blocked&&run.phase!=='paused')elapsed+=dt;
      const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
      const pixelWidth=Math.round(rect.width*ratio),pixelHeight=Math.round(rect.height*ratio);
      if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
      const context=canvas.getContext('2d');if(!context)return;
      let camera=getWorldView(current.width,current.height,rect.width,rect.height,latest.zoom,latest.pan,latest.panY);
      if(!blocked&&gestureRef.current?.kind==='draw'&&drawPointerRef.current){
        const next=autoPanWorldView(camera,drawPointerRef.current,dt,latest.pan,latest.panY);
        if(next.panX!==latest.pan||next.panY!==latest.panY){
          latest.pan=next.panX;latest.panY=next.panY;setPan(next.panX);setPanY(next.panY);
          camera=getWorldView(current.width,current.height,rect.width,rect.height,latest.zoom,next.panX,next.panY);
          const point={x:(drawPointerRef.current.x-camera.x)/camera.scale,y:(drawPointerRef.current.y-camera.y)/camera.scale};
          appendStroke(run,current,point);handRef.current=run.activeStroke?.points.at(-1)??point;
        }
      }
      const {scale,x,y}=camera;frameRef.current=camera;
      context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,rect.width,rect.height);
      context.translate(x,y);context.scale(scale,scale);
      try{
        renderWorld(context,current,run,assets,{elapsed,dt:blocked?0:dt,reducedMotion:latest.reducedMotion,activeStroke:run.activeStroke,handTip:handRef.current,hover:hoverRef.current,drawAnchors:latest.drawMode,hint:latest.panel==='hints',selectedDevice:latest.selectedDevice,viewScale:scale,viewport:camera,hudInsets:{top:latest.portrait?158:84,bottom:latest.portrait?158:110,left:12,right:12}});
      }catch(error){
        if(!renderErrorRef.current){renderErrorRef.current=true;setLoadError(error instanceof Error?error.message:'Le dessin n’a pas pu être affiché.');}
      }
      if(at-lastView>100){setView(snapshot(run));lastView=at;}
      if(isJourneyComplete(currentWorld,run)&&!winRef.current){
        winRef.current=true;
        const completed=getJourneySummary(run,currentWorld),earned=completed.stars;
        const previousRecord=sessionRef.current.records[current.id];
        const record={rescued:completed.saved,stars:earned,time:completed.time,completed:true,revision:2};
        if(!previousRecord||previousRecord.revision!==2||earned>previousRecord.stars||(earned===previousRecord.stars&&(completed.saved>previousRecord.rescued||(completed.saved===previousRecord.rescued&&completed.time<previousRecord.time)))){
          sessionRef.current.records={...sessionRef.current.records,[current.id]:record};setRecords({...sessionRef.current.records});
        }
        persist();
      }
    };
    request=requestAnimationFrame(frame);return()=>cancelAnimationFrame(request);
  },[persist]);

  const pause=useCallback(()=>{
    const run=runRef.current;if(run.phase==='ready')act({type:'start'});else if(run.phase==='playing'||run.phase==='paused')act({type:'pause'});
  },[act]);
  const hintKey=`${level.id}:${journey.actIndex}`;
  const revealHint=()=>{const amount=Math.min(level.hints.length,(hintCounts[hintKey]??0)+1);setHintCounts(old=>({...old,[hintKey]:amount}));};
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.metaKey||event.ctrlKey||event.altKey)return;
      if(binding){
        event.preventDefault();if(event.repeat)return;
        if(event.key==='Escape'){setBinding(null);return;}
        if(['Tab','Shift','Control','Alt','Meta'].includes(event.key))return;
        const key=event.key==='Delete'?null:normalizedKey(event.key);
        if(key){const used=SHORTCUTS.find(({id})=>bindings[id].some((old,slot)=>old===key&&(id!==binding.action||slot!==binding.slot)));if(used){setBindingWarning(`Cette touche est déjà utilisée pour « ${used.label} ».`);return;}}
        setBindings(old=>({...old,[binding.action]:old[binding.action].map((value,slot)=>slot===binding.slot?key:value) as [string|null,string|null]}));setBinding(null);setBindingWarning('');return;
      }
      const target=event.target as HTMLElement;
      if(target?.matches('input,textarea,select')||target?.isContentEditable)return;
      if(event.key==='Escape'){
        event.preventDefault();if(latestRef.current.panel)setPanel(null);else if(gestureRef.current)releaseGesture();else if(latestRef.current.selectedDevice)setSelectedDevice(null);else if(latestRef.current.erasing)setErasing(false);else if(latestRef.current.screen==='play')openPanel('menu');return;
      }
      const latest=latestRef.current;
      if(latest.screen!=='play'||latest.panel||latest.entry||latest.loading||event.repeat)return;
      const action=SHORTCUTS.find(({id})=>latest.bindings[id].includes(normalizedKey(event.key)))?.id;
      if(!action)return;event.preventDefault();
      if(action==='pause')pause();else if(action==='undo')act({type:'undo'});else if(action==='speed')act({type:'speed'});else if(action==='draw')setDrawMode(v=>!v);else if(action==='hint')openPanel('hints');
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[binding,bindings,act,pause,releaseGesture,openPanel]);

  const worldPoint=(event:ReactPointerEvent<HTMLCanvasElement>):Point=>{
    const rect=event.currentTarget.getBoundingClientRect(),frame=frameRef.current;
    return {x:(event.clientX-rect.left-frame.x)/frame.scale,y:(event.clientY-rect.top-frame.y)/frame.scale};
  };
  const focusPoint=(point:Point)=>{
    const frame=frameRef.current;
    if(frame.overflowX>0)setPan(Math.max(0,Math.min(1,(point.x*frame.scale-frame.width*.45)/frame.overflowX)));
    if(frame.overflowY>0)setPanY(Math.max(0,Math.min(1,(point.y*frame.scale-frame.height*.42)/frame.overflowY)));
  };
  const selectMechanism=(id:string,focus=false)=>{
    releaseGesture();setErasing(false);setSelectedDevice(id);
    const definition=level.devices.find(d=>d.id===id);
    if(definition&&focus)focusPoint(definition);
    setStatus({text:definition?.playerControlled===false?'Cette borne est automatique : les compagnons l’activent en arrivant.':'Lis son rôle, puis choisis une action dans le panneau.',error:false});
  };
  const findTroupe=()=>{
    releaseGesture();setSelectedDevice(null);
    const units=runRef.current.units;
    const target=[...units].filter(u=>u.state==='waiting').sort((a,b)=>b.waitTime-a.waitTime)[0]??units.find(u=>u.state==='walking'||u.state==='riding')??level.nodes.find(n=>n.id===level.spawn);
    if(target)focusPoint(target);
    setStatus({text:'La vue rejoint les compagnons qui ont besoin de toi.',error:false});
  };
  const pointerDown=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(event.button!==0||panel||entry||loading||loadError||gestureRef.current||view.phase==='won'||view.phase==='lost')return;
    event.preventDefault();unlock();canvasRef.current?.focus({preventScroll:true});
    const point=worldPoint(event),run=runRef.current,hit=hitTestWorld(level,run,point,Math.max(44,22/frameRef.current.scale));
    if(hit?.kind==='device'){
      selectMechanism(hit.id);return;
    }
    if(drawMode&&hit?.kind==='drawing'){
      const result=beginStroke(run,level,point);notify(result);
      if(result.ok){gestureRef.current={id:event.pointerId,kind:'draw',startX:event.clientX,startY:event.clientY,pan,panY};const bounds=event.currentTarget.getBoundingClientRect();drawPointerRef.current={x:event.clientX-bounds.left,y:event.clientY-bounds.top};event.currentTarget.setPointerCapture(event.pointerId);setDrawing(true);handRef.current=run.activeStroke?.points.at(-1)??point;lastDrawRef.current={point,at:performance.now()};audioRef.current?.play('draw-start');audioRef.current?.beginPencil();setSelectedDevice(null);setErasing(false);}
      return;
    }
    if(zoom>1){gestureRef.current={id:event.pointerId,kind:'pan',startX:event.clientX,startY:event.clientY,pan,panY};event.currentTarget.setPointerCapture(event.pointerId);setPanning(true);}
    else if(drawMode)setStatus({text:'Pars d’un petit appui rond, puis trace jusqu’à l’autre rive.',error:false});
  };
  const pointerMove=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const point=worldPoint(event);hoverRef.current=point;
    const gesture=gestureRef.current;if(!gesture||gesture.id!==event.pointerId)return;
    event.preventDefault();
    if(gesture.kind==='pan'){
      const {overflowX,overflowY}=frameRef.current;
      if(overflowX>0)setPan(Math.max(0,Math.min(1,gesture.pan-(event.clientX-gesture.startX)/overflowX)));
      if(overflowY>0)setPanY(Math.max(0,Math.min(1,gesture.panY-(event.clientY-gesture.startY)/overflowY)));
      return;
    }
    const bounds=event.currentTarget.getBoundingClientRect();drawPointerRef.current={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
    appendStroke(runRef.current,level,point);handRef.current=runRef.current.activeStroke?.points.at(-1)??point;
    const previous=lastDrawRef.current,at=performance.now();if(previous)audioRef.current?.updatePencil(Math.hypot(point.x-previous.point.x,point.y-previous.point.y)/Math.max(.001,(at-previous.at)/1000));lastDrawRef.current={point,at};
  };
  const pointerUp=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const gesture=gestureRef.current;if(!gesture||gesture.id!==event.pointerId)return;
    if(gesture.kind==='draw'){
      appendStroke(runRef.current,level,worldPoint(event));const result=finishStroke(runRef.current,level);notify(result);if(result.ok)audioRef.current?.play('draw-end');persist();
    }
    releaseGesture(false);
  };
  const fullscreen=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else if(shellRef.current?.requestFullscreen)await shellRef.current.requestFullscreen();else setStatus({text:'Sur cet appareil, ajoute le jeu à l’écran d’accueil pour jouer en plein écran.',error:false});}catch{setStatus({text:'Le plein écran n’est pas disponible ici. Le jeu reste jouable dans cette fenêtre.',error:false});}
  };
  const restart=()=>{winRef.current=false;act({type:'restart'});setPanel(null);setSelectedDevice(null);setErasing(false);setEntry(false);setStatus({text:level.objective,error:false});};
  const advance=()=>{
    const result=act({type:'advanceAct'});
    if(!result.ok)return;
    winRef.current=false;setPanel(null);setSelectedDevice(null);setErasing(false);setEntry(true);setMigrationNotice('');setDrawMode(true);
    setZoom(portrait?2.2:1);setPan(portrait?0:.5);setPanY(.5);
    setStatus({text:getActiveAct(world,runRef.current).objective,error:false});
  };
  const toggleMute=()=>{unlock();setMuted(v=>!v);};
  const dismissEntry=()=>{unlock();setEntry(false);setStatus({text:'Observe les mécanismes, dessine tes passages, puis libère la troupe.',error:false});canvasRef.current?.focus({preventScroll:true});};
  const hintCount=hintCounts[hintKey]??0;
  const panelTitle=panel==='menu'?'Une petite pause':panel==='settings'?'À ta manière':panel==='keys'?'Tes raccourcis':panel==='hints'?'Un coup de crayon ?':panel==='book'?'Le carnet des mondes':panel==='restart'?'Recommencer ce tableau ?':panel==='restartJourney'?'Repartir du premier tableau ?':'Ils avancent. Tu les guides.';
  const displayStatus=status.text||view.message||level.objective;
  const statusText=displayStatus;

  return <main ref={shellRef} className={`universe-shell world-${screen==='gate'?'boucles':level.id}`}>
    {screen==='gate'?<WorldGate onEnter={index=>void enterWorld(index)} onSettings={()=>openPanel('settings')} onBook={()=>openPanel('book')} records={records} muted={muted} onMute={toggleMute} resumeAt={Object.fromEntries(WORLD_LEVELS.flatMap(item=>{const raw=sessionRef.current.runs[item.id];return raw&&typeof raw==='object'&&'version' in raw&&raw.version===2&&'actIndex' in raw&&typeof raw.actIndex==='number'&&Number.isInteger(raw.actIndex)&&raw.actIndex>=0&&raw.actIndex<getActCount(item)&&!('phase' in raw&&raw.phase==='won'&&raw.actIndex===getActCount(item)-1)?[ [item.id,raw.actIndex+1] ]:[];}))}/>:<section className={`world-stage${mechanism||erasing?' inspecting':''}`} aria-label={`${level.name} — ${level.stageName}`}>
      <div className="stage-atmosphere" style={{backgroundImage:`url("${getWorldAsset(`worlds/${level.id}-scene.png`)}")`}}/>
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label={`${level.stageName}. Dessine entre les appuis avec la souris ou le doigt. Sélectionne un mécanisme puis choisis une action dans son panneau.`} className={drawing?'is-drawing':panning?'is-panning':zoom>1?'can-pan':''} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>releaseGesture()} onLostPointerCapture={()=>{if(gestureRef.current)releaseGesture();}} onPointerLeave={()=>{if(!gestureRef.current)hoverRef.current=null;}}/>
      <div className="stage-progress" aria-hidden="true"><span style={{width:`${(journey.actIndex+(view.phase==='won'?1:view.saved/world.total))/journey.actCount*100}%`}}/></div>
      <header className="stage-header">
        <button className="chapter-heading" onClick={goHome} aria-label="Revenir aux trois mondes"><span className="round-button"><ArrowLeft size={17}/></span><span><small>{level.name} · Tableau {journey.actNumber}/{journey.actCount}</small><strong>{journey.actTitle}</strong></span></button>
        <div className="header-tools"><div className="rescue-counter" aria-label={`${view.saved} compagnons arrivés au refuge de ce tableau sur ${world.total}`} title="Compagnons arrivés au refuge de ce tableau"><Users size={20} strokeWidth={1.4}/><span className="rescue-number">{view.saved}<small>/{world.total}</small></span></div><button className="round-button" onClick={toggleMute} aria-label={muted?'Activer le son':'Couper le son'}>{muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button><button className="round-button header-fullscreen" onClick={()=>void fullscreen()} aria-label="Plein écran"><Expand size={18}/></button><button className="round-button" onClick={()=>openPanel('menu')} aria-label="Menu du jeu"><Menu size={20}/></button></div>
      </header>
      {!entry&&!loading&&view.phase!=='won'&&view.phase!=='lost'&&<JourneyGuide key={`${world.id}:${journey.actIndex}`} journey={journey} compact={portrait} devices={level.devices.map(d=>({id:d.id,label:d.label,automatic:d.playerControlled===false}))} selectedDevice={selectedDevice} onSelect={id=>selectMechanism(id,true)} onHelp={()=>openPanel('help')}/> }
      {!entry&&!loading&&view.phase!=='won'&&view.phase!=='lost'&&mechanism&&selectedDevice&&<MechanismCard status={mechanism} automatic={level.devices.find(d=>d.id===selectedDevice)?.playerControlled===false} currentMode={runRef.current.devices[selectedDevice]?.mode??0} disabled={false} onAction={mode=>act({type:'device',id:selectedDevice,mode})} onClose={()=>setSelectedDevice(null)}/> }
      {!entry&&!loading&&view.phase!=='won'&&view.phase!=='lost'&&erasing&&<DrawingInventory budget={level.inkBudget} used={view.inkUsed} drawings={level.drawings.filter(d=>!!runRef.current.drawings[d.id]).map(d=>({id:d.id,label:d.label,ink:runRef.current.drawings[d.id].inkLength,occupied:runRef.current.units.some(u=>u.edgeId&&level.edges.some(e=>e.id===u.edgeId&&e.drawingId===d.id))}))} onErase={id=>act({type:'erase',id})} onClose={()=>setErasing(false)}/> }
      {!entry&&view.phase==='paused'&&<span className="pause-indicator"><Pause size={10}/>Le temps est suspendu</span>}
      <button className="stage-hint-button" aria-label="Un indice ?" onClick={()=>openPanel('hints')}><Lightbulb size={16}/><span>Un indice ?</span></button>
      {portrait&&<span className="portrait-nudge"><Hand size={13}/>{zoom>1?'Glisse le décor pour explorer':'Agrandis le décor pour dessiner'}</span>}
      <div className="view-tools" aria-label="Vue du décor"><button className="round-button" onClick={findTroupe} aria-label="Retrouver la troupe" title="Retrouver la troupe"><LocateFixed size={15}/></button><button className="round-button" onClick={()=>setZoom(v=>Math.max(1,Math.round((v-.4)*10)/10))} disabled={zoom<=1} aria-label="Dézoomer"><Minus size={15}/></button><span className="zoom-readout">{Math.round(zoom*100)}%</span><button className="round-button" onClick={()=>setZoom(v=>Math.min(3,Math.round((v+.4)*10)/10))} disabled={zoom>=3} aria-label="Agrandir le décor"><Plus size={15}/></button></div>
      {!entry&&view.phase!=='won'&&view.phase!=='lost'&&(view.stroke?<DrawingMeter {...view.stroke}/>:<div className={`stage-status${status.error?' error':''}`} aria-live="polite"><span>{statusText}</span></div>)}
      {!entry&&typeof level.inkBudget==='number'&&<div className="stage-ink-reserve"><Pencil size={13}/><strong>{Math.max(0,Math.round(level.inkBudget-view.inkUsed))}</strong><span> / {level.inkBudget} encre</span></div>}
      <nav className="stage-tools" aria-label="Outils du voyage">
        <button className="tool-button primary-tool" onClick={pause} disabled={loading||entry||view.phase==='won'||view.phase==='lost'} aria-label={view.phase==='ready'?'Libérer la troupe':view.phase==='playing'?'Mettre en pause':'Reprendre le voyage'}>{view.phase==='playing'?<Pause size={18}/>:<Play size={18}/>}<span>{view.phase==='ready'?'Libérer la troupe':view.phase==='playing'?'Pause':'Reprendre'}</span></button>
        <span className="tool-divider"/>
        <button className="tool-button draw-tool" onClick={()=>{releaseGesture();setDrawMode(v=>!v);setStatus({text:drawMode?'Les appuis sont masqués. Le crayon les fait réapparaître.':'Pars d’un appui rond et dessine jusqu’à l’autre rive.',error:false});}} aria-label="Afficher les appuis pour dessiner" aria-pressed={drawMode} title="Dessiner"><Pencil size={21}/><span className="tool-label">Dessiner</span><small className="tool-key">{keyLabel(bindings.draw[0])}</small></button>
        <button className="tool-button eraser-tool" onClick={()=>{releaseGesture();setSelectedDevice(null);setErasing(v=>!v);}} aria-label="Gomme : effacer un passage" aria-pressed={erasing} disabled={entry||loading||view.phase==='won'||view.phase==='lost'}><Eraser size={19}/><span className="tool-label">Gomme</span></button>
        <button className="tool-button" onClick={()=>act({type:'undo'})} disabled={view.undo===0||entry||view.phase==='won'||view.phase==='lost'} aria-label="Annuler le dernier geste" title="Annuler"><Undo2 size={20}/><small className="tool-key">{keyLabel(bindings.undo[0])}</small></button>
        <button className="tool-button speed-tool" onClick={()=>act({type:'speed'})} aria-label={`Vitesse ${view.speed}, changer la vitesse`} title="Vitesse">{view.speed}×<small className="tool-key">{keyLabel(bindings.speed[0])}</small></button>
      </nav>
      <span className="stage-save-note"><Check size={11}/>{storageOk?'Le voyage se souvient':'Sauvegarde indisponible'}</span>
      {zoom>1&&<input className="stage-navigation" type="range" min={0} max={100} value={Math.round(pan*100)} onChange={e=>setPan(Number(e.target.value)/100)} aria-label="Déplacer la vue dans le décor"/>}
      {entry&&!loading&&!loadError&&<div className="stage-entry"><div className="entry-sheet journey-entry">
        <span className="eyebrow">{level.name} · Tableau {journey.actNumber} sur {journey.actCount}</span><h2>{journey.actTitle}</h2><p className="entry-objective">{level.objective}</p>
        <ol className="entry-rules"><li><Users size={17}/><span><b>Ils avancent seuls.</b> Tu prépares leur chemin.</span></li><li><Pencil size={17}/><span><b>Relie deux appuis de même lettre.</b> Le trait devient un passage.</span></li><li><Settings2 size={17}/><span><b>Sélectionne un mécanisme.</b> Son panneau explique son rôle et propose ses actions.</span></li></ol>
        <JourneyRecap journey={journey}/>
        {migrationNotice&&<p className="entry-update">{migrationNotice}</p>}
        <div className="entry-goal"><Users size={16}/>{journey.survivors} compagnons poursuivent le voyage · au moins {world.rescueTarget} à réunir</div>
        {typeof level.inkBudget==='number'&&<p className="entry-ink"><Eraser size={15}/>{level.inkBudget} unités d’encre pour ce tableau. La gomme récupère l’encre des passages libres.</p>}
        <p className="mastery-note entry-mastery"><Star size={14}/><span><b>Le défi des trois étoiles</b>{journey.masteryGoal}</span></p>
        <button className="solid-button" onClick={dismissEntry}>Observer et préparer<ArrowRight size={16}/></button><small className="entry-note">La troupe attend ton signal. La pause reste disponible à tout moment.</small>
      </div></div>}
      {(loading||loadError)&&<div className="loading-curtain"><img src={getWorldAsset(identity.asset)} alt=""/><div className={`loading-copy${loadError?' load-error':''}`}><span className="eyebrow">{identity.material}</span><h2>{identity.name}</h2><p>{loadError?'Le décor a besoin d’être rechargé.':'L’atelier se prépare…'}</p>{loadError?<><button className="solid-button" onClick={()=>void enterWorld(levelIndex)}>Réessayer<RotateCw size={15}/></button><button className="text-button" onClick={goHome}>Retour aux mondes</button></>:<div className="loading-line"><i/></div>}</div></div>}
      {(view.phase==='won'||view.phase==='lost')&&!loading&&<section className="result-overlay" aria-label={nextAct?'Tableau terminé':'Résultat du voyage'}><div className="result-sheet">
        <Sparkles size={27} strokeWidth={1.2}/><span className="eyebrow">{level.name} · Tableau {journey.actNumber}/{journey.actCount}</span>
        <h2>{view.phase==='won'?(nextAct?'Le voyage continue.':rescuedAll?'Tout le monde est là.':'Le refuge s’illumine.'):'Une autre idée ?'}</h2>
        <p>{nextAct?'Ce tableau est résolu. Les compagnons réunis poursuivent le même voyage vers une nouvelle énigme.':view.phase==='won'?'Les trois tableaux sont traversés. Ta troupe a trouvé son refuge.':'Recommence ce tableau pour essayer une autre solution. Les tableaux précédents restent acquis.'}</p>
        <JourneyRecap journey={journey}/>
        {journey.complete&&<div className="result-stars" aria-label={`${stars} étoiles sur trois`}>{[0,1,2].map(i=><Star key={i} className={i<stars?'earned':''} size={26} strokeWidth={1.2}/>)}</div>}
        <div className="result-details"><div><strong>{view.saved}/{world.total}</strong><small>compagnons réunis</small></div><div><strong>{clock(journey.time)}</strong><small>temps du voyage</small></div><div><strong>{journey.completedActs}/{journey.actCount}</strong><small>tableaux résolus</small></div></div>
        {journey.complete&&<p className={`mastery-note result-mastery${journey.mastered?' completed':''}`}><Star size={15}/><span><b>{journey.mastered?'Troisième étoile obtenue':'Le défi des trois étoiles'}</b>{journey.masteryGoal}<small>Encre du voyage : {journey.inkUsed} / {journey.masteryInk}</small></span></p>}
        <div className="result-buttons">{nextAct?<button className="solid-button" onClick={advance}>Tableau {journey.actNumber+1} · {journey.acts[journey.actIndex+1]?.title}<ArrowRight size={15}/></button>:journey.complete?<button className="solid-button" onClick={()=>void enterWorld((levelIndex+1)%WORLD_LEVELS.length)}>Découvrir {WORLD_IDENTITIES[(levelIndex+1)%3].name}<ArrowRight size={15}/></button>:<button className="solid-button" onClick={restart}><RotateCcw size={15}/>Réessayer ce tableau</button>}
        {nextAct&&view.lost>(runRef.current.actResults.find(result=>result.index===journey.actIndex-1)?.lost??0)&&<button className="text-button" onClick={restart}>Rejouer pour récupérer les compagnons perdus ici</button>}
        <button className="text-button" onClick={goHome}>Les trois mondes</button></div>
        <p className="result-footer">{nextAct?'La progression est enregistrée. Les survivants et les pertes sont conservés.':'Un crayon. Trois mondes. Neuf énigmes.'}</p>
      </div></section>}
    </section>}

    <dialog ref={dialogRef} className={`world-dialog${panel==='book'?' art-dialog':''}`} aria-labelledby="dialog-title" onCancel={e=>{e.preventDefault();setPanel(null);setBinding(null);}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setPanel(null);}}}>
      <header className="dialog-head"><span className="eyebrow">Coup de Main</span><h2 id="dialog-title">{panelTitle}</h2><button className="round-button" onClick={()=>{setPanel(null);setBinding(null);}} aria-label="Fermer"><X size={20}/></button></header>
      <div className="dialog-content">
        {panel==='menu'&&<div className="menu-list"><button onClick={()=>setPanel(null)}><Play size={19}/><span>Revenir au voyage<small>La troupe reprend là où tu l’as laissée.</small></span><ChevronRight size={17}/></button><button onClick={()=>setPanel('help')}><HelpCircle size={19}/><span>La main et la troupe<small>Les gestes pour dessiner ton aventure.</small></span><ChevronRight size={17}/></button><button onClick={()=>setPanel('settings')}><Settings2 size={19}/><span>Réglages<small>Son, confort et raccourcis.</small></span><ChevronRight size={17}/></button><button onClick={()=>setPanel('restart')}><RotateCcw size={19}/><span>Recommencer ce tableau<small>Les tableaux précédents restent acquis.</small></span><ChevronRight size={17}/></button><button onClick={()=>setPanel('restartJourney')}><RotateCw size={19}/><span>Recommencer le voyage entier<small>Repartir à douze depuis le premier tableau.</small></span><ChevronRight size={17}/></button><button onClick={goHome}><Home size={19}/><span>Les trois mondes<small>Ton voyage est conservé.</small></span><ChevronRight size={17}/></button></div>}
        {panel==='settings'&&<><p>Un petit atelier à régler pour jouer confortablement.</p><div className="setting-row"><div><h3>Voix et sons des matières</h3><p>Encre, plis de papier, bois et petites lumières.</p></div><Switch label="Voix et bruitages" value={!muted} onChange={toggleMute}/></div><div className="volume-setting"><label htmlFor="world-volume">Volume<span>{volume}%</span></label><input id="world-volume" type="range" min="0" max="100" value={volume} onChange={e=>setVolume(Number(e.target.value))} onPointerUp={()=>{unlock();audioRef.current?.play('save');}}/></div><div className="setting-row"><div><h3>Animation douce</h3><p>Allège les mouvements du décor.{systemReduced?' Ton appareil demande déjà des mouvements réduits.':''}</p></div><Switch label="Animation douce" value={reducedMotion||systemReduced} onChange={()=>setReducedMotion(v=>!v)}/></div><div className="menu-list" style={{marginTop:22}}><button onClick={()=>setPanel('keys')}><Keyboard size={19}/><span>Raccourcis clavier<small>Deux touches possibles par action.</small></span><ChevronRight size={17}/></button><button onClick={()=>void fullscreen()}><Expand size={19}/><span>Plein écran</span><ChevronRight size={17}/></button></div><div className="dialog-actions"><button className="solid-button" onClick={()=>setPanel(null)}>C’est parfait<Check size={15}/></button></div></>}
        {panel==='keys'&&<><p className="shortcut-caption">Choisis un emplacement, puis presse la touche souhaitée. Suppr efface un raccourci ; Échap annule la saisie.</p><div className="shortcut-table">{SHORTCUTS.map(action=><div className="shortcut-row" key={action.id}><span>{action.label}</span>{([0,1] as const).map(slot=><button key={slot} className={binding?.action===action.id&&binding.slot===slot?'binding':''} onClick={()=>{setBinding({action:action.id,slot});setBindingWarning('');}} aria-label={`${action.label}, touche ${slot+1} : ${keyLabel(bindings[action.id][slot])}`}>{binding?.action===action.id&&binding.slot===slot?'Une touche…':keyLabel(bindings[action.id][slot])}</button>)}</div>)}</div>{bindingWarning&&<p className="shortcut-warning" role="status">{bindingWarning}</p>}<div className="dialog-actions"><button className="text-button" onClick={()=>{setBindings(defaultBindings());setBinding(null);setBindingWarning('');}}>Rétablir les touches</button><button className="solid-button" onClick={()=>{setBinding(null);setPanel('settings');}}>Terminé<Check size={15}/></button></div></>}
        {panel==='hints'&&<><p>{level.stageName}. Observe d’abord les cordes, les appuis et la direction des mécanismes.</p><p className="mastery-note"><Star size={14}/><span><b>Le défi des trois étoiles</b>{journey.masteryGoal}<small>Les indices et les essais ne retirent aucune étoile.</small></span></p>{hintCount===0?<div className="help-steps"><div className="help-step"><Lightbulb size={25}/><h3>Prends ton temps</h3><p>Le voyage est suspendu pendant que tu consultes ce carnet.</p></div><div className="help-step"><Pencil size={25}/><h3>Essaie une idée</h3><p>Tu peux préparer les traits pendant la pause, puis observer ce qui change.</p></div></div>:<ol className="clues">{level.hints.slice(0,hintCount).map((hint,index)=><li key={hint}><span>{index+1}</span><div><small>{index===0?'Un regard':index===1?'Une piste':'Le fil de la solution'}</small><p>{hint}</p></div></li>)}</ol>}<div className="dialog-actions">{hintCount<level.hints.length&&<button className="text-button" onClick={revealHint}><Lightbulb size={15}/>{hintCount===0?'Un premier indice':'Un peu plus d’aide'}</button>}<button className="solid-button" onClick={()=>setPanel(null)}>Retour au décor<ArrowRight size={15}/></button></div></>}
        {panel==='help'&&<><p>Tes compagnons avancent seuls. À toi de leur préparer un chemin et de faire coopérer les mécanismes.</p><div className="help-steps"><div className="help-step"><Pencil size={25}/><h3>Dessine un passage</h3><p>Relie les deux appuis portant la même lettre. La destination s’illumine, une jauge suit ton encre et le trait devient le chemin réellement parcouru.</p></div><div className="help-step"><Hand size={25}/><h3>Touche les mécanismes</h3><p>Sélectionne un objet pour lire son rôle, sa charge et son état. Choisis ensuite une action nommée dans son panneau : monter, descendre, orienter la troupe…</p></div><div className="help-step"><Pause size={25}/><h3>Suspend le temps</h3><p>La pause laisse le temps de réfléchir et de dessiner. La vitesse ×2 accélère les déplacements.</p></div><div className="help-step"><Undo2 size={25}/><h3>Change d’idée</h3><p>Annule le dernier geste ou ouvre la gomme pour effacer un passage libre et récupérer son encre. Un trait occupé est protégé.</p></div></div><p>Sur un petit écran, agrandis le décor puis glisse-le pour explorer. Pendant un trait, approche le crayon d’un bord pour continuer à dessiner au-delà de l’écran. Tu peux aussi jouer en paysage.</p><div className="dialog-actions"><button className="solid-button" onClick={()=>setPanel(null)}>À moi de jouer<ArrowRight size={15}/></button></div></>}
        {panel==='book'&&<>{WORLD_IDENTITIES.map((world,index)=><section className="book-world" key={world.id}><img src={getWorldAsset(world.asset)} alt={`Artwork de ${world.name}`}/><h3>{world.number} · {world.name}</h3><p>{world.description}</p><button onClick={()=>void enterWorld(index)}>Entrer dans ce monde<ArrowRight size={15}/></button></section>)}</>}
        {panel==='restartJourney'&&<><p>Le voyage recommencera au premier tableau avec les douze compagnons. La partie en cours sera remplacée ; le meilleur résultat reste dans le carnet.</p><div className="dialog-actions"><button className="text-button" onClick={()=>setPanel('menu')}>Garder ma progression</button><button className="solid-button" onClick={()=>void enterWorld(levelIndex,true)}><RotateCw size={15}/>Repartir à douze</button></div></>}
        {panel==='restart'&&<><p>Seul le tableau courant repartira du début, avec les compagnons qui y sont entrés. Les tableaux déjà terminés et ton meilleur résultat sont conservés.</p><div className="dialog-actions"><button className="text-button" onClick={()=>setPanel('menu')}>Garder ce tableau</button><button className="solid-button" onClick={restart}><RotateCcw size={15}/>Recommencer</button></div></>}
      </div>
    </dialog>
    {!storageOk&&hydrated&&<p className="storage-notice">Le navigateur ne permet pas de conserver ce voyage. La partie reste jouable.</p>}
  </main>;
}
