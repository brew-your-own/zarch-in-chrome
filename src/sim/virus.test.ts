import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { Terrain } from './terrain';
import { stepVirus } from './virus';

// 8x8: land at height 1 except sea rows at z = 6..7; the pad is tiles (0..1, 0..1).
function world(): Terrain {
  const rows = Array.from({ length: 8 }, (_, z) => Array.from({ length: 8 }, () => (z >= 6 ? 0 : 1)));
  return Terrain.fromRows(rows, { i: 0, j: 0, w: 2, h: 2 });
}

describe('infection', () => {
  it('only takes on clean land', () => {
    const t = world();
    expect(t.infect(4, 4)).toBe(true);
    expect(t.infect(4, 4)).toBe(false); // already infected
    expect(t.infect(0, 0)).toBe(false); // pad
    expect(t.infect(4, 6)).toBe(false); // sea
    expect(t.isInfected(12, -4)).toBe(true); // wraps
    expect(t.infectedCount).toBe(1);
  });

  it('reports the infected share of land', () => {
    const t = world();
    let land = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (t.tileType(i, j) === 'land') land++;
    t.infect(4, 4);
    t.infect(5, 4);
    expect(t.infectedFraction()).toBeCloseTo(2 / land);
  });
});

describe('stepVirus', () => {
  it('spreads to neighbouring land over time', () => {
    const t = world();
    t.infect(4, 3);
    const rng = createRng(1);
    for (let k = 0; k < 600; k++) stepVirus(t, 0.5, 1 / 60, rng);
    expect(t.infectedCount).toBeGreaterThan(3);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) if (t.isInfected(i, j)) expect(t.tileType(i, j)).toBe('land');
    }
  });

  it('does nothing at rate 0', () => {
    const t = world();
    t.infect(4, 3);
    const rng = createRng(1);
    for (let k = 0; k < 600; k++) stepVirus(t, 0, 1 / 60, rng);
    expect(t.infectedCount).toBe(1);
  });

  it('is deterministic for a given random stream', () => {
    const run = () => {
      const t = world();
      t.infect(4, 3);
      const rng = createRng(9);
      for (let k = 0; k < 300; k++) stepVirus(t, 0.5, 1 / 60, rng);
      return Array.from(t.infection);
    };
    expect(run()).toEqual(run());
  });
});
