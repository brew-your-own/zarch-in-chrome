import * as THREE from 'three';
import type { Bullet } from '../sim/cannon';

const CAPACITY = 128;
/** Tracer length as seconds of travel behind the bullet. */
const TRAIL = 0.035;
const HEAD = new THREE.Color(0xffffd0);
const TAIL = new THREE.Color(0xff8020);

/** Bullets drawn as bright tracer streaks: a point at the head and a fading line behind it. */
export class BulletView {
  readonly tracers: THREE.LineSegments;
  readonly heads: THREE.Points;
  private readonly linePositions = new Float32Array(CAPACITY * 6);
  private readonly headPositions = new Float32Array(CAPACITY * 3);

  constructor() {
    const lineColours = new Float32Array(CAPACITY * 6);
    for (let k = 0; k < CAPACITY; k++) {
      lineColours.set([HEAD.r, HEAD.g, HEAD.b, TAIL.r, TAIL.g, TAIL.b], k * 6);
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    lines.setAttribute('color', new THREE.BufferAttribute(lineColours, 3));
    this.tracers = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.tracers.frustumCulled = false;

    const heads = new THREE.BufferGeometry();
    heads.setAttribute('position', new THREE.BufferAttribute(this.headPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.heads = new THREE.Points(heads, new THREE.PointsMaterial({ color: HEAD, size: 0.1 }));
    this.heads.frustumCulled = false;
  }

  update(bullets: readonly Bullet[]): void {
    const n = Math.min(CAPACITY, bullets.length);
    for (let k = 0; k < n; k++) {
      const { pos, vel } = bullets[k]!;
      this.headPositions.set([pos.x, pos.y, pos.z], k * 3);
      this.linePositions.set(
        [pos.x, pos.y, pos.z, pos.x - vel.x * TRAIL, pos.y - vel.y * TRAIL, pos.z - vel.z * TRAIL],
        k * 6,
      );
    }
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.heads.geometry.setDrawRange(0, n);
    this.tracers.geometry.attributes.position!.needsUpdate = true;
    this.heads.geometry.attributes.position!.needsUpdate = true;
  }
}
