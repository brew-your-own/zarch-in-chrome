/** Sound knobs edited from the settings panel. */
export interface SoundSettings {
  /** Master volume, 0-1. 0 is silent. */
  volume: number;
}

export const DEFAULT_SOUND: Readonly<SoundSettings> = Object.freeze({ volume: 0.6 });

/** Distance (tiles) at which a sound is at half volume. */
const HALF_VOLUME_DISTANCE = 8;

/** Volume multiplier for a sound `distance` tiles from the craft. */
export function attenuation(distance: number): number {
  return 1 / (1 + Math.max(0, distance) / HALF_VOLUME_DISTANCE);
}

/** How big each kind of explosion sounds. */
export const EXPLOSION_SIZE = { craft: 1, seeder: 0.7, tree: 0.35 } as const;
export type ExplosionKind = keyof typeof EXPLOSION_SIZE;

/** Shape of an explosion of `size` (0-1): louder, longer and deeper as it grows. */
export function explosionShape(size: number): { peak: number; duration: number; startFreq: number; thump: boolean } {
  return { peak: 0.25 + 0.65 * size, duration: 0.35 + 1.25 * size, startFreq: 900 + 2600 * size, thump: size >= 0.5 };
}

const THRUST_GAIN = 0.32;
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
  }
}
