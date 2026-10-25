import * as THREE from 'three';
import type { Vec3 } from '../sim/craft';

const CAPACITY = 128;
/** Tracer length as seconds of travel behind the bullet. */
const TRAIL = 0.035;

/** The craft's tracers; fighters' shots use the same view in their own colours. */
export const CRAFT_TRACER = { head: 0xffffd0, tail: 0xff8020, size: 0.1 };
export const FIGHTER_TRACER = { head: 0xffd0e0, tail: 0xff2050, size: 0.15 };

/** Bullets drawn as bright tracer streaks: a point at the head and a fading line behind it. */
export class BulletView {
  readonly tracers: THREE.LineSegments;
  readonly heads: THREE.Points;
  private readonly linePositions = new Float32Array(CAPACITY * 6);
  private readonly headPositions = new Float32Array(CAPACITY * 3);

  constructor(style = CRAFT_TRACER) {
    const head = new THREE.Color(style.head);
    const tail = new THREE.Color(style.tail);
    const lineColours = new Float32Array(CAPACITY * 6);
    for (let k = 0; k < CAPACITY; k++) {
      lineColours.set([head.r, head.g, head.b, tail.r, tail.g, tail.b], k * 6);
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    lines.setAttribute('color', new THREE.BufferAttribute(lineColours, 3));
    this.tracers = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.tracers.frustumCulled = false;

    const heads = new THREE.BufferGeometry();
    heads.setAttribute('position', new THREE.BufferAttribute(this.headPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.heads = new THREE.Points(heads, new THREE.PointsMaterial({ color: head, size: style.size }));
    this.heads.frustumCulled = false;
  }

  /**
   * `focus` places wrapped positions (fighters' shots) at their copy nearest the camera;
   * the craft's bullets are unwrapped and drawn where they are.
   */
  update(bullets: readonly { pos: Vec3; vel: Vec3 }[], wrap?: { terrain: { delta(a: number, b: number): number }; focus: { x: number; z: number } }): void {
    const n = Math.min(CAPACITY, bullets.length);
    for (let k = 0; k < n; k++) {
      const { vel } = bullets[k]!;
      let pos = bullets[k]!.pos;
      if (wrap) {
        const { terrain, focus } = wrap;
        pos = { x: focus.x + terrain.delta(focus.x, pos.x), y: pos.y, z: focus.z + terrain.delta(focus.z, pos.z) };
      }
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
