import * as THREE from 'three';
import type { EnemyState, Seeder } from '../sim/enemies';
import type { Mutant } from '../sim/mutants';
import type { Terrain } from '../sim/terrain';
import { VIRUS } from './palette';
import { HALF_WIDTH, ROWS_AHEAD, ROWS_BEHIND } from './terrainView';

const CAPACITY = 64;
const SPIN = 2.5; // rad/s
const RADIUS = 0.38;
const SHADOW_LIFT = 0.02;
const FACE_COLOURS = [0xb040e0, 0xf0d020];
/** Mutants: a spiky ball in acid green and the virus crimson, spinning faster and tumbling. */
const MUTANT_COLOURS = [0x70ff30, VIRUS.getHex()];
const MUTANT_SPIN = 7;
const MUTANT_TUMBLE = 0.5;

/** A squat spinning top: a flattened octahedron with alternating purple and yellow faces. */
function seederGeometry(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(RADIUS, 0).toNonIndexed();
  g.scale(1, 0.45, 1);
  return paint(g, FACE_COLOURS);
}

/** A spiky ball: each face of an icosahedron raised into a three-sided spike. */
function mutantGeometry(): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(RADIUS * 0.6, 0);
  const corners = base.attributes.position!;
  const positions: number[] = [];
  const [a, b, c, tip] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let f = 0; f < corners.count / 3; f++) {
    a.fromBufferAttribute(corners, f * 3);
    b.fromBufferAttribute(corners, f * 3 + 1);
    c.fromBufferAttribute(corners, f * 3 + 2);
    tip.copy(a).add(b).add(c).setLength(RADIUS * 1.05);
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) positions.push(p.x, p.y, p.z, q.x, q.y, q.z, tip.x, tip.y, tip.z);
  }
  base.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return paint(g, MUTANT_COLOURS);
}

/** Colours the faces of a non-indexed geometry in turn from `faceColours`. */
function paint(g: THREE.BufferGeometry, faceColours: readonly number[]): THREE.BufferGeometry {
  const colours = new Float32Array(g.attributes.position!.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < colours.length / 9; f++) {
    c.setHex(faceColours[f % faceColours.length]!);
    for (let v = 0; v < 3; v++) colours.set([c.r, c.g, c.b], f * 9 + v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * Seeders and the mutants they grow into, their shadows (straight down, like the craft's)
 * and falling spores.
 * Enemy positions are wrapped into the world; each is drawn at its wrapped position
 * nearest the camera focus, and only within the visible terrain patch.
 */
export class SeederView {
  readonly seeders: THREE.InstancedMesh;
  readonly mutants: THREE.InstancedMesh;
  readonly shadows: THREE.Mesh;
  readonly spores: THREE.Points;
  private readonly geometry = seederGeometry();
  private readonly mutantGeometry = mutantGeometry();
  /** Seeders and mutants share the shadow buffer. */
  private readonly shadowPositions = new Float32Array(CAPACITY * 2 * 6 * 3);
  private readonly sporePositions = new Float32Array(CAPACITY * 8 * 3);
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly euler = new THREE.Euler();
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
    this.mutants = new THREE.InstancedMesh(
      this.mutantGeometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      CAPACITY,
    );
    this.mutants.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mutants.frustumCulled = false;

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
    let m = 0;
    for (const mutant of enemies.mutants) {
      if (m >= CAPACITY || !this.near(mutant.pos, focus, this.position)) continue;
      this.poseMutant(mutant, focus, time, this.matrix);
      this.mutants.setMatrixAt(m++, this.matrix);
      shadowVerts = this.castShadow(this.position.x, this.position.z, time * 3 + mutant.id, shadowVerts);
    }
    this.mutants.count = m;
    this.mutants.instanceMatrix.needsUpdate = true;
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

  /** The mutant as a coloured non-indexed geometry plus world pose near `focus`, for shattering. */
  mutantShape(m: Mutant, focus: { x: number; z: number }, time: number): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    return { geometry: this.mutantGeometry, matrix: this.poseMutant(m, focus, time, new THREE.Matrix4()) };
  }

  private poseMutant(m: Mutant, focus: { x: number; z: number }, time: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.position.set(focus.x + this.terrain.delta(focus.x, m.pos.x), m.pos.y, focus.z + this.terrain.delta(focus.z, m.pos.z));
    const t = time + m.id;
    this.euler.set(Math.sin(t * 1.7) * MUTANT_TUMBLE, t * MUTANT_SPIN, Math.cos(t * 1.3) * MUTANT_TUMBLE);
    this.quaternion.setFromEuler(this.euler);
    return out.compose(this.position, this.quaternion, this.one);
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
