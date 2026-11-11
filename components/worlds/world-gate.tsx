"use client";

import {ArrowUpRight, BookOpen, Check, Pencil, Settings2, Volume2, VolumeX} from 'lucide-react';
import {getWorldAsset, WORLD_IDENTITIES} from '../../lib/worlds/assets';

export interface WorldRecord {rescued:number; stars:number; time:number; completed:boolean}
export type WorldRecords = Record<string, WorldRecord>;

export function WorldGate({onEnter,onSettings,onBook,records,muted,onMute}: {
  onEnter:(index:number)=>void; onSettings:()=>void; onBook:()=>void;
  records:WorldRecords; muted:boolean; onMute:()=>void;
}) {
  return <section className="world-gate" aria-label="Choisir un monde">
    <header className="gate-header">
      <div className="universe-mark"><Pencil size={21} strokeWidth={1.4}/><span>COUP DE<br/><b className="universe-wordmark">MAIN</b></span></div>
      <p>Un crayon. Trois mondes.</p>
      <nav aria-label="Réglages de l’univers">
        <button className="round-button" onClick={onBook} aria-label="Ouvrir le carnet des mondes" title="Le carnet des mondes"><BookOpen size={19}/></button>
        <button className="round-button" onClick={onMute} aria-label={muted?'Activer le son':'Couper le son'} title={muted?'Activer le son':'Couper le son'}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
        <button className="round-button" onClick={onSettings} aria-label="Réglages" title="Réglages"><Settings2 size={19}/></button>
      </nav>
    </header>
    <div className="world-portals">
      {WORLD_IDENTITIES.map((world,index)=>{
        const record=records[world.id];
        return <button className={`world-portal portal-${world.id}`} key={world.id} onClick={()=>onEnter(index)} aria-label={`Entrer dans ${world.name}, premier stage`}>
          <img className="portal-art" src={getWorldAsset(world.asset)} alt={`Le monde de ${world.name}`} draggable={false}/>
          <div className="portal-shade"/>
          <span className="portal-number">{world.number}</span>
          <div className="portal-copy">
            <span className="portal-material">{world.material}</span>
            <h1>{world.name}</h1>
            <p>{world.promise}</p>
            <span className="portal-stage"><span>{record?.completed?<Check size={14}/>:<span className="stage-seed"/>}{record?.completed?`${record.rescued} compagnons sauvés`:'Premier voyage'}</span><ArrowUpRight size={22} strokeWidth={1.25}/></span>
          </div>
        </button>;
      })}
    </div>
    <footer className="gate-footer"><span>Ils avancent. Tu inventes le chemin.</span><span className="journey-seeds" aria-label={`${Object.values(records).filter(r=>r.completed).length} mondes terminés sur trois`}>{WORLD_IDENTITIES.map(w=><i key={w.id} className={records[w.id]?.completed?'filled':''}/>)}</span><span>Une aventure à dessiner</span></footer>
  </section>;
}
