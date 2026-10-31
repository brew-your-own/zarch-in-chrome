import { describe, expect, it } from 'vitest';
import { CHAIN_WINDOW, chainKill, createCombo, LOW_HEIGHT, LOW_RATE, lowFlying, MAX_MULTIPLIER, multiplier, stepCombo } from './combo';
import { spawnCraft, type CraftState } from './craft';
import { Terrain } from './terrain';

const flat = () => Terrain.fromRows(Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 1)), { i: 0, j: 0, w: 2, h: 2 });

function flying(t: Terrain, height: number, speed: number): CraftState {
  const craft = spawnCraft(t);
  craft.status = 'flying';
  craft.pos = { x: 4, y: t.heightAt(4, 4) + height, z: 4 };
  craft.vel = { x: speed, y: 0, z: 0 };
  return craft;
}

describe('kill chains', () => {
  it('multiply each kill by its place in the chain, up to the cap', () => {
    const combo = createCombo();
    expect(multiplier(combo)).toBe(1);
    expect(chainKill(combo, 100)).toBe(100);
    expect(chainKill(combo, 100)).toBe(200);
    expect(chainKill(combo, 100)).toBe(300);
    for (let k = 0; k < 10; k++) chainKill(combo, 100);
    expect(multiplier(combo)).toBe(MAX_MULTIPLIER);
    expect(combo.best).toBe(13);
  });

  it('break when the window runs out, sooner high up than skimming the ground', () => {
    const t = flat();
    const high = createCombo();
    const low = createCombo();
    chainKill(high, 100);
    chainKill(low, 100);
    const up = flying(t, 5, 5);
    const down = flying(t, 0.5, 5);
    for (let s = 0; s < (CHAIN_WINDOW + 0.5) * 60; s++) {
      stepCombo(high, up, t, 1 / 60);
      stepCombo(low, down, t, 1 / 60);
    }
    expect(high.chain).toBe(0);
    expect(low.chain).toBe(1);
  });

  it('break on a crash', () => {
    const t = flat();
    const combo = createCombo();
    chainKill(combo, 100);
    chainKill(combo, 100);
    const craft = flying(t, 3, 0);
    craft.status = 'crashed';
    stepCombo(combo, craft, t, 1 / 60);
    expect(combo.chain).toBe(0);
    expect(combo.best).toBe(2);
  });
});

describe('low flying', () => {
  it('pays only flying fast and low', () => {
    const t = flat();
    expect(lowFlying(flying(t, 0.5, 6), t)).toBeGreaterThan(0.5);
    expect(lowFlying(flying(t, LOW_HEIGHT + 0.1, 6), t)).toBe(0); // too high
    expect(lowFlying(flying(t, 0.5, 1), t)).toBe(0); // hovering
    const landed = flying(t, 0, 6);
    landed.status = 'landed';
    expect(lowFlying(landed, t)).toBe(0);
  });

  it('pays more the lower and faster it goes', () => {
    const t = flat();
    expect(lowFlying(flying(t, 0.2, 6), t)).toBeGreaterThan(lowFlying(flying(t, 1.2, 6), t));
    expect(lowFlying(flying(t, 0.5, 8), t)).toBeGreaterThan(lowFlying(flying(t, 0.5, 4), t));
  });

  it('earns whole points over time, times the multiplier', () => {
    const t = flat();
    const craft = flying(t, 0, 10);
    const plain = createCombo();
    const chained = createCombo();
    chainKill(chained, 0);
    chainKill(chained, 0);
    let a = 0;
    let b = 0;
    for (let s = 0; s < 60; s++) {
      a += stepCombo(plain, craft, t, 1 / 60);
      b += stepCombo(chained, craft, t, 1 / 60);
    }
    expect(a).toBeGreaterThanOrEqual(LOW_RATE - 1);
    expect(a).toBeLessThanOrEqual(LOW_RATE);
    expect(b).toBeGreaterThanOrEqual(2 * LOW_RATE - 1);
    expect(plain.run).toBe(a);
  });
});
