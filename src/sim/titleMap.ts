import { generateTerrain, type Terrain } from './terrain';
import { TREE_NONE } from './trees';

/** Pixel font for the title, one string per row, `#` for a lit pixel. */
const FONT: Record<string, readonly string[]> = {
  Z: ['###', '..#', '.#.', '#..', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
};
const WORD = 'ZARCH';
const LETTER_WIDTH = 3;
const LETTER_GAP = 1;
const FONT_ROWS = 5;
/**
 * Each font pixel is one tile wide and two deep: the camera looks down at a slant, which
 * squashes the letters front to back, and the doubled rows make up for it.
 */
const ROW_TILES = 2;

const SIZE = 32;
const SEED = 1987;
/** The plinth stands this far above the highest ground under it. */
const PLINTH_RISE = 0.8;
/** Letter tiles are raised this much more, so their edges catch the light. */
const EMBOSS = 0.35;
/** Tiles of plinth around the letters. */
const MARGIN = 1;
const LETTER = 1;
const PLINTH = 2;

export const TITLE_WIDTH = WORD.length * LETTER_WIDTH + (WORD.length - 1) * LETTER_GAP;
export const TITLE_DEPTH = FONT_ROWS * ROW_TILES;

export interface TitleMap {
  terrain: Terrain;
  /** Per tile (row-major, like `Terrain.trees`): 1 where the word is written, 2 for the rest of the plinth, else 0. */
  letters: Uint8Array;
  /** Centre of the word, in world coordinates. */
  centre: { x: number; y: number; z: number };
}

/** Whether column `x`, row `y` of the word's pixel grid is lit. */
function lit(x: number, y: number): boolean {
  const letter = Math.floor(x / (LETTER_WIDTH + LETTER_GAP));
  const col = x % (LETTER_WIDTH + LETTER_GAP);
  if (col >= LETTER_WIDTH) return false;
  return FONT[WORD[letter]!]![y]![col] === '#';
}

/**
 * The title screen's world: a small, gentle map with the word ZARCH written on a raised
 * plinth north of the launch pad, so the camera sees it over the craft. Trees are cleared
 * from the plinth and the ground just around it.
 */
export function buildTitleMap(): TitleMap {
  const terrain = generateTerrain(SEED, { size: SIZE, amplitude: 3, seaBias: 0.3, treeDensity: 0.6 });
  const n = terrain.size;
  const letters = new Uint8Array(n * n);
  // The word sits centred on the pad's x, a few rows clear of the pad's north edge.
  const i0 = Math.round(terrain.padCentre().x - TITLE_WIDTH / 2);
  const j0 = terrain.pad.j - 3 - TITLE_DEPTH;
  for (let y = 0; y < TITLE_DEPTH; y++) {
    for (let x = 0; x < TITLE_WIDTH; x++) {
      if (lit(x, Math.floor(y / ROW_TILES))) letters[(j0 + y) * n + i0 + x] = LETTER;
    }
  }

  // Plinth: every vertex of the tiles from (i0, j0) to the far corner, plus the margin.
  const vi0 = i0 - MARGIN;
  const vj0 = j0 - MARGIN;
  const vi1 = i0 + TITLE_WIDTH + MARGIN;
  const vj1 = j0 + TITLE_DEPTH + MARGIN;
  let top = terrain.padCentre().y;
  for (let j = vj0; j <= vj1; j++) for (let i = vi0; i <= vi1; i++) top = Math.max(top, terrain.vertexHeight(i, j));
  const plinth = top + PLINTH_RISE;
  const letterAt = (i: number, j: number) => letters[(((j % n) + n) % n) * n + (((i % n) + n) % n)] === LETTER;
  for (let j = vj0; j <= vj1; j++) {
    for (let i = vi0; i <= vi1; i++) {
      // A vertex rises by the share of its four tiles that are part of a letter.
      const share = (Number(letterAt(i - 1, j - 1)) + Number(letterAt(i, j - 1)) + Number(letterAt(i - 1, j)) + Number(letterAt(i, j))) / 4;
      terrain.heights[j * n + i] = plinth + EMBOSS * share;
    }
  }
  for (let j = vj0; j < vj1; j++) for (let i = vi0; i < vi1; i++) if (letters[j * n + i] === 0) letters[j * n + i] = PLINTH;
  for (let j = vj0 - 1; j <= vj1; j++) for (let i = vi0 - 1; i <= vi1; i++) terrain.setTree(i, j, TREE_NONE);

  return { terrain, letters, centre: { x: i0 + TITLE_WIDTH / 2, y: plinth, z: j0 + TITLE_DEPTH / 2 } };
}

/** Share of the word's tiles the virus has taken, 0-1. */
export function lettersInfected(terrain: Terrain, letters: Uint8Array): number {
  let total = 0;
  let infected = 0;
  for (let k = 0; k < letters.length; k++) {
    if (letters[k] !== LETTER) continue;
    total++;
    if (terrain.infection[k] === 1) infected++;
  }
  return total === 0 ? 0 : infected / total;
}
