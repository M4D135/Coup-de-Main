/** Run with: node scripts/qa-audio-scheduler.mjs
 * Executes the production synth and scheduler for 32 bars per world, using only
 * Node and the project's existing TypeScript dependency. The recording context
 * traces Web Audio calls; it does NOT render PCM or replace a listening test.
 * Dry envelope estimates exclude panning, reverb and compression.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const ts=require('typescript'),previousLoader=require.extensions['.ts'];
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,file);

class Parameter {
  value=0;events=[];
  setValueAtTime(v,t=0){assert(Number.isFinite(v));this.value=v;this.events.push({type:'set',v,t});return this;}
  setTargetAtTime(v,t,k){this.value=v;this.events.push({type:'target',v,t,k});return this;}
  linearRampToValueAtTime(v,t){this.value=v;this.events.push({type:'linear',v,t});return this;}
  exponentialRampToValueAtTime(v,t){assert(v>0);this.value=v;this.events.push({type:'exp',v,t});return this;}
  setValueCurveAtTime(v,t,d){this.value=v.at(-1);this.events.push({type:'curve',v:[...v],t,d});return this;}
  cancelScheduledValues(t){this.events=this.events.filter(event=>event.t<t);return this;}
  cancelAndHoldAtTime(t){return this.cancelScheduledValues(t);}
}
class RecordingNode {
  connections=[];stopAt=Infinity;started=false;ended=false;buffer=null;type='sine';
  constructor(owner,kind){
    this.owner=owner;this.kind=kind;
    for(const key of ['gain','frequency','detune','pan','Q','playbackRate','threshold','knee','ratio','attack','release'])this[key]=new Parameter();
    this.gain.value=1;
  }
  connect(node){this.connections.push(node);return node;}
  disconnect(){}
  setPeriodicWave(wave){this.wave=wave;}
  start(at){assert(Number.isFinite(at));this.at=at;this.started=true;this.owner.sources.push(this);}
  stop(at){assert(Number.isFinite(at));this.stopAt=at;}
}
class RecordingContext {
  static last;
  currentTime=0;sampleRate=8000;state='suspended';sources=[];
  constructor(){RecordingContext.last=this;this.destination=new RecordingNode(this,'destination');}
  node(kind){return new RecordingNode(this,kind);}
  createGain(){return this.node('gain');}
  createDynamicsCompressor(){return this.node('compressor');}
  createConvolver(){return this.node('convolver');}
  createStereoPanner(){return this.node('panner');}
  createBiquadFilter(){return this.node('filter');}
  createOscillator(){return this.node('oscillator');}
  createBufferSource(){return this.node('buffer');}
  createPeriodicWave(real,imag){return {real,imag};}
  createBuffer(channels,length,sampleRate){
    const data=Array.from({length:channels},()=>new Float32Array(length));
    return {length,sampleRate,duration:length/sampleRate,getChannelData:channel=>data[channel]};
  }
  async resume(){this.state='running';this.onstatechange?.();}
  async close(){this.state='closed';}
  advance(seconds){
    this.currentTime+=seconds;
    for(const source of this.sources)if(!source.ended&&source.stopAt<=this.currentTime){source.ended=true;source.onended?.();}
  }
}
class EventSurface {
  hidden=false;AudioContext=RecordingContext;listeners=new Map();
  addEventListener(type,callback){const group=this.listeners.get(type)??new Set();group.add(callback);this.listeners.set(type,group);}
  removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
  dispatch(type){for(const callback of this.listeners.get(type)??[])callback();}
}

function envelopeAt(events,time){
  let previous=null;
  for(const next of events){
    if(time<next.t){
      if(!previous)return 0;if(next.type==='set')return previous.v;
      const fraction=(time-previous.t)/(next.t-previous.t);
      return next.type==='exp'?previous.v*Math.pow(next.v/previous.v,fraction):previous.v+(next.v-previous.v)*fraction;
    }
    previous=next;
  }
  return previous?.v??0;
}
function sourceGainEstimate(source,voice){
  let multiplier=1,node=source;
  for(let hop=0;hop<6;hop++){
    node=node.connections[0];if(!node||node===voice.gain)break;
    if(node.kind==='gain')multiplier*=node.gain.value;
  }
  // The current brush's pink noise is white*.26 + low*1.9. This is an
  // envelope estimate before its band-pass, not a measured sample peak.
  return multiplier*(source.kind==='buffer'?2.16:1);
}
function noteCounts(notes){
  const counts=new Map();
  for(const note of notes){const key=[note.kind,note.note,Math.round(note.at*1e6),note.pan].join(':');counts.set(key,(counts.get(key)??0)+1);}
  return [...counts].sort(([a],[b])=>a.localeCompare(b));
}

const originals=new Map(['window','document','setInterval','clearInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const intervals=new Set();let nextInterval=0;
Object.defineProperties(globalThis,{
  window:{configurable:true,value:new EventSurface()},document:{configurable:true,value:new EventSurface()},
  setInterval:{configurable:true,value:()=>{const id=++nextInterval;intervals.add(id);return id;}},
  clearInterval:{configurable:true,value:id=>intervals.delete(id)},
});
try {
  const {WorldAudio}=require(resolve(root,'lib/worlds/audio.ts'));
  const {getMusicBar,MUSIC_PROFILES,musicBarDuration}=require(resolve(root,'lib/worlds/audio-score.ts'));
  for(const world of ['boucles','plis','veilleurs']){
    const audio=new WorldAudio(),notes=[],voiceRecords=[];audio.setWorld(world);
    try {
      const instrument=audio.instrument.bind(audio);
      audio.instrument=function(kind,note,duration,velocity,delay,pan,bus='music'){
        const previous=new Set(this.voices);notes.push({kind,note,at:this.context.currentTime+delay,pan,bus});
        instrument(kind,note,duration,velocity,delay,pan,bus);
        for(const voice of this.voices)if(!previous.has(voice))voiceRecords.push(voice);
      };
      await audio.unlock();const context=RecordingContext.last,total=32*musicBarDuration(world),origin=.14;let maxVoices=0;
      for(let elapsed=0;elapsed<total+.15;elapsed+=.045){
        context.advance(.045);audio.scheduleMusic();audio.scheduleMusic();
        maxVoices=Math.max(maxVoices,audio.voices.size);
      }
      const expected=[];
      for(let bar=0;bar<32;bar++)for(const note of getMusicBar(world,bar))expected.push({
        kind:note.instrument,note:note.note,at:origin+bar*musicBarDuration(world)+note.beat*60/MUSIC_PROFILES[world].tempo,pan:note.pan,
      });
      const actual=notes.filter(note=>note.at<origin+total-1e-6);
      assert.deepEqual(noteCounts(actual),noteCounts(expected),`${world}: every scheduled note must occur exactly once`);
      assert.equal(voiceRecords.length,notes.length,`${world}: the synth must allocate every scheduled note`);
      assert(maxVoices<=24,`${world}: the arrangement must retain room below its 28-voice limit`);
      for(const voice of voiceRecords){
        assert(voice.sources.length>0,'exercise the real synth, not just a score callback');
        voice.envelope=voice.gain.gain.events.filter(event=>['set','exp','linear'].includes(event.type)).sort((a,b)=>a.t-b.t);
        voice.sourceGains=voice.sources.map(source=>sourceGainEstimate(source,voice));
      }
      let dryEnvelopeEstimate=0;
      for(let time=0;time<total;time+=.002){
        let sum=0;
        for(const voice of voiceRecords)if(time>=voice.at&&time<voice.end){
          const sourceGain=voice.sources.reduce((gain,source,index)=>gain+(time>=source.at&&time<source.stopAt?voice.sourceGains[index]:0),0);
          sum+=envelopeAt(voice.envelope,time)*sourceGain;
        }
        dryEnvelopeEstimate=Math.max(dryEnvelopeEstimate,sum);
      }
      const beforeHide=context.sources.length;document.hidden=true;document.dispatch('visibilitychange');context.advance(.5);
      audio.play('device');audio.scheduleMusic();
      assert(context.sources.every(source=>source.ended),`${world}: hiding must stop live and future sources`);
      assert.equal(context.sources.length,beforeHide,`${world}: hidden events must not create sources`);
      document.hidden=false;document.dispatch('visibilitychange');
      const sourcesOnReturn=context.sources.length-beforeHide;assert(sourcesOnReturn>0&&sourcesOnReturn<=18,'resume one look-ahead window, without a backlog');
      console.log(JSON.stringify({world,bars:32,expectedNotes:expected.length,actualNotes:actual.length,missing:0,extra:0,maxVoices,
        dryEnvelopeEstimate,afterDefaultGains:dryEnvelopeEstimate*.38*.5*.72,afterMaximumMusicGains:dryEnvelopeEstimate*.72,
        allSourcesStoppedAfterHidden:true,noNewWhileHidden:true,sourcesOnReturn}));
    } finally {audio.dispose();}
  }
  assert.equal(intervals.size,0,'dispose must remove every scheduler');
  console.log('PASS: production scheduler/synth call trace. No PCM rendered; no listening or clipping measurement claimed.');
} finally {
  if(previousLoader)require.extensions['.ts']=previousLoader;else delete require.extensions['.ts'];
  for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
}
