import { describe, expect, it } from 'vitest';
import { buildMap, DEFAULT_MAP_ID, findMap, MAPS } from './maps';
import type { Terrain } from './terrain';

function seaFraction(t: Terrain): number {
  let sea = 0;
  for (let j = 0; j < t.size; j++) for (let i = 0; i < t.size; i++) if (t.tileType(i, j) === 'sea') sea++;
  return sea / (t.size * t.size);
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
});
