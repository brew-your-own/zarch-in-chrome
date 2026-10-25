import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import { TREE_NONE } from '../sim/trees';
import { SUN } from './lighting';
import type { Palette } from './palette';

/** Forest pixels show the foliage colour, darkened. */
const CANOPY_SHADE = 0.75;

/**
 * Draws a top-down map of the whole terrain into `canvas`: one pixel per tile,
 * scaled up without smoothing. North (-z) is up, matching the in-game camera.
 * Colours come from `palette`; land is hill-shaded and lightened with altitude.
 * `marker` (world x/z) is drawn as the craft's position, wrapped onto the map.
 */
export function drawMinimap(
  canvas: HTMLCanvasElement,
  terrain: Terrain,
  palette: Palette,
  marker?: { x: number; z: number },
): void {
  const n = terrain.size;
  const tiles = document.createElement('canvas');
  tiles.width = tiles.height = n;
  const tilesCtx = tiles.getContext('2d')!;
  const image = tilesCtx.createImageData(n, n);
  const maxHeight = Math.max(1e-6, ...terrain.heights);
  const colour = new THREE.Color();

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      palette.tile(i, j, colour, false);
      if (terrain.tileType(i, j) === 'land') {
        const tree = terrain.treeAt(i, j);
        if (tree !== TREE_NONE) palette.foliage(i, j, tree, colour).multiplyScalar(CANOPY_SHADE);
        const altitude = terrain.heightAt(i + 0.5, j + 0.5) / maxHeight;
        const nrm = terrain.normalAt(i + 0.7, j + 0.3);
        const lit = 0.55 + 0.45 * Math.max(0, nrm.x * SUN.x + nrm.y * SUN.y + nrm.z * SUN.z);
        colour.multiplyScalar(lit * (0.75 + 0.45 * altitude));
      }
      colour.convertLinearToSRGB();
      const o = (j * n + i) * 4;
      image.data[o] = colour.r * 255;
      image.data[o + 1] = colour.g * 255;
      image.data[o + 2] = colour.b * 255;
      image.data[o + 3] = 255;
    }
  }
  tilesCtx.putImageData(image, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiles, 0, 0, canvas.width, canvas.height);

  if (marker) {
    const scale = canvas.width / n;
    const x = (((marker.x % n) + n) % n) * scale;
    const y = (((marker.z % n) + n) % n) * scale;
    const r = Math.max(3, scale * 1.5);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
}
