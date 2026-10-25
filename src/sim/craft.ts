import type { Terrain } from './terrain';
import { hitsTree } from './trees';

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
   * Its direction is where the craft leans; its length scales up to `Physics.maxTilt`.
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

/**
 * Tunable flight model. Units: world units (1 tile = 1 unit), seconds, radians.
 * Passed into the sim functions so it can be changed at runtime from the settings panel.
 */
export interface Physics {
  gravity: number;
  thrust: number;
  drag: number;
  maxTilt: number;
  /** How quickly the craft's attitude follows the mouse (1/s). */
  attitudeRate: number;
  maxFuel: number;
  fuelBurn: number;
  refuelRate: number;
  safeLandingVSpeed: number;
  safeLandingHSpeed: number;
  safeLandingTilt: number;
  /** Steepest ground (angle from horizontal) the craft can land on. */
  safeLandingSlope: number;
  maxAltitude: number;
  respawnDelay: number;
}

/** Horizontal radius of the craft's hull, for collisions with objects. */
export const CRAFT_RADIUS = 0.25;

export const DEFAULT_PHYSICS: Readonly<Physics> = Object.freeze({
  gravity: 2.5,
  thrust: 6.5,
  drag: 0.2,
  maxTilt: (70 * Math.PI) / 180,
  attitudeRate: 8,
  maxFuel: 100,
  fuelBurn: 4,
  refuelRate: 25,
  safeLandingVSpeed: 1.6,
  safeLandingHSpeed: 1.6,
  safeLandingTilt: (25 * Math.PI) / 180,
  safeLandingSlope: (20 * Math.PI) / 180,
  maxAltitude: 30,
  respawnDelay: 2,
});

export function spawnCraft(terrain: Terrain, physics: Physics = DEFAULT_PHYSICS): CraftState {
  const pad = terrain.padCentre();
  return {
    pos: { ...pad },
    vel: { x: 0, y: 0, z: 0 },
    tilt: { x: 0, z: 0 },
    heading: 0,
    fuel: physics.maxFuel,
    thrusting: false,
    status: 'landed',
    respawnIn: 0,
  };
}

/** Tilt angle in radians for the craft's current attitude. */
export function tiltAngle(state: CraftState, physics: Physics = DEFAULT_PHYSICS): number {
  return Math.min(1, Math.hypot(state.tilt.x, state.tilt.z)) * physics.maxTilt;
}

/** Unit vector along which the thruster pushes (the craft's local "up"). */
export function thrustDirection(state: CraftState, physics: Physics = DEFAULT_PHYSICS): Vec3 {
  const mag = Math.hypot(state.tilt.x, state.tilt.z);
  if (mag < 1e-9) return { x: 0, y: 1, z: 0 };
  const angle = tiltAngle(state, physics);
  const s = Math.sin(angle) / mag;
  return { x: state.tilt.x * s, y: Math.cos(angle), z: state.tilt.z * s };
}

/**
 * Advances the craft by `dt` seconds. Mutates and returns `state`.
 * Screen up maps to world -z because the camera always looks north (-z).
 */
export function stepCraft(
  state: CraftState,
  input: CraftInput,
  terrain: Terrain,
  dt: number,
  physics: Physics = DEFAULT_PHYSICS,
): CraftState {
  if (state.status === 'crashed') {
    state.thrusting = false;
    state.respawnIn -= dt;
    if (state.respawnIn <= 0) Object.assign(state, spawnCraft(terrain, physics));
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
  const k = Math.min(1, dt * physics.attitudeRate);
  state.tilt.x += (tx - state.tilt.x) * k;
  state.tilt.z += (tz - state.tilt.z) * k;
  if (Math.hypot(state.tilt.x, state.tilt.z) > 0.05) {
    state.heading = Math.atan2(state.tilt.x, -state.tilt.z);
  }

  // Forces.
  state.thrusting = input.thrust && state.fuel > 0;
  if (state.thrusting) {
    const dir = thrustDirection(state, physics);
    state.vel.x += dir.x * physics.thrust * dt;
    state.vel.y += dir.y * physics.thrust * dt;
    state.vel.z += dir.z * physics.thrust * dt;
    state.fuel = Math.max(0, state.fuel - physics.fuelBurn * dt);
  }
  state.vel.y -= physics.gravity * dt;
  const drag = Math.max(0, 1 - physics.drag * dt);
  state.vel.x *= drag;
  state.vel.y *= drag;
  state.vel.z *= drag;

  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  state.pos.z += state.vel.z * dt;

  if (state.pos.y > physics.maxAltitude) {
    state.pos.y = physics.maxAltitude;
    state.vel.y = Math.min(0, state.vel.y);
  }

  if (hitsTree(terrain, state.pos.x, state.pos.y, state.pos.z, CRAFT_RADIUS)) {
    crash(state, physics);
    return state;
  }

  // Ground contact.
  const ground = terrain.heightAt(state.pos.x, state.pos.z);
  if (state.pos.y > ground) {
    state.status = 'flying';
    return state;
  }

  if (state.status === 'flying' && !isSafeTouchdown(state, terrain, physics)) {
    state.pos.y = ground;
    crash(state, physics);
    return state;
  }

  // Resting on the ground: the craft settles level.
  state.pos.y = ground;
  state.vel = { x: 0, y: 0, z: 0 };
  state.tilt = { x: 0, z: 0 };
  state.status = 'landed';
  if (terrain.tileTypeAt(state.pos.x, state.pos.z) === 'pad') {
    state.fuel = Math.min(physics.maxFuel, state.fuel + physics.refuelRate * dt);
  }
  return state;
}

function crash(state: CraftState, physics: Physics): void {
  state.vel = { x: 0, y: 0, z: 0 };
  state.status = 'crashed';
  state.respawnIn = physics.respawnDelay;
}

function isSafeTouchdown(state: CraftState, terrain: Terrain, physics: Physics): boolean {
  const { x, z } = state.pos;
  if (terrain.tileTypeAt(x, z) === 'sea') return false;
  if (-state.vel.y > physics.safeLandingVSpeed) return false;
  if (Math.hypot(state.vel.x, state.vel.z) > physics.safeLandingHSpeed) return false;
  if (tiltAngle(state, physics) > physics.safeLandingTilt) return false;
  return Math.acos(terrain.normalAt(x, z).y) <= physics.safeLandingSlope;
}
