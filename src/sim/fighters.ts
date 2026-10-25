import { CRAFT_RADIUS, type CraftState, type Vec3 } from './craft';
import type { Terrain } from './terrain';
import { hitsTree } from './trees';

/**
 * Fighters hunt the craft: they close to a stand-off distance, circle it and fire.
 * Like seeders, their positions (and their shots') are kept wrapped into [0, size).
 */
export interface Fighter {
  id: number;
  pos: Vec3;
  vel: Vec3;
  /** Yaw of the nose, same convention as the craft: atan2(x, -z). */
  heading: number;
  /** Seconds until it may fire again. */
  cooldown: number;
  /** Which way it circles the craft (+1 or -1). */
  side: 1 | -1;
  /** Preferred horizontal distance from the craft. */
  standoff: number;
}

export interface EnemyShot {
  pos: Vec3;
  vel: Vec3;
  age: number;
}

/** The fighter knobs from `EnemySettings`. */
export interface FighterSettings {
  fighterSpeed: number;
  fighterFireInterval: number;
}

export const FIGHTER_RADIUS = 0.35;
export const FIGHTER_POINTS = 200;
/** Height above the ground (here and just ahead) a fighter never goes below. */
export const FIGHTER_FLOOR = 1.6;
/** Horizontal distance kept from the craft, give or take a unit per fighter. */
const STANDOFF = 5.5;
const ORBIT_SPEED = 2;
const STEER_RATE = 2.5;
const CLIMB_RATE = 2;
const MAX_CLIMB = 3.5;
/** Fighters fly a little above the craft, to shoot down at it. */
const ABOVE_CRAFT = 1;
/** Shots are fired when the craft is within this distance (3D). */
export const FIRE_RANGE = 9;
export const SHOT_SPEED = 9;
export const SHOT_LIFE = 1.6;
/** Random aiming error (radians, either way), so not every shot is a hit. */
const AIM_ERROR = 0.06;
/** A shot hits the craft within this horizontal radius and vertical half-height. */
const SHOT_HIT_RADIUS = CRAFT_RADIUS + 0.08;
const SHOT_HIT_HEIGHT = 0.25;

export function spawnFighter(id: number, x: number, z: number, terrain: Terrain, rng: () => number): Fighter {
  return {
    id,
    pos: { x, y: terrain.heightAt(x, z) + FIGHTER_FLOOR + 2, z },
    vel: { x: 0, y: 0, z: 0 },
    heading: 0,
    cooldown: 1 + rng() * 2,
    side: rng() < 0.5 ? 1 : -1,
    standoff: STANDOFF + (rng() * 2 - 1),
  };
}

/**
 * Moves one fighter towards its station near the craft. Returns a new shot when it fires.
 * It holds its fire while the craft is wrecked or sitting on the pad (the pad is a safe haven).
 */
export function flyFighter(
  f: Fighter,
  craft: CraftState,
  terrain: Terrain,
  dt: number,
  settings: FighterSettings,
  maxAltitude: number,
  rng: () => number,
): EnemyShot | null {
  const dx = terrain.delta(f.pos.x, craft.pos.x);
  const dz = terrain.delta(f.pos.z, craft.pos.z);
  const dist = Math.hypot(dx, dz);
  const speed = settings.fighterSpeed;

  // Head for the stand-off ring while circling round it.
  let wantX = 0;
  let wantZ = 0;
  if (dist > 1e-6) {
    const ux = dx / dist;
    const uz = dz / dist;
    const closing = Math.max(-1, Math.min(1, (dist - f.standoff) / 3)) * speed;
    wantX = ux * closing - uz * f.side * ORBIT_SPEED;
    wantZ = uz * closing + ux * f.side * ORBIT_SPEED;
    const want = Math.hypot(wantX, wantZ);
    if (want > speed) {
      wantX = (wantX / want) * speed;
      wantZ = (wantZ / want) * speed;
    }
  }
  const k = Math.min(1, dt * STEER_RATE);
  f.vel.x += (wantX - f.vel.x) * k;
  f.vel.z += (wantZ - f.vel.z) * k;

  // Altitude: just above the craft, but never below the floor over the ground here and ahead.
  const ground = Math.max(terrain.heightAt(f.pos.x, f.pos.z), terrain.heightAt(f.pos.x + f.vel.x * 0.6, f.pos.z + f.vel.z * 0.6));
  const target = Math.min(maxAltitude, Math.max(ground + FIGHTER_FLOOR, craft.pos.y + ABOVE_CRAFT));
  f.vel.y = Math.max(-MAX_CLIMB, Math.min(MAX_CLIMB, (target - f.pos.y) * CLIMB_RATE));

  f.pos.x = terrain.wrap(f.pos.x + f.vel.x * dt);
  f.pos.y = Math.max(f.pos.y + f.vel.y * dt, ground + 0.5);
  f.pos.z = terrain.wrap(f.pos.z + f.vel.z * dt);
  if (Math.hypot(f.vel.x, f.vel.z) > 0.1) f.heading = Math.atan2(f.vel.x, -f.vel.z);

  f.cooldown -= dt;
  const onPad = craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
  if (f.cooldown > 0 || craft.status === 'crashed' || onPad) return null;
  const dy = craft.pos.y - f.pos.y;
  if (Math.hypot(dx, dy, dz) > FIRE_RANGE) return null;

  f.cooldown = settings.fighterFireInterval * (0.7 + 0.6 * rng());
  return aimShot(f.pos, craft, dx, dy, dz, rng);
}

/** A shot from `from` towards where the craft will be when it arrives, with some aiming error. */
function aimShot(from: Vec3, craft: CraftState, dx: number, dy: number, dz: number, rng: () => number): EnemyShot {
  const flight = Math.hypot(dx, dy, dz) / SHOT_SPEED;
  let ax = dx + craft.vel.x * flight;
  let ay = dy + craft.vel.y * flight;
  let az = dz + craft.vel.z * flight;
  const len = Math.hypot(ax, ay, az) || 1;
  ax = ax / len + (rng() * 2 - 1) * AIM_ERROR;
  ay = ay / len + (rng() * 2 - 1) * AIM_ERROR;
  az = az / len + (rng() * 2 - 1) * AIM_ERROR;
  const n = Math.hypot(ax, ay, az) || 1;
  return {
    pos: { ...from },
    vel: { x: (ax / n) * SHOT_SPEED, y: (ay / n) * SHOT_SPEED, z: (az / n) * SHOT_SPEED },
    age: 0,
  };
}

export type ShotOutcome = 'flying' | 'hitCraft' | 'spent';

/** Moves a shot. It is spent on hitting the ground, a tree or running out of time. */
export function moveShot(shot: EnemyShot, craft: CraftState, terrain: Terrain, dt: number): ShotOutcome {
  // Two half steps, so a shot can't pass through the craft between frames.
  for (let half = 0; half < 2; half++) {
    shot.pos.x = terrain.wrap(shot.pos.x + shot.vel.x * dt * 0.5);
    shot.pos.y += shot.vel.y * dt * 0.5;
    shot.pos.z = terrain.wrap(shot.pos.z + shot.vel.z * dt * 0.5);
    if (craft.status !== 'crashed') {
      const hx = terrain.delta(craft.pos.x, shot.pos.x);
      const hz = terrain.delta(craft.pos.z, shot.pos.z);
      if (hx * hx + hz * hz < SHOT_HIT_RADIUS * SHOT_HIT_RADIUS && Math.abs(shot.pos.y - craft.pos.y - 0.05) < SHOT_HIT_HEIGHT) {
        return 'hitCraft';
      }
    }
    if (shot.pos.y <= terrain.heightAt(shot.pos.x, shot.pos.z)) return 'spent';
    if (hitsTree(terrain, shot.pos.x, shot.pos.y, shot.pos.z, 0)) return 'spent';
  }
  shot.age += dt;
  return shot.age > SHOT_LIFE ? 'spent' : 'flying';
}
