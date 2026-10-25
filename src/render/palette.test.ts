import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildMap, findMap } from '../sim/maps';
import { TREE_PINE, TREE_ROUND } from '../sim/trees';
import { COLOUR_PRESETS, Palette, type ColourSettings } from './palette';

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
});
