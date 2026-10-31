import * as THREE from 'three';
import { thrustDirection, type CraftState, type Physics } from '../sim/craft';
import type { Terrain } from '../sim/terrain';
import { ParticlePool, ramp } from './particles';

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
/** Where particles leave the craft, in craft-local space (just under the belly). */
/** The middle of the thruster plate, under the craft and a little forward of its centre. */
const NOZZLE = new THREE.Vector3(0, 0, -0.04);

/** Hot to cold. */
const RAMP = ramp(0xffffc0, 0xffa020, 0xc02000, 0x200000);

/**
 * Cosmetic thruster plume: square particles fired out of the craft's underside along
 * the reverse thrust axis, falling under gravity and bouncing off the terrain.
 */
export class ExhaustView {
  private readonly pool: ParticlePool;
  private emitDebt = 0;
  private readonly nozzle = new THREE.Vector3();

  constructor(
    terrain: Terrain,
    private readonly physics: Physics,
    private readonly plume: PlumeSettings,
  ) {
    this.pool = new ParticlePool(terrain, MAX_PARTICLES, [RAMP], plume.size);
  }

  get points(): THREE.Points {
    return this.pool.points;
  }

  /** `craftMatrix` is the craft mesh's world matrix; `dt` is 0 while paused. */
  update(state: CraftState, craftMatrix: THREE.Matrix4, dt: number): void {
    this.pool.size = this.plume.size;
    if (dt > 0 && state.thrusting) this.emit(state, craftMatrix, dt);
    this.pool.update(dt, this.physics.gravity);
  }

  private emit(state: CraftState, craftMatrix: THREE.Matrix4, dt: number): void {
    const { rate, speed: ejectSpeed, spread, lifetime } = this.plume;
    const dir = thrustDirection(state, this.physics);
    this.nozzle.copy(NOZZLE).applyMatrix4(craftMatrix);
    this.emitDebt += rate * dt;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const speed = ejectSpeed * (0.7 + 0.6 * Math.random());
      this.pool.spawn({
        x: this.nozzle.x,
        y: this.nozzle.y,
        z: this.nozzle.z,
        vx: state.vel.x - dir.x * speed + (Math.random() - 0.5) * spread,
        vy: state.vel.y - dir.y * speed + (Math.random() - 0.5) * spread,
        vz: state.vel.z - dir.z * speed + (Math.random() - 0.5) * spread,
        life: lifetime * (0.6 + 0.8 * Math.random()),
        // Spread spawns across the frame so the plume doesn't come out in clumps.
        head: Math.random() * dt,
      });
    }
  }
}
