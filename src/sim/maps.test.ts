import { describe, expect, it } from 'vitest';
import { buildMap, DEFAULT_MAP_ID, findMap, MAPS } from './maps';
import type { Terrain } from './terrain';
import { TREE_NONE } from './trees';

function seaFraction(t: Terrain): number {
  let sea = 0;
  for (let j = 0; j < t.size; j++) for (let i = 0; i < t.size; i++) if (t.tileType(i, j) === 'sea') sea++;
  return sea / (t.size * t.size);
}

function treeFraction(t: Terrain): number {
  let trees = 0;
  for (let j = 0; j < t.size; j++) for (let i = 0; i < t.size; i++) if (t.treeAt(i, j) !== TREE_NONE) trees++;
  return trees / (t.size * t.size);
}

/** Sizes of the separate bodies of water (4-connected, across the wrap). */
function waters(t: Terrain): number[] {
  const n = t.size;
  const seen = new Uint8Array(n * n);
  const sizes: number[] = [];
  for (let k = 0; k < n * n; k++) {
    if (seen[k] || t.tileType(k % n, Math.floor(k / n)) !== 'sea') continue;
    let size = 0;
    const stack = [k];
    seen[k] = 1;
    while (stack.length > 0) {
      const c = stack.pop()!;
      size++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const i = (((c % n) + di) % n + n) % n;
        const j = ((Math.floor(c / n) + dj) % n + n) % n;
        if (!seen[j * n + i] && t.tileType(i, j) === 'sea') {
          seen[j * n + i] = 1;
          stack.push(j * n + i);
        }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

describe('maps', () => {
  it('have unique ids and fall back to the default for unknown ones', () => {
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length);
    expect(findMap('nope').id).toBe(DEFAULT_MAP_ID);
    expect(findMap('highlands').name).toBe('Highlands');
  });

  it('each have a launch pad above sea level', () => {
    for (const m of MAPS) {
      const t = buildMap(m);
      expect(t.tileTypeAt(t.padCentre().x, t.padCentre().z)).toBe('pad');
      expect(t.padCentre().y).toBeGreaterThan(0);
    }
  });

  it('have distinct characters', () => {
    const valleys = buildMap(findMap('valleys'));
    const archipelago = buildMap(findMap('archipelago'));
    const highlands = buildMap(findMap('highlands'));
    expect(seaFraction(archipelago)).toBeGreaterThan(0.4);
    expect(seaFraction(archipelago)).toBeGreaterThan(seaFraction(valleys));
    expect(seaFraction(highlands)).toBeLessThan(seaFraction(valleys));
    expect(Math.max(...highlands.heights)).toBeGreaterThan(Math.max(...valleys.heights) * 2);
  });

  it('give farmlands, forest and lakes their own characters', () => {
    const valleys = buildMap(findMap('valleys'));
    const farmlands = buildMap(findMap('farmlands'));
    const forest = buildMap(findMap('forest'));
    const lakes = buildMap(findMap('lakes'));
    // Farmlands: flat and dry, with the most buildings of any map.
    expect(Math.max(...farmlands.heights)).toBeLessThan(Math.max(...valleys.heights));
    expect(seaFraction(farmlands)).toBeLessThan(0.05);
    for (const m of MAPS) if (m.id !== 'farmlands') expect(farmlands.buildings.length).toBeGreaterThan(buildMap(m).buildings.length);
    // Deep Forest: far more trees than anywhere else.
    expect(treeFraction(forest)).toBeGreaterThan(treeFraction(valleys) * 1.8);
    // Lake District: many separate lakes, none of them a sea.
    const bodies = waters(lakes);
    expect(bodies.filter((size) => size >= 6).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...bodies)).toBeLessThan(300);
  });
});
