import type { SoundKind } from '../world/blocks';

type Material = 'stone' | 'dirt' | 'grass' | 'sand' | 'wood' | 'glass' | 'metal' | 'ore' | 'plant' | 'liquid';

const MATERIAL_TONE: Record<Material, { freq: number; noise: number; q: number }> = {
  stone: { freq: 220, noise: 0.75, q: 2.4 },
  dirt: { freq: 150, noise: 0.9, q: 1.2 },
  grass: { freq: 320, noise: 0.85, q: 1.0 },
  sand: { freq: 480, noise: 0.95, q: 0.8 },
  wood: { freq: 260, noise: 0.55, q: 3.2 },
  glass: { freq: 900, noise: 0.4, q: 6.0 },
  metal: { freq: 620, noise: 0.3, q: 8.0 },
  ore: { freq: 380, noise: 0.6, q: 4.5 },
  plant: { freq: 700, noise: 0.8, q: 1.4 },
  liquid: { freq: 180, noise: 1.0, q: 0.7 },
};

/**
 * Fully procedural audio: every sound is synthesised with the Web Audio API
 * so the game ships without a single audio asset.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private droneGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private started = false;

  volume = 0.65;
  muted = false;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.started) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoise();
      this.buildAmbience();
      this.started = true;
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  private createNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // Low cave drone.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    for (const freq of [42, 63, 84]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      osc.connect(g);
      g.connect(filter);
      osc.start();
    }
    filter.connect(droneGain);
    droneGain.connect(this.master!);
    this.droneGain = droneGain;

    // Surface wind.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.master!);
    wind.start();
    this.windGain = windGain;
  }

  /** 0 = deep underground, 1 = open sky. */
  setAmbience(underground: number): void {
    if (!this.ctx || !this.droneGain || !this.windGain) return;
    const now = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(0.09 * underground, now, 0.8);
    this.windGain.gain.setTargetAtTime(0.035 * (1 - underground), now, 0.8);
  }

  private noiseSource(duration: number): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    src.start(this.ctx.currentTime, Math.random() * 0.5, duration);
    return src;
  }

  dig(kind: SoundKind): void {
    if (!this.ctx || !this.master) return;
    const tone = MATERIAL_TONE[kind as Material] ?? MATERIAL_TONE.stone;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = this.noiseSource(0.16);
    if (src) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = tone.freq * (0.85 + Math.random() * 0.3);
      filter.Q.value = tone.q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16 * tone.noise, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.stop(now + 0.16);
    }

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(tone.freq * 0.8, now);
    osc.frequency.exponentialRampToValueAtTime(tone.freq * 0.55, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  breakBlock(kind: SoundKind): void {
    if (!this.ctx || !this.master) return;
    const tone = MATERIAL_TONE[kind as Material] ?? MATERIAL_TONE.stone;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this.noiseSource(0.35);
    if (src) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(tone.freq * 1.4, now);
      filter.frequency.exponentialRampToValueAtTime(tone.freq * 0.5, now + 0.3);
      filter.Q.value = tone.q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3 * tone.noise, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.stop(now + 0.35);
    }
  }

  pickup(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  hurt(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.28);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  hit(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this.noiseSource(0.1);
    if (src) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.stop(now + 0.11);
    }
  }

  step(speed = 0.7): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this.noiseSource(0.12);
    if (!src) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420 + Math.random() * 200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07 * speed, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.stop(now + 0.12);
  }

  beep(frequency = 660, duration = 0.12): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  ui(): void {
    this.beep(420, 0.06);
  }
}
