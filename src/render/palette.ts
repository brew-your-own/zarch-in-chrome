import * as THREE from 'three';
import { valueNoise } from '../sim/noise';
import { createRng } from '../sim/rng';
import type { Terrain } from '../sim/terrain';
import { TREE_PALM, TREE_PINE, tileHash, type TreeKind } from '../sim/trees';

/** Colour scheme knobs, all 0-1. Purely visual: nothing in the sim reads them. */
export interface ColourSettings {
  /** Share of round trees in autumn colours (pines stay evergreen). */
  autumn: number;
  /** Grass hue: 0 green, 0.5 olive, 1 ochre. */
  grassTone: number;
  /** How much of the land is covered in rust/orange/brown patches. */
  patches: number;
}

export const COLOUR_PRESETS = {
  summer: { name: 'Summer', colours: { autumn: 0, grassTone: 0, patches: 0.1 } },
  early: { name: 'Early autumn', colours: { autumn: 0.45, grassTone: 0.3, patches: 0.3 } },
  late: { name: 'Late autumn', colours: { autumn: 0.85, grassTone: 0.65, patches: 0.55 } },
} as const satisfies Record<string, { name: string; colours: ColourSettings }>;

export const DEFAULT_COLOURS: Readonly<ColourSettings> = Object.freeze({ ...COLOUR_PRESETS.early.colours });

export const GRASS = [new THREE.Color(0x3fbf3a), new THREE.Color(0x8fae3c), new THREE.Color(0xc9a040)];
const PATCHES = [new THREE.Color(0xb5541e), new THREE.Color(0xd9792a), new THREE.Color(0x8a5a2b)];
const SEA = [new THREE.Color(0x1d3fbf), new THREE.Color(0x2449d6)];
export const PAD = [new THREE.Color(0x9a9a9a), new THREE.Color(0xb4b4b4)];
/** The title screen's lettering, pale stone, on a slab of dark stone: both clear of the grey pad. */
const LETTERING = new THREE.Color(0xf2e8c9);
const SLAB = new THREE.Color(0x3b4250);
export const PINE = new THREE.Color(0x24753a);
/** Palm fronds stay green whatever the season. */
export const PALM = new THREE.Color(0x3f9a2e);
export const SUMMER_LEAVES = new THREE.Color(0x5aa83a);
export const AUTUMN_LEAVES = [0xd9b52a, 0xe5862a, 0xd0502a, 0xa8321e].map((c) => new THREE.Color(c));
/** The virus: a crimson-magenta kept clear of the brick-red autumn leaves. */
export const VIRUS = new THREE.Color(0xd8185a);
export const VIRUS_LEAVES = new THREE.Color(0xa0104a);
/** Odd checkerboard tiles are this much darker. */
export const CHECKER_DARK = 0.82;

/**
 * Colours for one terrain under the current (live, mutable) colour settings.
 * The patch layout is fixed per terrain; everything else is recomputed on each call,
 * so slider changes show up on the next frame.
 */
export class Palette {
  private readonly patchAmount: Float32Array;
  private readonly patchKind: Float32Array;

  /**
   * `letters`, if given, paints tiles (row-major) as on the title map: 1 for lettering,
   * 2 for the slab it stands on. Neither is checkered, so the letters read clearly.
   */
  constructor(
    private readonly terrain: Terrain,
    private readonly colours: ColourSettings,
    private readonly letters: Uint8Array | null = null,
  ) {
    // Seed from the terrain itself so each map gets its own patch layout.
    let seed = terrain.size;
    for (let k = 0; k < terrain.heights.length; k += 7) seed = (Math.imul(seed, 31) + Math.round(terrain.heights[k]! * 1000)) | 0;
    const rng = createRng(seed);
    const coarse = valueNoise(rng, terrain.size, 8);
    const fine = valueNoise(rng, terrain.size, 4);
    this.patchAmount = coarse.map((c, k) => 0.7 * c + 0.3 * fine[k]!);
    this.patchKind = valueNoise(rng, terrain.size, 16);
  }

  /** Base colour of tile (i, j) before lighting; `checker` darkens alternate tiles. */
  tile(i: number, j: number, out: THREE.Color, checker = true): THREE.Color {
    const t = this.terrain;
    const parity = checker ? (i + j) & 1 : 0;
    const type = t.tileType(i, j);
    if (type === 'sea') return out.copy(SEA[parity]!);
    if (type === 'pad') return out.copy(PAD[parity]!);

    const n = t.size;
    const k = (((j % n) + n) % n) * n + (((i % n) + n) % n);
    if (t.isInfected(i, j)) {
      out.copy(VIRUS);
    } else if (this.letters?.[k] === 1) {
      return out.copy(LETTERING);
    } else if (this.letters?.[k] === 2) {
      return out.copy(SLAB);
    } else if (this.patchAmount[k]! > 1 - 0.6 * this.colours.patches) {
      out.copy(PATCHES[Math.min(PATCHES.length - 1, Math.floor(this.patchKind[k]! * PATCHES.length))]!);
    } else {
      grass(this.colours.grassTone, out);
    }
    return parity ? out.multiplyScalar(CHECKER_DARK) : out;
  }

  /** Foliage colour of the tree on tile (i, j); trees on infected land take the virus colour. */
  foliage(i: number, j: number, kind: TreeKind, out: THREE.Color): THREE.Color {
    if (this.terrain.isInfected(i, j)) return out.copy(VIRUS_LEAVES);
    if (kind === TREE_PINE) return out.copy(PINE);
    if (kind === TREE_PALM) return out.copy(PALM);
    if (tileHash(this.terrain, i, j, 3) >= this.colours.autumn) return out.copy(SUMMER_LEAVES);
    return out.copy(AUTUMN_LEAVES[Math.floor(tileHash(this.terrain, i, j, 4) * AUTUMN_LEAVES.length)]!);
  }
}

function grass(tone: number, out: THREE.Color): THREE.Color {
  const f = Math.min(1, Math.max(0, tone)) * (GRASS.length - 1);
  const k = Math.min(GRASS.length - 2, Math.floor(f));
  return out.copy(GRASS[k]!).lerp(GRASS[k + 1]!, f - k);
}
