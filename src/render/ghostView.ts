import * as THREE from 'three';
import type { GhostPose } from '../sim/race';
import type { Terrain } from '../sim/terrain';
import { craftGeometry } from './craftView';

/** A recorded run's craft: a pale see-through copy of the hull, flying where the run flew. */
export class GhostView {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly terrain: Terrain) {
    this.mesh = new THREE.Mesh(
      craftGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.mesh.rotation.order = 'YXZ';
    this.mesh.visible = false;
  }

  /** Shows the ghost at `pose` (null hides it), at its copy across the wrap nearest `focus`. */
  update(pose: GhostPose | null, focus: { x: number; z: number }): void {
    this.mesh.visible = pose !== null;
    if (!pose) return;
    this.mesh.position.set(
      focus.x + this.terrain.delta(focus.x, pose.pos.x),
      pose.pos.y,
      focus.z + this.terrain.delta(focus.z, pose.pos.z),
    );
    this.mesh.rotation.set(-pose.tilt, -pose.heading, 0);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
