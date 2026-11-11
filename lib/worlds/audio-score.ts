import type {WorldId} from './types';

export type MusicInstrument='felt'|'reed'|'celesta'|'pluck'|'strings'|'bass'|'air';
export interface MusicNote {beat:number;note:number;duration:number;velocity:number;instrument:MusicInstrument;pan:number}
type Melody=readonly (readonly [beat:number,note:number,duration:number])[];
interface MusicProfile {
  tempo:number;beats:number;tonic:number;minor:boolean;lead:MusicInstrument;
  chords:readonly (readonly number[])[];melody:readonly Melody[];answer:readonly Melody[];
}

/** Original phrases written for these three worlds; no external score or sample. */
export const MUSIC_PROFILES:Readonly<Record<WorldId,MusicProfile>>={
  boucles:{
    tempo:84,beats:3,tonic:50,minor:false,lead:'felt',
    chords:[[50,54,57,59],[47,50,54,57],[43,47,50,54],[45,49,52,55],
      [40,47,50,54],[43,47,50,52],[45,50,52,57],[45,49,52,55],
      [50,54,57,61],[47,50,54,57],[43,47,50,54],[42,45,49,52],
      [40,43,47,50],[43,47,50,54],[45,49,52,55],[50,54,57,59]],
    melody:[
      [[.25,62,.65],[1,66,.65],[2,69,.8]],[[0,71,.9],[1.5,69,.4],[2,66,.8]],
      [[.5,67,.7],[1.5,66,.35],[2.25,62,.6]],[[.5,64,1.2],[2.25,61,.45]],
      [[0,64,.7],[1,66,.45],[1.75,67,.9]],[[0,71,.65],[1.25,69,.65],[2.25,67,.45]],
      [[.5,66,.65],[1.5,64,.85]],[[0,61,.65],[1.5,64,.8]],
      [[0,69,1.1],[1.5,74,1.2]],[[.25,73,.65],[1.25,71,.9]],
      [[0,71,.45],[.75,69,.45],[1.5,67,1.1]],[[.5,66,1.4]],
      [[0,64,.65],[1,67,.65],[2,71,.7]],[[.25,69,.75],[1.5,67,.85]],
      [[0,66,.65],[1,64,.65],[2,61,.6]],[[0,62,2.1]],
    ],
    answer:[
      [[.5,69,1.3]],[[.25,66,.7],[1.5,62,.95]],[[.5,67,1.3]],[[1,64,1.35]],
      [[0,67,.5],[.75,71,.7],[2,69,.65]],[[.5,67,.6],[1.5,62,.8]],
      [[0,64,.7],[1,66,.7]],[],
      [[.25,66,.6],[1,69,1.2]],[[.5,71,.8],[2,69,.6]],
      [[.25,67,.8],[1.5,66,.45],[2.25,62,.5]],[[.75,61,1.2]],
      [[0,64,.9],[1.5,67,.8]],[[.25,71,.7],[1.5,69,.7]],
      [[.5,64,1.1]],[[0,62,2.4]],
    ],
  },
  plis:{
    tempo:92,beats:4,tonic:55,minor:false,lead:'reed',
    chords:[[55,59,62,66],[52,55,59,62],[48,52,55,59],[50,55,57,62],
      [47,50,54,57],[48,52,55,57],[45,52,55,59],[50,54,57,60],
      [55,59,62,64],[52,55,59,62],[48,52,55,59],[50,54,57,60],
      [45,48,52,55],[48,52,55,59],[50,54,57,60],[55,59,62,66]],
    melody:[
      [[.5,67,.7],[1.5,71,.8],[3,74,.65]],[[.25,76,1.2],[2,74,.7],[3,71,.7]],
      [[.5,72,.7],[1.5,71,.6],[2.5,67,1]],[[.75,69,1.4]],
      [[0,71,.7],[1.25,74,.7],[2.5,78,.7]],[[.5,76,1],[2,72,1.15]],
      [[.25,71,.7],[1.25,69,.7],[2.75,67,.8]],[[.5,66,1.6]],
      [[0,74,.7],[1,71,.6],[2,67,1.3]],[[.75,64,.7],[2,67,1]],
      [[.25,72,.65],[1.25,76,.8],[3,74,.65]],[[.5,69,1.4],[3,66,.6]],
      [[0,69,.7],[1,72,.7],[2.5,76,.9]],[[.5,74,.8],[2,72,1]],
      [[.25,71,.7],[1.5,69,.7],[2.75,66,.7]],[[0,67,2.6]],
    ],
    answer:[
      [[.75,71,1.2],[2.75,74,.8]],[[.5,71,1.1],[2.5,67,.9]],
      [[0,67,1],[1.75,64,1.2]],[[1,69,1.7]],
      [[.25,66,.7],[1.5,71,1.3]],[[.75,72,.7],[2,76,1.2]],
      [[.25,74,.8],[1.5,71,.8],[3,69,.7]],[],
      [[.5,67,.8],[2,71,1.2]],[[.75,76,1.4]],
      [[.25,72,.75],[1.5,71,.7],[2.75,67,.8]],[[1,66,1.7]],
      [[.5,69,.65],[1.5,72,.8],[3,71,.65]],[[.25,67,1.1],[2,64,1.1]],
      [[.5,66,.7],[1.5,69,.9]],[[.25,67,2.75]],
    ],
  },
  veilleurs:{
    tempo:66,beats:4,tonic:45,minor:true,lead:'celesta',
    chords:[[45,52,57,60],[41,48,52,57],[48,52,55,59],[43,50,55,59],
      [38,45,50,53],[41,48,52,57],[40,47,52,56],[45,52,57,60],
      [45,52,57,59],[48,52,55,59],[41,48,52,57],[43,50,55,59],
      [38,45,50,53],[41,48,52,57],[40,47,50,56],[45,52,57,60]],
    melody:[
      [[.5,69,1],[2,72,1.2]],[[.25,76,1.1],[2.25,72,1.15]],
      [[.5,71,.8],[2,67,1.25]],[[1,69,1.8]],
      [[.25,65,1],[1.75,69,1.2]],[[.5,72,1.1],[2.5,69,.9]],
      [[.75,68,1.2],[2.5,71,.9]],[[.5,69,2.2]],
      [[0,76,1.1],[1.75,72,.75],[3,71,.8]],[[.75,67,1.5]],
      [[.5,69,.8],[1.75,72,1.4]],[[.25,71,1],[2,67,1.4]],
      [[.75,65,1.1],[2.5,69,.9]],[[.25,72,.9],[1.75,69,1.3]],
      [[.5,68,1.2],[2.25,64,1.1]],[[.25,69,2.7]],
    ],
    answer:[
      [[.75,64,1.5]],[[1,65,1.6]],[[.5,67,1],[2.5,71,1]],[[.75,69,1.7]],
      [[.25,65,1.15],[2,69,1.1]],[[.75,72,1.6]],[[1,68,1.4]],[],
      [[.5,69,1.3],[2.5,71,1]],[[.75,72,1.1],[2.5,67,1]],
      [[.5,65,1],[2,69,1.4]],[[1,71,1.6]],
      [[.25,69,1.2],[2.25,65,1.2]],[[.5,64,1.5]],[[1,68,1.6]],[[.5,69,2.6]],
    ],
  },
};

export const midiFrequency=(note:number)=>440*2**((note-69)/12);
export const musicBarDuration=(world:WorldId)=>MUSIC_PROFILES[world].beats*60/MUSIC_PROFILES[world].tempo;

/** A phrase has a harmonic arc, an answering phrase and quiet breathing spaces. */
export function getMusicBar(world:WorldId,index:number):MusicNote[]{
  const profile=MUSIC_PROFILES[world],bar=Math.max(0,Math.floor(Number.isFinite(index)?index:0));
  const measure=bar%16,cycle=Math.floor(bar/16),chord=profile.chords[measure];
  const breath=.78+.13*Math.sin(bar*Math.PI/16)+.07*Math.sin(bar*.37);
  const phrase=cycle%2?profile.answer[measure]:profile.melody[measure];
  const notes:MusicNote[]=[];
  const add=(beat:number,note:number,duration:number,velocity:number,instrument:MusicInstrument,pan=0)=>notes.push({beat,note,duration,velocity:velocity*breath,instrument,pan});
  // Low, sustained harmony carries the melody; it is not a stream of UI chimes.
  chord.slice(1).forEach((note,voice)=>add(voice*.025,note+12,profile.beats+.9,.47,'strings',(voice-1)*.38));
  add(0,chord[0]-12,profile.beats*.85,.74,'bass',-.06);
  if(world!=='boucles'&&measure%4!==3)add(profile.beats*.625,chord[0]-5,profile.beats*.3,.36,'bass',.04);
  for(const [beat,note,duration] of phrase)add(beat,note,duration,.8+(beat===0?.06:0),profile.lead,world==='plis'?.12:-.08);
  // Sparse accompaniment changes voicing and rhythm between complete phrases.
  const pattern=world==='boucles'?[1,2]:world==='plis'?[.5,1.75,3.25]:[1.5,3];
  for(const [slot,beat] of pattern.entries()){
    if((measure+slot+cycle)%5===4||measure===15)continue;
    const tone=chord[(slot+cycle)%3+1]+(world==='veilleurs'?12:0);
    add(beat,tone,world==='veilleurs'?1.6:.95,world==='plis'?.48:.37,'pluck',slot%2?.48:-.43);
  }
  if(measure%4===0)add(.1,world==='veilleurs'?47:55,profile.beats*1.9,.26,'air',-.18);
  return notes.sort((a,b)=>a.beat-b.beat);
}
