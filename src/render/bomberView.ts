import * as THREE from 'three';
import type { Bomber } from '../sim/bombers';
import type { EnemyState } from '../sim/enemies';
import type { Terrain } from '../sim/terrain';
import { inPatch } from './terrainView';

const CAPACITY = 16;
const SHADOW_LIFT = 0.02;

// Flying-wing outline in local space, nose along -z like the craft.
const NOSE = [0, 0.04, -0.5] as const;
const LEFT = [-0.85, 0, 0.32] as const;
const RIGHT = [0.85, 0, 0.32] as const;
const TAIL = [0, 0.04, 0.12] as const;
const TOP = [0, 0.2, -0.08] as const;
const BELLY = [0, -0.1, -0.02] as const;

const WING = 0x6f7f3a;
const WING_DARK = 0x56652c;
const BELLY_COLOUR = 0x222a14;
const BAY = 0xff7020;

/** A wide, flat flying wing in olive drab, with a glowing bomb bay underneath. */
export function bomberGeometry(): THREE.BufferGeometry {
  const faces: [readonly number[], readonly number[], readonly number[], number][] = [
    [NOSE, LEFT, TOP, WING],
    [NOSE, TOP, RIGHT, WING_DARK],
    [TOP, LEFT, TAIL, WING_DARK],
    [TOP, TAIL, RIGHT, WING],
    [NOSE, BELLY, LEFT, BELLY_COLOUR],
    [NOSE, RIGHT, BELLY, BELLY_COLOUR],
    [BELLY, TAIL, LEFT, BAY],
    [BELLY, RIGHT, TAIL, BAY],
  ];
  const positions: number[] = [];
  const colours: number[] = [];
  const c = new THREE.Color();
  for (const [a, b, d, colour] of faces) {
    positions.push(...a, ...b, ...d);
    c.setHex(colour);
    for (let v = 0; v < 3; v++) colours.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return g;
}

/**
 * Bombers as flying wings along their heading, rolling a little as they turn, with
 * straight-down shadows. Like seeders, each is drawn at its wrapped position nearest the
 * camera focus.
 */
export class BomberView {
  readonly bombers: THREE.InstancedMesh;
  readonly shadows: THREE.Mesh;
  private readonly geometry = bomberGeometry();
  private readonly shadowPositions = new Float32Array(CAPACITY * 6 * 3);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quaternion = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly position = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly corner = new THREE.Vector3();

  constructor(private readonly terrain: Terrain) {
    this.bombers = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
      CAPACITY,
    );
    this.bombers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bombers.frustumCulled = false;

    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(this.shadowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.shadows = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.shadows.frustumCulled = false;
  }

  /** `focus` is the (unwrapped) point the camera follows. */
  update(enemies: EnemyState, focus: { x: number; z: number }): void {
    let n = 0;
    let shadowVerts = 0;
    for (const b of enemies.bombers) {
      if (n >= CAPACITY || !this.near(b, focus)) continue;
      this.pose(b, focus, this.matrix);
      this.bombers.setMatrixAt(n++, this.matrix);
      shadowVerts = this.castShadow(b, shadowVerts);
    }
    this.bombers.count = n;
    this.bombers.instanceMatrix.needsUpdate = true;
    this.shadows.geometry.setDrawRange(0, shadowVerts);
    this.shadows.geometry.attributes.position!.needsUpdate = true;
  }

  /** The bomber as a coloured non-indexed geometry plus world pose near `focus`, for shattering. */
  shape(b: Bomber, focus: { x: number; z: number }): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    this.near(b, focus);
    return { geometry: this.geometry, matrix: this.pose(b, focus, new THREE.Matrix4()) };
  }

  private pose(b: Bomber, focus: { x: number; z: number }, out: THREE.Matrix4): THREE.Matrix4 {
    this.position.set(focus.x + this.terrain.delta(focus.x, b.pos.x), b.pos.y, focus.z + this.terrain.delta(focus.z, b.pos.z));
    // Roll into a turn towards its new course.
    const turn = Math.atan2(Math.sin(b.course - b.heading), Math.cos(b.course - b.heading));
    this.euler.set(0, -b.heading, Math.max(-0.4, Math.min(0.4, -turn)));
    this.quaternion.setFromEuler(this.euler);
    return out.compose(this.position, this.quaternion, this.one);
  }

  /** Sets `this.position` to the wrapped position nearest `focus`; false if outside the drawn patch. */
  private near(b: Bomber, focus: { x: number; z: number }): boolean {
    const dx = this.terrain.delta(focus.x, b.pos.x);
    const dz = this.terrain.delta(focus.z, b.pos.z);
    this.position.set(focus.x + dx, b.pos.y, focus.z + dz);
    return inPatch(dx, dz);
  }

  /** The wing's outline (nose, tips and tail notch) dropped straight down onto the terrain. */
  private castShadow(b: Bomber, start: number): number {
    const centre = this.position.clone();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.heading);
    const corners = [NOSE, LEFT, TAIL, RIGHT].map((p) => {
      this.corner.set(p[0], 0, p[2]).applyQuaternion(yaw).add(centre);
      return [this.corner.x, this.terrain.heightAt(this.corner.x, this.corner.z) + SHADOW_LIFT, this.corner.z];
    });
    let v = start;
    for (const k of [0, 1, 2, 0, 2, 3]) this.shadowPositions.set(corners[k]!, v++ * 3);
    return v;
  }
}
