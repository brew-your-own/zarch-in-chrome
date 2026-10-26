import { placeVillages, type Building } from './buildings';
import { valueNoise } from './noise';
import { createRng } from './rng';
import { plantTrees, type TreeKind } from './trees';

export type TileType = 'sea' | 'land' | 'pad';

export interface PadRect {
  /** Tile coordinates of the pad's first (min x, min z) tile. */
  i: number;
  j: number;
  /** Size in tiles. */
  w: number;
  h: number;
}

export const SEA_LEVEL = 0;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Square heightmap of `size` x `size` vertices, one world unit per tile.
 * The world wraps in both x and z, so tile/vertex lookups take any integer
 * and world coordinates are unbounded.
 *
 * Each tile is split into two triangles along the (0,0)-(1,1) diagonal;
 * `heightAt` and the renderer must agree on this split.
 *
 * Each tile can also hold one tree (see `trees.ts`), stored per tile in `trees`, or one
 * building (see `buildings.ts`), listed in `buildings`, and be infected by the virus
 * (see `virus.ts`), stored per tile in `infection`.
 */
export class Terrain {
  readonly trees: Uint8Array;
  readonly infection: Uint8Array;
  readonly buildings: Building[] = [];
  /** Per tile, 1 + the index in `buildings` of the building there, or 0. */
  private readonly buildingIndex: Uint16Array;
  /** Number of infected tiles. */
  infectedCount = 0;
  private landTiles = -1;

  constructor(
    readonly size: number,
    readonly heights: Float32Array,
    readonly pad: PadRect,
  ) {
    if (heights.length !== size * size) {
      throw new Error(`expected ${size * size} heights, got ${heights.length}`);
    }
    this.trees = new Uint8Array(size * size);
    this.infection = new Uint8Array(size * size);
    this.buildingIndex = new Uint16Array(size * size);
  }

  /** Wraps a world coordinate into [0, size). */
  wrap(v: number): number {
    return mod(v, this.size);
  }

  /** Shortest signed distance from `a` to `b` along one axis of the wrapping world. */
  delta(a: number, b: number): number {
    const d = mod(b - a, this.size);
    return d > this.size / 2 ? d - this.size : d;
  }

  isInfected(i: number, j: number): boolean {
    return this.infection[mod(j, this.size) * this.size + mod(i, this.size)] === 1;
  }

  /** Only land can catch the virus; sea and the launch pad are immune. */
  canInfect(i: number, j: number): boolean {
    return this.tileType(i, j) === 'land' && !this.isInfected(i, j);
  }

  /** Infects tile (i, j) if it can be infected; returns whether it was. */
  infect(i: number, j: number): boolean {
    if (!this.canInfect(i, j)) return false;
    this.infection[mod(j, this.size) * this.size + mod(i, this.size)] = 1;
    this.infectedCount++;
    return true;
  }

  /** Clears the virus from tile (i, j), if it had it. */
  disinfect(i: number, j: number): void {
    const k = mod(j, this.size) * this.size + mod(i, this.size);
    if (this.infection[k] !== 1) return;
    this.infection[k] = 0;
    this.infectedCount--;
  }

  /** The building on tile (i, j), if any. */
  buildingAt(i: number, j: number): Building | undefined {
    const k = this.buildingIndex[mod(j, this.size) * this.size + mod(i, this.size)]!;
    return k === 0 ? undefined : this.buildings[k - 1];
  }

  addBuilding(b: Building): void {
    this.buildings.push(b);
    this.buildingIndex[mod(b.j, this.size) * this.size + mod(b.i, this.size)] = this.buildings.length;
  }

  /** Share of land tiles infected, 0-1. */
  infectedFraction(): number {
    if (this.landTiles < 0) {
      this.landTiles = 0;
      for (let j = 0; j < this.size; j++) for (let i = 0; i < this.size; i++) if (this.tileType(i, j) === 'land') this.landTiles++;
    }
    return this.landTiles === 0 ? 0 : this.infectedCount / this.landTiles;
  }

  /** Builds a treeless terrain from rows of heights (row index = z), handy for tests. */
  static fromRows(rows: number[][], pad: PadRect): Terrain {
    const size = rows.length;
    const heights = new Float32Array(size * size);
    rows.forEach((row, j) => {
      if (row.length !== size) throw new Error('terrain rows must be square');
      row.forEach((h, i) => (heights[j * size + i] = h));
    });
    return new Terrain(size, heights, pad);
  }

  vertexHeight(i: number, j: number): number {
    return this.heights[mod(j, this.size) * this.size + mod(i, this.size)]!;
  }

  treeAt(i: number, j: number): TreeKind {
    return this.trees[mod(j, this.size) * this.size + mod(i, this.size)]! as TreeKind;
  }

  setTree(i: number, j: number, kind: TreeKind): void {
    this.trees[mod(j, this.size) * this.size + mod(i, this.size)] = kind;
  }

  /** Height of the terrain surface at world position (x, z). */
  heightAt(x: number, z: number): number {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = x - i;
    const fz = z - j;
    const h00 = this.vertexHeight(i, j);
    const h11 = this.vertexHeight(i + 1, j + 1);
    if (fx >= fz) {
      const h10 = this.vertexHeight(i + 1, j);
      return h00 + fx * (h10 - h00) + fz * (h11 - h10);
    }
    const h01 = this.vertexHeight(i, j + 1);
    return h00 + fz * (h01 - h00) + fx * (h11 - h01);
  }

  /** Unit surface normal at (x, z), from the triangle under that point. */
  normalAt(x: number, z: number): { x: number; y: number; z: number } {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const h00 = this.vertexHeight(i, j);
    const h11 = this.vertexHeight(i + 1, j + 1);
    let dx: number;
    let dz: number;
    if (x - i >= z - j) {
      const h10 = this.vertexHeight(i + 1, j);
      dx = h10 - h00;
      dz = h11 - h10;
    } else {
      const h01 = this.vertexHeight(i, j + 1);
      dz = h01 - h00;
      dx = h11 - h01;
    }
    const len = Math.hypot(dx, 1, dz);
    return { x: -dx / len, y: 1 / len, z: -dz / len };
  }

  isPadTile(i: number, j: number): boolean {
    const { pad, size } = this;
    return mod(i - pad.i, size) < pad.w && mod(j - pad.j, size) < pad.h;
  }

  tileType(i: number, j: number): TileType {
    if (this.isPadTile(i, j)) return 'pad';
    const atSea =
      this.vertexHeight(i, j) <= SEA_LEVEL &&
      this.vertexHeight(i + 1, j) <= SEA_LEVEL &&
      this.vertexHeight(i, j + 1) <= SEA_LEVEL &&
      this.vertexHeight(i + 1, j + 1) <= SEA_LEVEL;
    return atSea ? 'sea' : 'land';
  }

  tileTypeAt(x: number, z: number): TileType {
    return this.tileType(Math.floor(x), Math.floor(z));
  }

  /** World position of the centre of the launch pad surface. */
  padCentre(): { x: number; y: number; z: number } {
    const x = this.pad.i + this.pad.w / 2;
    const z = this.pad.j + this.pad.h / 2;
    return { x, y: this.heightAt(x, z), z };
  }
}

export interface TerrainOptions {
  /** Vertices per side; must be divisible by every octave cell size. */
  size?: number;
  /** Peak-to-trough scale of the hills, in world units. */
  amplitude?: number;
  /** Shifts the landscape down so lower areas flood into sea. */
  seaBias?: number;
  /** Weight of each finer noise octave relative to the previous one; higher is bumpier. */
  roughness?: number;
  /** How thickly forests grow, 0-1. 0 means no trees. */
  treeDensity?: number;
  /** Villages to build (fewer if the land has no room). */
  villages?: number;
}

/** Noise cell sizes in tiles, coarsest first. */
const OCTAVE_CELLS = [16, 8, 4];

/**
 * Seeded, wrapping value-noise landscape with a flat launch pad in the middle, forests and villages.
 * The same seed always produces the same terrain.
 */
export function generateTerrain(seed: number, options: TerrainOptions = {}): Terrain {
  const { size = 64, amplitude = 4, seaBias = 0.35, roughness = 0.5, treeDensity = 0.5, villages = 4 } = options;
  const rng = createRng(seed);
  const heights = new Float32Array(size * size);
  const octaves = OCTAVE_CELLS.map((cell, k) => ({ cell, weight: roughness ** k }));
  const totalWeight = octaves.reduce((sum, o) => sum + o.weight, 0);

  for (const { cell, weight } of octaves) {
    const noise = valueNoise(rng, size, cell);
    for (let k = 0; k < heights.length; k++) heights[k]! += (weight / totalWeight) * noise[k]!;
  }

  for (let k = 0; k < heights.length; k++) {
    heights[k] = Math.max(SEA_LEVEL, (heights[k]! - seaBias) * amplitude);
  }

  // Flatten a 3x3-tile launch pad in the middle, raised a little above sea level.
  const pad: PadRect = { i: size / 2 - 1, j: size / 2 - 1, w: 3, h: 3 };
  let sum = 0;
  for (let j = pad.j; j <= pad.j + pad.h; j++) {
    for (let i = pad.i; i <= pad.i + pad.w; i++) sum += heights[j * size + i]!;
  }
  const padHeight = Math.max(SEA_LEVEL + 0.5, sum / ((pad.w + 1) * (pad.h + 1)));
  for (let j = pad.j; j <= pad.j + pad.h; j++) {
    for (let i = pad.i; i <= pad.i + pad.w; i++) heights[j * size + i] = padHeight;
  }

  const terrain = new Terrain(size, heights, pad);
  plantTrees(terrain, seed, treeDensity);
  placeVillages(terrain, seed, villages);
  return terrain;
}
