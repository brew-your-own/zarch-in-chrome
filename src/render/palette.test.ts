import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildMap, findMap } from '../sim/maps';
import { buildTitleMap } from '../sim/titleMap';
import { TREE_PINE, TREE_ROUND } from '../sim/trees';
import { COLOUR_PRESETS, Palette, VIRUS, type ColourSettings } from './palette';

const terrain = buildMap(findMap('valleys'));

function landTiles(): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < terrain.size; j++) for (let i = 0; i < terrain.size; i++) if (terrain.tileType(i, j) === 'land') out.push([i, j]);
  return out;
}

function distinct(colours: THREE.Color[]): number {
  return new Set(colours.map((c) => c.getHexString())).size;
}

describe('Palette', () => {
  it('keeps every round tree green in summer and turns them all at full autumn', () => {
    const colours: ColourSettings = { ...COLOUR_PRESETS.summer.colours };
    const palette = new Palette(terrain, colours);
    const leaves = () => landTiles().map(([i, j]) => palette.foliage(i, j, TREE_ROUND, new THREE.Color()));
    expect(distinct(leaves())).toBe(1);

    colours.autumn = 1; // the palette reads settings live
    const autumn = leaves();
    expect(distinct(autumn)).toBe(4);
    expect(autumn.every((c) => c.r > c.g * 0.9)).toBe(true); // yellow to red: never green-dominant
  });

  it('keeps pines evergreen', () => {
    const palette = new Palette(terrain, { autumn: 1, grassTone: 1, patches: 1 });
    const pine = palette.foliage(3, 4, TREE_PINE, new THREE.Color());
    expect(pine.g).toBeGreaterThan(pine.r);
  });

  it('turns more of the land into patches as the setting grows', () => {
    const colours: ColourSettings = { autumn: 0, grassTone: 0, patches: 0 };
    const palette = new Palette(terrain, colours);
    const hues = () => landTiles().map(([i, j]) => palette.tile(i, j, new THREE.Color(), false).getHexString());
    const grassOnly = new Set(hues());
    expect(grassOnly.size).toBe(1);
    colours.patches = 0.5;
    const some = hues().filter((h) => !grassOnly.has(h)).length;
    colours.patches = 1;
    const more = hues().filter((h) => !grassOnly.has(h)).length;
    expect(some).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(some);
  });

  it('shifts grass from green toward ochre', () => {
    const colours: ColourSettings = { autumn: 0, grassTone: 0, patches: 0 };
    const palette = new Palette(terrain, colours);
    const [i, j] = landTiles()[0]!;
    const green = palette.tile(i, j, new THREE.Color(), false);
    colours.grassTone = 1;
    const ochre = palette.tile(i, j, new THREE.Color(), false);
    expect(green.g).toBeGreaterThan(green.r);
    expect(ochre.r).toBeGreaterThan(ochre.g);
  });

  it('darkens alternate tiles only with the checkerboard on', () => {
    const palette = new Palette(terrain, { autumn: 0, grassTone: 0, patches: 0 });
    const [i, j] = landTiles().find(([a, b]) => terrain.tileType(a + 1, b) === 'land')!;
    const a = palette.tile(i, j, new THREE.Color()).getHexString();
    const b = palette.tile(i + 1, j, new THREE.Color()).getHexString();
    expect(a).not.toBe(b);
    expect(palette.tile(i, j, new THREE.Color(), false).getHexString()).toBe(palette.tile(i + 1, j, new THREE.Color(), false).getHexString());
  });

  it('paints infected land and its trees in the virus colour', () => {
    const t = buildMap(findMap('valleys'));
    const palette = new Palette(t, { ...COLOUR_PRESETS.late.colours });
    const [i, j] = (() => {
      for (let b = 0; b < t.size; b++) for (let a = 0; a < t.size; a++) if (t.tileType(a, b) === 'land') return [a, b];
      throw new Error('no land');
    })();
    const before = palette.tile(i, j, new THREE.Color(), false).getHex();
    t.infect(i, j);
    expect(palette.tile(i, j, new THREE.Color(), false).getHex()).not.toBe(before);
    expect(palette.tile(i, j, new THREE.Color(), false).getHex()).toBe(VIRUS.getHex());
    const leaves = palette.foliage(i, j, TREE_PINE, new THREE.Color());
    expect(leaves.r).toBeGreaterThan(leaves.g * 3);
  });

  it('paints the title lettering on its slab, unless the virus has it', () => {
    const { terrain: title, letters } = buildTitleMap();
    const palette = new Palette(title, { ...COLOUR_PRESETS.summer.colours }, letters);
    const n = title.size;
    const tileOf = (value: number) => {
      const k = letters.indexOf(value);
      return [k % n, Math.floor(k / n)] as const;
    };
    const colour = (i: number, j: number) => palette.tile(i, j, new THREE.Color()).getHexString();
    const [li, lj] = tileOf(1);
    const [si, sj] = tileOf(2);
    expect(colour(li, lj)).not.toBe(colour(si, sj));
    // Neither is checkered, so neighbouring letter tiles match.
    expect(letters[lj * n + li + 1]).toBe(1);
    expect(colour(li + 1, lj)).toBe(colour(li, lj));
    title.infect(li, lj);
    const infected = palette.tile(li, lj, new THREE.Color(), false);
    expect(infected.getHexString()).toBe(VIRUS.getHexString());
  });
});
