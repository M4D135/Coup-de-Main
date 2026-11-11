import type { WorldId } from './types';

export type WorldSound = 'start' | 'draw-start' | 'draw-end' | 'device' | 'wait' | 'save' | 'win' | 'undo' | 'loss' | 'step';

/** Small, original material voices. Nothing is sampled from another game or film. */
export class WorldAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private pencil: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private muted = false;
  private volume = .5;
  private world: WorldId = 'boucles';
  private serial = 0;
  private last = new Map<string, number>();

  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.context) {
      const AudioConstructor = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioConstructor) return;
      this.context = new AudioConstructor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * .6;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 10;
      limiter.ratio.value = 5;
      limiter.attack.value = .004;
      limiter.release.value = .15;
      this.master.connect(limiter);
      limiter.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      try { await this.context.resume(); } catch { /* A later user gesture can retry. */ }
    }
  }

  setWorld(world: WorldId) { this.world = world; this.endPencil(); this.last.clear(); }
  setMuted(muted: boolean) { this.muted = muted; this.updateVolume(); if (muted) this.endPencil(); }
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : .5)); this.updateVolume(); }

  private updateVolume() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .6, this.context.currentTime, .035);
  }

  private random() {
    const value = Math.sin(++this.serial * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  private tone(frequency: number, duration: number, gain = .1, delay = 0, type: OscillatorType = 'sine', endFrequency?: number) {
    const context = this.context, destination = this.master;
    if (!context || !destination) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration * .8);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.001, gain), at + Math.min(.018, duration * .15));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(destination);
    oscillator.start(at); oscillator.stop(at + duration + .015);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  private noise(duration: number, gain: number, frequency: number, delay = 0, q = .7) {
    const context = this.context, destination = this.master;
    if (!context || !destination) return;
    const count = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, count, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let low = 0;
    for (let index = 0; index < count; index++) {
      low = low * .35 + (this.random() * 2 - 1) * .65;
      samples[index] = low;
    }
    const source = context.createBufferSource(); source.buffer = buffer;
    const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
    const envelope = context.createGain(), at = context.currentTime + delay;
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.001, gain), at + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(destination);
    source.start(at); source.stop(at + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }

  /** A short voiced gesture with a rising question or a contented falling answer. */
  private voice(question: boolean, delay = 0) {
    const base = (this.world === 'boucles' ? 360 : this.world === 'plis' ? 540 : 270) * (.9 + this.random() * .22);
    const syllables = 2 + Math.floor(this.random() * 2);
    for (let index = 0; index < syllables; index++) {
      const tone = base * [1, 1.22, .92][index % 3];
      this.tone(tone, .11 + this.random() * .07, .045, delay + index * .12, 'triangle', tone * (question ? 1.27 : .8));
      this.tone(tone * 2.01, .07, .012, delay + index * .12 + .02, 'sine');
    }
  }

  play(sound: WorldSound) {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const cooldown = sound === 'step' ? .13 : sound === 'wait' ? 2.8 : sound === 'save' ? .12 : .08;
    if (context.currentTime - (this.last.get(sound) ?? -Infinity) < cooldown) return;
    this.last.set(sound, context.currentTime);
    const variation = .9 + this.random() * .2;
    switch (sound) {
      case 'step':
        if (this.world === 'plis') this.noise(.055, .065, 1600 * variation, 0, .5);
        else if (this.world === 'veilleurs') { this.tone(180 * variation, .065, .045, 0, 'sine', 120); this.noise(.035, .026, 900); }
        else { this.noise(.045, .04, 650 * variation); this.tone(230 * variation, .055, .028, 0, 'triangle', 150); }
        break;
      case 'draw-start': this.noise(.075, .08, 1900 * variation); break;
      case 'draw-end':
        this.noise(.13, .075, 1250);
        this.tone(this.world === 'veilleurs' ? 740 : 620, .22, .055, .04, 'sine');
        this.tone(930, .18, .028, .10, 'sine');
        break;
      case 'device':
        this.noise(.12, .16, this.world === 'plis' ? 1900 : 700);
        this.tone(165 * variation, .12, .075, 0, 'triangle', 125);
        this.tone(280 * variation, .2, .035, .055, 'sine', 245);
        this.noise(.09, .05, 1350, .10);
        break;
      case 'wait': this.voice(true); break;
      case 'start': this.voice(false); this.tone(392, .22, .035, .2); break;
      case 'save': {
        const notes = [523.25, 587.33, 659.25, 783.99, 880];
        const note = notes[this.serial % notes.length];
        this.tone(note, .32, .055); this.tone(note * 2.005, .16, .012, .008);
        if (this.serial % 5 === 0) this.voice(false, .09);
        break;
      }
      case 'win':
        [392, 493.88, 587.33, 783.99].forEach((note, index) => {
          this.tone(note, .65, .07, index * .13); this.tone(note * 2, .35, .014, index * .13);
        });
        this.voice(false, .62); break;
      case 'undo': this.noise(.25, .13, 2300); this.tone(400, .15, .03, 0, 'sine', 270); break;
      case 'loss': this.noise(.24, .12, 400); this.tone(300, .35, .055, 0, 'triangle', 115); break;
    }
  }

  beginPencil() {
    if (this.pencil || this.muted || !this.context || !this.master || this.context.state !== 'running') return;
    const context = this.context;
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (this.random() * 2 - 1) * (.5 + .5 * Math.sin(index * .04) ** 2);
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = this.world === 'plis' ? 2500 : 1600; filter.Q.value = .55;
    const gain = context.createGain(); gain.gain.value = .035;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    this.pencil = {source, filter, gain};
    this.play('draw-start');
  }

  updatePencil(speed: number) {
    if (!this.pencil || !this.context) return;
    const pressure = Math.min(1, Math.max(0, speed) / 650);
    this.pencil.gain.gain.setTargetAtTime(.012 + pressure * .10, this.context.currentTime, .035);
    this.pencil.filter.frequency.setTargetAtTime(950 + pressure * 1700, this.context.currentTime, .045);
  }

  endPencil() {
    const pencil = this.pencil; this.pencil = null;
    if (!pencil || !this.context) return;
    pencil.gain.gain.setTargetAtTime(.0001, this.context.currentTime, .025);
    pencil.source.stop(this.context.currentTime + .13);
    pencil.source.onended = () => { pencil.source.disconnect(); pencil.filter.disconnect(); pencil.gain.disconnect(); };
  }

  dispose() {
    this.endPencil();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.master = null; this.last.clear();
  }
}
