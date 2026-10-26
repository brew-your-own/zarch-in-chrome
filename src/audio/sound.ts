import { MusicPlayer } from './music';

/** Sound knobs edited from the settings panel. */
export interface SoundSettings {
  /** Master volume, 0-1. 0 is silent. */
  volume: number;
  /** Distance (tiles) at which the proximity alarm starts for an approaching seeder. 0 turns it off. */
  alertDistance: number;
  /** Music volume relative to the master volume, 0-1. 0 is off. */
  music: number;
}

export const DEFAULT_SOUND: Readonly<SoundSettings> = Object.freeze({ volume: 0.6, alertDistance: 10, music: 0.5 });

/** While paused or after game over, the music keeps playing at this share of its volume. */
const MUSIC_QUIET = 0.4;

/** Within this distance (tiles) of a seeder the proximity alarm is at full volume. */
export const FULL_ALERT_DISTANCE = 3;
/** Alarm level at the edge of the alert distance, so it starts quiet but audible. */
const MIN_ALERT_LEVEL = 0.15;

/**
 * Proximity alarm level, 0-1, for the nearest seeder `distance` tiles away: 0 beyond
 * `alertDistance`, rising from a quiet `MIN_ALERT_LEVEL` to 1 at `FULL_ALERT_DISTANCE`.
 */
export function proximityLevel(distance: number, alertDistance: number): number {
  if (alertDistance <= 0 || distance >= alertDistance) return 0;
  if (distance <= FULL_ALERT_DISTANCE) return 1;
  const t = (alertDistance - distance) / (alertDistance - FULL_ALERT_DISTANCE);
  return MIN_ALERT_LEVEL + (1 - MIN_ALERT_LEVEL) * t;
}

/** Distance (tiles) at which a sound is at half volume. */
const HALF_VOLUME_DISTANCE = 8;

/** Volume multiplier for a sound `distance` tiles from the craft. */
export function attenuation(distance: number): number {
  return 1 / (1 + Math.max(0, distance) / HALF_VOLUME_DISTANCE);
}

/** How big each kind of explosion sounds. */
export const EXPLOSION_SIZE = { craft: 1, bomber: 0.9, fighter: 0.8, mutant: 0.75, seeder: 0.7, tree: 0.35 } as const;
export type ExplosionKind = keyof typeof EXPLOSION_SIZE;

/** Shape of an explosion of `size` (0-1): louder, longer and deeper as it grows. */
export function explosionShape(size: number): { peak: number; duration: number; startFreq: number; thump: boolean } {
  return { peak: 0.25 + 0.65 * size, duration: 0.35 + 1.25 * size, startFreq: 900 + 2600 * size, thump: size >= 0.5 };
}

const THRUST_GAIN = 0.32;
/** Proximity alarm volume at level 1. */
const ALERT_GAIN = 0.16;
/** The alarm alternates between this pitch (Hz) and an octave above it. */
const ALERT_PITCH = 220;
/** Seconds on each pitch. */
const ALERT_STEP = 0.5;
/** Time constant (s) for the thruster fading in and out. */
const THRUST_FADE = 0.06;

/**
 * Procedural game audio on the Web Audio API: no sound files, everything is synthesised.
 * The AudioContext is only created by `resume()`, which must be called from a user
 * gesture (browsers block audio until then); until then every call is a no-op.
 */
export class SoundEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private thrustGain?: GainNode;
  private thrustFilter?: BiquadFilterNode;
  private thrustOn = false;
  private alertGain?: GainNode;
  private alertLevel = 0;
  private musicPlayer?: MusicPlayer;
  private musicGain?: GainNode;

  constructor(private readonly settings: SoundSettings) {}

  /** Creates or wakes the audio context. Call from a click or key handler. */
  resume(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) this.build(new AudioContext());
    void this.ctx!.resume();
  }

  /** Applies the current volume setting; call each frame or after it changes. */
  update(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.05);
  }

  /** Thruster roar on or off; `on` should already account for pause, fuel and crashes. */
  thruster(on: boolean): void {
    if (!this.ctx || !this.thrustGain || !this.thrustFilter || on === this.thrustOn) return;
    this.thrustOn = on;
    const t = this.ctx.currentTime;
    this.thrustGain.gain.setTargetAtTime(on ? THRUST_GAIN : 0, t, THRUST_FADE);
    this.thrustFilter.frequency.setTargetAtTime(on ? 520 : 200, t, THRUST_FADE * 2);
  }

  /**
   * Proximity alarm: a low tone and its octave, alternating every `ALERT_STEP` seconds.
   * `level` (0-1, from `proximityLevel`) sets its volume; 0 silences it.
   */
  proximity(level: number): void {
    if (!this.ctx || !this.alertGain || Math.abs(level - this.alertLevel) < 0.01) return;
    this.alertLevel = level;
    this.alertGain.gain.setTargetAtTime(level * ALERT_GAIN, this.ctx.currentTime, 0.08);
  }

  /**
   * Steers the soundtrack: `intensity` (0-1) decides which layers play and how tense it is,
   * `quiet` turns it down (pause, game over). Call every frame with the frame time.
   */
  music(intensity: number, quiet: boolean, dt: number): void {
    if (!this.ctx || !this.musicPlayer || !this.musicGain) return;
    this.musicPlayer.update(intensity, dt);
    this.musicGain.gain.setTargetAtTime(this.settings.music * (quiet ? MUSIC_QUIET : 1), this.ctx.currentTime, 0.3);
  }

  /** One cannon shot: a falling square-wave blip plus a noise click. */
  cannon(): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const pitch = 1 + (Math.random() - 0.5) * 0.12;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(950 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(180 * pitch, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.13, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.12);

    const click = ctx.createBufferSource();
    click.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.12, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    click.connect(hp).connect(clickGain).connect(master);
    click.start(t, Math.random());
    click.stop(t + 0.04);
  }

  /** Autopilot engaged: two rising chimes, like a cockpit announcement. */
  autopilot(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    for (const [delay, freq] of [[0, 660], [0.13, 990]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.22, t + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.32);
      osc.connect(gain).connect(master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.33);
    }
  }

  /** Something hitting the water `distance` tiles away; `size` 0-1 from a shard to a wreck. */
  splash(size: number, distance: number): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const length = 0.18 + 0.5 * size;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(700 + 600 * size, t);
    band.frequency.exponentialRampToValueAtTime(260, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime((0.12 + 0.35 * size) * attenuation(distance), t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(band).connect(gain).connect(master);
    src.start(t, Math.random());
    src.stop(t + length + 0.02);
  }

  /** A smart bomb: the biggest explosion, under a long sub-bass drop. */
  bomb(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    this.explosion('craft');
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 1.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 1.65);
  }

  /** A missile launching: a rising whoosh of filtered noise. */
  missile(): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2;
    band.frequency.setValueAtTime(300, t);
    band.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(band).connect(gain).connect(master);
    src.start(t, Math.random());
    src.stop(t + 0.62);
  }

  /** A fighter's shot, `distance` tiles away: a lower, harsher zap than the craft's cannon. */
  enemyShot(distance: number): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.16);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16 * attenuation(distance), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(lp).connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  /** A seeder mutating, `distance` tiles away: a warbling, rising squeal. */
  mutation(distance: number): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14 * attenuation(distance), t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(gain).connect(master);
    const warble = ctx.createOscillator();
    warble.frequency.value = 18;
    const depth = ctx.createGain();
    depth.gain.value = 40;
    warble.connect(depth);
    for (const detune of [-12, 12]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.6);
      depth.connect(osc.frequency);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 0.72);
    }
    warble.start(t);
    warble.stop(t + 0.72);
  }

  /** A bullet glancing off a bomber, `distance` tiles away: a short metallic clank. */
  clank(distance: number): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 * attenuation(distance), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    gain.connect(master);
    // Two inharmonic partials ring like struck metal.
    for (const freq of [620, 1470]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.26);
    }
  }

  /** An explosion `distance` tiles from the craft. */
  explosion(kind: ExplosionKind, distance = 0): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const { peak, duration, startFreq, thump } = explosionShape(EXPLOSION_SIZE[kind]);
    const level = peak * attenuation(distance);

    const burst = ctx.createBufferSource();
    burst.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(startFreq, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    burst.connect(lp).connect(gain).connect(master);
    burst.start(t, Math.random() * 0.5);
    burst.stop(t + duration);

    if (thump) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.4);
      const thumpGain = ctx.createGain();
      thumpGain.gain.setValueAtTime(level * 0.9, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(thumpGain).connect(master);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.settings.volume;
    this.master.connect(compressor);

    // Two seconds of white noise, shared by every noisy sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const white = this.noise.getChannelData(0);
    for (let k = 0; k < white.length; k++) white[k] = Math.random() * 2 - 1;

    // Thruster: looping brown noise (integrated white noise, all rumble), low-passed,
    // with a slow wobble on the filter so it roars rather than hisses.
    const brownBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const brown = brownBuffer.getChannelData(0);
    let last = 0;
    for (let k = 0; k < brown.length; k++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      brown[k] = last * 3.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = brownBuffer;
    source.loop = true;
    this.thrustFilter = ctx.createBiquadFilter();
    this.thrustFilter.type = 'lowpass';
    this.thrustFilter.frequency.value = 200;
    this.thrustFilter.Q.value = 2;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 7;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 60;
    wobble.connect(wobbleDepth).connect(this.thrustFilter.frequency);
    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.value = 0;
    source.connect(this.thrustFilter).connect(this.thrustGain).connect(this.master);
    source.start();
    wobble.start();

    // Proximity alarm: a square tone, softened by a lowpass, stepped between ALERT_PITCH and
    // its octave by a slow square-wave LFO. The LFO is hard-clipped to ±1 first, because the
    // band-limited square overshoots at each switch and would chirp the pitch. The alarm runs
    // silently until `proximity` raises its gain.
    const tone = ctx.createOscillator();
    tone.type = 'square';
    tone.frequency.value = ALERT_PITCH * 1.5;
    const steps = ctx.createOscillator();
    steps.type = 'square';
    steps.frequency.value = 1 / (2 * ALERT_STEP);
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let k = 0; k < curve.length; k++) curve[k] = k < curve.length / 2 ? -1 : 1;
    clip.curve = curve;
    const swing = ctx.createGain();
    swing.gain.value = ALERT_PITCH * 0.5;
    steps.connect(clip).connect(swing).connect(tone.frequency);
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 1200;
    this.alertGain = ctx.createGain();
    this.alertGain.gain.value = 0;
    tone.connect(soften).connect(this.alertGain).connect(this.master);
    tone.start();
    steps.start();

    this.musicPlayer = new MusicPlayer(ctx, this.noise);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicPlayer.output.connect(this.musicGain).connect(this.master);
    this.musicPlayer.start();
  }
}
