import type { Terrain } from './terrain';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Player input for one simulation step.
 * `aimX`/`aimY` is the virtual mouse position relative to the screen centre,
 * inside the unit disk: +x is screen right, +y is screen up (away from the camera).
 */
export interface CraftInput {
  aimX: number;
  aimY: number;
  thrust: boolean;
}

export type CraftStatus = 'flying' | 'landed' | 'crashed';

export interface CraftState {
  pos: Vec3;
  vel: Vec3;
  /**
   * Horizontal tilt vector in world xz, magnitude in [0, 1].
   * Its direction is where the craft leans; its length scales up to MAX_TILT.
   */
  tilt: { x: number; z: number };
  /** Yaw (radians) of the craft's nose; follows the tilt direction. */
  heading: number;
  fuel: number;
  /** Whether the thruster fired during the last step (input held and fuel left). */
  thrusting: boolean;
  status: CraftStatus;
  /** Seconds left before respawning after a crash. */
  respawnIn: number;
}

/** Tuning constants. Units: world units (1 tile = 1 unit), seconds, radians. */
export const CRAFT = {
  GRAVITY: 2.5,
  THRUST: 6.5,
  DRAG: 0.2,
  MAX_TILT: (70 * Math.PI) / 180,
  /** How quickly the craft's attitude follows the mouse (1/s). */
  ATTITUDE_RATE: 8,
  MAX_FUEL: 100,
  FUEL_BURN: 4,
  REFUEL_RATE: 25,
  SAFE_LANDING_VSPEED: 1.6,
  SAFE_LANDING_HSPEED: 1.6,
  SAFE_LANDING_TILT: (25 * Math.PI) / 180,
  /** Steepest ground (angle from horizontal) the craft can land on. */
  SAFE_LANDING_SLOPE: (20 * Math.PI) / 180,
  MAX_ALTITUDE: 30,
  RESPAWN_DELAY: 2,
} as const;

export function spawnCraft(terrain: Terrain): CraftState {
  const pad = terrain.padCentre();
  return {
    pos: { ...pad },
    vel: { x: 0, y: 0, z: 0 },
    tilt: { x: 0, z: 0 },
    heading: 0,
    fuel: CRAFT.MAX_FUEL,
    thrusting: false,
    status: 'landed',
    respawnIn: 0,
  };
}

/** Tilt angle in radians for the craft's current attitude. */
export function tiltAngle(state: CraftState): number {
  return Math.min(1, Math.hypot(state.tilt.x, state.tilt.z)) * CRAFT.MAX_TILT;
}

/** Unit vector along which the thruster pushes (the craft's local "up"). */
export function thrustDirection(state: CraftState): Vec3 {
  const mag = Math.hypot(state.tilt.x, state.tilt.z);
  if (mag < 1e-9) return { x: 0, y: 1, z: 0 };
  const angle = tiltAngle(state);
  const s = Math.sin(angle) / mag;
  return { x: state.tilt.x * s, y: Math.cos(angle), z: state.tilt.z * s };
}

/**
 * Advances the craft by `dt` seconds. Mutates and returns `state`.
 * Screen up maps to world -z because the camera always looks north (-z).
 */
export function stepCraft(state: CraftState, input: CraftInput, terrain: Terrain, dt: number): CraftState {
  if (state.status === 'crashed') {
    state.thrusting = false;
    state.respawnIn -= dt;
    if (state.respawnIn <= 0) Object.assign(state, spawnCraft(terrain));
    return state;
  }

  // Attitude eases toward the aim point; a landed craft stays upright.
  let tx = state.status === 'landed' ? 0 : input.aimX;
  let tz = state.status === 'landed' ? 0 : -input.aimY;
  const aimMag = Math.hypot(tx, tz);
  if (aimMag > 1) {
    tx /= aimMag;
    tz /= aimMag;
  }
  const k = Math.min(1, dt * CRAFT.ATTITUDE_RATE);
  state.tilt.x += (tx - state.tilt.x) * k;
  state.tilt.z += (tz - state.tilt.z) * k;
  if (Math.hypot(state.tilt.x, state.tilt.z) > 0.05) {
    state.heading = Math.atan2(state.tilt.x, -state.tilt.z);
  }

  // Forces.
  state.thrusting = input.thrust && state.fuel > 0;
  if (state.thrusting) {
    const dir = thrustDirection(state);
    state.vel.x += dir.x * CRAFT.THRUST * dt;
    state.vel.y += dir.y * CRAFT.THRUST * dt;
    state.vel.z += dir.z * CRAFT.THRUST * dt;
    state.fuel = Math.max(0, state.fuel - CRAFT.FUEL_BURN * dt);
  }
  state.vel.y -= CRAFT.GRAVITY * dt;
  const drag = Math.max(0, 1 - CRAFT.DRAG * dt);
  state.vel.x *= drag;
  state.vel.y *= drag;
  state.vel.z *= drag;

  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  state.pos.z += state.vel.z * dt;

  if (state.pos.y > CRAFT.MAX_ALTITUDE) {
    state.pos.y = CRAFT.MAX_ALTITUDE;
    state.vel.y = Math.min(0, state.vel.y);
  }

  // Ground contact.
  const ground = terrain.heightAt(state.pos.x, state.pos.z);
  if (state.pos.y > ground) {
    state.status = 'flying';
    return state;
  }

  if (state.status === 'flying' && !isSafeTouchdown(state, terrain)) {
    state.pos.y = ground;
    state.vel = { x: 0, y: 0, z: 0 };
    state.status = 'crashed';
    state.respawnIn = CRAFT.RESPAWN_DELAY;
    return state;
  }

  // Resting on the ground: the craft settles level.
  state.pos.y = ground;
  state.vel = { x: 0, y: 0, z: 0 };
  state.tilt = { x: 0, z: 0 };
  state.status = 'landed';
  if (terrain.tileTypeAt(state.pos.x, state.pos.z) === 'pad') {
    state.fuel = Math.min(CRAFT.MAX_FUEL, state.fuel + CRAFT.REFUEL_RATE * dt);
  }
  return state;
}

function isSafeTouchdown(state: CraftState, terrain: Terrain): boolean {
  const { x, z } = state.pos;
  if (terrain.tileTypeAt(x, z) === 'sea') return false;
  if (-state.vel.y > CRAFT.SAFE_LANDING_VSPEED) return false;
  if (Math.hypot(state.vel.x, state.vel.z) > CRAFT.SAFE_LANDING_HSPEED) return false;
  if (tiltAngle(state) > CRAFT.SAFE_LANDING_TILT) return false;
  return Math.acos(terrain.normalAt(x, z).y) <= CRAFT.SAFE_LANDING_SLOPE;
}
