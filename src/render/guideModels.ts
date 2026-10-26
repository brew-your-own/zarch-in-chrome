import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TREE_PINE, TREE_ROUND } from '../sim/trees';
import { buildingGeometry } from './buildingView';
import { craftGeometry } from './craftView';
import { AUTUMN_LEAVES, CHECKER_DARK, GRASS, PAD, PINE, SUMMER_LEAVES, VIRUS, VIRUS_LEAVES } from './palette';
import { treeGeometry } from './treeView';

/**
 * Small dioramas of the land for the field guide: a few tiles of ground, one world unit
 * each, with the game's own meshes standing on them. The ground's top is at y = 0.
 */

/** The slab's sides reach this far down, deep enough to hide the buildings' footings. */
const DEPTH = 0.45;
const EARTH = new THREE.Color(0x5a4030);

/** A slab of `cols` x `rows` tiles centred on the origin, each painted by `colour`. */
function ground(cols: number, rows: number, colour: (i: number, j: number) => THREE.Color): THREE.BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], col: THREE.Color) => {
    for (const v of [a, b, c, a, c, d]) {
      positions.push(...v);
      colours.push(col.r, col.g, col.b);
    }
  };
  const x0 = -cols / 2;
  const z0 = -rows / 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const [x, z] = [x0 + i, z0 + j];
      const c = colour(i, j).clone();
      if ((i + j) & 1) c.multiplyScalar(CHECKER_DARK);
      quad([x, 0, z], [x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], c);
    }
  }
  const [x1, z1] = [-x0, -z0];
  quad([x0, 0, z1], [x0, -DEPTH, z1], [x1, -DEPTH, z1], [x1, 0, z1], EARTH);
  quad([x1, 0, z0], [x1, -DEPTH, z0], [x0, -DEPTH, z0], [x0, 0, z0], EARTH);
  quad([x1, 0, z1], [x1, -DEPTH, z1], [x1, -DEPTH, z0], [x1, 0, z0], EARTH);
  quad([x0, 0, z0], [x0, -DEPTH, z0], [x0, -DEPTH, z1], [x0, 0, z1], EARTH);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

/** `geometry` moved to (x, y, z) and turned by `yaw`. */
function place(geometry: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0): THREE.BufferGeometry {
  return geometry.rotateY(yaw).translate(x, y, z);
}

/** Grass as the default colours paint it, between green and olive. */
const GRASS_TONE = GRASS[0]!.clone().lerp(GRASS[1]!, 0.6).multiplyScalar(0.85);
const grass = () => GRASS_TONE;

/** The launch pad, with the craft (drawn larger, so it reads at this size) sitting on it. */
export function padModel(): THREE.BufferGeometry {
  return mergeGeometries([ground(3, 3, () => PAD[1]!), place(craftGeometry().scale(1.6, 1.6, 1.6), 0, 0.1, 0, -0.5)])!;
}

/** Pines and round trees in summer and autumn colours, and one round tree taken by the virus. */
export function treesModel(): THREE.BufferGeometry {
  const infected = (i: number, j: number) => i === 2 && j === 1;
  return mergeGeometries([
    ground(3, 2, (i, j) => (infected(i, j) ? VIRUS : grass())),
    place(treeGeometry(TREE_PINE, PINE), -1, 0, -0.5),
    place(treeGeometry(TREE_ROUND, SUMMER_LEAVES), 0, 0, -0.5),
    place(treeGeometry(TREE_ROUND, AUTUMN_LEAVES[1]!), 1, 0, -0.5),
    place(treeGeometry(TREE_PINE, PINE), -1, 0, 0.5),
    place(treeGeometry(TREE_PINE, PINE).scale(0.8, 0.8, 0.8), 0, 0, 0.5),
    place(treeGeometry(TREE_ROUND, VIRUS_LEAVES), 1, 0, 0.5),
  ])!;
}

/** A village: its tower, a house and a barn, with a tree. */
export function villageModel(): THREE.BufferGeometry {
  return mergeGeometries([
    ground(3, 2, grass),
    place(buildingGeometry('tower'), -1, 0, -0.5),
    place(buildingGeometry('house'), 0.1, 0, 0.5),
    place(buildingGeometry('barn'), 1, 0, -0.5, Math.PI / 2),
    place(treeGeometry(TREE_ROUND, AUTUMN_LEAVES[0]!), -1, 0, 0.5),
  ])!;
}
