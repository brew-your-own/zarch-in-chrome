import { valueNoise } from './noise';
import { createRng } from './rng';
import type { Terrain } from './terrain';

export const TREE_NONE = 0;
export const TREE_PINE = 1;
export const TREE_ROUND = 2;
export type TreeKind = typeof TREE_NONE | typeof TREE_PINE | typeof TREE_ROUND;

/** Collision cylinder of a tree at scale 1, from its base. Renderers size their meshes to match. */
export const TREE_SHAPES = {
  [TREE_PINE]: { height: 1.1, radius: 0.2 },
  [TREE_ROUND]: { height: 0.85, radius: 0.28 },
} as const;

/** Each tree lives at the centre of its tile. */
export function treeBase(terrain: Terrain, i: number, j: number): { x: number; y: number; z: number } {
  const x = i + 0.5;
  const z = j + 0.5;
  return { x, y: terrain.heightAt(x, z), z };
}

/** Deterministic per-tile hash in [0, 1), stable across world wraps. */
export function tileHash(terrain: Terrain, i: number, j: number, salt = 0): number {
  const n = terrain.size;
  let h = (((i % n) + n) % n) * 374761393 + (((j % n) + n) % n) * 668265263 + salt * 2246822519;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Size multiplier of the tree on tile (i, j), 0.8-1.2. */
export function treeScale(terrain: Terrain, i: number, j: number): number {
  return 0.8 + 0.4 * tileHash(terrain, i, j);
}

/** Whether a body of horizontal radius `radius` at (x, y, z) overlaps any tree. */
export function hitsTree(terrain: Terrain, x: number, y: number, z: number, radius: number): boolean {
  return treeHit(terrain, x, y, z, radius) !== null;
}

/**
 * The tile of a tree that a body of horizontal radius `radius` at (x, y, z) overlaps, or null.
 * Only the 3x3 tiles around the point can hold a tree close enough to touch it.
 */
export function treeHit(
  terrain: Terrain,
  x: number,
  y: number,
  z: number,
  radius: number,
): { i: number; j: number; kind: Exclude<TreeKind, typeof TREE_NONE> } | null {
  const ci = Math.floor(x);
  const cj = Math.floor(z);
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const kind = terrain.treeAt(i, j);
      if (kind === TREE_NONE) continue;
      const shape = TREE_SHAPES[kind];
      const scale = treeScale(terrain, i, j);
      const base = treeBase(terrain, i, j);
      if (Math.hypot(x - base.x, z - base.z) >= shape.radius * scale + radius) continue;
      if (y < base.y + shape.height * scale) return { i, j, kind };
    }
  }
  return null;
}

const smoothstep = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * Seeds forests over the land: a coarse noise layer decides where woods are, `density`
 * (0-1) how thick they get. Pines favour high ground, round trees the lowlands.
 * The pad and the ring of tiles around it stay clear. Uses its own random stream,
 * so tree placement never changes the heights generated from the same seed.
 */
export function plantTrees(terrain: Terrain, seed: number, density: number): void {
  const n = terrain.size;
  const rng = createRng(seed ^ 0x5eed7ee5);
  const forest = valueNoise(rng, n, 8);
  const maxHeight = Math.max(1e-6, ...terrain.heights);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      terrain.setTree(i, j, TREE_NONE);
      if (terrain.tileType(i, j) !== 'land' || nearPad(terrain, i, j)) continue;
      // Draw both numbers for every tile so one tile's outcome never shifts the others.
      const grow = rng();
      const pick = rng();
      if (grow >= density * smoothstep(0.4, 0.7, forest[j * n + i]!)) continue;
      const altitude = treeBase(terrain, i, j).y / maxHeight;
      terrain.setTree(i, j, pick < 0.15 + 0.75 * altitude ? TREE_PINE : TREE_ROUND);
    }
  }
}

function nearPad(terrain: Terrain, i: number, j: number): boolean {
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) if (terrain.isPadTile(i + di, j + dj)) return true;
  }
  return false;
}
