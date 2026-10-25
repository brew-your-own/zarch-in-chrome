import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';

const BOUNCE = 0.3;
const GROUND_FRICTION = 0.6;
const PARKED_Y = -1000;

/** Colours a particle passes through over its life, sampled by normalised age. */
export type Ramp = readonly THREE.Color[];

export const ramp = (...hex: number[]): Ramp => hex.map((h) => new THREE.Color(h));

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  /** Index into the pool's ramps. */
  ramp?: number;
  /** Multiplier on gravity: 1 falls normally, 0 floats. */
  gravity?: number;
  /** Seconds to advance straight away, to spread spawns across a frame. */
  head?: number;
}

/**
 * Fixed-size ring buffer of square particles drawn as one `THREE.Points`.
 * Particles fall under gravity, bounce and skid on the terrain, and fade along a colour ramp.
 * When full, the oldest slot is reused. Cosmetic only, driven by frame time.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly rampOf: Uint8Array;
  private readonly gravityOf: Float32Array;
  private next = 0;
  private gravity = 0;
  private readonly colour = new THREE.Color();

  constructor(
    private readonly terrain: Terrain,
    private readonly capacity: number,
    private readonly ramps: readonly Ramp[],
    size: number,
  ) {
    this.positions = new Float32Array(capacity * 3).fill(PARKED_Y);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity).fill(Infinity);
    this.lifetimes = new Float32Array(capacity).fill(1);
    this.rampOf = new Uint8Array(capacity);
    this.gravityOf = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ size, vertexColors: true }));
    this.points.frustumCulled = false;
  }

  set size(size: number) {
    (this.points.material as THREE.PointsMaterial).size = size;
  }

  spawn(p: ParticleSpawn): void {
    const k = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.positions.set([p.x, p.y, p.z], k * 3);
    this.velocities.set([p.vx, p.vy, p.vz], k * 3);
    this.lifetimes[k] = p.life;
    this.ages[k] = 0;
    this.rampOf[k] = p.ramp ?? 0;
    this.gravityOf[k] = p.gravity ?? 1;
    if (p.head) this.advance(k, p.head);
  }

  /** Advances every particle; `gravity` is the world's current gravity, `dt` 0 while paused. */
  update(dt: number, gravity: number): void {
    this.gravity = gravity;
    for (let k = 0; k < this.capacity; k++) this.advance(k, dt);
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.color!.needsUpdate = true;
  }

  private advance(k: number, dt: number): void {
    const p = this.positions;
    const v = this.velocities;
    this.ages[k]! += dt;
    const life = this.ages[k]! / this.lifetimes[k]!;
    if (!(life < 1)) {
      p[k * 3 + 1] = PARKED_Y;
      return;
    }

    v[k * 3 + 1]! -= this.gravity * this.gravityOf[k]! * dt;
    p[k * 3]! += v[k * 3]! * dt;
    p[k * 3 + 1]! += v[k * 3 + 1]! * dt;
    p[k * 3 + 2]! += v[k * 3 + 2]! * dt;

    const ground = this.terrain.heightAt(p[k * 3]!, p[k * 3 + 2]!);
    if (p[k * 3 + 1]! < ground) {
      p[k * 3 + 1] = ground;
      v[k * 3 + 1] = Math.abs(v[k * 3 + 1]!) * BOUNCE;
      v[k * 3]! *= GROUND_FRICTION;
      v[k * 3 + 2]! *= GROUND_FRICTION;
    }

    const colours = this.ramps[this.rampOf[k]!]!;
    const f = life * (colours.length - 1);
    const i = Math.min(colours.length - 2, Math.floor(f));
    this.colour.copy(colours[i]!).lerp(colours[i + 1]!, f - i);
    this.colors[k * 3] = this.colour.r;
    this.colors[k * 3 + 1] = this.colour.g;
    this.colors[k * 3 + 2] = this.colour.b;
  }
}
