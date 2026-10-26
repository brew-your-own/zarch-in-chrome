import type { CraftState, Vec3 } from './craft';
import type { Terrain } from './terrain';

/**
 * A mutant is a seeder left alive too long. It stops wandering and stalks the craft from
 * above, then dives at it in a straight line, pulls up and stalks again. Like seeders, its
 * position is kept wrapped into [0, size).
 */
export interface Mutant {
  /** The seeder's id, kept so a missile locked onto the seeder follows the mutant. */
  id: number;
  pos: Vec3;
  vel: Vec3;
  phase: 'stalk' | 'dive' | 'recover';
  /** Seconds left in this phase (before the next dive while stalking). */
  timer: number;
  /** Which way it circles the craft while stalking (+1 or -1). */
  side: 1 | -1;
  /** Seconds until it drops its next spore. */
  dropIn: number;
}

export const MUTANT_RADIUS = 0.42;
export const MUTANT_POINTS = 300;
/** Horizontal distance and height above the craft it stalks from. */
const STALK_DISTANCE = 6;
const STALK_ABOVE = 2.5;
/** It circles the craft at this speed while stalking, swaying in and out. */
const ORBIT_SPEED = 2.5;
const SWAY = 2;
/** Seconds between dives (random in this range). */
const STALK_TIME = [1.8, 3.4] as const;
/** It only dives at a craft this close (3D). */
export const DIVE_RANGE = 10;
/** A dive is this much faster than the mutant's speed and lasts at most this long. */
export const DIVE_BOOST = 1.6;
const DIVE_TIME = 1.4;
const RECOVER_TIME = 1;
/** Share of the craft's motion during the dive that it leads. */
const DIVE_LEAD = 0.5;
const STEER_RATE = 3;
/** Height above the ground (here and just ahead) it never goes below; a dive pulls out here. */
export const MUTANT_FLOOR = 0.8;

/** The mutant a seeder at `pos` turns into, with the same id. */
export function mutate(id: number, pos: Vec3, vel: Vec3, rng: () => number): Mutant {
  return {
    id,
    pos: { ...pos },
    vel: { ...vel },
    phase: 'recover',
    timer: RECOVER_TIME,
    side: rng() < 0.5 ? 1 : -1,
    dropIn: 1 + rng(),
  };
}

/**
 * Moves one mutant: it stalks the craft from above, swaying, then dives at where the craft
 * is heading. It won't start a dive at a wrecked craft or one sitting on the pad.
 */
export function flyMutant(m: Mutant, craft: CraftState, terrain: Terrain, dt: number, speed: number, maxAltitude: number, rng: () => number): void {
  const dx = terrain.delta(m.pos.x, craft.pos.x);
  const dz = terrain.delta(m.pos.z, craft.pos.z);
  const dy = craft.pos.y - m.pos.y;
  const dist = Math.hypot(dx, dz);
  m.timer -= dt;

  const onPad = craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
  if (m.phase === 'dive') {
    // Straight on, until the dive runs out or would hit the ground.
    const ahead = terrain.heightAt(m.pos.x + m.vel.x * 0.3, m.pos.z + m.vel.z * 0.3);
    if (m.timer <= 0 || m.pos.y + m.vel.y * 0.3 < ahead + MUTANT_FLOOR) {
      m.phase = 'recover';
      m.timer = RECOVER_TIME;
    }
  } else if (m.phase === 'stalk' && m.timer <= 0 && craft.status !== 'crashed' && !onPad && Math.hypot(dist, dy) < DIVE_RANGE) {
    startDive(m, craft, dx, dy, dz, speed * DIVE_BOOST);
  } else {
    const ground = Math.max(terrain.heightAt(m.pos.x, m.pos.z), terrain.heightAt(m.pos.x + m.vel.x * 0.5, m.pos.z + m.vel.z * 0.5));
    let wantX = 0;
    let wantY = 0;
    let wantZ = 0;
    if (m.phase === 'recover') {
      // Climb away, slowing down.
      wantX = m.vel.x * 0.5;
      wantZ = m.vel.z * 0.5;
      wantY = speed * 0.5;
      if (m.timer <= 0) {
        m.phase = 'stalk';
        m.timer = STALK_TIME[0] + (STALK_TIME[1] - STALK_TIME[0]) * rng();
      }
    } else if (dist > 1e-6) {
      // Circle the craft from above, swaying in and out.
      const ux = dx / dist;
      const uz = dz / dist;
      const standoff = STALK_DISTANCE + SWAY * Math.sin(m.timer * 2.3 + m.id);
      const closing = Math.max(-1, Math.min(1, (dist - standoff) / 3)) * speed;
      wantX = ux * closing - uz * m.side * ORBIT_SPEED;
      wantZ = uz * closing + ux * m.side * ORBIT_SPEED;
      const target = Math.min(maxAltitude, Math.max(ground + MUTANT_FLOOR + 1, craft.pos.y + STALK_ABOVE));
      wantY = Math.max(-speed, Math.min(speed, (target - m.pos.y) * 2));
    }
    const want = Math.hypot(wantX, wantZ);
    if (want > speed) {
      wantX = (wantX / want) * speed;
      wantZ = (wantZ / want) * speed;
    }
    const k = Math.min(1, dt * STEER_RATE);
    m.vel.x += (wantX - m.vel.x) * k;
    m.vel.y += (wantY - m.vel.y) * k;
    m.vel.z += (wantZ - m.vel.z) * k;
    if (m.pos.y < ground + MUTANT_FLOOR) m.vel.y = Math.max(m.vel.y, speed * 0.5);
  }

  m.pos.x = terrain.wrap(m.pos.x + m.vel.x * dt);
  m.pos.y = Math.min(maxAltitude, Math.max(m.pos.y + m.vel.y * dt, terrain.heightAt(m.pos.x, m.pos.z) + 0.4));
  m.pos.z = terrain.wrap(m.pos.z + m.vel.z * dt);
}

/** Sets off at `diveSpeed` towards where the craft will be, leading part of its motion. */
function startDive(m: Mutant, craft: CraftState, dx: number, dy: number, dz: number, diveSpeed: number): void {
  const lead = (Math.hypot(dx, dy, dz) / diveSpeed) * DIVE_LEAD;
  const ax = dx + craft.vel.x * lead;
  const ay = dy + craft.vel.y * lead;
  const az = dz + craft.vel.z * lead;
  const len = Math.hypot(ax, ay, az) || 1;
  m.vel = { x: (ax / len) * diveSpeed, y: (ay / len) * diveSpeed, z: (az / len) * diveSpeed };
  m.phase = 'dive';
  m.timer = DIVE_TIME;
}
