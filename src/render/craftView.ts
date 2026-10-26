import * as THREE from 'three';
import { tiltAngle, type CraftState, type Physics } from '../sim/craft';
import type { Terrain } from '../sim/terrain';

// Low-poly lander in local space: +y is the craft's up (thrust) axis, nose toward -z.
const V = {
  nose: [0, 0.06, -0.45],
  left: [-0.32, 0, 0.25],
  right: [0.32, 0, 0.25],
  top: [0, 0.2, 0.08],
  tail: [0, 0.05, 0.3],
  belly: [0, -0.06, 0.05],
} as const;

type Face = [keyof typeof V, keyof typeof V, keyof typeof V, number];

const FACES: Face[] = [
  ['nose', 'left', 'top', 0xe8e8e8],
  ['nose', 'top', 'right', 0xc8c8c8],
  ['top', 'left', 'tail', 0xd04040],
  ['top', 'tail', 'right', 0xa83030],
  ['nose', 'belly', 'left', 0x606060],
  ['nose', 'right', 'belly', 0x505050],
  ['left', 'belly', 'tail', 0x404040],
  ['right', 'tail', 'belly', 0x383838],
];

const SHADOW_LIFT = 0.02;

export function craftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new THREE.Color();
  for (const [a, b, d, hex] of FACES) {
    c.setHex(hex);
    for (const key of [a, b, d]) {
      positions.push(...V[key]);
      colors.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** The player's craft plus its shadow, cast straight down onto the terrain. */
export class CraftView {
  readonly craft: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  private readonly local: THREE.BufferAttribute;
  private readonly shadowPositions: Float32Array;

  constructor(
    private readonly terrain: Terrain,
    private readonly physics: Physics,
  ) {
    const geometry = craftGeometry();
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
      }),
    );
    this.shadow.frustumCulled = false;
  }

  update(state: CraftState, pos: { x: number; y: number; z: number }): void {
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
