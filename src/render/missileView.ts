import * as THREE from 'three';
import type { Missile } from '../sim/weapons';

const CAPACITY = 16;
const UP = new THREE.Vector3(0, 1, 0);

/** Missiles in flight: small white darts pointing along their velocity. Their smoke is drawn by `EffectsView`. */
export class MissileView {
  readonly missiles: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly direction = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor() {
    const body = new THREE.ConeGeometry(0.06, 0.34, 6);
    this.missiles = new THREE.InstancedMesh(body, new THREE.MeshBasicMaterial({ color: 0xf4f4ff }), CAPACITY);
    this.missiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.missiles.frustumCulled = false;
  }

  update(missiles: readonly Missile[]): void {
    const n = Math.min(CAPACITY, missiles.length);
    for (let k = 0; k < n; k++) {
      const { pos, vel } = missiles[k]!;
      this.direction.set(vel.x, vel.y, vel.z).normalize();
      this.quaternion.setFromUnitVectors(UP, this.direction);
      this.position.set(pos.x, pos.y, pos.z);
      this.missiles.setMatrixAt(k, this.matrix.compose(this.position, this.quaternion, this.one));
    }
    this.missiles.count = n;
    this.missiles.instanceMatrix.needsUpdate = true;
  }
}
