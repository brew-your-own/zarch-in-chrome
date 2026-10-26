import * as THREE from 'three';
import type { EnemyState } from '../sim/enemies';
import type { Pest } from '../sim/pests';
import type { Terrain } from '../sim/terrain';
import { HALF_WIDTH, ROWS_AHEAD, ROWS_BEHIND } from './terrainView';

const CAPACITY = 48;
const SHADOW_LIFT = 0.02;
/** The shadow is a small diamond this wide. */
const SHADOW_SIZE = 0.16;

const HEAD = 0xf0c020;
const TAIL = 0x2a2410;
const WING = 0xc8d8f0;

/** A low-poly wasp, nose along -z: a yellow head, a dark tail and a pair of pale wings. */
export function pestGeometry(): THREE.BufferGeometry {
  const nose = [0, 0, -0.2];
  const tail = [0, -0.02, 0.22];
  const waist = 0.02;
  const [l, r, t, b] = [[-0.09, 0, waist], [0.09, 0, waist], [0, 0.08, waist], [0, -0.08, waist]];
  const faces: [number[], number[], number[], number][] = [
    [nose, l, t, HEAD], [nose, t, r, HEAD], [nose, r, b, HEAD], [nose, b, l, HEAD],
    [tail, t, l, TAIL], [tail, r, t, TAIL], [tail, b, r, TAIL], [tail, l, b, TAIL],
    // Wings, swept back and tilted up a little.
    [[-0.04, 0.06, -0.02], [-0.3, 0.12, 0.06], [-0.04, 0.06, 0.12], WING],
    [[0.04, 0.06, -0.02], [0.04, 0.06, 0.12], [0.3, 0.12, 0.06], WING],
  ];
  const positions: number[] = [];
  const colours: number[] = [];
  const c = new THREE.Color();
  for (const [a, bb, d, colour] of faces) {
    positions.push(...a, ...bb, ...d);
    c.setHex(colour);
    for (let v = 0; v < 3; v++) colours.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Pests as little wasps facing along their flight and buzzing (a fast wobble), each with a
 * small straight-down shadow. Like seeders, each is drawn at its wrapped position nearest
 * the camera focus.
 */
export class PestView {
  readonly pests: THREE.InstancedMesh;
  readonly shadows: THREE.Mesh;
  private readonly geometry = pestGeometry();
  private readonly shadowPositions = new Float32Array(CAPACITY * 6 * 3);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quaternion = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly position = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  /** Last heading per pest, kept while it hovers so it doesn't snap round. */
  private readonly heading = new Map<number, number>();

  constructor(private readonly terrain: Terrain) {
    this.pests = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
      CAPACITY,
    );
    this.pests.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pests.frustumCulled = false;

    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(this.shadowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.shadows = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.shadows.frustumCulled = false;
  }

  /** `focus` is the (unwrapped) point the camera follows; `time` drives the buzz. */
  update(enemies: EnemyState, focus: { x: number; z: number }, time: number): void {
    let n = 0;
    let shadowVerts = 0;
    const alive = new Set<number>();
    for (const p of enemies.pests) {
      alive.add(p.id);
      if (Math.hypot(p.vel.x, p.vel.z) > 0.3) this.heading.set(p.id, Math.atan2(p.vel.x, -p.vel.z));
      if (n >= CAPACITY || !this.near(p, focus)) continue;
      this.pose(p, focus, time, this.matrix);
      this.pests.setMatrixAt(n++, this.matrix);
      shadowVerts = this.castShadow(shadowVerts);
    }
    for (const id of this.heading.keys()) if (!alive.has(id)) this.heading.delete(id);
    this.pests.count = n;
    this.pests.instanceMatrix.needsUpdate = true;
    this.shadows.geometry.setDrawRange(0, shadowVerts);
    this.shadows.geometry.attributes.position!.needsUpdate = true;
  }

  /** The pest as a coloured non-indexed geometry plus world pose near `focus`, for shattering. */
  shape(p: Pest, focus: { x: number; z: number }, time: number): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    this.near(p, focus);
    return { geometry: this.geometry, matrix: this.pose(p, focus, time, new THREE.Matrix4()) };
  }

  private pose(p: Pest, focus: { x: number; z: number }, time: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.position.set(focus.x + this.terrain.delta(focus.x, p.pos.x), p.pos.y, focus.z + this.terrain.delta(focus.z, p.pos.z));
    // A buzz: a quick roll and bob, out of step from one pest to the next.
    const phase = time * 38 + p.id * 1.7;
    this.position.y += Math.sin(phase * 0.5) * 0.03;
    this.euler.set(Math.sin(phase * 0.7) * 0.15, -(this.heading.get(p.id) ?? 0), Math.sin(phase) * 0.35);
    this.quaternion.setFromEuler(this.euler);
    return out.compose(this.position, this.quaternion, this.one);
  }

  /** Sets `this.position` to the wrapped position nearest `focus`; false if outside the drawn patch. */
  private near(p: Pest, focus: { x: number; z: number }): boolean {
    const dx = this.terrain.delta(focus.x, p.pos.x);
    const dz = this.terrain.delta(focus.z, p.pos.z);
    this.position.set(focus.x + dx, p.pos.y, focus.z + dz);
    return Math.abs(dx) <= HALF_WIDTH && dz >= -ROWS_AHEAD && dz <= ROWS_BEHIND + 1;
  }

  /** A small diamond on the ground straight below `this.position`. */
  private castShadow(start: number): number {
    const { x, z } = this.position;
    const s = SHADOW_SIZE / 2;
    const corner = (cx: number, cz: number) => [cx, this.terrain.heightAt(cx, cz) + SHADOW_LIFT, cz];
    const [n, e, so, w] = [corner(x, z - s), corner(x + s, z), corner(x, z + s), corner(x - s, z)];
    let v = start;
    for (const p of [n, e, so, n, so, w]) this.shadowPositions.set(p, v++ * 3);
    return v;
  }
}
