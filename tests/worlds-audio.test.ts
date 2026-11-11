import test from 'node:test';
import assert from 'node:assert/strict';
import {getMusicBar,midiFrequency,musicBarDuration,MUSIC_PROFILES} from '../lib/worlds/audio-score';
import {getSoundPlacement,soundVolume} from '../lib/worlds/audio-space';
import type {WorldId} from '../lib/worlds/types';

test('all music phrases schedule finite, bounded notes with a sustained harmonic accompaniment',()=>{
  for(const world of ['boucles','plis','veilleurs'] as WorldId[]){
    const instruments=new Set<string>();
    for(let bar=0;bar<64;bar++){
      const notes=getMusicBar(world,bar);
      assert(notes.length>0);
      let previous=-1;
      for(const note of notes){
        for(const value of [note.beat,note.note,note.duration,note.velocity,note.pan])assert(Number.isFinite(value));
        assert(note.beat>=previous&&note.beat<MUSIC_PROFILES[world].beats);previous=note.beat;
        assert(note.note>=24&&note.note<=96);
        assert(note.duration>0&&note.duration<=MUSIC_PROFILES[world].beats*2);
        assert(note.velocity>0&&note.velocity<=1);
        assert(Math.abs(note.pan)<=1);instruments.add(note.instrument);
      }
      assert(notes.some(note=>note.instrument==='strings'&&note.duration>=MUSIC_PROFILES[world].beats));
      assert(notes.some(note=>note.instrument==='bass'));
    }
    assert(instruments.size>=5);
    assert(musicBarDuration(world)>1.5&&musicBarDuration(world)<5);
  }
});

test('themes have different tempos and phrases, with a written response and stable regeneration',()=>{
  const profiles=Object.values(MUSIC_PROFILES);
  assert.equal(new Set(profiles.map(profile=>profile.tempo)).size,3);
  assert.equal(new Set(profiles.map(profile=>profile.lead)).size,3);
  for(const world of ['boucles','plis','veilleurs'] as WorldId[]){
    const original=JSON.stringify(MUSIC_PROFILES[world]);
    const first=Array.from({length:16},(_,i)=>getMusicBar(world,i));
    const reply=Array.from({length:16},(_,i)=>getMusicBar(world,i+16));
    assert.notDeepEqual(first,reply);
    assert.deepEqual(getMusicBar(world,0),first[0]);
    assert.equal(JSON.stringify(MUSIC_PROFILES[world]),original);
    first[0][0].velocity=0;
    assert(getMusicBar(world,0)[0].velocity>0,'scheduling must not mutate the authored score');
  }
  assert.equal(midiFrequency(69),440);
});

test('sound follows the visible world and fades out before distant mechanisms can be heard',()=>{
  const listener={x:8000,y:450,width:1600,height:900};
  const centre=getSoundPlacement({x:8000,y:450},listener);
  assert.deepEqual(centre,{gain:1,pan:0});
  const left=getSoundPlacement({x:7300,y:450},listener),right=getSoundPlacement({x:8700,y:450},listener);
  assert(left.pan<0&&right.pan>0);assert.equal(left.gain,right.gain);
  const edge=getSoundPlacement({x:8800,y:450},listener),outside=getSoundPlacement({x:9000,y:450},listener);
  assert(edge.gain>outside.gain&&outside.gain>0);
  assert.equal(getSoundPlacement({x:10000,y:450},listener).gain,0);
  assert.equal(getSoundPlacement({x:8000,y:1400},listener).gain,0);
  assert.deepEqual(getSoundPlacement(undefined,listener),{gain:1,pan:0});
});

test('zoom changes the listening range and invalid inputs cannot create invalid AudioParam values',()=>{
  const source={x:1300,y:450};
  assert(getSoundPlacement(source,{x:800,y:450,width:1600,height:900}).gain>0);
  assert.equal(getSoundPlacement(source,{x:800,y:450,width:500,height:900}).gain,0);
  for(const value of [NaN,Infinity,-Infinity,-1,0]){
    const result=getSoundPlacement({x:value,y:value},{x:800,y:450,width:value,height:value});
    assert(Number.isFinite(result.gain)&&Number.isFinite(result.pan));
    assert(result.gain>=0&&result.gain<=1&&Math.abs(result.pan)<=1);
    const badListener=getSoundPlacement(source,{x:value,y:value,width:1000});
    assert(Number.isFinite(badListener.gain)&&Number.isFinite(badListener.pan));
    assert(Number.isFinite(soundVolume(value)));
  }
  assert.equal(soundVolume(-10),0);assert.equal(soundVolume(10),1);assert.equal(soundVolume(.38),.38);
});

// This fixture checks scheduling/lifecycle, not the subjective sound of a synth.
// It intentionally records sources scheduled in the future as well as live ones.
class AudioParameter {
  value=0;
  setValueAtTime(value:number){assert(Number.isFinite(value));this.value=value;return this;}
  setTargetAtTime(value:number){return this.setValueAtTime(value);}
  linearRampToValueAtTime(value:number){return this.setValueAtTime(value);}
  exponentialRampToValueAtTime(value:number){assert(value>0);return this.setValueAtTime(value);}
  setValueCurveAtTime(values:Float32Array){for(const value of values)assert(Number.isFinite(value));return this;}
  cancelScheduledValues(){return this;}
  cancelAndHoldAtTime(){return this;}
}
class AudioNodeFixture {
  gain=new AudioParameter();frequency=new AudioParameter();detune=new AudioParameter();pan=new AudioParameter();
  Q=new AudioParameter();playbackRate=new AudioParameter();threshold=new AudioParameter();knee=new AudioParameter();
  ratio=new AudioParameter();attack=new AudioParameter();release=new AudioParameter();
  type='';buffer:unknown=null;loop=false;onended:(()=>void)|null=null;stopAt=Infinity;started=false;ended=false;
  constructor(private owner?:AudioContextFixture){}
  connect(node:unknown){return node;}
  disconnect(){}
  setPeriodicWave(){}
  start(at:number){assert(Number.isFinite(at));this.started=true;this.owner?.sources.push(this);}
  stop(at:number){assert(Number.isFinite(at));this.stopAt=at;}
}
class AudioContextFixture {
  static instances:AudioContextFixture[]=[];
  currentTime=0;sampleRate=8000;state='suspended';destination=new AudioNodeFixture();sources:AudioNodeFixture[]=[];
  onstatechange:(()=>void)|null=null;resumes=0;
  constructor(){AudioContextFixture.instances.push(this);}
  createGain(){return new AudioNodeFixture();}
  createDynamicsCompressor(){return new AudioNodeFixture();}
  createConvolver(){return new AudioNodeFixture();}
  createStereoPanner(){return new AudioNodeFixture();}
  createBiquadFilter(){return new AudioNodeFixture();}
  createOscillator(){return new AudioNodeFixture(this);}
  createBufferSource(){return new AudioNodeFixture(this);}
  createPeriodicWave(){return {};}
  createBuffer(channels:number,length:number,sampleRate:number){const data=Array.from({length:channels},()=>new Float32Array(length));return {length,sampleRate,duration:length/sampleRate,getChannelData:(channel:number)=>data[channel]};}
  async resume(){this.state='running';this.resumes++;this.onstatechange?.();}
  async close(){this.state='closed';}
  advance(seconds:number){this.currentTime+=seconds;for(const source of this.sources)if(!source.ended&&source.stopAt<=this.currentTime){source.ended=true;source.onended?.();}}
}
class EventSurface {
  hidden=false;AudioContext=AudioContextFixture;
  listeners=new Map<string,Set<()=>void>>();
  addEventListener(type:string,callback:()=>void){const group=this.listeners.get(type)??new Set();group.add(callback);this.listeners.set(type,group);}
  removeEventListener(type:string,callback:()=>void){this.listeners.get(type)?.delete(callback);}
  dispatch(type:string){for(const callback of this.listeners.get(type)??[])callback();}
}
async function audioBrowser(callback:(audio:import('../lib/worlds/audio').WorldAudio,document:EventSurface,window:EventSurface)=>Promise<void>){
  const {WorldAudio}=await import('../lib/worlds/audio');
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const document=new EventSurface(),window=new EventSurface();
  AudioContextFixture.instances=[];
  Object.defineProperty(globalThis,'window',{configurable:true,value:window});
  Object.defineProperty(globalThis,'document',{configurable:true,value:document});
  const audio=new WorldAudio();
  try{await callback(audio,document,window);}
  finally{
    audio.dispose();
    for(const [name,descriptor]of [['window',oldWindow],['document',oldDocument]] as const){
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);
    }
  }
}

test('an AudioContext is created only by unlock and the three mixer buses stay independent',async()=>{
  await audioBrowser(async audio=>{
    audio.setMusicVolume(.23);audio.setEffectsVolume(.7);audio.setVoicesVolume(.46);
    audio.play('start');audio.beginPencil();
    assert.equal(AudioContextFixture.instances.length,0);
    await audio.unlock();
    const context=AudioContextFixture.instances[0];assert.equal(context.resumes,1);
    const internals=audio as unknown as {buses:Record<string,AudioNodeFixture>};
    assert.equal(internals.buses.music.gain.value,.23);
    assert.equal(internals.buses.effects.gain.value,.7);
    assert.equal(internals.buses.voices.gain.value,.46);
    audio.setEffectsVolume(0);
    assert.equal(internals.buses.music.gain.value,.23);assert.equal(internals.buses.voices.gain.value,.46);
    audio.setMuted(true);const before=context.sources.length;audio.play('win');audio.beginPencil();
    assert.equal(context.sources.length,before);context.advance(1);
    assert(context.sources.every(source=>source.ended),'mute must cancel both live and future notes');
  });
});

test('distant events allocate no sources and deactivation cancels even a scheduled celebration',async()=>{
  await audioBrowser(async audio=>{
    audio.setMusicVolume(0);audio.setListener({x:800,y:450,width:1600,height:900});await audio.unlock();
    const context=AudioContextFixture.instances[0];
    audio.play('device',{x:14000,y:450});audio.play('wait',{x:14000,y:450,unitId:8});
    assert.equal(context.sources.length,0);
    audio.play('win');assert(context.sources.length>0);
    audio.setActive(false);context.advance(8);
    assert(context.sources.every(source=>source.ended),'future choir syllables must not survive deactivation');
    const count=context.sources.length;audio.play('save');audio.beginPencil();assert.equal(context.sources.length,count);
    const internals=audio as unknown as {timer:unknown;voices:Set<unknown>};
    assert.equal(internals.timer,null);assert.equal(internals.voices.size,0);
  });
});

test('hidden pages discard events and restart one musical bar without a backlog',async()=>{
  await audioBrowser(async(audio,document,window)=>{
    await audio.unlock();const context=AudioContextFixture.instances[0];
    audio.beginPencil();audio.play('win');
    document.hidden=true;document.dispatch('visibilitychange');context.advance(600);
    assert(context.sources.every(source=>source.ended));
    const count=context.sources.length;
    for(let i=0;i<20;i++)audio.play('device',{x:800,y:450});audio.beginPencil();
    assert.equal(context.sources.length,count);
    document.hidden=false;document.dispatch('visibilitychange');
    assert(context.sources.length-count<=18,'returning should schedule one look-ahead window, not ten minutes of notes');
    audio.dispose();
    assert([...document.listeners.values(),...window.listeners.values()].every(callbacks=>callbacks.size===0));
  });
});
