/**
 * Procedural soundtrack: a four-bar loop in A minor built from layers that join as the
 * intensity (0-1) rises: a pad, then bass, hats, kick, snare and an arpeggio. At high
 * intensity the harmony turns darker (a flat second and a major fifth chord) and the tempo
 * climbs. `musicStep` is the pure score; `MusicPlayer` schedules it on the Web Audio clock.
 */

export type Voice = 'pad' | 'bass' | 'kick' | 'snare' | 'hat' | 'arp';

export interface NoteEvent {
  voice: Voice;
  /** MIDI note number, for pitched voices. */
  note?: number;
  /** Length in sixteenth-note steps. */
  steps: number;
  /** 0-1. */
  velocity: number;
}

/** Chords as MIDI notes, lowest first. The bass plays the first note two octaves down. */
const CALM = [
  [57, 60, 64], // A minor
  [53, 57, 60], // F major
  [55, 59, 62], // G major
  [52, 55, 59], // E minor
];
const TENSE = [
  [57, 60, 64], // A minor
  [58, 62, 65], // B flat major (the flat second)
  [57, 60, 64], // A minor
  [56, 59, 64], // E major (G sharp in the bass: the harmonic minor's leading tone)
];

/** Intensity at which each layer joins. */
export const LAYERS: Record<Voice, number> = { pad: 0, bass: 0.15, hat: 0.3, kick: 0.4, snare: 0.55, arp: 0.5 };
/** Above this, the darker chords are used. */
export const TENSE_AT = 0.75;

export const STEPS_PER_BAR = 16;

/** Tempo in beats per minute for `intensity`. */
export function tempo(intensity: number): number {
  return 100 + 30 * Math.max(0, Math.min(1, intensity));
}

/** The chord for bar `bar` at `intensity`. */
export function chordFor(bar: number, intensity: number): number[] {
  const progression = intensity >= TENSE_AT ? TENSE : CALM;
  return progression[((bar % 4) + 4) % 4]!;
}

/** Everything that starts on sixteenth-note `step` (counted from the start of the music). */
export function musicStep(step: number, intensity: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  const s = step % STEPS_PER_BAR;
  const chord = chordFor(Math.floor(step / STEPS_PER_BAR), intensity);
  const on = (voice: Voice) => intensity >= LAYERS[voice];

  if (s === 0) for (const note of chord) events.push({ voice: 'pad', note, steps: STEPS_PER_BAR, velocity: 0.5 });

  // Bass: a driving eighth-note figure on the chord root.
  if (on('bass') && [0, 3, 6, 8, 10, 14].includes(s)) {
    events.push({ voice: 'bass', note: chord[0]! - 24, steps: 2, velocity: s === 0 || s === 8 ? 1 : 0.75 });
  }
  if (on('kick') && (s === 0 || s === 8 || (intensity >= 0.7 && s === 10))) events.push({ voice: 'kick', steps: 1, velocity: 1 });
  if (on('snare') && (s === 4 || s === 12)) events.push({ voice: 'snare', steps: 1, velocity: 0.9 });
  // Hats on the off-beat eighths, then every sixteenth when it gets hot.
  if (on('hat') && (s % 4 === 2 || (intensity >= 0.7 && s % 2 === 1))) {
    events.push({ voice: 'hat', steps: 1, velocity: s % 4 === 2 ? 0.8 : 0.45 });
  }
  // Arpeggio: chord tones rising an octave above the pad, up two octaves at full tilt.
  if (on('arp')) {
    const span = intensity >= 0.85 ? 2 : 1;
    const tones = [];
    for (let octave = 1; octave <= span; octave++) for (const note of chord) tones.push(note + 12 * octave);
    events.push({ voice: 'arp', note: tones[s % tones.length], steps: 1, velocity: s % 4 === 0 ? 0.9 : 0.6 });
  }
  return events;
}

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** How far ahead (s) notes are scheduled, and how often (ms) the scheduler wakes up. */
const LOOKAHEAD = 0.15;
const TICK_MS = 30;
/** Seconds for the intensity to move all the way across, so layers come and go smoothly. */
const INTENSITY_GLIDE = 3;

/**
 * Plays `musicStep` on an AudioContext. Call `update(intensity, dt)` every frame; the
 * scheduler runs on its own timer so the beat stays steady whatever the frame rate.
 */
export class MusicPlayer {
  private step = 0;
  private nextTime = 0;
  private intensity = 0;
  private target = 0;
  private timer?: ReturnType<typeof setInterval>;
  readonly output: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly noise: AudioBuffer,
  ) {
    this.output = ctx.createGain();
  }

  start(): void {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Sets where the intensity is heading; it glides there over a few seconds. */
  update(target: number, dt: number): void {
    this.target = Math.max(0, Math.min(1, target));
    const max = dt / INTENSITY_GLIDE;
    this.intensity += Math.max(-max, Math.min(max, this.target - this.intensity));
  }

  private schedule(): void {
    // After the tab was in the background, skip ahead rather than play a burst of catch-up notes.
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const stepLength = 60 / tempo(this.intensity) / 4;
      for (const event of musicStep(this.step, this.intensity)) this.play(event, this.nextTime, stepLength);
      this.nextTime += stepLength;
      this.step++;
    }
  }

  private play(event: NoteEvent, t: number, stepLength: number): void {
    const length = event.steps * stepLength;
    const freq = event.note === undefined ? 0 : midiToHz(event.note);
    switch (event.voice) {
      case 'pad':
        // Two detuned saws per note through a soft lowpass, swelling in and out over the bar.
        for (const detune of [-7, 7]) {
          this.tone('sawtooth', freq, detune, 900, t, 0.5, length + 0.4, 0.05 * event.velocity);
        }
        break;
      case 'bass':
        this.tone('sawtooth', freq, 0, 420, t, 0.005, length * 0.9, 0.22 * event.velocity);
        break;
      case 'arp':
        this.tone('square', freq, 0, 2400, t, 0.003, stepLength * 0.9, 0.05 * event.velocity);
        break;
      case 'kick':
        this.kick(t, event.velocity);
        break;
      case 'snare':
        this.noiseHit('bandpass', 1800, t, 0.16, 0.22 * event.velocity);
        break;
      case 'hat':
        this.noiseHit('highpass', 7000, t, 0.04, 0.09 * event.velocity);
        break;
    }
  }

  /** An oscillator through a lowpass, with an attack/release envelope. */
  private tone(type: OscillatorType, freq: number, detune: number, cutoff: number, t: number, attack: number, length: number, peak: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + Math.max(attack, length * 0.6));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(lp).connect(gain).connect(this.output);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private kick(t: number, velocity: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * velocity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(this.output);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private noiseHit(type: BiquadFilterType, freq: number, t: number, length: number, peak: number): void {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(filter).connect(gain).connect(this.output);
    src.start(t, Math.random() * 1.5);
    src.stop(t + length + 0.02);
  }
}
