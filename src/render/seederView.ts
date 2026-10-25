import * as THREE from 'three';
import type { EnemyState, Seeder } from '../sim/enemies';
import type { Terrain } from '../sim/terrain';
import { VIRUS } from './palette';
import { HALF_WIDTH, ROWS_AHEAD, ROWS_BEHIND } from './terrainView';

const CAPACITY = 64;
const SPIN = 2.5; // rad/s
const RADIUS = 0.38;
const SHADOW_LIFT = 0.02;
const FACE_COLOURS = [0xb040e0, 0xf0d020];

/** A squat spinning top: a flattened octahedron with alternating purple and yellow faces. */
function seederGeometry(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(RADIUS, 0).toNonIndexed();
  g.scale(1, 0.45, 1);
  const colours = new Float32Array(g.attributes.position!.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < colours.length / 9; f++) {
    c.setHex(FACE_COLOURS[f % 2]!);
    for (let v = 0; v < 3; v++) colours.set([c.r, c.g, c.b], f * 9 + v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * Seeders, their shadows (straight down, like the craft's) and falling spores.
 * Enemy positions are wrapped into the world; each is drawn at its wrapped position
 * nearest the camera focus, and only within the visible terrain patch.
 */
export class SeederView {
  readonly seeders: THREE.InstancedMesh;
  readonly shadows: THREE.Mesh;
  readonly spores: THREE.Points;
  private readonly geometry = seederGeometry();
  private readonly shadowPositions = new Float32Array(CAPACITY * 6 * 3);
  private readonly sporePositions = new Float32Array(CAPACITY * 8 * 3);
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly position = new THREE.Vector3();

  constructor(private readonly terrain: Terrain) {
    this.seeders = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      CAPACITY,
    );
    this.seeders.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.seeders.frustumCulled = false;

    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(this.shadowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.shadows = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.shadows.frustumCulled = false;

    const sporeGeometry = new THREE.BufferGeometry();
    sporeGeometry.setAttribute('position', new THREE.BufferAttribute(this.sporePositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.spores = new THREE.Points(sporeGeometry, new THREE.PointsMaterial({ color: VIRUS, size: 0.12 }));
    this.spores.frustumCulled = false;
  }

  /** `focus` is the (unwrapped) point the camera follows; `time` drives the spin. */
  update(enemies: EnemyState, focus: { x: number; z: number }, time: number): void {
    let n = 0;
    let shadowVerts = 0;
    for (const s of enemies.seeders) {
      if (n >= CAPACITY || !this.near(s.pos, focus, this.position)) continue;
      this.pose(s, focus, time, this.matrix);
      this.seeders.setMatrixAt(n++, this.matrix);
      shadowVerts = this.castShadow(this.position.x, this.position.z, time + s.id, shadowVerts);
    }
    this.seeders.count = n;
    this.seeders.instanceMatrix.needsUpdate = true;
    this.shadows.geometry.setDrawRange(0, shadowVerts);
    this.shadows.geometry.attributes.position!.needsUpdate = true;

    let spores = 0;
    for (const spore of enemies.spores) {
      if (spores >= CAPACITY * 8 || !this.near(spore.pos, focus, this.position)) continue;
      this.sporePositions.set([this.position.x, this.position.y, this.position.z], spores++ * 3);
    }
    this.spores.geometry.setDrawRange(0, spores);
    this.spores.geometry.attributes.position!.needsUpdate = true;
  }

  /** The seeder as a coloured non-indexed geometry plus world pose near `focus`, for shattering. */
  shape(s: Seeder, focus: { x: number; z: number }, time: number): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    return { geometry: this.geometry, matrix: this.pose(s, focus, time, new THREE.Matrix4()) };
  }

  private pose(s: Seeder, focus: { x: number; z: number }, time: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.position.set(focus.x + this.terrain.delta(focus.x, s.pos.x), s.pos.y, focus.z + this.terrain.delta(focus.z, s.pos.z));
    this.quaternion.setFromAxisAngle(this.up, (time + s.id) * SPIN);
    return out.compose(this.position, this.quaternion, this.one);
  }

  /** Writes the wrapped position of `pos` nearest `focus` into `out`; false if outside the drawn patch. */
  private near(pos: { x: number; y: number; z: number }, focus: { x: number; z: number }, out: THREE.Vector3): boolean {
    const dx = this.terrain.delta(focus.x, pos.x);
    const dz = this.terrain.delta(focus.z, pos.z);
    out.set(focus.x + dx, pos.y, focus.z + dz);
    return Math.abs(dx) <= HALF_WIDTH && dz >= -ROWS_AHEAD && dz <= ROWS_BEHIND + 1;
  }

  /** A diamond footprint under the seeder, turning with it, draped on the terrain. */
  private castShadow(x: number, z: number, angle: number, start: number): number {
    const corners = [0, 1, 2, 3].map((k) => {
      const a = angle * SPIN + (k * Math.PI) / 2;
      const cx = x + Math.cos(a) * RADIUS;
      const cz = z - Math.sin(a) * RADIUS; // same handedness as the mesh's rotation about +y
      return [cx, this.terrain.heightAt(cx, cz) + SHADOW_LIFT, cz];
    });
    let v = start;
    for (const k of [0, 1, 2, 0, 2, 3]) this.shadowPositions.set(corners[k]!, v++ * 3);
    return v;
  }
}
