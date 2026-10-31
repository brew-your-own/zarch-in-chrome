import * as THREE from 'three';
import { BUILDING_SHAPES, buildingBase, RESCUE_TIME, type Building, type BuildingKind } from '../sim/buildings';
import type { Terrain } from '../sim/terrain';
import { SUN } from './lighting';
import { VIRUS } from './palette';
import { patch } from './terrainView';

const CAPACITY = 64;
/** Walls reach this far below the base, so a building on a slope never shows a gap. */
const FOOTING = 0.4;
const SHADOW_LIFT = 0.015;
const SHADOW_OPACITY = 0.4;
/** A shadow outline has at most 8 corners, so 6 triangles. */
const MAX_SHADOW_VERTS = 6 * 3;
/** Infected buildings pulse towards the virus colour, faster as they near falling. */
const INFECTED_TINT = new THREE.Color().copy(VIRUS).lerp(new THREE.Color(0xffffff), 0.25);

type Face = [number[], number[], number[], number];

/** A box from y0 to y1, centred on the origin, as triangles of one colour (`top` for its lid). */
function box(halfX: number, halfZ: number, y0: number, y1: number, colour: number, top = colour): Face[] {
  const c = (x: number, y: number, z: number) => [x * halfX, y, z * halfZ];
  const [a, b, cc, d] = [c(-1, y0, -1), c(1, y0, -1), c(1, y0, 1), c(-1, y0, 1)];
  const [e, f, g, h] = [c(-1, y1, -1), c(1, y1, -1), c(1, y1, 1), c(-1, y1, 1)];
  return [
    [a, b, f, colour], [a, f, e, colour],
    [b, cc, g, colour], [b, g, f, colour],
    [cc, d, h, colour], [cc, h, g, colour],
    [d, a, e, colour], [d, e, h, colour],
    [e, f, g, top], [e, g, h, top],
  ];
}

/** A gable roof over a box of the same footprint: the ridge runs along x. */
function gable(halfX: number, halfZ: number, y0: number, rise: number, colour: number, ends: number): Face[] {
  const overhang = 0.04;
  const x = halfX + overhang;
  const z = halfZ + overhang;
  const [a, b, c, d] = [[-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z]];
  const [r0, r1] = [[-x, y0 + rise, 0], [x, y0 + rise, 0]];
  return [
    [a, b, r1, colour], [a, r1, r0, colour],
    [c, d, r0, colour], [c, r0, r1, colour],
    [d, a, r0, ends], [b, c, r1, ends],
  ];
}

/** A four-sided spire on a square footprint. */
function spire(half: number, y0: number, rise: number, colour: number): Face[] {
  const [a, b, c, d] = [[-half, y0, -half], [half, y0, -half], [half, y0, half], [-half, y0, half]];
  const tip = [0, y0 + rise, 0];
  return [[a, b, tip, colour], [b, c, tip, colour], [c, d, tip, colour], [d, a, tip, colour]];
}

function geometry(faces: Face[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const c = new THREE.Color();
  // The faces above are listed clockwise seen from outside; emit them the other way round.
  for (const [a, b, d, colour] of faces) {
    positions.push(...a, ...d, ...b);
    c.setHex(colour);
    for (let v = 0; v < 3; v++) colours.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

/** Each kind's mesh in local space: base at y = 0, width along x. Sizes follow `BUILDING_SHAPES`. */
export function buildingGeometry(kind: BuildingKind | 'ruin'): THREE.BufferGeometry {
  if (kind === 'house') {
    const { halfWidth: w, halfDepth: d, height } = BUILDING_SHAPES.house;
    const walls = height * 0.6;
    return geometry([...box(w, d, -FOOTING, walls, 0xeee8da), ...gable(w, d, walls, height - walls, 0xc0412e, 0xe2dccd)]);
  }
  if (kind === 'barn') {
    const { halfWidth: w, halfDepth: d, height } = BUILDING_SHAPES.barn;
    const walls = height * 0.6;
    return geometry([...box(w, d, -FOOTING, walls, 0x9a3b28), ...gable(w, d, walls, height - walls, 0x4b3b32, 0x86331f)]);
  }
  if (kind === 'tower') {
    const { halfWidth: w, height } = BUILDING_SHAPES.tower;
    const body = height * 0.65;
    return geometry([...box(w, w, -FOOTING, body, 0xd9d1bf), ...spire(w + 0.03, body, height - body, 0x3d4b5c)]);
  }
  // A ruin: a scorched floor with stumps of wall.
  return geometry([
    ...box(0.34, 0.27, -FOOTING, 0.05, 0x2e2a28, 0x3a3532),
    ...box(0.08, 0.27, 0.05, 0.2, 0x4a4542).map(shift(-0.26, 0)),
    ...box(0.16, 0.06, 0.05, 0.14, 0x4a4542).map(shift(0.1, 0.21)),
    ...box(0.07, 0.07, 0.05, 0.11, 0x3a3532).map(shift(0.15, -0.12)),
  ]);
}

function shift(dx: number, dz: number): (face: Face) => Face {
  return ([a, b, c, colour]) => [[a[0]! + dx, a[1]!, a[2]! + dz], [b[0]! + dx, b[1]!, b[2]! + dz], [c[0]! + dx, c[1]!, c[2]! + dz], colour];
}

/** 2D convex hull (monotone chain), counter-clockwise. */
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Buildings and ruins as one `InstancedMesh` per kind, for the same visible patch as the
 * terrain, plus their shadows cast along the sun like the trees'. Infected buildings pulse
 * crimson, faster as they near falling, and fade back to white while the craft saves them.
 */
export class BuildingView {
  readonly meshes: THREE.InstancedMesh[];
  readonly shadow: THREE.Mesh;
  private readonly byKind: Record<BuildingKind | 'ruin', THREE.InstancedMesh>;
  private readonly geometries: Record<BuildingKind | 'ruin', THREE.BufferGeometry>;
  private readonly shadowPositions = new Float32Array(CAPACITY * MAX_SHADOW_VERTS * 3);
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly position = new THREE.Vector3();
  private readonly tint = new THREE.Color();
  private readonly white = new THREE.Color(0xffffff);

  constructor(private readonly terrain: Terrain) {
    const kinds = ['house', 'barn', 'tower', 'ruin'] as const;
    const each = <T>(make: (k: BuildingKind | 'ruin') => T) => ({ house: make('house'), barn: make('barn'), tower: make('tower'), ruin: make('ruin') });
    this.geometries = each(buildingGeometry);
    this.byKind = each((k) => {
      const mesh = new THREE.InstancedMesh(this.geometries[k], new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), CAPACITY);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      return mesh;
    });
    this.meshes = kinds.map((k) => this.byKind[k]);

    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(this.shadowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }),
    );
    this.shadow.frustumCulled = false;
  }

  /** Draws the buildings in the patch around (centreX, centreZ); `time` drives the infected pulse. */
  update(centreX: number, centreZ: number, time: number): void {
    const ci = Math.floor(centreX);
    const cj = Math.floor(centreZ);
    for (const mesh of this.meshes) mesh.count = 0;
    let shadowVerts = 0;
    for (let j = cj - patch.ahead; j <= cj + patch.behind; j++) {
      for (let i = ci - patch.halfWidth; i <= ci + patch.halfWidth; i++) {
        const b = this.terrain.buildingAt(i, j);
        if (!b) continue;
        const kind = b.status === 'ruin' ? 'ruin' : b.kind;
        const mesh = this.byKind[kind];
        if (mesh.count >= CAPACITY) continue;
        this.pose(b, i, j, this.matrix);
        mesh.setMatrixAt(mesh.count, this.matrix);
        mesh.setColorAt(mesh.count, this.colour(b, time));
        mesh.count++;
        if ((shadowVerts + MAX_SHADOW_VERTS) * 3 <= this.shadowPositions.length) shadowVerts = this.castShadow(b, i, j, shadowVerts);
      }
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.shadow.geometry.setDrawRange(0, shadowVerts);
    this.shadow.geometry.attributes.position!.needsUpdate = true;
  }

  /** The building (as it stood) as a coloured geometry plus its world pose nearest `focus`, for shattering. */
  shape(b: Building, focus: { x: number; z: number }): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    const i = Math.floor(focus.x) + Math.round(this.terrain.delta(Math.floor(focus.x), b.i));
    const j = Math.floor(focus.z) + Math.round(this.terrain.delta(Math.floor(focus.z), b.j));
    return { geometry: this.geometries[b.kind], matrix: this.pose(b, i, j, new THREE.Matrix4()) };
  }

  private pose(b: Building, i: number, j: number, out: THREE.Matrix4): THREE.Matrix4 {
    const base = buildingBase(this.terrain, { i, j });
    this.position.set(base.x, base.y, base.z);
    this.quaternion.setFromAxisAngle(this.up, b.turned ? Math.PI / 2 : 0);
    return out.compose(this.position, this.quaternion, this.one);
  }

  private colour(b: Building, time: number): THREE.Color {
    if (b.status !== 'infected') return this.tint.copy(this.white);
    const rate = 4 + 12 / Math.max(1, b.timer);
    const pulse = 0.55 + 0.45 * Math.sin(time * rate);
    const saved = Math.min(1, b.rescue / RESCUE_TIME);
    return this.tint.copy(this.white).lerp(INFECTED_TINT, pulse * (1 - saved));
  }

  /** The building's box (base and top outline) cast along the sun, draped on the terrain. */
  private castShadow(b: Building, i: number, j: number, start: number): number {
    const shape = BUILDING_SHAPES[b.kind];
    const height = b.status === 'ruin' ? 0.15 : shape.height * 0.85;
    const halfX = b.turned ? shape.halfDepth : shape.halfWidth;
    const halfZ = b.turned ? shape.halfWidth : shape.halfDepth;
    const cx = i + 0.5;
    const cz = j + 0.5;
    const sx = (-SUN.x / SUN.y) * height;
    const sz = (-SUN.z / SUN.y) * height;
    const corners: [number, number][] = [];
    for (const [ux, uz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      corners.push([cx + ux * halfX, cz + uz * halfZ], [cx + ux * halfX + sx, cz + uz * halfZ + sz]);
    }
    const outline = hull(corners);
    let v = start;
    for (let k = 1; k < outline.length - 1; k++) {
      for (const [x, z] of [outline[0]!, outline[k]!, outline[k + 1]!]) {
        this.shadowPositions.set([x, this.terrain.heightAt(x, z) + SHADOW_LIFT, z], v++ * 3);
      }
    }
    return v;
  }
}
