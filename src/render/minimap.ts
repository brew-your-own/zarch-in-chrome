import type { Terrain } from '../sim/terrain';
import { TREE_NONE, TREE_PINE } from '../sim/trees';

const SEA = [36, 73, 214];
const PAD = [180, 180, 180];
const LOW = [40, 120, 40];
const HIGH = [190, 230, 120];
const LIGHT = { x: -0.5, y: 1, z: 0.35 };
const LIGHT_LEN = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);

/**
 * Draws a top-down map of the whole terrain into `canvas`: one pixel per tile,
 * scaled up without smoothing. North (-z) is up, matching the in-game camera.
 * `marker` (world x/z) is drawn as the craft's position, wrapped onto the map.
 */
export function drawMinimap(canvas: HTMLCanvasElement, terrain: Terrain, marker?: { x: number; z: number }): void {
  const n = terrain.size;
  const tiles = document.createElement('canvas');
  tiles.width = tiles.height = n;
  const tilesCtx = tiles.getContext('2d')!;
  const image = tilesCtx.createImageData(n, n);
  const maxHeight = Math.max(1e-6, ...terrain.heights);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const type = terrain.tileType(i, j);
      let rgb: number[];
      if (type === 'sea') rgb = SEA;
      else if (type === 'pad') rgb = PAD;
      else {
        const h = terrain.heightAt(i + 0.5, j + 0.5) / maxHeight;
        const nrm = terrain.normalAt(i + 0.7, j + 0.3);
        const lit = 0.55 + 0.45 * Math.max(0, (nrm.x * LIGHT.x + nrm.y * LIGHT.y + nrm.z * LIGHT.z) / LIGHT_LEN);
        const tree = terrain.treeAt(i, j);
        // Forests read as darker patches; pines darker still.
        const canopy = tree === TREE_NONE ? 1 : tree === TREE_PINE ? 0.5 : 0.68;
        rgb = LOW.map((c, k) => (c + (HIGH[k]! - c) * h) * lit * canopy);
      }
      const o = (j * n + i) * 4;
      image.data[o] = rgb[0]!;
      image.data[o + 1] = rgb[1]!;
      image.data[o + 2] = rgb[2]!;
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
