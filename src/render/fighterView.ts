import * as THREE from 'three';
import type { EnemyState } from '../sim/enemies';
import type { Fighter } from '../sim/fighters';
import type { Terrain } from '../sim/terrain';
import { HALF_WIDTH, ROWS_AHEAD, ROWS_BEHIND } from './terrainView';

const CAPACITY = 32;
const SHADOW_LIFT = 0.02;

// Dart outline in local space, nose along -z like the craft.
const NOSE = [0, 0, -0.45] as const;
const LEFT = [-0.38, 0, 0.22] as const;
const RIGHT = [0.38, 0, 0.22] as const;
const TOP = [0, 0.13, 0.14] as const;
const BOTTOM = [0, -0.07, 0.18] as const;

const HULL = 0xc82828;
const BELLY = 0x3a1010;
const EXHAUST = 0xff9030;

/** A low-poly dart: red back, dark belly and a glowing rear. */
export function fighterGeometry(): THREE.BufferGeometry {
  const faces: [readonly number[], readonly number[], readonly number[], number][] = [
    [NOSE, LEFT, TOP, HULL],
    [NOSE, TOP, RIGHT, HULL],
    [NOSE, BOTTOM, LEFT, BELLY],
    [NOSE, RIGHT, BOTTOM, BELLY],
    [LEFT, BOTTOM, TOP, EXHAUST],
    [RIGHT, TOP, BOTTOM, EXHAUST],
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
 * Fighters as darts pointing along their heading, banked into their turns, with straight-down
 * shadows. Like seeders, each is drawn at its wrapped position nearest the camera focus.
 */
export class FighterView {
  readonly fighters: THREE.InstancedMesh;
  readonly shadows: THREE.Mesh;
  private readonly geometry = fighterGeometry();
  private readonly shadowPositions = new Float32Array(CAPACITY * 3 * 3);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quaternion = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly position = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly corner = new THREE.Vector3();
  /** Last heading per fighter, to bank by the turn rate. */
  private readonly lastHeading = new Map<number, number>();

  constructor(private readonly terrain: Terrain) {
    this.fighters = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
      CAPACITY,
    );
    this.fighters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fighters.frustumCulled = false;

    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(this.shadowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.shadows = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.shadows.frustumCulled = false;
  }

  /** `focus` is the (unwrapped) point the camera follows; `dt` is 0 while paused. */
  update(enemies: EnemyState, focus: { x: number; z: number }, dt: number): void {
    let n = 0;
    let shadowVerts = 0;
    const alive = new Set<number>();
    for (const f of enemies.fighters) {
      alive.add(f.id);
      const turn = dt > 0 ? wrapAngle(f.heading - (this.lastHeading.get(f.id) ?? f.heading)) / dt : 0;
      this.lastHeading.set(f.id, f.heading);
      if (n >= CAPACITY || !this.near(f, focus)) continue;
      this.pose(f, focus, turn, this.matrix);
      this.fighters.setMatrixAt(n++, this.matrix);
      shadowVerts = this.castShadow(f, shadowVerts);
    }
    for (const id of this.lastHeading.keys()) if (!alive.has(id)) this.lastHeading.delete(id);
    this.fighters.count = n;
    this.fighters.instanceMatrix.needsUpdate = true;
    this.shadows.geometry.setDrawRange(0, shadowVerts);
    this.shadows.geometry.attributes.position!.needsUpdate = true;
  }

  /** The fighter as a coloured non-indexed geometry plus world pose near `focus`, for shattering. */
  shape(f: Fighter, focus: { x: number; z: number }): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    this.near(f, focus);
    return { geometry: this.geometry, matrix: this.pose(f, focus, 0, new THREE.Matrix4()) };
  }

  private pose(f: Fighter, focus: { x: number; z: number }, turnRate: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.position.set(focus.x + this.terrain.delta(focus.x, f.pos.x), f.pos.y, focus.z + this.terrain.delta(focus.z, f.pos.z));
    // Nose up or down with the climb; roll into the turn (a positive turn rate is clockwise from above).
    const speed = Math.hypot(f.vel.x, f.vel.z);
    const pitch = Math.atan2(f.vel.y, Math.max(speed, 1)) * 0.8;
    const bank = Math.max(-0.7, Math.min(0.7, -turnRate * 0.35));
    this.euler.set(pitch, -f.heading, bank);
    this.quaternion.setFromEuler(this.euler);
    return out.compose(this.position, this.quaternion, this.one);
  }

  /** Sets `this.position` to the wrapped position nearest `focus`; false if outside the drawn patch. */
  private near(f: Fighter, focus: { x: number; z: number }): boolean {
    const dx = this.terrain.delta(focus.x, f.pos.x);
    const dz = this.terrain.delta(focus.z, f.pos.z);
    this.position.set(focus.x + dx, f.pos.y, focus.z + dz);
    return Math.abs(dx) <= HALF_WIDTH && dz >= -ROWS_AHEAD && dz <= ROWS_BEHIND + 1;
  }

  /** The dart's outline (nose and wingtips) dropped straight down onto the terrain. */
  private castShadow(f: Fighter, start: number): number {
    const centre = this.position.clone();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -f.heading);
    let v = start;
    for (const p of [NOSE, LEFT, RIGHT]) {
      this.corner.set(p[0], 0, p[2]).applyQuaternion(yaw).add(centre);
      this.shadowPositions.set([this.corner.x, this.terrain.heightAt(this.corner.x, this.corner.z) + SHADOW_LIFT, this.corner.z], v++ * 3);
    }
    return v;
  }
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
