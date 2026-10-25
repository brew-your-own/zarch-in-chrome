import { describe, expect, it } from 'vitest';
import { chordFor, LAYERS, musicStep, STEPS_PER_BAR, tempo, TENSE_AT, type Voice } from './music';

/** Voices heard anywhere in one four-bar loop at `intensity`. */
function voicesIn(intensity: number): Set<Voice> {
  const voices = new Set<Voice>();
  for (let step = 0; step < STEPS_PER_BAR * 4; step++) for (const e of musicStep(step, intensity)) voices.add(e.voice);
  return voices;
}

describe('music score', () => {
  it('adds layers as the intensity rises', () => {
    expect(voicesIn(0)).toEqual(new Set(['pad']));
    expect(voicesIn(0.2)).toEqual(new Set(['pad', 'bass']));
    const full = voicesIn(1);
    for (const voice of Object.keys(LAYERS) as Voice[]) expect(full.has(voice)).toBe(true);
    // Each layer joins exactly at its threshold.
    for (const [voice, at] of Object.entries(LAYERS) as [Voice, number][]) {
      if (at > 0) expect(voicesIn(at - 0.01).has(voice)).toBe(false);
      expect(voicesIn(at).has(voice)).toBe(true);
    }
  });

  it('plays a pad chord at the start of every bar, and the bass on its root', () => {
    for (let bar = 0; bar < 4; bar++) {
      const events = musicStep(bar * STEPS_PER_BAR, 0.5);
      const pad = events.filter((e) => e.voice === 'pad').map((e) => e.note);
      expect(pad).toEqual(chordFor(bar, 0.5));
      expect(events.find((e) => e.voice === 'bass')?.note).toBe(chordFor(bar, 0.5)[0]! - 24);
    }
  });

  it('turns darker and faster when tense', () => {
    expect(chordFor(1, TENSE_AT)).not.toEqual(chordFor(1, 0));
    expect(chordFor(0, TENSE_AT)).toEqual(chordFor(0, 0)); // still home in A minor
    expect(tempo(1)).toBeGreaterThan(tempo(0));
  });

  it('keeps every pitched note in a sensible range', () => {
    for (let step = 0; step < STEPS_PER_BAR * 4; step++) {
      for (const e of musicStep(step, 1)) {
        if (e.note === undefined) continue;
        expect(e.note).toBeGreaterThanOrEqual(28);
        expect(e.note).toBeLessThanOrEqual(96);
      }
    }
  });
});
