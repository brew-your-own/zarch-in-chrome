import { describe, expect, it } from 'vitest';
import { generateTerrain, SEA_LEVEL, Terrain } from './terrain';

const PAD = { i: 0, j: 0, w: 1, h: 1 };

describe('Terrain', () => {
  // Rows are z, columns are x.
  const t = Terrain.fromRows(
    [
      [0, 1, 0, 0],
      [0, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    PAD,
  );

  it('returns vertex heights at integer coordinates', () => {
    expect(t.heightAt(1, 0)).toBe(1);
    expect(t.heightAt(1, 1)).toBe(2);
    expect(t.heightAt(2, 2)).toBe(0);
  });

  it('wraps around in both axes', () => {
    expect(t.heightAt(5, 4)).toBe(1);
    expect(t.heightAt(-3, -4)).toBe(1);
    expect(t.heightAt(1.5 + 8, 0.25 - 4)).toBeCloseTo(t.heightAt(1.5, 0.25));
  });

  it('interpolates linearly within each triangle', () => {
    // Tile (1,0): h00=1, h10=0, h01=2, h11=0. Upper triangle (fx >= fz).
    expect(t.heightAt(1.5, 0)).toBeCloseTo(0.5);
    // Lower triangle (fz > fx): along the left edge from h00=1 to h01=2.
    expect(t.heightAt(1, 0.5)).toBeCloseTo(1.5);
  });

  it('is continuous across the tile diagonal', () => {
    const a = t.heightAt(1.4 + 1e-6, 1.4);
    const b = t.heightAt(1.4, 1.4 + 1e-6);
    expect(a).toBeCloseTo(b, 5);
  });

  it('gives an upward normal on flat ground and a tilted one on slopes', () => {
    expect(t.normalAt(2.5, 2.5)).toEqual({ x: -0, y: 1, z: -0 });
    const n = t.normalAt(0.6, 0.2); // rising toward +x
    expect(n.x).toBeLessThan(0);
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1);
  });

  it('classifies sea, land and pad tiles', () => {
    expect(t.tileType(0, 0)).toBe('pad');
    expect(t.tileType(1, 0)).toBe('land');
    expect(t.tileType(2, 2)).toBe('sea');
    expect(t.tileType(4, 4)).toBe('pad');
  });
});

describe('generateTerrain', () => {
  it('is deterministic for a given seed', () => {
    expect(generateTerrain(42).heights).toEqual(generateTerrain(42).heights);
    expect(generateTerrain(42).heights).not.toEqual(generateTerrain(43).heights);
  });

  it('never goes below sea level and has both sea and land', () => {
    const t = generateTerrain(1);
    expect(Math.min(...t.heights)).toBe(SEA_LEVEL);
    expect(Math.max(...t.heights)).toBeGreaterThan(1);
  });

  it('has a flat pad above sea level', () => {
    const t = generateTerrain(7);
    const { i, j, w, h } = t.pad;
    const padHeight = t.vertexHeight(i, j);
    expect(padHeight).toBeGreaterThan(SEA_LEVEL);
    for (let z = j; z <= j + h; z++) {
      for (let x = i; x <= i + w; x++) expect(t.vertexHeight(x, z)).toBe(padHeight);
    }
    expect(t.tileTypeAt(t.padCentre().x, t.padCentre().z)).toBe('pad');
  });
});
