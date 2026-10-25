import { terrainImage } from '../render/minimap';
import type { Palette } from '../render/palette';
import type { CraftState } from '../sim/craft';
import type { EnemyState } from '../sim/enemies';
import type { Terrain } from '../sim/terrain';

/** Seconds between redraws of the terrain layer (infection and felled trees change slowly). */
const TERRAIN_REFRESH = 0.5;

/**
 * Live map in a corner of the screen: the whole wrapping world centred on the craft,
 * north up like the camera. The terrain layer is cached and refreshed periodically;
 * the craft, pad and seeders are redrawn every frame.
 */
export class Scanner {
  private readonly ctx: CanvasRenderingContext2D;
  private image?: HTMLCanvasElement;
  private imageFor?: { terrain: Terrain; palette: Palette };
  private imageAge = Infinity;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** `dt` is the frame time, used to pace terrain refreshes. */
  update(terrain: Terrain, palette: Palette, craft: CraftState, enemies: EnemyState, dt: number): void {
    this.imageAge += dt;
    const stale = this.imageFor?.terrain !== terrain || this.imageFor.palette !== palette;
    if (!this.image || stale || this.imageAge >= TERRAIN_REFRESH) {
      this.image = terrainImage(terrain, palette);
      this.imageFor = { terrain, palette };
      this.imageAge = 0;
    }

    const { ctx, canvas } = this;
    const size = canvas.width;
    const scale = size / terrain.size;
    const half = size / 2;
    const toScreen = (x: number, z: number) =>
      [half + terrain.delta(craft.pos.x, x) * scale, half + terrain.delta(craft.pos.z, z) * scale] as const;

    // Tile the map so the craft sits at the centre whatever its position on the wrap.
    ctx.imageSmoothingEnabled = false;
    const ox = half - terrain.wrap(craft.pos.x) * scale;
    const oy = half - terrain.wrap(craft.pos.z) * scale;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) ctx.drawImage(this.image, ox + dx, oy + dy, size, size);
    }

    // Launch pad outline.
    const pad = terrain.pad;
    const [px, py] = toScreen(pad.i, pad.j);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(px - 1, py - 1, pad.w * scale + 2, pad.h * scale + 2);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(px, py, pad.w * scale, pad.h * scale);

    for (const s of enemies.seeders) {
      const [x, y] = toScreen(s.pos.x, s.pos.z);
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#e050ff';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    // The craft: an arrow along its heading (0 = north = up).
    if (craft.status !== 'crashed') {
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(craft.heading);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = '#ff0';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }
}
