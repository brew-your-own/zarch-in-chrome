import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Terrain } from '../sim/terrain';
import { TREE_NONE, TREE_PALM, TREE_PINE, TREE_ROUND, tileHash, treeBase, treeScale, type TreeKind } from '../sim/trees';
import { SUN } from './lighting';
import type { Palette } from './palette';
import { MAX_PATCH_TILES, patch } from './terrainView';

const CAPACITY = MAX_PATCH_TILES;

/**
 * Flat side-on outline of each kind as triangles of (u, v) points: u across, v up,
 * in the same units as the meshes. Cast along the sun onto the terrain for the shadow.
 * Parts don't overlap, so the translucent shadow has an even tone.
 */
type Outline = [number, number][];

const trunk = (halfWidth: number, top: number): Outline => [
  [-halfWidth, 0], [halfWidth, 0], [halfWidth, top],
  [-halfWidth, 0], [halfWidth, top], [-halfWidth, top],
];

const PINE_OUTLINE: Outline = [...trunk(0.04, 0.2), [-0.22, 0.2], [0.22, 0.2], [0, 1.1]];

const ROUND_OUTLINE: Outline = (() => {
  const centre = 0.57;
  const radius = 0.28;
  const out: Outline = trunk(0.05, centre - radius);
  const sides = 8;
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2;
    const a1 = ((k + 1) / sides) * Math.PI * 2;
    out.push([0, centre], [Math.cos(a0) * radius, centre + Math.sin(a0) * radius], [Math.cos(a1) * radius, centre + Math.sin(a1) * radius]);
  }
  return out;
})();

/** A palm's size: trunk segments, the top of the trunk, how far it leans, and its fronds' count and reach. */
const PALM_SEGMENTS = 4;
const PALM_TOP = 0.92;
/** How far the trunk's top leans off its base. */
const PALM_LEAN = 0.1;
const PALM_FRONDS = 7;
const PALM_REACH = 0.34;

/** A palm's crown, seen side on: a fan of drooping fronds above the trunk. */
const PALM_OUTLINE: Outline = (() => {
  const out: Outline = trunk(0.04, PALM_TOP - 0.08);
  const rim: [number, number][] = [[-PALM_REACH, PALM_TOP - 0.16], [-0.22, PALM_TOP + 0.04], [0, PALM_TOP + 0.08], [0.22, PALM_TOP + 0.04], [PALM_REACH, PALM_TOP - 0.16]];
  for (let k = 0; k + 1 < rim.length; k++) out.push([PALM_LEAN, PALM_TOP - 0.08], rim[k]!, rim[k + 1]!);
  return out;
})();

const OUTLINES = { [TREE_PINE]: PINE_OUTLINE, [TREE_ROUND]: ROUND_OUTLINE, [TREE_PALM]: PALM_OUTLINE };
const MAX_OUTLINE = Math.max(...Object.values(OUTLINES).map((o) => o.length));
const SHADOW_LIFT = 0.015;
const SHADOW_OPACITY = 0.4;

// Shadows fall away from the sun. The outline faces the sun, so it spans the horizontal
// direction perpendicular to the sun's bearing.
const SUN_H = Math.hypot(SUN.x, SUN.z);
const ACROSS = { x: -SUN.z / SUN_H, z: SUN.x / SUN_H };

const TRUNK = 0x6b4a2b;
const PALM_BARK = [0x8a6a42, 0x74583a];
const COCONUT = 0x4a3420;

/**
 * Low-poly part, built at the origin then moved into place and painted one colour.
 * Foliage parts are painted grey levels: the instance colour supplies the hue.
 */
function part(geometry: THREE.BufferGeometry, y: number, colour: number): THREE.BufferGeometry {
  const g = geometry.toNonIndexed();
  g.translate(0, y, 0);
  const c = new THREE.Color(colour);
  const colours = new Float32Array(g.attributes.position!.count * 3);
  for (let k = 0; k < colours.length; k += 3) colours.set([c.r, c.g, c.b], k);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * A palm, matching TREE_SHAPES (1.1 tall with its fronds, 0.3 reach): a trunk of a few
 * segments that leans a little more with each, and a crown of folded fronds drooping from
 * its top. The fronds are drawn from both sides, being single sheets.
 */

function palmTrunk(): THREE.BufferGeometry {
  const height = PALM_TOP / PALM_SEGMENTS;
  const segments: THREE.BufferGeometry[] = [];
  for (let k = 0; k < PALM_SEGMENTS; k++) {
    const g = part(new THREE.CylinderGeometry(0.032, 0.042, height, 5), (k + 0.5) * height, PALM_BARK[k % 2]!);
    // Each segment sits further over, so the trunk curves gently.
    const t = (k + 0.5) / PALM_SEGMENTS;
    g.rotateZ(-0.12 * t);
    g.translate(PALM_LEAN * t * t, 0, 0);
    segments.push(g);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    segments.push(part(new THREE.IcosahedronGeometry(0.035, 0), 0, COCONUT).translate(PALM_LEAN + Math.cos(a) * 0.04, PALM_TOP - 0.05, Math.sin(a) * 0.04));
  }
  return mergeGeometries(segments)!;
}

function palmCrown(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const top = new THREE.Vector3(PALM_LEAN, PALM_TOP, 0);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, grey: number) => {
    // Both windings, so the frond shows from above and below.
    for (const p of [a, b, c, a, c, b]) {
      positions.push(p.x, p.y, p.z);
      colours.push(grey, grey, grey);
    }
  };
  for (let k = 0; k < PALM_FRONDS; k++) {
    const a = (k / PALM_FRONDS) * Math.PI * 2 + 0.3;
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const across = new THREE.Vector3(-d.z, 0, d.x);
    // A frond rises from the top, folds along its rib and droops to its tip.
    const reach = PALM_REACH * (0.85 + 0.15 * ((k * 5) % 3));
    const mid = top.clone().addScaledVector(d, reach * 0.5).setY(PALM_TOP + 0.08);
    const tip = top.clone().addScaledVector(d, reach).setY(PALM_TOP - 0.16);
    const left = mid.clone().addScaledVector(across, 0.07).setY(PALM_TOP + 0.04);
    const right = mid.clone().addScaledVector(across, -0.07).setY(PALM_TOP + 0.04);
    tri(top, left, mid, 1);
    tri(top, mid, right, 0.82);
    tri(mid, left, tip, 0.92);
    tri(mid, tip, right, 0.74);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

// Sizes follow TREE_SHAPES so what you see is what you hit (pine 1.1 tall, round 0.85).
// Wood and foliage are separate meshes so foliage can be recoloured without tinting trunks.
const GEOMETRY = {
  [TREE_PINE]: {
    wood: () => part(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 4), 0.15, TRUNK),
    foliage: () =>
      mergeGeometries([
        part(new THREE.ConeGeometry(0.22, 0.55, 5), 0.48, 0xd8d8d8),
        part(new THREE.ConeGeometry(0.16, 0.5, 5), 0.85, 0xffffff),
      ])!,
  },
  [TREE_ROUND]: {
    wood: () => part(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 4), 0.2, TRUNK),
    foliage: () => part(new THREE.IcosahedronGeometry(0.28, 0), 0.57, 0xffffff),
  },
  [TREE_PALM]: { wood: palmTrunk, foliage: palmCrown },
};

type Kind = Exclude<TreeKind, typeof TREE_NONE>;

/** One tree of `kind` at scale 1, base at the origin, as a single geometry with `leaves` as its foliage colour. */
export function treeGeometry(kind: Kind, leaves: THREE.Color): THREE.BufferGeometry {
  const foliage = GEOMETRY[kind].foliage();
  const c = foliage.attributes.color!;
  for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * leaves.r, c.getY(k) * leaves.g, c.getZ(k) * leaves.b);
  return mergeGeometries([GEOMETRY[kind].wood(), foliage])!;
}

/**
 * Trees in the visible patch: per kind, a wood and a foliage InstancedMesh refilled every frame.
 * Each tree gets a stable yaw, size and shade from its tile hash, and its foliage colour from the palette.
 */
export class TreeView {
  readonly meshes: THREE.InstancedMesh[];
  /** Every tree's shadow, one translucent mesh rebuilt per frame. */
  readonly shadow: THREE.Mesh;
  private readonly shadowPositions = new Float32Array(CAPACITY * MAX_OUTLINE * 3);
  private readonly byKind: Record<Kind, { wood: THREE.InstancedMesh; foliage: THREE.InstancedMesh }>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tint = new THREE.Color();

  constructor(
    private readonly terrain: Terrain,
    private readonly palette: Palette,
  ) {
    const instanced = (geometry: THREE.BufferGeometry) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
        CAPACITY,
      );
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return mesh;
    };
    const build = (kind: Kind) => ({ wood: instanced(GEOMETRY[kind].wood()), foliage: instanced(GEOMETRY[kind].foliage()) });
    this.byKind = { [TREE_PINE]: build(TREE_PINE), [TREE_ROUND]: build(TREE_ROUND), [TREE_PALM]: build(TREE_PALM) };
    this.meshes = Object.values(this.byKind).flatMap(({ wood, foliage }) => [wood, foliage]);

    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.shadowPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: SHADOW_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.shadow.frustumCulled = false;
  }

  update(centreX: number, centreZ: number): void {
    const ci = Math.floor(centreX);
    const cj = Math.floor(centreZ);
    const t = this.terrain;
    for (const mesh of this.meshes) mesh.count = 0;
    let shadowVerts = 0;

    for (let j = cj - patch.ahead; j <= cj + patch.behind; j++) {
      for (let i = ci - patch.halfWidth; i <= ci + patch.halfWidth; i++) {
        const kind = t.treeAt(i, j);
        if (kind === TREE_NONE) continue;
        const { wood, foliage } = this.byKind[kind];
        const base = treeBase(t, i, j);
        const s = treeScale(t, i, j);
        this.pose(i, j, this.matrix);
        const n = wood.count;
        const shade = this.shade(i, j);
        wood.setMatrixAt(n, this.matrix);
        wood.setColorAt(n, this.tint.setRGB(shade, shade, shade));
        foliage.setMatrixAt(n, this.matrix);
        foliage.setColorAt(n, this.palette.foliage(i, j, kind, this.tint).multiplyScalar(shade));
        wood.count++;
        foliage.count++;
        shadowVerts = this.castShadow(OUTLINES[kind], base, s, shadowVerts);
      }
    }

    this.shadow.geometry.setDrawRange(0, shadowVerts);
    this.shadow.geometry.attributes.position!.needsUpdate = true;

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * The tree that stood on (i, j) as one non-indexed geometry with its final colours baked in,
   * plus its world pose, so it can be shattered after the sim has removed it.
   */
  shape(i: number, j: number, kind: Kind): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
    const shade = this.shade(i, j);
    const wood = GEOMETRY[kind].wood();
    const foliage = GEOMETRY[kind].foliage();
    const leaves = this.palette.foliage(i, j, kind, new THREE.Color()).multiplyScalar(shade);
    const paint = (g: THREE.BufferGeometry, tint: THREE.Color) => {
      const c = g.attributes.color!;
      for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * tint.r, c.getY(k) * tint.g, c.getZ(k) * tint.b);
    };
    paint(wood, new THREE.Color(shade, shade, shade));
    paint(foliage, leaves);
    return { geometry: mergeGeometries([wood, foliage])!, matrix: this.pose(i, j, new THREE.Matrix4()) };
  }

  /** World transform of the tree on (i, j): base position, stable yaw and size. */
  private pose(i: number, j: number, out: THREE.Matrix4): THREE.Matrix4 {
    const t = this.terrain;
    const base = treeBase(t, i, j);
    const s = treeScale(t, i, j);
    this.position.set(base.x, base.y, base.z);
    this.rotation.setFromAxisAngle(this.up, tileHash(t, i, j, 1) * Math.PI * 2);
    this.scale.set(s, s, s);
    return out.compose(this.position, this.rotation, this.scale);
  }

  private shade(i: number, j: number): number {
    return 0.85 + 0.3 * tileHash(this.terrain, i, j, 2);
  }

  /**
   * Projects the outline along the sun onto the plane of the tree's base, then drapes each
   * vertex onto the terrain. Returns the new vertex count.
   */
  private castShadow(outline: Outline, base: { x: number; y: number; z: number }, scale: number, start: number): number {
    const out = this.shadowPositions;
    let v = start;
    for (const [u, h] of outline) {
      const run = (h * scale) / SUN.y;
      const x = base.x + ACROSS.x * u * scale - SUN.x * run;
      const z = base.z + ACROSS.z * u * scale - SUN.z * run;
      out[v * 3] = x;
      out[v * 3 + 1] = this.terrain.heightAt(x, z) + SHADOW_LIFT;
      out[v * 3 + 2] = z;
      v++;
    }
    return v;
  }
}
