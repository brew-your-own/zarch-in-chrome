import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import { SUN } from './lighting';
import type { Palette } from './palette';

/** Tiles drawn around the craft. The camera looks north (-z), so more rows lie ahead. */
export const HALF_WIDTH = 12;
export const ROWS_AHEAD = 18;
export const ROWS_BEHIND = 6;

const COLS = 2 * HALF_WIDTH + 1;
const ROWS = ROWS_AHEAD + ROWS_BEHIND + 1;
const VERTS_PER_TILE = 6;

const AMBIENT = 0.45;

/**
 * The visible patch of terrain, rebuilt every frame around the craft.
 * Shading is computed per triangle on the CPU for a flat-shaded look,
 * using the same diagonal split as `Terrain.heightAt`.
 */
export class TerrainView {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();

  private readonly base = new THREE.Color();

  constructor(
    private readonly terrain: Terrain,
    private readonly palette: Palette,
  ) {
    const count = COLS * ROWS * VERTS_PER_TILE;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.mesh.frustumCulled = false;
  }

  update(centreX: number, centreZ: number): void {
    const ci = Math.floor(centreX);
    const cj = Math.floor(centreZ);
    const t = this.terrain;
    let v = 0;
    const tmp = new THREE.Color();

    const put = (x: number, y: number, z: number, c: THREE.Color) => {
      this.positions[v * 3] = x;
      this.positions[v * 3 + 1] = y;
      this.positions[v * 3 + 2] = z;
      this.colors[v * 3] = c.r;
      this.colors[v * 3 + 1] = c.g;
      this.colors[v * 3 + 2] = c.b;
      v++;
    };

    const shade = (base: THREE.Color, dx: number, dz: number) => {
      // Normal of a triangle with height slopes dx (along x) and dz (along z).
      const len = Math.hypot(dx, 1, dz);
      const lambert = Math.max(0, (-dx * SUN.x + SUN.y - dz * SUN.z) / len);
      return tmp.copy(base).multiplyScalar(AMBIENT + (1 - AMBIENT) * lambert);
    };

    for (let j = cj - ROWS_AHEAD; j <= cj + ROWS_BEHIND; j++) {
      for (let i = ci - HALF_WIDTH; i <= ci + HALF_WIDTH; i++) {
        const h00 = t.vertexHeight(i, j);
        const h10 = t.vertexHeight(i + 1, j);
        const h01 = t.vertexHeight(i, j + 1);
        const h11 = t.vertexHeight(i + 1, j + 1);
        const base = this.palette.tile(i, j, this.base);

        // Triangle (00, 11, 10): the fx >= fz half.
        let c = shade(base, h10 - h00, h11 - h10);
        put(i, h00, j, c);
        put(i + 1, h11, j + 1, c);
        put(i + 1, h10, j, c);

        // Triangle (00, 01, 11): the fz > fx half.
        c = shade(base, h11 - h01, h01 - h00);
        put(i, h00, j, c);
        put(i, h01, j + 1, c);
        put(i + 1, h11, j + 1, c);
      }
    }

    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
  }
}
