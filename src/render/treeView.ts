import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Terrain } from '../sim/terrain';
import { TREE_NONE, TREE_PINE, TREE_ROUND, tileHash, treeBase, treeScale, type TreeKind } from '../sim/trees';
import { HALF_WIDTH, ROWS_AHEAD, ROWS_BEHIND } from './terrainView';

const CAPACITY = (2 * HALF_WIDTH + 1) * (ROWS_AHEAD + ROWS_BEHIND + 1);

const TRUNK = 0x6b4a2b;

/** Low-poly part, built at the origin then moved into place and painted one colour. */
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

// Sizes follow TREE_SHAPES so what you see is what you hit (pine 1.1 tall, round 0.85).
function pineGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 4), 0.15, TRUNK),
    part(new THREE.ConeGeometry(0.22, 0.55, 5), 0.48, 0x1f6b34),
    part(new THREE.ConeGeometry(0.16, 0.5, 5), 0.85, 0x2a7f3e),
  ])!;
}

function roundGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 4), 0.2, TRUNK),
    part(new THREE.IcosahedronGeometry(0.28, 0), 0.57, 0x5aa83a),
  ])!;
}

/**
 * Trees in the visible patch, one InstancedMesh per kind refilled every frame.
 * Each tree gets a stable yaw, size and tint from its tile hash.
 */
export class TreeView {
  readonly meshes: THREE.InstancedMesh[];
  private readonly byKind: Record<Exclude<TreeKind, typeof TREE_NONE>, THREE.InstancedMesh>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tint = new THREE.Color();

  constructor(private readonly terrain: Terrain) {
    const material = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.byKind = {
      [TREE_PINE]: new THREE.InstancedMesh(pineGeometry(), material(), CAPACITY),
      [TREE_ROUND]: new THREE.InstancedMesh(roundGeometry(), material(), CAPACITY),
    };
    this.meshes = Object.values(this.byKind);
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }

  update(centreX: number, centreZ: number): void {
    const ci = Math.floor(centreX);
    const cj = Math.floor(centreZ);
    const t = this.terrain;
    for (const mesh of this.meshes) mesh.count = 0;

    for (let j = cj - ROWS_AHEAD; j <= cj + ROWS_BEHIND; j++) {
      for (let i = ci - HALF_WIDTH; i <= ci + HALF_WIDTH; i++) {
        const kind = t.treeAt(i, j);
        if (kind === TREE_NONE) continue;
        const mesh = this.byKind[kind];
        const base = treeBase(t, i, j);
        const s = treeScale(t, i, j);
        this.position.set(base.x, base.y, base.z);
        this.rotation.setFromAxisAngle(this.up, tileHash(t, i, j, 1) * Math.PI * 2);
        this.scale.set(s, s, s);
        this.matrix.compose(this.position, this.rotation, this.scale);
        mesh.setMatrixAt(mesh.count, this.matrix);
        const shade = 0.85 + 0.3 * tileHash(t, i, j, 2);
        mesh.setColorAt(mesh.count, this.tint.setRGB(shade, shade, shade));
        mesh.count++;
      }
    }

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
