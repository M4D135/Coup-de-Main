"use client";

import {useCallback,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,Eraser,Flag,Hand,Home,LocateFixed,Maximize2,Music2,Pause,Pencil,Play,RotateCcw,Settings2,ShieldCheck,Sparkles,Star,Undo2,Users,Volume2,VolumeX,X} from 'lucide-react';
import {WORLD_LEVELS} from '../lib/worlds/levels';
import {createRun,updateRun,applyAction,beginStroke,appendStroke,finishStroke,cancelStroke,saveRun,restoreRun,getRunSummary,getJourneySummary,getDeviceStatus,getStageProgress,isJourneyComplete} from '../lib/worlds/engine';
import {loadWorldAssets,renderWorld,hitTestDrawing,type WorldAssets} from '../lib/worlds/renderer';
import {reactCompanion} from '../lib/worlds/renderer-characters';
import {hitTestPlayTarget,tappedPlatform,type PlayTarget} from '../lib/worlds/interaction';
import {companionFeedback,deviceFeedback,waitingGroupFeedback,createStillnessWatch,observeStillness} from '../lib/worlds/feedback';
import {WorldAudio,type WorldSound} from '../lib/worlds/audio';
import {getWorldAsset} from '../lib/worlds/assets';
import {getExpeditionView,autoPanWorldView,panAroundPoint,type WorldView} from '../lib/worlds/camera';
import {SESSION_KEY} from '../lib/worlds/session';
import type {GameAction,GameEvent,Point,WorldRun,WorldLevel} from '../lib/worlds/types';
import {WorldGate,type WorldRecords} from '../components/worlds/world-gate';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const TABLEAU_WIDTH=3200;
const timeLabel=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
const emptySession=()=>({runs:{} as Record<string,unknown>,records:{} as WorldRecords,muted:false,music:38,effects:65,voices:52,reduced:false,learned:false});
type Session=ReturnType<typeof emptySession>;
const sessionObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Each writer owns only its patch. Re-read storage so another tab keeps its settings and worlds. */
function mergeSessionPatch(stored:unknown,fallback:Session,patch:Partial<Session>):Session {
  const source=sessionObject(stored)?stored:{};
  const runs=sessionObject(source.runs)?source.runs:fallback.runs;
  const records=sessionObject(source.records)?source.records as WorldRecords:fallback.records;
  const merged={...fallback,...source,...patch,runs:{...runs,...patch.runs},records:{...records},
    learned:source.learned===true||fallback.learned||patch.learned===true} as Session;
  for(const [id,record] of Object.entries(patch.records??{})){
    const previous=merged.records[id];
    if(!previous||previous.revision!==record.revision||record.stars>previous.stars
      ||(record.stars===previous.stars&&(record.rescued>previous.rescued||(record.rescued===previous.rescued&&record.time<previous.time))))merged.records[id]=record;
  }
  return merged;
}
type Panel='pause'|'sound'|'restart'|null;
type Gesture={id:number;kind:'pending'|'pan'|'draw'|'pinch';start:Point;panX:number;panY:number;hit:PlayTarget;eraseId?:string|null;distance?:number;zoom?:number;anchor?:Point;pagePull?:number};
const audioEvents:Partial<Record<GameEvent['type'],WorldSound>>={spawn:'start',step:'step',wait:'wait',draw:'draw-end',device:'device',saved:'save',lost:'loss',win:'win',retry:'undo',undo:'undo'};
const makeView=(run:WorldRun,level:WorldLevel)=>({
  phase:run.phase,saved:run.saved,lost:run.lost,time:run.time,speed:run.speed,undo:run.history.length,
  ink:getRunSummary(run,level).inkUsed,summary:getJourneySummary(run,level),progress:getStageProgress(run,level),
  units:run.units.filter(u=>u.state!=='queued'&&u.state!=='lost').map(u=>({id:u.id,x:u.x,y:u.y,saved:u.state==='saved',waiting:u.state==='waiting'})),
  stroke:run.activeStroke?{used:run.activeStroke.points.reduce((sum,p,i,points)=>sum+(i?Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0),0),
    limit:Math.min(level.drawings.find(d=>d.id===run.activeStroke!.drawingId)?.inkLimit??0,Math.max(0,(level.inkBudget??Infinity)-getRunSummary(run,level).inkUsed+(run.drawings[run.activeStroke.drawingId]?.inkLength??0)))}:null,
});

function SoundSlider({label,icon,value,onChange}:{label:string;icon:ReactNode;value:number;onChange:(value:number)=>void}){
  return <label className="sound-slider"><span>{icon}{label}<small>{value}%</small></span><input aria-label={label} type="range" min="0" max="100" value={value} onChange={event=>onChange(Number(event.target.value))}/></label>;
}

export default function HomePage(){
  const [screen,setScreen]=useState<'gate'|'play'>('gate'),[worldIndex,setWorldIndex]=useState(0);
  const [view,setView]=useState(()=>makeView(createRun(WORLD_LEVELS[0]),WORLD_LEVELS[0]));
  const [panel,setPanel]=useState<Panel>(null),[intro,setIntro]=useState(false),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState('');
  const [muted,setMuted]=useState(false),[music,setMusic]=useState(38),[effects,setEffects]=useState(65),[voices,setVoices]=useState(52);
  const [reduced,setReduced]=useState(false),[systemReduced,setSystemReduced]=useState(false),[records,setRecords]=useState<WorldRecords>({});
  const [erasing,setErasing]=useState(false),[drawing,setDrawing]=useState(false),[panning,setPanning]=useState(false);
  const [zoom,setZoom]=useState(1),[panX,setPanX]=useState(0),[panY,setPanY]=useState(.5),[following,setFollowing]=useState(true);
  const [camera,setCamera]=useState<WorldView>({scale:1,x:0,y:0,width:1400,height:900,overflowX:0,overflowY:0});
  const [toast,setToast]=useState(''),[storageOk,setStorageOk]=useState(true),[hydrated,setHydrated]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[migration,setMigration]=useState(false);
  const canvasRef=useRef<HTMLCanvasElement>(null),shellRef=useRef<HTMLElement>(null),dialogRef=useRef<HTMLDialogElement>(null);
  const runRef=useRef(createRun(WORLD_LEVELS[0])),assetsRef=useRef<WorldAssets|null>(null),audioRef=useRef<WorldAudio|null>(null);
  const sessionRef=useRef<Session>(emptySession()),gestureRef=useRef<Gesture|null>(null),pointersRef=useRef(new Map<number,Point>());
  const cameraRef=useRef(camera),pointerRef=useRef<Point|null>(null),hoverRef=useRef<Point|null>(null),handRef=useRef<Point|null>(null);
  const lastStrokeRef=useRef<{point:Point;at:number}|null>(null),requestRef=useRef(0),wonRef=useRef(false),renderFailedRef=useRef(false);
  const tactileRef=useRef(false);
  const persistedSettingsRef=useRef({muted:false,music:38,effects:65,voices:52,reduced:false});
  const persistedRunsRef=useRef<Record<string,string>>({});
  const checkpointRef=useRef<string|null>(null),toastTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null),focusTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const groupRef=useRef(-1),arrowKeysRef=useRef(new Set<string>());
  const tableauRef=useRef({index:-1,changedAt:-1000});
  const stillnessRef=useRef(createStillnessWatch());
  const latest=useRef({screen,worldIndex,panel,intro,loading,erasing,zoom,panX,panY,following,selected,reduced:reduced||systemReduced});
  latest.current={screen,worldIndex,panel,intro,loading,erasing,zoom,panX,panY,following,selected,reduced:reduced||systemReduced};
  const level=WORLD_LEVELS[worldIndex],finished=view.phase==='won'||view.phase==='lost';

  const flash=useCallback((message:string)=>{setToast(message);stillnessRef.current.seconds=0;if(toastTimerRef.current)clearTimeout(toastTimerRef.current);toastTimerRef.current=setTimeout(()=>setToast(''),Math.min(6500,Math.max(3000,message.length*42)));},[]);
  const flush=useCallback((patch:Partial<Session>)=>{
    try{
      let stored:unknown=null;try{stored=JSON.parse(localStorage.getItem(SESSION_KEY)??'null');}catch{}
      sessionRef.current=mergeSessionPatch(stored,sessionRef.current,patch);
      if(Object.keys(patch).length)localStorage.setItem(SESSION_KEY,JSON.stringify(sessionRef.current));
      setStorageOk(true);return true;
    }catch{setStorageOk(false);return false;}
  },[]);
  const persist=useCallback((allowHidden=false)=>{
    if(latest.current.screen!=='play'||(!allowHidden&&document.hidden))return;
    const id=WORLD_LEVELS[latest.current.worldIndex].id,snapshot=saveRun(runRef.current),serialized=JSON.stringify(snapshot);
    // Returning to a paused, unchanged tab must not replace the newer run from another tab.
    if(persistedRunsRef.current[id]===serialized)return;
    if(flush({runs:{[id]:snapshot}}))persistedRunsRef.current[id]=serialized;
  },[flush]);
  const unlock=useCallback(()=>{void audioRef.current?.unlock();},[]);
  const playGestureEvents=useCallback(()=>{for(const event of runRef.current.events.splice(0)){const sound=audioEvents[event.type];if(sound)audioRef.current?.play(sound,event);}},[]);
  const refresh=useCallback(()=>setView(makeView(runRef.current,WORLD_LEVELS[latest.current.worldIndex])),[]);
  const releaseGesture=useCallback((cancel=true)=>{
    if(cancel)cancelStroke(runRef.current);gestureRef.current=null;pointersRef.current.clear();pointerRef.current=null;handRef.current=null;lastStrokeRef.current=null;
    setDrawing(false);setPanning(false);audioRef.current?.endPencil();
  },[]);
  const setPosition=useCallback((x:number,y:number)=>{latest.current.panX=clamp(x);latest.current.panY=clamp(y);setPanX(clamp(x));setPanY(clamp(y));},[]);
  const focusPoint=useCallback((point:Point)=>{const frame=cameraRef.current;const pos=panAroundPoint(frame,point,{x:frame.width*.43,y:frame.height*.53});setPosition(pos.panX,pos.panY);},[setPosition]);
  const goToTableau=useCallback((index:number)=>{
    releaseGesture();setFollowing(false);
    const world=WORLD_LEVELS[latest.current.worldIndex],c=cameraRef.current,count=Math.ceil(world.width/TABLEAU_WIDTH);
    const page=clamp(index,0,count-1),point={x:(page+.5)*TABLEAU_WIDTH,y:world.height*.5};
    const pos=panAroundPoint(c,point,{x:c.width*.5,y:c.height*.5});setPosition(pos.panX,pos.panY);
  },[releaseGesture,setPosition]);
  const findWaitingGroup=useCallback((side:'left'|'right')=>{
    releaseGesture();setFollowing(false);const c=cameraRef.current;
    const waiting=runRef.current.units.filter(u=>u.state==='waiting'&&(side==='left'?u.x*c.scale+c.x<24:u.x*c.scale+c.x>c.width-24))
      .sort((a,b)=>side==='left'?b.x-a.x:a.x-b.x);
    const nearest=waiting[0];if(!nearest)return;
    const group=waiting.filter(u=>Math.abs(u.x-nearest.x)<450&&Math.abs(u.y-nearest.y)<180);
    focusPoint({x:group.reduce((sum,u)=>sum+u.x,0)/group.length,y:group.reduce((sum,u)=>sum+u.y,0)/group.length});
    const notice=waitingGroupFeedback(runRef.current,WORLD_LEVELS[latest.current.worldIndex],group);
    if(notice)flash(notice.message);
  },[releaseGesture,focusPoint,flash]);
  const takeAction=useCallback((action:GameAction)=>{
    unlock();if(['pause','undo','erase','restart','retry'].includes(action.type))releaseGesture();
    runRef.current.events.length=0;
    const result=applyAction(runRef.current,WORLD_LEVELS[latest.current.worldIndex],action);
    playGestureEvents();
    if(!result.ok)flash(result.message);
    else if(action.type==='device'){
      setSelected(action.id);if(focusTimerRef.current)clearTimeout(focusTimerRef.current);focusTimerRef.current=setTimeout(()=>setSelected(null),900);
      flash(deviceFeedback(runRef.current,WORLD_LEVELS[latest.current.worldIndex],action.id));
    }
    refresh();persist();return result;
  },[unlock,releaseGesture,flash,refresh,persist,playGestureEvents]);
  const playPause=useCallback(()=>{const phase=runRef.current.phase;if(phase==='ready')takeAction({type:'start'});else if(phase==='playing'||phase==='paused')takeAction({type:'pause'});},[takeAction]);
  const openPause=useCallback(()=>{releaseGesture();setPanel('pause');persist();},[releaseGesture,persist]);
  const goHome=useCallback(()=>{persist();releaseGesture();requestRef.current++;setPanel(null);setIntro(false);setScreen('gate');setLoading(false);setLoadError('');assetsRef.current=null;},[persist,releaseGesture]);
  const enterWorld=useCallback(async(index:number,fresh=false)=>{
    persist();flush({});releaseGesture();unlock();const next=WORLD_LEVELS[index],request=++requestRef.current;
    const raw=sessionRef.current.runs[next.id],restored=fresh?null:restoreRun(raw,next);
    const resumed=restored&&!isJourneyComplete(next,restored)?restored:null;
    runRef.current=resumed??createRun(next);if(runRef.current.phase==='playing')applyAction(runRef.current,next,{type:'pause',paused:true});
    const migrated=!!raw&&typeof raw==='object'&&'version'in raw&&raw.version!==3;
    assetsRef.current=null;wonRef.current=false;renderFailedRef.current=false;groupRef.current=-1;tableauRef.current={index:-1,changedAt:-1000};checkpointRef.current=getStageProgress(runRef.current,next).checkpoint?.id??null;
    setWorldIndex(index);setScreen('play');setPanel(null);setLoading(true);setLoadError('');setIntro(!sessionRef.current.learned);setMigration(migrated&&!fresh);
    setView(makeView(runRef.current,next));setErasing(false);setToast('');setSelected(null);setFollowing(true);
    const portrait=window.innerHeight>window.innerWidth,newZoom=!portrait&&window.innerHeight<550?1.2:1;
    setZoom(newZoom);setPosition(0,.5);audioRef.current?.setWorld(next.id);
    try{const assets=await loadWorldAssets(next.id);if(request!==requestRef.current)return;assetsRef.current=assets;setLoading(false);
      const source=next.nodes.find(node=>node.id===next.spawn)!;
      const first=resumed?.units.filter(unit=>unit.state!=='lost'&&unit.state!=='saved'&&unit.state!=='queued').sort((a,b)=>a.x-b.x)[0];
      const position=first??source,c=getExpeditionView(next.width,next.height,window.innerWidth,window.innerHeight,newZoom,0,.5,TABLEAU_WIDTH);
      const pos=panAroundPoint(c,position,{x:c.width*.4,y:c.height*.54});setPosition(pos.panX,pos.panY);
    }catch(error){if(request===requestRef.current){setLoading(false);setLoadError(error instanceof Error?error.message:'Le décor ne répond pas.');}}
  },[persist,releaseGesture,unlock,setPosition,flush]);
  const findGroup=useCallback(()=>{
    releaseGesture();const units=runRef.current.units.filter(u=>u.state!=='saved'&&u.state!=='lost'&&u.state!=='queued').sort((a,b)=>a.x-b.x);
    const groups:Point[][]=[];for(const u of units){const group=groups.at(-1);if(!group||u.x-group.at(-1)!.x>500)groups.push([u]);else group.push(u);}
    if(!groups.length){const spawn=WORLD_LEVELS[latest.current.worldIndex].nodes.find(n=>n.id===WORLD_LEVELS[latest.current.worldIndex].spawn);if(spawn)focusPoint(spawn);setFollowing(true);return;}
    groupRef.current=(groupRef.current+1)%groups.length;const group=groups[groupRef.current];focusPoint({x:group.reduce((sum,u)=>sum+u.x,0)/group.length,y:group.reduce((sum,u)=>sum+u.y,0)/group.length});setFollowing(groups.length===1);
  },[releaseGesture,focusPoint]);

  useEffect(()=>{
    audioRef.current=new WorldAudio();try{const raw=JSON.parse(localStorage.getItem(SESSION_KEY)??'null');if(raw&&typeof raw==='object'){
      const state=emptySession();if(raw.runs&&typeof raw.runs==='object'&&!Array.isArray(raw.runs))state.runs=raw.runs;
      for(const world of WORLD_LEVELS){const r=raw.records?.[world.id];if(r&&Number.isFinite(r.time)&&Number.isInteger(r.rescued)&&r.rescued>=0&&r.rescued<=12)state.records[world.id]={rescued:r.rescued,stars:clamp(Number(r.stars)||0,0,3),time:Math.max(0,r.time),completed:r.completed===true,revision:r.revision===3?3:0};}
      for(const key of ['music','effects','voices'] as const)if(Number.isFinite(raw[key]))state[key]=clamp(raw[key],0,100);
      state.muted=raw.muted===true;state.reduced=raw.reduced===true;state.learned=raw.learned===true;
      sessionRef.current=state;persistedSettingsRef.current={muted:state.muted,music:state.music,effects:state.effects,voices:state.voices,reduced:state.reduced};setRecords(state.records);setMuted(state.muted);setMusic(state.music);setEffects(state.effects);setVoices(state.voices);setReduced(state.reduced);
    }}catch{setStorageOk(false);}
    const query=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setSystemReduced(query.matches);change();query.addEventListener('change',change);setHydrated(true);
    return()=>{audioRef.current?.dispose();query.removeEventListener('change',change);if(toastTimerRef.current)clearTimeout(toastTimerRef.current);if(focusTimerRef.current)clearTimeout(focusTimerRef.current);};
  },[]);
  useEffect(()=>{
    audioRef.current?.setMuted(muted);audioRef.current?.setMusicVolume(music/100);audioRef.current?.setEffectsVolume(effects/100);audioRef.current?.setVoicesVolume(voices/100);
    if(!hydrated)return;
    const values={muted,music,effects,voices,reduced},previous=persistedSettingsRef.current,patch:Partial<Session>={};
    for(const key of ['muted','reduced'] as const)if(values[key]!==previous[key])patch[key]=values[key];
    for(const key of ['music','effects','voices'] as const)if(values[key]!==previous[key])patch[key]=values[key];
    if(Object.keys(patch).length&&flush(patch))persistedSettingsRef.current=values;
  },[muted,music,effects,voices,reduced,hydrated,flush]);
  useEffect(()=>{audioRef.current?.setActive(screen==='play');},[screen]);
  useEffect(()=>{const dialog=dialogRef.current;if(panel&&!dialog?.open)dialog?.showModal();else if(!panel&&dialog?.open)dialog.close();},[panel]);
  useEffect(()=>{const hide=()=>{if(document.hidden&&latest.current.screen==='play'){releaseGesture();if(runRef.current.phase==='playing')applyAction(runRef.current,WORLD_LEVELS[latest.current.worldIndex],{type:'pause',paused:true});refresh();persist(true);}};
    const pageHide=()=>{if(!document.hidden)persist();};
    const timer=setInterval(()=>{if(!document.hidden&&latest.current.screen==='play')persist();},5000);
    window.addEventListener('pagehide',pageHide);document.addEventListener('visibilitychange',hide);
    return()=>{window.removeEventListener('pagehide',pageHide);document.removeEventListener('visibilitychange',hide);clearInterval(timer);};
  },[persist,releaseGesture,refresh]);

  useEffect(()=>{
    let id=0,lastAt=0,elapsed=0,lastUi=0;
    const frame=(at:number)=>{
      id=requestAnimationFrame(frame);const dt=lastAt?Math.min(.05,Math.max(0,(at-lastAt)/1000)):0;lastAt=at;
      const state=latest.current,canvas=canvasRef.current,assets=assetsRef.current;if(state.screen!=='play'||!canvas||!assets)return;
      const world=WORLD_LEVELS[state.worldIndex],run=runRef.current,blocked=!!state.panel||state.intro||state.loading||document.hidden;
      if(!blocked){for(const event of updateRun(run,world,dt)){const sound=audioEvents[event.type];if(sound)audioRef.current?.play(sound,event);}}
      if(!blocked)elapsed+=dt;
      const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2),w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const context=canvas.getContext('2d');if(!context)return;
      let c=getExpeditionView(world.width,world.height,rect.width,rect.height,state.zoom,state.panX,state.panY,TABLEAU_WIDTH);
      if(!blocked&&gestureRef.current?.kind==='draw'&&pointerRef.current){const pos=autoPanWorldView(c,pointerRef.current,dt,state.panX,state.panY);if(pos.panX!==state.panX||pos.panY!==state.panY){setPosition(pos.panX,pos.panY);c=getExpeditionView(world.width,world.height,rect.width,rect.height,state.zoom,pos.panX,pos.panY,TABLEAU_WIDTH);const point={x:(pointerRef.current.x-c.x)/c.scale,y:(pointerRef.current.y-c.y)/c.scale};appendStroke(run,world,point);handRef.current=run.activeStroke?.points.at(-1)??point;}}
      if(!blocked&&!gestureRef.current&&arrowKeysRef.current.size){const dx=(arrowKeysRef.current.has('ArrowRight')?1:0)-(arrowKeysRef.current.has('ArrowLeft')?1:0),dy=(arrowKeysRef.current.has('ArrowDown')?1:0)-(arrowKeysRef.current.has('ArrowUp')?1:0);if(dx||dy){setFollowing(false);setPosition(state.panX+(c.overflowX?dx*dt*420/c.overflowX:0),state.panY+(c.overflowY?dy*dt*420/c.overflowY:0));}}
      if(!blocked&&state.following&&!gestureRef.current&&run.phase==='playing'){
        const active=run.units.filter(u=>u.state==='walking'||u.state==='waiting'||u.state==='riding'),lead=active.reduce<typeof active[number]|null>((a,b)=>!a||b.x>a.x?b:a,null);
        if(lead){const desired=panAroundPoint(c,lead,{x:c.width*.43,y:c.height*.57}),nextPage=clamp(Math.floor(lead.x/TABLEAU_WIDTH),0,Math.ceil(world.width/TABLEAU_WIDTH)-1),t=nextPage!==c.tableauIndex?1:1-Math.exp(-dt*2.1);setPosition(state.panX+(desired.panX-state.panX)*t,state.panY+(desired.panY-state.panY)*t);c=getExpeditionView(world.width,world.height,rect.width,rect.height,state.zoom,latest.current.panX,latest.current.panY,TABLEAU_WIDTH);}
      }
      if(tableauRef.current.index!==c.tableauIndex){const previous=tableauRef.current.index;tableauRef.current={index:c.tableauIndex??0,changedAt:previous<0?-1000:at};setCamera({...c});}
      cameraRef.current=c;audioRef.current?.setListener({x:(c.width/2-c.x)/c.scale,y:(c.height/2-c.y)/c.scale,width:c.width/c.scale,height:c.height/c.scale});
      context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,rect.width,rect.height);context.translate(c.x,c.y);context.scale(c.scale,c.scale);
      context.save();context.beginPath();context.rect((c.tableauIndex??0)*TABLEAU_WIDTH,0,TABLEAU_WIDTH,world.height);context.clip();
      try{renderWorld(context,world,run,assets,{elapsed,dt:blocked?0:dt,reducedMotion:state.reduced,activeStroke:run.activeStroke,handTip:tactileRef.current?null:handRef.current,hover:hoverRef.current,drawAnchors:!state.erasing,selectedDevice:state.selected,viewScale:c.scale,viewport:c,hudInsets:{top:74,bottom:120,left:8,right:8}});}catch(error){if(!renderFailedRef.current){renderFailedRef.current=true;setLoadError(error instanceof Error?error.message:'Le paysage ne peut pas être affiché.');}}
      context.restore();
      // A brief paper veil reveals the next complete illustration. The two
      // pictures are never stretched, blended together or shown as a seam.
      const pageAge=at-tableauRef.current.changedAt;
      if(!state.reduced&&pageAge>=0&&pageAge<180){context.save();context.setTransform(ratio,0,0,ratio,0,0);context.globalAlpha=1-pageAge/180;context.fillStyle=world.palette.paper;context.fillRect(0,0,rect.width,rect.height);context.restore();}
      if(at-lastUi>110){
        const visible=run.units.filter(unit=>{const x=unit.x*c.scale+c.x,y=(unit.y-world.creatureHeight*.6)*c.scale+c.y;return x>=20&&x<=c.width-20&&y>=70&&y<=c.height-115;})
          .sort((a,b)=>Math.hypot(a.x*c.scale+c.x-c.width/2,a.y*c.scale+c.y-c.height/2)-Math.hypot(b.x*c.scale+c.x-c.width/2,b.y*c.scale+c.y-c.height/2));
        const notice=observeStillness(stillnessRef.current,run,world,(at-lastUi)/1000,visible,!blocked&&!gestureRef.current&&!state.erasing&&!arrowKeysRef.current.size);
        if(notice)flash(notice.message);
        setView(makeView(run,world));setCamera({...c});lastUi=at;const checkpoint=getStageProgress(run,world).checkpoint?.id??null;if(checkpoint&&checkpoint!==checkpointRef.current){checkpointRef.current=checkpoint;flash('Un souvenir conservé.');persist();}
      }
      if(isJourneyComplete(world,run)&&!wonRef.current){wonRef.current=true;const s=getJourneySummary(run,world),record={rescued:s.saved,time:s.time,stars:s.stars,completed:true,revision:3};flush({records:{[world.id]:record}});setRecords({...sessionRef.current.records});persist();}
    };id=requestAnimationFrame(frame);return()=>cancelAnimationFrame(id);
  },[setPosition,persist,flash,flush]);

  const localPoint=(event:ReactPointerEvent<HTMLCanvasElement>):Point=>{const bounds=event.currentTarget.getBoundingClientRect();return {x:event.clientX-bounds.left,y:event.clientY-bounds.top};};
  const worldPoint=(p:Point):Point=>{const c=cameraRef.current;return {x:(p.x-c.x)/c.scale,y:(p.y-c.y)/c.scale};};
  const changeZoom=(value:number,screenPoint?:Point,anchor?:Point)=>{const c=cameraRef.current,z=clamp(value,1,3.4),point=screenPoint??{x:c.width/2,y:c.height/2},world=anchor??worldPoint(point);const next=getExpeditionView(level.width,level.height,c.width,c.height,z,panX,panY,TABLEAU_WIDTH),pos=panAroundPoint(next,world,point);latest.current.zoom=z;setZoom(z);setPosition(pos.panX,pos.panY);};
  const pointerDown=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(event.button!==0||panel||intro||loading||loadError||finished)return;event.preventDefault();unlock();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
    tactileRef.current=event.pointerType==='touch'||event.pointerType==='pen';
    const p=localPoint(event);pointersRef.current.set(event.pointerId,p);setFollowing(false);
    if(pointersRef.current.size===2){cancelStroke(runRef.current);audioRef.current?.endPencil();setDrawing(false);handRef.current=null;pointerRef.current=null;const [a,b]=[...pointersRef.current.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gestureRef.current={id:event.pointerId,kind:'pinch',start:mid,panX:latest.current.panX,panY:latest.current.panY,hit:null,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:latest.current.zoom,anchor:worldPoint(mid)};setPanning(true);return;}
    if(pointersRef.current.size>2)return;
    const wp=worldPoint(p),run=runRef.current,hit=erasing?null:hitTestPlayTarget(level,run,wp,cameraRef.current.scale);
    const c=cameraRef.current,radius=24/c.scale;
    const gesture:Gesture={id:event.pointerId,kind:'pending',start:p,panX:c.overflowX?-c.x/c.overflowX:0,panY:latest.current.panY,hit,eraseId:erasing?hitTestDrawing(level,run,wp,radius):null};gestureRef.current=gesture;
    if(!erasing&&hit?.kind==='drawing'){const d=level.drawings.find(item=>item.id===hit.id),endpoint=d?.[hit.end];if(endpoint&&beginStroke(run,level,endpoint).ok){gesture.kind='draw';pointerRef.current=p;setDrawing(true);handRef.current=endpoint;lastStrokeRef.current={point:endpoint,at:performance.now()};audioRef.current?.beginPencil();}}
  };
  const pointerMove=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const p=localPoint(event),wp=worldPoint(p);hoverRef.current=wp;if(!pointersRef.current.has(event.pointerId))return;pointersRef.current.set(event.pointerId,p);const g=gestureRef.current;if(!g)return;event.preventDefault();
    if(g.kind==='pinch'){const [a,b]=[...pointersRef.current.values()];if(a&&b)changeZoom((g.zoom??1)*Math.hypot(a.x-b.x,a.y-b.y)/(g.distance??1),{x:(a.x+b.x)/2,y:(a.y+b.y)/2},g.anchor);return;}
    if(g.id!==event.pointerId)return;
    if(g.kind==='pending'&&Math.hypot(p.x-g.start.x,p.y-g.start.y)>8){g.kind='pan';setPanning(true);}
    if(g.kind==='pan'){const c=cameraRef.current,raw=g.panX-(c.overflowX?(p.x-g.start.x)/c.overflowX:0),bounded=clamp(raw,c.panMinX??0,c.panMaxX??1);g.pagePull=(raw-bounded)*c.overflowX;setPosition(bounded,g.panY-(c.overflowY?(p.y-g.start.y)/c.overflowY:0));return;}
    if(g.kind==='draw'){pointerRef.current=p;appendStroke(runRef.current,level,wp);handRef.current=runRef.current.activeStroke?.points.at(-1)??wp;const prev=lastStrokeRef.current,at=performance.now();if(prev)audioRef.current?.updatePencil(Math.hypot(wp.x-prev.point.x,wp.y-prev.point.y)/Math.max(.001,(at-prev.at)/1000));lastStrokeRef.current={point:wp,at};}
  };
  const pointerUp=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const g=gestureRef.current;pointersRef.current.delete(event.pointerId);if(!g)return;
    if(g.kind==='pinch'){const remaining=pointersRef.current.entries().next().value as [number,Point]|undefined;if(remaining){const c=cameraRef.current;gestureRef.current={id:remaining[0],kind:'pan',start:remaining[1],panX:c.overflowX?-c.x/c.overflowX:0,panY:latest.current.panY,hit:null};}else releaseGesture();return;}
    if(g.id!==event.pointerId)return;
    if(g.kind==='draw'){
      const local=localPoint(event),point=worldPoint(local);
      if(Math.hypot(local.x-g.start.x,local.y-g.start.y)<8){
        // A tap on a loaded pan operates its crank; dragging its rim draws a
        // bridge. Touch users do not need to hit a tiny handle beside an anchor.
        const device=tappedPlatform(level,runRef.current,point,cameraRef.current.scale);
        releaseGesture();if(device)takeAction({type:'device',id:device});return;
      }
      appendStroke(runRef.current,level,point);runRef.current.events.length=0;const result=finishStroke(runRef.current,level);playGestureEvents();if(!result.ok)flash(result.message);refresh();persist();releaseGesture(false);return;
    }
    if(g.kind==='pending'){
      if(erasing){if(g.eraseId){const result=takeAction({type:'erase',id:g.eraseId});if(result.ok)setErasing(false);}else flash('Touche un trait libre pour l’effacer.');}
      else if(g.hit?.kind==='device')takeAction({type:'device',id:g.hit.id});
      else if(g.hit?.kind==='companion'){
        const unit=runRef.current.units.find(unit=>unit.id===g.hit!.id);
        if(unit){
          if(reactCompanion(runRef.current,unit.id))audioRef.current?.play('wait',{unitId:unit.id,x:unit.x,y:unit.y});
          const reason=companionFeedback(runRef.current,level,unit);
          if(reason)flash(reason);
        }
      }
    }releaseGesture();
    if(g.kind==='pan'&&Math.abs(g.pagePull??0)>Math.min(72,cameraRef.current.width*.16))goToTableau((cameraRef.current.tableauIndex??0)+((g.pagePull??0)>0?1:-1));
  };
  const retry=()=>{wonRef.current=false;const result=takeAction({type:'retry'});if(result.ok){setPanel(null);setFollowing(true);const progress=getStageProgress(runRef.current,level);focusPoint(progress.checkpoint??{x:progress.rearmostX,y:500});}};
  const startAdventure=()=>{unlock();flush({learned:true});setIntro(false);setMigration(false);takeAction({type:'start'});setFollowing(true);};
  const toggleMute=()=>{unlock();setMuted(v=>!v);};
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{if(event.metaKey||event.ctrlKey||event.altKey||(event.target as HTMLElement)?.matches('input,select,textarea,button'))return;
      if(event.key==='Escape'){event.preventDefault();if(latest.current.panel)setPanel(null);else if(latest.current.screen==='play')openPause();return;}
      if(latest.current.screen!=='play'||latest.current.panel||latest.current.intro)return;
      if(event.key==='PageDown'||event.key==='PageUp'){event.preventDefault();if(!event.repeat)goToTableau((cameraRef.current.tableauIndex??0)+(event.key==='PageDown'?1:-1));return;}
      if(event.key.startsWith('Arrow')){event.preventDefault();arrowKeysRef.current.add(event.key);return;}
      if(event.repeat)return;if([' ','p'].includes(event.key)){event.preventDefault();playPause();}else if(['z','Backspace'].includes(event.key)){event.preventDefault();takeAction({type:'undo'});}else if(event.key==='e'){releaseGesture();setErasing(v=>!v);}else if(event.key==='f')takeAction({type:'speed'});else if(event.key==='r')findGroup();
    };const up=(event:KeyboardEvent)=>arrowKeysRef.current.delete(event.key),blur=()=>arrowKeysRef.current.clear();window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[playPause,takeAction,releaseGesture,findGroup,openPause,goToTableau]);
  const tableauIndex=camera.tableauIndex??0,tableauCount=Math.ceil(level.width/TABLEAU_WIDTH);
  const areaName=level.sectors?.[tableauIndex*2]?.name??level.stageName;
  const waitingLeft=view.units.filter(u=>u.waiting&&u.x*camera.scale+camera.x<24).length;
  const waitingRight=view.units.filter(u=>u.waiting&&u.x*camera.scale+camera.x>camera.width-24).length;
  const inkLeft=clamp(1-view.ink/(level.inkBudget??1)),resumeAt:Record<string,number>={};
  if(screen==='gate')for(const world of WORLD_LEVELS){const raw=sessionRef.current.runs[world.id];if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===3&&'phase'in raw&&raw.phase!=='won'){const restored=restoreRun(raw,world);if(restored)resumeAt[world.id]=getStageProgress(restored,world).progress*100;}}

  return <main ref={shellRef} className={`universe-shell world-${screen==='gate'?'boucles':level.id}`}>
    {screen==='gate'?<WorldGate onEnter={i=>void enterWorld(i)} onSettings={()=>{unlock();setPanel('sound');}} records={records} muted={muted} onMute={toggleMute} resumeAt={resumeAt}/>:<section className={`expedition ${erasing?'erasing':''}`} aria-label={`${level.name} — ${level.stageName}`}>
      <canvas ref={canvasRef} role="application" tabIndex={0} aria-label={`${level.name}. Touche un mécanisme pour agir. Trace depuis un appui. Glisse le décor pour explorer. Pince pour zoomer.`} className={drawing?'drawing':panning?'panning':''} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>releaseGesture()} onLostPointerCapture={event=>{if(pointersRef.current.has(event.pointerId))releaseGesture();}} onPointerLeave={()=>{if(!gestureRef.current)hoverRef.current=null;}} onWheel={event=>{if(panel||intro)return;setFollowing(false);changeZoom(latest.current.zoom*(event.deltaY>0?.92:1.08),{x:event.clientX-event.currentTarget.getBoundingClientRect().left,y:event.clientY-event.currentTarget.getBoundingClientRect().top});}}/>
      <header className="play-header"><button className="game-icon home-icon" onClick={goHome} aria-label="Revenir aux mondes"><ArrowLeft size={21}/></button><div className="place-name"><small>{level.name}<span className="place-page">{tableauIndex+1}/{tableauCount}</span>{!loading&&!intro&&!finished&&<span className="ink-ribbon" role="meter" aria-label="Encre disponible" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(inkLeft*100)}><Pencil size={11}/><span><i style={{width:`${inkLeft*100}%`}}/></span></span>}</small><h1>{areaName}</h1></div>{(tableauIndex===tableauCount-1||view.saved>0)&&<div className="play-count" aria-label={`${view.saved} compagnons arrivés au refuge sur 12`}><Users size={20}/><span><em>Au refuge</em>{view.saved}<small>/12</small></span></div>}<button className="game-icon" onClick={openPause} aria-label="Pause et son"><Settings2 size={20}/></button></header>
      {view.phase==='paused'&&!panel&&!intro&&<div className="time-still"><Pause size={11}/>Pause</div>}
      {!loading&&!intro&&!finished&&<>
        {tableauIndex>0&&<button className="page-arrow page-arrow-left" onClick={()=>goToTableau(tableauIndex-1)} aria-label="Tableau précédent"><ArrowLeft size={21}/></button>}
        {tableauIndex<tableauCount-1&&<button className="page-arrow page-arrow-right" onClick={()=>goToTableau(tableauIndex+1)} aria-label="Tableau suivant"><ArrowRight size={21}/></button>}
        {waitingLeft>0&&<button className="waiting-group waiting-group-left" onClick={()=>findWaitingGroup('left')} aria-label={`${waitingLeft} compagnons attendent à gauche, les retrouver`}><ArrowLeft size={14}/><Users size={16}/><b>{waitingLeft}</b></button>}
        {waitingRight>0&&<button className="waiting-group waiting-group-right" onClick={()=>findWaitingGroup('right')} aria-label={`${waitingRight} compagnons attendent à droite, les retrouver`}><b>{waitingRight}</b><Users size={16}/><ArrowRight size={14}/></button>}
        <div className="game-tools" role="toolbar" aria-label="Commandes du jeu">
          <button className="game-icon" onClick={()=>takeAction({type:'undo'})} disabled={!view.undo} aria-label="Annuler le dernier geste" title="Annuler"><Undo2 size={22}/></button>
          <button className={`game-icon ${erasing?'active':''}`} onClick={()=>{releaseGesture();setErasing(v=>!v);}} aria-label={erasing?'Reprendre le crayon':'Gomme : toucher un trait pour l’effacer'} aria-pressed={erasing} title="Gomme">{erasing?<Pencil size={23}/>:<Eraser size={23}/>}</button>
          <button className="play-button" onClick={playPause} aria-label={view.phase==='playing'?'Mettre en pause':view.phase==='ready'?'Libérer les compagnons':'Reprendre'}>{view.phase==='playing'?<Pause size={26} fill="currentColor"/>:<Play size={27} fill="currentColor"/>}</button>
          <button className={`game-icon ${following?'following':''}`} onClick={findGroup} aria-label="Retrouver un groupe de compagnons" title="La troupe"><LocateFixed size={23}/></button>
          <button className="game-icon speed-button" onClick={()=>takeAction({type:'speed'})} aria-label={`Vitesse ${view.speed}, changer`} title="Vitesse">{view.speed}×</button>
        </div>
        <nav className="page-trail" aria-label="Les cinq tableaux du voyage">{Array.from({length:tableauCount},(_,index)=>{
          const occupied=view.units.some(u=>!u.saved&&Math.floor(u.x/TABLEAU_WIDTH)===index);
          return <button key={index} onClick={()=>goToTableau(index)} className={`${index===tableauIndex?'current':''} ${occupied?'occupied':''}`} aria-current={index===tableauIndex?'page':undefined} aria-label={`Tableau ${index+1} : ${level.sectors?.[index*2]?.name??level.stageName}`}><span>{index+1}</span></button>;
        })}</nav>
      </>}
      {view.stroke&&<div className={`stroke-ink ${view.stroke.used>view.stroke.limit?'empty':''}`} aria-label="Encre du trait"><Pencil size={16}/><progress value={Math.min(view.stroke.used,view.stroke.limit)} max={Math.max(1,view.stroke.limit)}/></div>}
      {erasing&&!drawing&&!panel&&<div className="game-toast mode-toast">Touche le trait à effacer</div>}
      {toast&&!panel&&!intro&&<div className="game-toast" role="status">{toast}</div>}
      {migration&&!loading&&!intro&&<button className="migration-note" onClick={()=>setMigration(false)}>La grande aventure commence ici.<X size={13}/></button>}
      {level.devices.filter(device=>device.playerControlled!==false&&device.modes.length>1).map(device=>{const x=device.x*camera.scale+camera.x,y=device.y*camera.scale+camera.y;if(x<0||x>camera.width||y<75||y>camera.height-115||intro||finished||loading||panel)return null;const status=getDeviceStatus(runRef.current,level,device.id);return <button key={device.id} className="mechanism-keyboard" style={{left:x-24,top:y-24}} onClick={()=>takeAction({type:'device',id:device.id})} onFocus={()=>setSelected(device.id)} onBlur={()=>setSelected(null)} aria-label={`${device.label} : ${status?.stateLabel??''}. ${status?.actionLabel??'Actionner'}`} title={device.label}/>;})}
      {loading&&<div className="loading-curtain"><img src={getWorldAsset(`worlds/${level.id}-art.png`)} alt=""/><div className="loading-copy"><span className="eyebrow">{level.name}</span><h2>Le voyage s’éveille</h2><div className="loading-line"><i/></div></div></div>}
      {loadError&&<div className="game-shade"><div className="game-sheet"><h2>Un petit contretemps</h2><p>{loadError}</p><button className="solid-button" onClick={()=>void enterWorld(worldIndex)}>Réessayer<RotateCcw size={17}/></button></div></div>}
      {intro&&!loading&&!loadError&&<div className="game-shade gentle"><div className="game-sheet welcome-sheet"><span className="eyebrow">{level.name}</span><h2>Une main suffit.</h2><p>Douze compagnons. Un long chemin.<br/>À toi de leur ouvrir la voie.</p><div className="gesture-lessons"><span><Hand size={26}/><b>Touche</b><small>un mécanisme</small></span><span><Pencil size={26}/><b>Trace</b><small>depuis un appui</small></span><span><Maximize2 size={26}/><b>Explore</b><small>glisse ou pince</small></span></div><button className="solid-button" onClick={startAdventure}>C’est parti<Play size={17} fill="currentColor"/></button><small className="rescue-goal">Au moins 10 compagnons à réunir.</small></div></div>}
      {finished&&!loading&&<div className="game-shade"><div className="game-sheet result-sheet-v3"><Sparkles size={31}/><span className="eyebrow">{level.name}</span><h2>{view.phase==='won'?(view.saved===12?'Tous ensemble.':'Le refuge est atteint.'):'Un autre chemin existe.'}</h2><div className="big-rescue">{view.saved}<small>/12</small></div>{view.phase==='won'&&<div className="earned-stars" aria-label={`${view.summary.stars} étoiles sur 3`}>{[1,2,3].map(n=><Star key={n} size={25} fill={n<=view.summary.stars?'currentColor':'none'}/>)}</div>}<p>{view.phase==='won'?`${timeLabel(view.time)} de voyage · ${view.summary.mastered?'Une troupe réunie avec soin.':'Chaque compagnon compte.'}`:'Le dernier souvenir permet de reprendre le voyage.'}</p><button className="solid-button" onClick={view.phase==='won'?goHome:retry}>{view.phase==='won'?'Les trois mondes':'Reprendre au souvenir'}<ArrowRight size={17}/></button><button className="text-button" onClick={()=>void enterWorld(worldIndex,true)}>Repartir du début</button></div></div>}
    </section>}
    <dialog ref={dialogRef} className="pause-sheet" onCancel={event=>{event.preventDefault();setPanel(null);}} onClick={event=>{if(event.target===event.currentTarget)setPanel(null);}}>
      <button className="game-icon close-pause" onClick={()=>setPanel(null)} aria-label="Fermer"><X size={21}/></button>
      <span className="eyebrow">Coup de Main</span><h2>{panel==='restart'?'Un nouveau départ ?':screen==='play'?'Une petite pause.':'À ton rythme.'}</h2>
      {panel==='restart'?<><p>Le voyage en cours repartira à douze. Ton meilleur résultat reste conservé.</p><button className="solid-button" onClick={()=>void enterWorld(worldIndex,true)}>Recommencer<RotateCcw size={17}/></button><button className="text-button" onClick={()=>setPanel('pause')}>Continuer cette aventure</button></>:<>
        {screen==='play'&&<button className="solid-button resume-button" onClick={()=>setPanel(null)}>Retour au jeu<Play size={17} fill="currentColor"/></button>}
        <div className="sound-controls"><button className="mute-control" aria-pressed={muted} onClick={toggleMute}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}<span>{muted?'Son coupé':'Son activé'}</span></button>
          <SoundSlider label="Musique" icon={<Music2 size={18}/>} value={music} onChange={value=>{unlock();setMusic(value);}}/>
          <SoundSlider label="Bruitages" icon={<Volume2 size={18}/>} value={effects} onChange={value=>{unlock();setEffects(value);}}/>
          <SoundSlider label="Petites voix" icon={<Users size={18}/>} value={voices} onChange={value=>{unlock();setVoices(value);}}/>
        </div>
        <label className="motion-control"><span>Mouvements doux</span><input type="checkbox" checked={reduced||systemReduced} disabled={systemReduced} onChange={()=>setReduced(value=>!value)}/></label>
        {screen==='play'&&<div className="pause-actions"><button onClick={retry}><Flag size={18}/><span>Dernier souvenir</span></button><button onClick={()=>setPanel('restart')}><RotateCcw size={18}/><span>Recommencer</span></button><button onClick={goHome}><Home size={18}/><span>Les mondes</span></button></div>}
      </>}
    </dialog>
    {!storageOk&&hydrated&&<span className="save-warning"><ShieldCheck size={14}/>Sauvegarde indisponible dans ce navigateur.</span>}
  </main>;
}
