"use client";

import {useEffect,useState} from 'react';
import {ArrowRight,Check,ChevronDown,Eraser,Flag,Info,LockKeyhole,Pencil,Settings2,Users,X} from 'lucide-react';
import type {getDeviceStatus,getJourneySummary} from '../../lib/worlds/engine';

type Journey = ReturnType<typeof getJourneySummary>;
type Mechanism = NonNullable<ReturnType<typeof getDeviceStatus>>;

export function JourneyGuide({journey,compact,devices,selectedDevice,onSelect,onHelp}: {
  journey:Journey; compact:boolean; devices:Array<{id:string;label:string;automatic?:boolean}>;
  selectedDevice:string|null; onSelect:(id:string)=>void; onHelp:()=>void;
}) {
  const [expanded,setExpanded]=useState(!compact);
  useEffect(()=>{if(compact&&selectedDevice)setExpanded(false);},[compact,selectedDevice]);
  return <aside className={`journey-guide${expanded?' expanded':''}`} aria-label="Objectif et progression du voyage">
    <div className="journey-steps" aria-label={`Tableau ${journey.actNumber} sur ${journey.actCount}`}>
      {journey.acts.map(act=><span key={act.index} className={`journey-step ${act.status}`} aria-current={act.status==='current'?'step':undefined} title={act.title}>
        <i>{act.status==='completed'?<Check size={10}/>:act.index+1}</i><span>{act.title}</span>
      </span>)}
    </div>
    <button className="journey-objective-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
      <span className="journey-objective-icon"><Flag size={15}/></span>
      <span><small>Objectif · tableau {journey.actNumber}/{journey.actCount}</small><strong>{journey.objective}</strong></span>
      <ChevronDown size={14} className="journey-chevron"/>
    </button>
    {expanded&&<div className="journey-guide-body">
      <ol className="puzzle-objectives">
        {journey.objectives.map(item=><li key={item.id} className={item.complete?'done':''}>
          <span className="objective-check">{item.complete&&<Check size={11}/>}</span><span>{item.label}</span>
          {typeof item.current==='number'&&typeof item.target==='number'&&<small>{item.current}/{item.target}</small>}
        </li>)}
      </ol>
      <div className="mechanism-picker"><small>Choisis un mécanisme pour comprendre son rôle</small><div>
        {devices.map(device=><button key={device.id} onClick={()=>onSelect(device.id)} aria-pressed={selectedDevice===device.id}>{device.automatic?<Info size={12}/>:<Settings2 size={12}/>} {device.label}</button>)}
      </div></div>
      <button className="guide-help" onClick={onHelp}><Info size={13}/>Comment jouer ?<ArrowRight size={12}/></button>
    </div>}
  </aside>;
}

export function MechanismCard({status,currentMode,onAction,onClose,disabled,automatic}: {
  status:Mechanism; currentMode:number; onAction:(mode:number)=>void; onClose:()=>void; disabled:boolean; automatic?:boolean;
}) {
  return <aside className="mechanism-card" aria-label={`Mécanisme : ${status.label}`}>
    <header><span className="eyebrow">{automatic?'Automatique · la troupe l’active':'Dans le décor'}</span><button className="round-button" onClick={onClose} aria-label="Fermer le mécanisme"><X size={17}/></button><h2>{status.label}</h2></header>
    <p className="mechanism-description">{status.description}</p>
    <div className="mechanism-state"><span className="mechanism-state-dot"/><strong>{status.stateLabel}</strong></div>
    {status.requiredLoad!==null&&status.requiredLoad>0&&<div className="mechanism-load"><Users size={14}/><span>{status.load} / {status.requiredLoad} compagnons</span><div aria-hidden="true">{Array.from({length:status.requiredLoad},(_,i)=><i key={i} className={i<status.load?'filled':''}/>)}</div></div>}
    {status.reason&&<p className="mechanism-reason"><Info size={13}/>{status.reason}</p>}
    {!automatic&&status.modes.length>1&&<div className="mechanism-actions" aria-label={`Actions de ${status.label}`}>
      {status.modes.map(action=><button key={action.mode} className={action.mode===currentMode?'chosen':''} disabled={disabled||!action.enabled} aria-pressed={action.mode===currentMode} onClick={()=>onAction(action.mode)}>
        <span>{action.mode===currentMode?<Check size={15}/>:action.enabled?<ArrowRight size={15}/>:<LockKeyhole size={14}/>}<strong>{action.label}</strong></span>
        {!action.enabled&&action.reason&&<small>{action.reason}</small>}
      </button>)}
    </div>}
    {!automatic&&status.modes.length>1&&<p className="mechanism-footnote">Sélectionner un objet ne le modifie pas. Choisis une action ci-dessus.</p>}
  </aside>;
}

export function DrawingMeter({label,letter,used,limit}:{label:string;letter:string;used:number;limit:number}) {
  const overflow=used>limit;
  return <div className={`drawing-meter${overflow?' over-budget':''}`} role="status">
    <Pencil size={17}/><div><strong>{label}</strong><span>{overflow?(limit===0?'Plus d’encre : efface un passage libre avec la gomme.':'Plus assez d’encre : raccourcis le trait ou utilise la gomme.'):`Rejoins l’autre appui ${letter}, puis relâche.`}</span>
      <progress value={Math.min(used,limit)} max={Math.max(1,limit)} aria-label="Encre disponible pour ce trait"/>
    </div><small>{Math.round(used)} / {limit}</small>
  </div>;
}

export function DrawingInventory({drawings,budget,used,onErase,onClose}:{
  drawings:Array<{id:string;label:string;ink:number;occupied:boolean}>;
  budget?:number; used:number; onErase:(id:string)=>void; onClose:()=>void;
}) {
  return <aside className="mechanism-card drawing-inventory" aria-label="Effacer un passage">
    <header><span className="eyebrow">La gomme</span><button className="round-button" onClick={onClose} aria-label="Fermer la gomme"><X size={17}/></button><h2>Reprendre un trait</h2></header>
    <p className="mechanism-description">Un passage libre peut être effacé. Tu récupères son encre pour dessiner ailleurs.</p>
    {typeof budget==='number'&&<div className="ink-reserve"><Pencil size={16}/><strong>{Math.max(0,Math.round(budget-used))}</strong><span>unités d’encre disponibles sur {budget}</span></div>}
    <div className="erasable-drawings">
      {drawings.length===0?<p>Aucun passage dessiné pour le moment.</p>:drawings.map(drawing=><div key={drawing.id}>
        <span><strong>{drawing.label}</strong><small>{Math.round(drawing.ink)} unités d’encre · {drawing.occupied?'Des compagnons le traversent':'Passage libre'}</small></span>
        <button onClick={()=>onErase(drawing.id)} disabled={drawing.occupied} aria-label={`Effacer ${drawing.label}`}><Eraser size={16}/><span>Effacer</span></button>
      </div>)}
    </div>
  </aside>;
}

export function JourneyRecap({journey}:{journey:Journey}) {
  return <ol className="journey-recap" aria-label="Étapes du voyage">
    {journey.acts.map(act=><li key={act.index} className={act.status}>
      <i>{act.status==='completed'?<Check size={12}/>:act.index+1}</i>
      <span>{act.title}</span><small>{act.status==='completed'?`${act.saved??journey.survivors} réunis`:act.status==='current'?'En cours':'À découvrir'}</small>
    </li>)}
  </ol>;
}
