import type {WorldId} from './types';
import {getMusicBar,midiFrequency,MUSIC_PROFILES,musicBarDuration,type MusicInstrument,type MusicNote} from './audio-score';
import {getSoundPlacement,soundVolume,type SoundListener,type SoundPlacement,type SoundPosition} from './audio-space';

export type WorldSound='start'|'draw-start'|'draw-end'|'device'|'wait'|'save'|'win'|'undo'|'loss'|'step';
export type {SoundListener,SoundPosition} from './audio-space';
type Bus='music'|'effects'|'voices';
type NoiseColour='white'|'pink'|'soft';
type VoiceMood='curious'|'content'|'brave'|'sad'|'together';
interface Voice {
  bus:Bus;gain:GainNode;nodes:AudioNode[];sources:AudioScheduledSourceNode[];
  at:number;end:number;priority:number;ended:number;released:boolean;
}
interface Pencil {voice:Voice;source:AudioBufferSourceNode;filter:BiquadFilterNode}
const CENTRE:SoundPlacement={gain:1,pan:0};
const VOICE_LIMITS:Record<Bus,number>={music:28,effects:12,voices:7};
const positive=(value:number,fallback:number)=>Number.isFinite(value)&&value>0?value:fallback;

/**
 * An original, entirely local score and material/character soundscape.
 * Audio starts only after unlock() from a gesture. Nothing is queued while the
 * page is hidden, the context is interrupted, or the world is inactive.
 */
export class WorldAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private buses:Record<Bus,GainNode>|null=null;
  private room:ConvolverNode|null=null;
  private roomReturn:GainNode|null=null;
  private pencil:Pencil|null=null;
  private muted=false;
  private volume=.5;
  private musicVolume=.38;
  private effectsVolume=.65;
  private voicesVolume=.58;
  private world:WorldId='boucles';
  private active=true;
  private hidden=typeof document!=='undefined'&&document.hidden;
  private disposed=false;
  private listener:SoundListener|null=null;
  private seed=194839;
  private last=new Map<string,number>();
  private voices=new Set<Voice>();
  private noiseBuffers=new Map<NoiseColour,AudioBuffer>();
  private impulses=new Map<WorldId,AudioBuffer>();
  private waves=new Map<string,PeriodicWave>();
  private timer:ReturnType<typeof setInterval>|null=null;
  private musicBar=0;
  private barTime=0;
  private barNotes:MusicNote[]=[];
  private noteIndex=0;
  private musicRestUntil=0;
  private rescueCount=0;

  constructor(){
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibilityChanged);
    if(typeof window!=='undefined'){
      window.addEventListener('pagehide',this.pageHidden);
      window.addEventListener('pageshow',this.visibilityChanged);
    }
  }

  async unlock():Promise<void>{
    if(this.disposed||typeof window==='undefined'||this.hidden)return;
    if(!this.context){
      const Constructor=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if(!Constructor)return;
      let context:AudioContext;
      try{context=new Constructor({latencyHint:'interactive'});}catch{try{context=new Constructor();}catch{return;}}
      this.context=context;
      const master=context.createGain();master.gain.value=0;this.master=master;
      const limiter=context.createDynamicsCompressor();
      limiter.threshold.value=-15;limiter.knee.value=12;limiter.ratio.value=4;
      limiter.attack.value=.008;limiter.release.value=.24;
      master.connect(limiter);limiter.connect(context.destination);
      this.buses={music:context.createGain(),effects:context.createGain(),voices:context.createGain()};
      this.room=context.createConvolver();this.roomReturn=context.createGain();this.roomReturn.gain.value=.2;
      this.room.connect(this.roomReturn);this.roomReturn.connect(master);
      for(const bus of ['music','effects','voices'] as const){
        this.buses[bus].gain.value=0;this.buses[bus].connect(master);
        // Keep the new short notes crisp; ambience must not smear the rhythm.
        const send=context.createGain();send.gain.value=bus==='music'?.15:bus==='voices'?.14:.08;
        this.buses[bus].connect(send);send.connect(this.room);
      }
      this.room.buffer=this.impulse(this.world);
      context.onstatechange=()=>{
        if(this.disposed)return;
        if(context.state==='running')this.sync();
        else{this.stopScheduler();this.endPencil();this.stopVoices();}
      };
    }
    const context=this.context;
    if(context.state!=='running'&&context.state!=='closed'){
      try{await context.resume();}catch{/* A later, genuine gesture may unlock this device. */}
    }
    if(this.disposed||this.context!==context)return;
    this.sync();
  }

  setWorld(world:WorldId):void{
    this.endPencil();
    if(world===this.world)return;
    this.world=world;this.last.clear();this.rescueCount=0;this.musicBar=0;this.musicRestUntil=0;
    this.stopScheduler();this.stopVoices();
    if(this.room&&this.context)this.room.buffer=this.impulse(world);
    this.sync();
  }
  setActive(active:boolean):void{
    if(this.active===active)return;
    this.active=active;
    if(!active){this.endPencil();this.stopScheduler();this.stopVoices();}
    this.sync();
  }
  setListener(listener:SoundListener|null):void{
    if(listener===null){this.listener=null;return;}
    if(!Number.isFinite(listener.x)||!Number.isFinite(listener.y)||!Number.isFinite(listener.width)||listener.width<=0)return;
    this.listener={x:listener.x,y:listener.y,width:listener.width,height:positive(listener.height??0,listener.width*.6)};
  }
  setMuted(muted:boolean):void{
    this.muted=muted;
    if(muted){this.endPencil();this.stopScheduler();this.stopVoices();}
    this.sync();
  }
  /** Compatibility: this is the overall volume, before the three independent buses. */
  setVolume(volume:number):void{this.volume=soundVolume(volume);this.sync();}
  setMusicVolume(volume:number):void{
    this.musicVolume=soundVolume(volume,.38);
    if(!this.musicVolume){this.stopScheduler();this.stopVoices('music');}
    this.sync();
  }
  setEffectsVolume(volume:number):void{
    this.effectsVolume=soundVolume(volume,.65);
    if(!this.effectsVolume){this.endPencil();this.stopVoices('effects');}
    this.sync();
  }
  setVoicesVolume(volume:number):void{
    this.voicesVolume=soundVolume(volume,.58);
    if(!this.voicesVolume)this.stopVoices('voices');
    this.sync();
  }

  private pageHidden=()=>{this.hidden=true;this.endPencil();this.stopScheduler();this.stopVoices();this.updateMix();};
  private visibilityChanged=()=>{
    this.hidden=typeof document!=='undefined'&&document.hidden;
    if(this.hidden){this.pageHidden();return;}
    this.last.clear();
    const context=this.context;
    if(context&&context.state!=='running'&&context.state!=='closed'&&this.active&&!this.muted){
      // Only an already-created, previously unlocked context is resumed here.
      void context.resume().then(()=>{if(this.context===context)this.sync();}).catch(()=>{});
    }
    this.sync();
  };
  private audible():boolean{return !this.disposed&&!this.hidden&&this.active&&!this.muted&&this.volume>0&&this.context?.state==='running';}
  private busVolume(bus:Bus):number{return bus==='music'?this.musicVolume:bus==='effects'?this.effectsVolume:this.voicesVolume;}
  private updateMix():void{
    const context=this.context;if(!context||!this.master||!this.buses)return;
    const now=context.currentTime;
    this.master.gain.setTargetAtTime(this.audible()?this.volume*.72:0,now,.12);
    this.buses.music.gain.setTargetAtTime(this.musicVolume,now,.16);
    this.buses.effects.gain.setTargetAtTime(this.effectsVolume,now,.035);
    this.buses.voices.gain.setTargetAtTime(this.voicesVolume,now,.055);
  }
  private sync():void{
    this.updateMix();
    if(!this.audible()){
      this.stopScheduler();this.endPencil();this.stopVoices();return;
    }
    if(this.musicVolume>0&&this.timer===null){
      this.barTime=0;this.barNotes=[];this.noteIndex=0;
      this.timer=setInterval(this.scheduleMusic,45);this.scheduleMusic();
    }
  }
  private stopScheduler():void{
    if(this.timer!==null)clearInterval(this.timer);
    this.timer=null;this.barTime=0;this.barNotes=[];this.noteIndex=0;
  }
  private scheduleMusic=()=>{
    const context=this.context;
    if(!context||!this.audible()||this.musicVolume===0)return;
    const now=context.currentTime;
    if(now<this.musicRestUntil)return;
    const duration=musicBarDuration(this.world),secondsPerBeat=60/MUSIC_PROFILES[this.world].tempo;
    if(!this.barTime||now>this.barTime+duration+.3){
      // A throttled or suspended tab starts a fresh bar; it never catches up.
      this.barTime=now+.14;this.barNotes=getMusicBar(this.world,this.musicBar);this.noteIndex=0;
    }
    let scheduled=0;
    while(scheduled<32){
      const note=this.barNotes[this.noteIndex];
      if(!note){
        if(this.barTime+duration>now+.22)break;
        this.musicBar++;this.barTime+=duration;this.barNotes=getMusicBar(this.world,this.musicBar);this.noteIndex=0;continue;
      }
      const at=this.barTime+note.beat*secondsPerBeat;
      if(at>now+.22)break;
      this.noteIndex++;scheduled++;
      if(at<now-.045)continue;
      this.instrument(note.instrument,note.note,note.duration*secondsPerBeat,note.velocity,Math.max(0,at-now),note.pan,'music');
    }
  };

  private random():number{this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  private noiseBuffer(colour:NoiseColour):AudioBuffer{
    const cached=this.noiseBuffers.get(colour);if(cached)return cached;
    const context=this.context!,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*1.9),context.sampleRate);
    const data=buffer.getChannelData(0);let low=0,slow=0;
    for(let i=0;i<data.length;i++){
      const white=this.random()*2-1;low=low*.86+white*.14;slow=slow*.985+white*.015;
      const value=colour==='white'?white:colour==='pink'?white*.26+low*1.9:low*1.4+slow*1.5;
      const edge=Math.min(1,i/160,(data.length-1-i)/160);data[i]=value*edge;
    }
    this.noiseBuffers.set(colour,buffer);return buffer;
  }
  private impulse(world:WorldId):AudioBuffer{
    const cached=this.impulses.get(world);if(cached)return cached;
    const context=this.context!,seconds=world==='veilleurs'?2.4:world==='plis'?1.8:1.5;
    const buffer=context.createBuffer(2,Math.ceil(context.sampleRate*seconds),context.sampleRate);
    for(let channel=0;channel<2;channel++){
      const data=buffer.getChannelData(channel);let low=0;
      for(let i=0;i<data.length;i++){
        low=low*.61+(this.random()*2-1)*.39;
        const attack=Math.min(1,i/(context.sampleRate*.018));
        data[i]=low*Math.pow(1-i/data.length,2.8)*attack;
      }
    }
    this.impulses.set(world,buffer);return buffer;
  }
  private wave(name:'felt'|'reed'|'voice'):PeriodicWave{
    const cached=this.waves.get(name);if(cached)return cached;
    const harmonics=name==='felt'?[0,1,.34,.14,.07,.025,.01]:name==='reed'?[0,1,.12,.20,.035,.035,.008]:[0,1,.48,.29,.19,.13,.09,.055,.035];
    const wave=this.context!.createPeriodicWave(new Float32Array(harmonics.length),new Float32Array(harmonics));
    this.waves.set(name,wave);return wave;
  }
  private createVoice(bus:Bus,duration:number,delay=0,placement:SoundPlacement=CENTRE,priority=1):Voice|null{
    const context=this.context,destination=this.buses?.[bus];
    if(!context||!destination||!this.audible()||!this.busVolume(bus)||placement.gain<=.005)return null;
    const active=[...this.voices].filter(voice=>voice.bus===bus&&!voice.released);
    if(active.length>=VOICE_LIMITS[bus]){
      const victim=active.sort((a,b)=>a.priority-b.priority||a.end-b.end)[0];
      if(victim.priority>priority)return null;
      this.release(victim,.025);
    }
    const gain=context.createGain();gain.gain.value=0;
    const nodes:AudioNode[]=[gain];
    if(typeof context.createStereoPanner==='function'){
      const pan=context.createStereoPanner();pan.pan.value=placement.pan;gain.connect(pan);pan.connect(destination);nodes.push(pan);
    }else gain.connect(destination);
    const at=context.currentTime+Math.max(0,delay);
    const voice:Voice={bus,gain,nodes,sources:[],at,end:at+duration,priority,ended:0,released:false};
    this.voices.add(voice);return voice;
  }
  private source(voice:Voice,source:AudioScheduledSourceNode,stop:number):void{
    voice.sources.push(source);voice.nodes.push(source);
    source.onended=()=>{voice.ended++;if(voice.ended>=voice.sources.length)this.disconnect(voice);};
    source.start(voice.at);source.stop(stop);
  }
  private disconnect(voice:Voice):void{
    this.voices.delete(voice);
    for(const node of voice.nodes)try{node.disconnect();}catch{}
    if(this.pencil?.voice===voice)this.pencil=null;
  }
  private hold(parameter:AudioParam,at:number):void{
    if(typeof parameter.cancelAndHoldAtTime==='function')parameter.cancelAndHoldAtTime(at);
    else{const current=parameter.value;parameter.cancelScheduledValues(at);parameter.setValueAtTime(current,at);}
  }
  private release(voice:Voice,fade=.045):void{
    if(voice.released)return;voice.released=true;this.voices.delete(voice);
    const context=this.context;if(!context){this.disconnect(voice);return;}
    const now=context.currentTime;this.hold(voice.gain.gain,now);
    voice.gain.gain.setTargetAtTime(.00001,now,Math.max(.004,fade/4));
    for(const source of voice.sources)try{source.stop(now+fade);}catch{}
  }
  private stopVoices(bus?:Bus):void{for(const voice of [...this.voices])if(!bus||voice.bus===bus)this.release(voice);}
  private envelope(voice:Voice,peak:number,attack:number,sustain:number,release:number,percussive=false):void{
    const parameter=voice.gain.gain,at=voice.at;
    parameter.setValueAtTime(.00001,at);
    parameter.exponentialRampToValueAtTime(Math.max(.00002,peak),at+Math.max(.003,attack));
    if(percussive)parameter.exponentialRampToValueAtTime(.00001,at+attack+sustain+release);
    else{
      parameter.exponentialRampToValueAtTime(Math.max(.00002,peak*.78),at+attack+Math.max(.01,sustain));
      parameter.exponentialRampToValueAtTime(.00001,at+attack+sustain+release);
    }
  }
  private oscillator(voice:Voice,frequency:number,type:OscillatorType|'felt'|'reed'|'voice',gain=1,detune=0,stop=voice.end):OscillatorNode{
    const context=this.context!,oscillator=context.createOscillator(),level=context.createGain();
    if(type==='felt'||type==='reed'||type==='voice')oscillator.setPeriodicWave(this.wave(type));else oscillator.type=type;
    oscillator.frequency.setValueAtTime(Math.max(25,frequency),voice.at);oscillator.detune.value=detune;
    level.gain.value=gain;oscillator.connect(level);level.connect(voice.gain);voice.nodes.push(level);
    this.source(voice,oscillator,stop);return oscillator;
  }
  private noise(duration:number,gain:number,frequency:number,placement:SoundPlacement=CENTRE,delay=0,colour:NoiseColour='pink',bus:Bus='effects',q=.7):void{
    const voice=this.createVoice(bus,duration+.04,delay,placement,bus==='music'?0:1);if(!voice)return;
    const context=this.context!,source=context.createBufferSource(),filter=context.createBiquadFilter();
    source.buffer=this.noiseBuffer(colour);source.loop=true;source.playbackRate.value=.86+this.random()*.28;
    filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=q;
    source.connect(filter);filter.connect(voice.gain);voice.nodes.push(filter);
    this.envelope(voice,gain*placement.gain,Math.min(.035,duration*.12),duration*.55,duration*.33,true);
    this.source(voice,source,voice.end);
  }
  private tone(frequency:number,duration:number,gain:number,placement:SoundPlacement=CENTRE,delay=0,type:OscillatorType='sine',endFrequency?:number):void{
    const voice=this.createVoice('effects',duration+.025,delay,placement,2);if(!voice)return;
    this.envelope(voice,gain*placement.gain,.009,duration*.56,duration*.4,true);
    const oscillator=this.oscillator(voice,frequency,type);
    if(endFrequency)oscillator.frequency.exponentialRampToValueAtTime(Math.max(25,endFrequency),voice.at+duration*.86);
  }
  private instrument(instrument:MusicInstrument,note:number,duration:number,velocity:number,delay:number,pan:number,bus:Bus='music'):void{
    if(instrument==='air'){
      this.noise(duration,.018*velocity,this.world==='plis'?1050:this.world==='veilleurs'?410:730,{gain:1,pan},delay,'soft',bus,.42);return;
    }
    if(instrument==='brush'){
      this.noise(Math.min(.1,duration),.032*velocity,1850,{gain:1,pan},delay,'pink',bus,.4);return;
    }
    if(instrument==='woodblock'||instrument==='kick'){
      const kick=instrument==='kick',length=kick?.17:.13;
      const voice=this.createVoice(bus,length,delay,{gain:1,pan},1);if(!voice)return;
      this.envelope(voice,(kick?.12:.066)*velocity,.004,kick?.025:.012,kick?.12:.095,true);
      if(kick){
        const body=this.oscillator(voice,94,'sine');
        body.frequency.exponentialRampToValueAtTime(46,voice.at+.11);
      }else{
        const frequency=midiFrequency(note)*1.55;
        const body=this.oscillator(voice,frequency,'sine',.8);
        body.frequency.exponentialRampToValueAtTime(frequency*.94,voice.at+.065);
        this.oscillator(voice,frequency*1.47,'sine',.24,0,voice.at+.085);
      }
      return;
    }
    const frequency=midiFrequency(note),sustained=instrument==='strings'||instrument==='reed'||instrument==='bass';
    const tail=instrument==='strings'?.7:instrument==='celesta'?.3:instrument==='reed'?.09:instrument==='bass'?.1:.18;
    const voice=this.createVoice(bus,duration+tail+.08,delay,{gain:1,pan},instrument==='strings'?0:instrument==='bass'?1:3);if(!voice)return;
    const peak=(instrument==='strings'?.022:instrument==='bass'?.085:instrument==='felt'?.098:instrument==='reed'?.065:instrument==='celesta'?.069:.052)*velocity;
    const attack=instrument==='strings'?.3:instrument==='reed'?.025:instrument==='bass'?.012:.006;
    this.envelope(voice,peak,attack,Math.max(.02,duration-attack),tail,!sustained);
    if(instrument==='strings'){
      const a=this.oscillator(voice,frequency,'triangle',.68,-3.8);
      this.oscillator(voice,frequency,'sine',.36,4.3);
      a.frequency.linearRampToValueAtTime(frequency*1.0015,voice.at+duration);
    }else if(instrument==='celesta'){
      this.oscillator(voice,frequency,'sine');
      // Harmonic toy-piano overtones read as a tune rather than alarm chimes.
      this.oscillator(voice,frequency*2.005,'sine',.14,1.2,voice.at+Math.min(duration+.18,.7));
      this.oscillator(voice,frequency*3.99,'sine',.025,-1.1,voice.at+.22);
    }else if(instrument==='reed'){
      const oscillator=this.oscillator(voice,frequency,'reed');
      const curve=new Float32Array(48);
      for(let i=0;i<curve.length;i++){const t=i/(curve.length-1);curve[i]=frequency*(1+Math.sin(t*duration*31)*.0018*Math.min(1,t*3));}
      oscillator.frequency.cancelScheduledValues(voice.at);
      oscillator.frequency.setValueCurveAtTime(curve,voice.at,Math.max(.12,duration));
    }else if(instrument==='bass'){
      this.oscillator(voice,frequency,'sine',.85);
      this.oscillator(voice,frequency*2,'triangle',.19);
    }else{
      this.oscillator(voice,frequency,instrument==='felt'?'felt':'triangle',1,-.8);
      this.oscillator(voice,frequency*2.002,'sine',instrument==='felt'?.08:.15,0,voice.at+Math.min(1,duration+.15));
    }
  }

  private character(mood:VoiceMood,position:SoundPosition|undefined,placement:SoundPlacement,delay=0,ratio=1):void{
    if(!this.context||!this.voicesVolume)return;
    const identity=position?.unitId??Math.floor(this.random()*12),characterPitch=1+((identity*7)%9-4)*.023;
    const base=(this.world==='boucles'?305:this.world==='plis'?435:238)*characterPitch*ratio;
    const question=mood==='curious',sad=mood==='sad',together=mood==='together';
    const syllables=together?2:question?2:2+(identity%4===0?1:0);
    const spacing=together?.19:question?.16:.135;
    for(let i=0;i<syllables;i++){
      const duration=together?.3:question?.22:.17+(i===syllables-1?.085:0);
      const voice=this.createVoice('voices',duration+.035,delay+i*spacing,placement,together?4:2);if(!voice)continue;
      const context=this.context,oscillator=context.createOscillator();oscillator.setPeriodicWave(this.wave('voice'));
      const pitch=base*(i===0?1:question?1.12:sad?.91:i===2?1.04:.96);
      const end=pitch*(question?(i===syllables-1?1.23:1.04):sad?.78:together?1.015:.88);
      oscillator.frequency.setValueAtTime(pitch*.95,voice.at);
      oscillator.frequency.exponentialRampToValueAtTime(pitch,voice.at+.035);
      oscillator.frequency.exponentialRampToValueAtTime(end,voice.at+duration*.9);
      const formants=this.world==='plis'?[920,2150]:this.world==='veilleurs'?[470,1120]:[680,1540];
      for(let vowel=0;vowel<2;vowel++){
        const filter=context.createBiquadFilter(),level=context.createGain();
        filter.type='bandpass';filter.Q.value=vowel?1.6:.85;
        filter.frequency.setValueAtTime(formants[vowel]*(i%2?.86:1.08),voice.at);
        filter.frequency.linearRampToValueAtTime(formants[vowel]*(question?1.12:.94),voice.at+duration);
        level.gain.value=vowel?.36:.94;oscillator.connect(filter);filter.connect(level);level.connect(voice.gain);voice.nodes.push(filter,level);
      }
      const body=context.createGain();body.gain.value=.12;oscillator.connect(body);body.connect(voice.gain);voice.nodes.push(body);
      this.envelope(voice,(together?.065:sad?.057:.078)*placement.gain,.026,duration*.42,duration*.46);
      this.source(voice,oscillator,voice.end);
    }
    if(this.world==='plis'&&!together)this.noise(.15,.022,2400,placement,delay,'white','voices',.45);
  }

  play(sound:WorldSound,position?:SoundPosition):void{
    const context=this.context;if(!context||!this.audible())return;
    const placement=sound==='win'?CENTRE:getSoundPlacement(position,this.listener);
    if(placement.gain<.015)return;
    const cooldown=sound==='step'?.16:sound==='wait'?7.5:sound==='start'?2.8:sound==='save'?.28:sound==='win'?5:sound==='device'?.17:.14;
    const now=context.currentTime;
    if(now-(this.last.get(sound)??-Infinity)<cooldown)return;
    this.last.set(sound,now);
    const variation=.92+this.random()*.16,profile=MUSIC_PROFILES[this.world];
    switch(sound){
      case 'step':
        if(this.world==='plis'){
          this.noise(.055,.052,1850*variation,placement,0,'white', 'effects',.45);
          this.noise(.035,.022,3150,placement,.025,'pink');
        }else if(this.world==='veilleurs'){
          this.tone(155*variation,.085,.052,placement,0,'sine',106);
          this.noise(.038,.037,690,placement,0,'soft');
        }else{
          this.noise(.055,.037,920*variation,placement,0,'soft');
          this.tone(245*variation,.055,.022,placement,0,'triangle',180);
        }
        if(this.random()<.032&&now-(this.last.get('character')??-Infinity)>9){this.last.set('character',now);this.character('content',position,{gain:placement.gain*.48,pan:placement.pan});}
        break;
      case 'draw-start':this.noise(.085,.07,this.world==='plis'?2400:1650,placement,0,'pink', 'effects',.5);break;
      case 'draw-end':
        this.noise(.15,.07,this.world==='plis'?2100:1100,placement,0,'soft');
        this.tone(midiFrequency(profile.tonic+24),.32,.048,placement,.025);
        this.tone(midiFrequency(profile.tonic+31),.38,.023,placement,.095);break;
      case 'device':
        if(this.world==='plis'){
          this.noise(.16,.13,1800*variation,placement,0,'pink', 'effects',.45);
          this.noise(.095,.085,3200,placement,.065,'white', 'effects',.6);
          this.tone(280*variation,.12,.036,placement,.025,'triangle',205);
        }else if(this.world==='veilleurs'){
          this.tone(132*variation,.19,.09,placement,0,'triangle',117);
          this.tone(327*variation,.26,.032,placement,.02);
          this.tone(782*variation,.21,.018,placement,.07);
          this.noise(.13,.1,750,placement,0,'soft', 'effects',1.1);
        }else{
          this.noise(.13,.1,1250,placement,0,'pink');
          this.tone(206*variation,.12,.057,placement,0,'triangle',170);
          this.noise(.075,.036,2350,placement,.075,'white');
        }
        break;
      case 'wait':
        if(now-(this.last.get('character')??-Infinity)>2){this.last.set('character',now);this.character('curious',position,placement);}
        break;
      case 'start':
        if(now-(this.last.get('character')??-Infinity)>1.5){this.last.set('character',now);this.character('brave',position,{gain:placement.gain*.8,pan:placement.pan});}
        break;
      case 'save':{
        this.rescueCount++;
        const note=profile.tonic+24+[0,7,profile.minor?10:9,12][this.rescueCount%4];
        this.tone(midiFrequency(note),.45,.046,placement);
        this.tone(midiFrequency(note+12),.28,.009,placement,.035);
        if((this.rescueCount===1||this.rescueCount%4===0)&&now-(this.last.get('character')??-Infinity)>1.1){
          this.last.set('character',now);this.character('content',position,{gain:placement.gain*.8,pan:placement.pan},.08);
        }
        break;
      }
      case 'win':{
        this.stopVoices('music');this.musicRestUntil=now+5.2;this.musicBar=0;this.barTime=0;
        const third=profile.minor?3:4;
        for(const [index,interval]of [0,third,7,12].entries()){
          this.instrument(this.world==='veilleurs'?'celesta':'felt',profile.tonic+12+interval,1.8,.65,index*.23,(index-1.5)*.16,'effects');
        }
        this.instrument('strings',profile.tonic+12,2.6,.6,.4,-.2,'effects');
        this.character('together',{unitId:0},{gain:.68,pan:-.32},1.1,1);
        this.character('together',{unitId:4},{gain:.6,pan:.05},1.14,1.006);
        this.character('together',{unitId:8},{gain:.57,pan:.34},1.19,.995);
        break;
      }
      case 'undo':
        this.noise(.28,.11,this.world==='plis'?1950:1480,placement,0,'soft', 'effects',.4);
        this.noise(.12,.035,2900,placement,.1,'pink');break;
      case 'loss':
        this.noise(.2,.075,420,placement,0,'soft');
        this.tone(240*variation,.3,.043,placement,0,'triangle',145);
        if(now-(this.last.get('character')??-Infinity)>1.5){this.last.set('character',now);this.character('sad',position,{gain:placement.gain*.75,pan:placement.pan},.08);}
        break;
    }
  }

  beginPencil():void{
    if(this.pencil||!this.audible()||!this.effectsVolume)return;
    const context=this.context!,voice=this.createVoice('effects',120,0,CENTRE,5);if(!voice)return;
    const source=context.createBufferSource(),filter=context.createBiquadFilter();
    source.buffer=this.noiseBuffer(this.world==='plis'?'pink':'soft');source.loop=true;
    filter.type='bandpass';filter.Q.value=.5;filter.frequency.value=this.world==='plis'?2400:1450;
    source.connect(filter);filter.connect(voice.gain);voice.nodes.push(filter);
    voice.gain.gain.setValueAtTime(.00001,voice.at);voice.gain.gain.exponentialRampToValueAtTime(.027,voice.at+.045);
    this.source(voice,source,voice.end);this.pencil={voice,source,filter};
    this.play('draw-start');
  }
  updatePencil(speed:number):void{
    const pencil=this.pencil,context=this.context;if(!pencil||!context||!this.audible())return;
    const pressure=Math.sqrt(Math.min(1,Math.max(0,Number.isFinite(speed)?speed:0)/750));
    pencil.voice.gain.gain.setTargetAtTime(.009+pressure*.075,context.currentTime,.045);
    pencil.filter.frequency.setTargetAtTime((this.world==='plis'?1450:850)+pressure*1550,context.currentTime,.055);
    pencil.source.playbackRate.setTargetAtTime(.82+pressure*.34,context.currentTime,.08);
  }
  endPencil():void{
    const pencil=this.pencil;this.pencil=null;if(pencil)this.release(pencil.voice,.1);
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibilityChanged);
    if(typeof window!=='undefined'){
      window.removeEventListener('pagehide',this.pageHidden);window.removeEventListener('pageshow',this.visibilityChanged);
    }
    this.stopScheduler();this.endPencil();
    for(const voice of [...this.voices]){this.release(voice,0);this.disconnect(voice);}
    if(this.context){this.context.onstatechange=null;void this.context.close().catch(()=>{});}
    this.context=null;this.master=null;this.buses=null;this.room=null;this.roomReturn=null;
    this.last.clear();this.noiseBuffers.clear();this.impulses.clear();this.waves.clear();this.voices.clear();
  }
}
