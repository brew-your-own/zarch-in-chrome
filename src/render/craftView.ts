import * as THREE from 'three';
import { tiltAngle, type CraftState, type Physics } from '../sim/craft';
import type { Terrain } from '../sim/terrain';

/**
 * The hull of Braben's Lander (1987), `objectPlayer` in its source: nine vertices, as stored
 * there (1.0 = one tile), with y pointing down and the nose towards +x: the flat edge with the
 * red face (`nose` below) leads, and the point trails.
 * See https://lander.bbcelite.com/source/main/variable/objectplayer.html
 */
const LANDER_VERTICES: readonly (readonly [number, number, number])[] = [
  [1, 0.3125, 0.5],
  [1, 0.3125, -0.5],
  [0, 0.0390625, -1.2],
  [-0.9, 0.3125, 0],
  [0, 0.0390625, 1.2],
  [-0.1, -0.46875, 0],
  [1 / 3, 0.3125, 0.25],
  [1 / 3, 0.3125, -0.25],
  [-0.2, 0.3125, 0],
];

/** Its faces: three vertices and which colour of a `ShipPaint` each takes. */
const LANDER_FACES: readonly [number, number, number, keyof ShipPaint][] = [
  [0, 1, 5, 'nose'],
  [1, 2, 5, 'top'],
  [0, 5, 4, 'top'],
  [2, 3, 5, 'top'],
  [3, 4, 5, 'top'],
  [1, 2, 3, 'wings'],
  [0, 3, 4, 'wings'],
  [0, 1, 3, 'base'],
  [6, 7, 8, 'engine'],
];

/** A colour for each part of the hull. */
interface ShipPaint {
  nose: number;
  top: number;
  wings: number;
  base: number;
  engine: number;
}

/** Lander's own face colours, from its `&rgb` words (one nibble per channel). */
const ORIGINAL_PAINT: ShipPaint = { nose: 0x008800, top: 0x004400, wings: 0x008888, base: 0x004444, engine: 0xcc8800 };
/** The game's colours: a pale top and a red nose face, so it shows on grass, pad and sea. */
const GAME_PAINT: ShipPaint = { nose: 0xc83838, top: 0xe4e4e4, wings: 0x5a5e6a, base: 0x34363e, engine: 0xff9a20 };

/** Lander units to the game's: the craft spans about 0.67 tiles, as wide as before. */
const LANDER_SCALE = 0.28;
/**
 * Where the hull's lowest point (the thruster plate) sits. The craft's origin is its point of
 * contact: a landed craft has it at ground height, so the hull rests on the ground, not in it.
 */
const BASE_Y = 0;
/** The thruster plate sits just proud of the base, so the two don't flicker. */
const PLATE_DROP = 0.004;

/** Lander's vertices in game space: (x, y down, z) becomes (-z, up, -x), so its nose (+x) is at -z. */
const V = (() => {
  const v = LANDER_VERTICES.map(([x, y, z]) => [-z * LANDER_SCALE, -y * LANDER_SCALE, -x * LANDER_SCALE]);
  const lift = BASE_Y + PLATE_DROP - Math.min(...v.map((p) => p[1]!));
  return v.map(([x, y, z], k) => [x!, y! + lift - (k >= 6 ? PLATE_DROP : 0), z!] as const);
})();
const CENTRE: number[] = V.reduce<number[]>((c, p) => c.map((n, k) => n + p[k]! / V.length), [0, 0, 0]);

/** Each face's vertices, wound so it faces away from the hull's centre (Lander didn't need a winding). */
const FACES = LANDER_FACES.map(([a, b, c, part]) => {
  const [pa, pb, pc] = [V[a]!, V[b]!, V[c]!];
  const u = pb.map((n, k) => n - pa[k]!);
  const w = pc.map((n, k) => n - pa[k]!);
  const normal = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const out = normal.reduce((sum, n, k) => sum + n * ((pa[k]! + pb[k]! + pc[k]!) / 3 - CENTRE[k]!), 0);
  return { vertices: out < 0 ? [pa, pc, pb] : [pa, pb, pc], part };
});

const SHADOW_LIFT = 0.02;

/** Writes the face colours for `original` (Lander's own) or the game's paint into `colors`. */
function paint(colors: THREE.BufferAttribute, original: boolean): void {
  const scheme = original ? ORIGINAL_PAINT : GAME_PAINT;
  const c = new THREE.Color();
  FACES.forEach(({ part }, f) => {
    c.setHex(scheme[part]);
    for (let k = 0; k < 3; k++) colors.setXYZ(f * 3 + k, c.r, c.g, c.b);
  });
  colors.needsUpdate = true;
}

/** The craft: Lander's hull, in the game's colours or, with `original`, in Lander's own. */
export function craftGeometry(original = false): THREE.BufferGeometry {
  const positions = FACES.flatMap(({ vertices }) => vertices.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  paint(g.attributes.color as THREE.BufferAttribute, original);
  g.computeVertexNormals();
  return g;
}

/** How the craft looks: `original` paints it in Lander's own colours. */
export interface ShipSettings {
  original: boolean;
}

export const DEFAULT_SHIP: ShipSettings = { original: false };

/** The player's craft plus its shadow, cast straight down onto the terrain. */
export class CraftView {
  readonly craft: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  private readonly local: THREE.BufferAttribute;
  private readonly shadowPositions: Float32Array;
  /** The paint on the mesh now, so a change in the settings repaints it. */
  private painted: boolean;

  constructor(
    private readonly terrain: Terrain,
    private readonly physics: Physics,
    private readonly ship: ShipSettings,
  ) {
    this.painted = ship.original;
    const geometry = craftGeometry(ship.original);
    this.local = geometry.attributes.position as THREE.BufferAttribute;
    this.craft = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.craft.rotation.order = 'YXZ';

    this.shadowPositions = new Float32Array(this.local.array.length);
    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(this.shadowPositions, 3));
    this.shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        depthWrite: false,
      }),
    );
    this.shadow.frustumCulled = false;
    // The shadow is drawn after the terrain but before the craft, and leaves the depth alone,
    // so the craft always covers its own shadow: on the pad the two touch.
    this.shadow.renderOrder = 1;
    this.craft.renderOrder = 2;
  }

  update(state: CraftState, pos: { x: number; y: number; z: number }): void {
    if (this.painted !== this.ship.original) {
      this.painted = this.ship.original;
      paint(this.craft.geometry.attributes.color as THREE.BufferAttribute, this.painted);
    }
    this.craft.visible = state.status !== 'crashed';
    this.shadow.visible = this.craft.visible;
    if (!this.craft.visible) return;

    this.craft.position.set(pos.x, pos.y, pos.z);
    // Yaw so the nose faces the tilt direction, then dip the nose by the tilt angle.
    this.craft.rotation.set(-tiltAngle(state, this.physics), -state.heading, 0);
    this.craft.updateMatrixWorld();

    const p = new THREE.Vector3();
    for (let k = 0; k < this.local.count; k++) {
      p.fromBufferAttribute(this.local, k).applyMatrix4(this.craft.matrixWorld);
      this.shadowPositions[k * 3] = p.x;
      this.shadowPositions[k * 3 + 1] = this.terrain.heightAt(p.x, p.z) + SHADOW_LIFT;
      this.shadowPositions[k * 3 + 2] = p.z;
    }
    this.shadow.geometry.attributes.position!.needsUpdate = true;
  }
}
