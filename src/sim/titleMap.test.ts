import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS, spawnCraft, stepCraft } from './craft';
import { buildTitleMap, lettersInfected, TITLE_DEPTH, TITLE_WIDTH } from './titleMap';
import { TREE_NONE } from './trees';

describe('title map', () => {
  const { terrain, letters, centre } = buildTitleMap();
  const n = terrain.size;
  const letterTiles = [...letters.keys()].filter((k) => letters[k] === 1).map((k) => ({ i: k % n, j: Math.floor(k / n) }));

  it('writes the word on land the virus can take, clear of trees', () => {
    expect(letterTiles.length).toBeGreaterThan(80);
    for (const { i, j } of letterTiles) {
      expect(terrain.canInfect(i, j)).toBe(true);
      expect(terrain.treeAt(i, j)).toBe(TREE_NONE);
    }
  });

  it('places the word north of the pad, centred on it, within the map', () => {
    const pad = terrain.padCentre();
    expect(centre.x).toBeCloseTo(pad.x, 0);
    expect(centre.z + TITLE_DEPTH / 2).toBeLessThan(terrain.pad.j);
    expect(Math.min(...letterTiles.map((t) => t.i))).toBe(Math.round(centre.x - TITLE_WIDTH / 2));
    expect(Math.min(...letterTiles.map((t) => t.j))).toBeGreaterThanOrEqual(0);
  });

  it('raises the letters above the plinth around them', () => {
    const mid = (i: number, j: number) => terrain.heightAt(i + 0.5, j + 0.5);
    // The Z's top bar is lit; the gap column after the Z is not.
    const top = Math.min(...letterTiles.map((t) => t.j));
    const left = Math.min(...letterTiles.map((t) => t.i));
    expect(mid(left + 1, top)).toBeGreaterThan(mid(left + 3, top + 4));
  });

  it('leaves the pad flat, so the craft can still take off and land on it', () => {
    const craft = spawnCraft(terrain, DEFAULT_PHYSICS);
    for (let k = 0; k < 60; k++) stepCraft(craft, { aimX: 0, aimY: 0, thrust: k < 30 }, terrain, 1 / 60, DEFAULT_PHYSICS);
    expect(craft.status).not.toBe('crashed');
  });

  it('starts with no letter infected', () => {
    expect(lettersInfected(terrain, letters)).toBe(0);
  });
});
