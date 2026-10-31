import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS, spawnCraft, stepCraft, type CraftInput } from './craft';
import { buildMap, MAPS } from './maps';
import { generateTerrain, Terrain } from './terrain';
import { hitsTree, plantTrees, TREE_NONE, TREE_PALM, TREE_PINE, TREE_ROUND, TREE_SHAPES, treeBase, treeScale } from './trees';

const DT = 1 / 60;
const IDLE: CraftInput = { aimX: 0, aimY: 0, thrust: false };

// 8x8 flat land at height 1 with the pad in the corner and one pine on tile (4, 4).
function forestWorld(): Terrain {
  const rows = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 1));
  const t = Terrain.fromRows(rows, { i: 0, j: 0, w: 2, h: 2 });
  t.setTree(4, 4, TREE_PINE);
  return t;
}

describe('tree storage', () => {
  it('wraps like the heightmap', () => {
    const t = forestWorld();
    expect(t.treeAt(4, 4)).toBe(TREE_PINE);
    expect(t.treeAt(12, -4)).toBe(TREE_PINE);
    expect(t.treeAt(3, 4)).toBe(TREE_NONE);
  });

  it('gives each tree a stable size', () => {
    const t = forestWorld();
    expect(treeScale(t, 4, 4)).toBe(treeScale(t, 12, 4));
    expect(treeScale(t, 4, 4)).toBeGreaterThanOrEqual(0.8);
    expect(treeScale(t, 4, 4)).toBeLessThan(1.2);
  });
});

describe('hitsTree', () => {
  const t = forestWorld();
  const top = 1 + TREE_SHAPES[TREE_PINE].height * treeScale(t, 4, 4);

  it('detects a body inside the trunk/canopy cylinder', () => {
    expect(hitsTree(t, 4.5, 1.5, 4.5, 0.25)).toBe(true);
    expect(hitsTree(t, 4.9, 1.5, 4.5, 0.25)).toBe(true); // within radius + body radius
  });

  it('ignores bodies above or beside the tree', () => {
    expect(hitsTree(t, 4.5, top + 0.01, 4.5, 0.25)).toBe(false);
    expect(hitsTree(t, 5.5, 1.5, 4.5, 0.25)).toBe(false);
  });

  it('finds trees in neighbouring tiles', () => {
    // A round canopy is wide enough to reach across the tile border.
    const wide = forestWorld();
    wide.setTree(4, 4, TREE_ROUND);
    const reach = TREE_SHAPES[TREE_ROUND].radius * treeScale(wide, 4, 4) + 0.25;
    expect(reach).toBeGreaterThan(0.5);
    expect(hitsTree(wide, 4.5 + reach - 0.01, 1.5, 4.5, 0.25)).toBe(true); // in tile (5, 4)
  });
});

describe('craft and trees', () => {
  it('crashes when flying into a tree', () => {
    const t = forestWorld();
    const s = spawnCraft(t);
    s.pos = { x: 2.5, y: 1.5, z: 4.5 };
    s.vel = { x: 3, y: 0, z: 0 };
    s.status = 'flying';
    const floating = { ...DEFAULT_PHYSICS, gravity: 0, drag: 0 }; // only the tree can stop it
    for (let i = 0; i < 60; i++) stepCraft(s, IDLE, t, DT, floating);
    expect(s.status).toBe('crashed');
    expect(s.pos.x).toBeLessThan(4.5);
  });

  it('can fly over a tree and land beside it', () => {
    const t = forestWorld();
    const s = spawnCraft(t);
    s.pos = { x: 4.5, y: 3, z: 4.5 };
    s.status = 'flying';
    stepCraft(s, IDLE, t, DT);
    expect(s.status).toBe('flying');

    s.pos = { x: 5.6, y: 1.05, z: 4.5 };
    s.vel = { x: 0, y: -0.5, z: 0 };
    for (let i = 0; i < 12; i++) stepCraft(s, IDLE, t, DT);
    expect(s.status).toBe('landed');
  });
});

describe('plantTrees', () => {
  it('is deterministic and independent of the heights', () => {
    const a = generateTerrain(5);
    const b = generateTerrain(5);
    expect(a.trees).toEqual(b.trees);
    expect(generateTerrain(5, { treeDensity: 0 }).heights).toEqual(a.heights);
  });

  it('can be switched off', () => {
    expect(generateTerrain(5, { treeDensity: 0 }).trees.every((k) => k === TREE_NONE)).toBe(true);
  });

  it('only plants on land, away from the pad, with every kind present', () => {
    for (const m of MAPS) {
      const t = buildMap(m);
      const kinds = new Set<number>();
      for (let j = 0; j < t.size; j++) {
        for (let i = 0; i < t.size; i++) {
          const kind = t.treeAt(i, j);
          if (kind === TREE_NONE) continue;
          kinds.add(kind);
          expect(t.tileType(i, j)).toBe('land');
          for (let d = -1; d <= 1; d++) expect(t.isPadTile(i + d, j + d)).toBe(false);
        }
      }
      expect(kinds).toEqual(new Set([TREE_PINE, TREE_ROUND, TREE_PALM]));
    }
  });

  it('turns only lowland round trees into palms, leaving every other tree where it was', () => {
    const t = generateTerrain(7, { palms: 0 });
    const withPalms = generateTerrain(7, { palms: 1 });
    let palms = 0;
    for (let j = 0; j < t.size; j++) {
      for (let i = 0; i < t.size; i++) {
        const before = t.treeAt(i, j);
        const after = withPalms.treeAt(i, j);
        expect(before).not.toBe(TREE_PALM);
        if (after === TREE_PALM) {
          palms++;
          expect(before).toBe(TREE_ROUND);
        } else {
          expect(after).toBe(before);
        }
      }
    }
    expect(palms).toBeGreaterThan(0);
  });

  it('leaves the spawn point clear', () => {
    for (const m of MAPS) {
      const t = buildMap(m);
      const pad = t.padCentre();
      expect(hitsTree(t, pad.x, pad.y, pad.z, 0.25)).toBe(false);
    }
  });

  it('replants from scratch', () => {
    const t = forestWorld();
    plantTrees(t, 1, 0);
    expect(t.treeAt(4, 4)).toBe(TREE_NONE);
    expect(treeBase(t, 4, 4)).toEqual({ x: 4.5, y: 1, z: 4.5 });
  });
});
