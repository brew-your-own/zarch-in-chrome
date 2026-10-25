import * as THREE from 'three';
import { thrustDirection, type CraftState, type Physics } from '../sim/craft';
import type { Terrain } from '../sim/terrain';

/** Tunable plume look, read every frame so the settings panel applies immediately. */
export interface PlumeSettings {
  /** Particles emitted per second. */
  rate: number;
  /** Ejection speed relative to the craft (units/s). */
  speed: number;
  /** Random velocity jitter (units/s). */
  spread: number;
  /** Mean particle lifetime (s); each particle lives 60-140% of it. */
  lifetime: number;
  /** Particle size in world units. */
  size: number;
}

export const DEFAULT_PLUME: Readonly<PlumeSettings> = Object.freeze({
  rate: 400,
  speed: 4,
  spread: 0.7,
  lifetime: 0.65,
  size: 0.07,
});

/** Enough for the panel's highest rate at its longest lifetime. */
const MAX_PARTICLES = 4500;
const BOUNCE = 0.3;
const GROUND_FRICTION = 0.6;
/** Where particles leave the craft, in craft-local space (just under the belly). */
const NOZZLE = new THREE.Vector3(0, -0.06, 0.05);

/** Hot to cold, sampled by normalised age. */
const RAMP = [new THREE.Color(0xffffc0), new THREE.Color(0xffa020), new THREE.Color(0xc02000), new THREE.Color(0x200000)];

/**
 * Cosmetic thruster plume: square particles fired out of the craft's underside along
 * the reverse thrust axis, falling under gravity and bouncing off the terrain.
 */
export class ExhaustView {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly ages = new Float32Array(MAX_PARTICLES);
  private readonly lifetimes = new Float32Array(MAX_PARTICLES);
  private next = 0;
  private emitDebt = 0;
  private readonly nozzle = new THREE.Vector3();
  private readonly colour = new THREE.Color();

  constructor(
    private readonly terrain: Terrain,
    private readonly physics: Physics,
    private readonly plume: PlumeSettings,
  ) {
    this.ages.fill(Infinity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: plume.size, vertexColors: true }));
    this.points.frustumCulled = false;
  }

  /** `craftMatrix` is the craft mesh's world matrix; `dt` is 0 while paused. */
  update(state: CraftState, craftMatrix: THREE.Matrix4, dt: number): void {
    (this.points.material as THREE.PointsMaterial).size = this.plume.size;
    if (dt > 0 && state.thrusting) this.emit(state, craftMatrix, dt);
    for (let k = 0; k < MAX_PARTICLES; k++) this.advance(k, dt);
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.color!.needsUpdate = true;
  }

  private emit(state: CraftState, craftMatrix: THREE.Matrix4, dt: number): void {
    const { rate, speed: ejectSpeed, spread, lifetime } = this.plume;
    const dir = thrustDirection(state, this.physics);
    this.nozzle.copy(NOZZLE).applyMatrix4(craftMatrix);
    this.emitDebt += rate * dt;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const k = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;
      const speed = ejectSpeed * (0.7 + 0.6 * Math.random());
      this.velocities[k * 3] = state.vel.x - dir.x * speed + (Math.random() - 0.5) * spread;
      this.velocities[k * 3 + 1] = state.vel.y - dir.y * speed + (Math.random() - 0.5) * spread;
      this.velocities[k * 3 + 2] = state.vel.z - dir.z * speed + (Math.random() - 0.5) * spread;
      this.positions[k * 3] = this.nozzle.x;
      this.positions[k * 3 + 1] = this.nozzle.y;
      this.positions[k * 3 + 2] = this.nozzle.z;
      this.lifetimes[k] = lifetime * (0.6 + 0.8 * Math.random());
      this.ages[k] = 0;
      // Spread spawns across the frame so the plume doesn't come out in clumps.
      this.advance(k, Math.random() * dt);
    }
  }

  private advance(k: number, dt: number): void {
    const p = this.positions;
    const v = this.velocities;
    this.ages[k]! += dt;
    const life = this.ages[k]! / this.lifetimes[k]!;
    if (!(life < 1)) {
      p[k * 3 + 1] = -1000; // parked out of sight
      return;
    }

    v[k * 3 + 1]! -= this.physics.gravity * dt;
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

    const f = life * (RAMP.length - 1);
    const i = Math.min(RAMP.length - 2, Math.floor(f));
    this.colour.copy(RAMP[i]!).lerp(RAMP[i + 1]!, f - i);
    this.colors[k * 3] = this.colour.r;
    this.colors[k * 3 + 1] = this.colour.g;
    this.colors[k * 3 + 2] = this.colour.b;
  }
}
