import type { Vec3 } from './craft';
import type { Spore } from './enemies';
import type { Terrain } from './terrain';

/**
 * A bomber flies dead straight across the map, high up, laying bombs one tile apart in
 * runs, so the virus spreads in lines rather than the seeders' scatter. Between runs it
 * sometimes turns by 45°. It takes several hits. Like seeders, its position is kept
 * wrapped into [0, size).
 */
export interface Bomber {
  id: number;
  pos: Vec3;
  vel: Vec3;
  /** Yaw of the nose, same convention as the craft: atan2(x, -z). */
  heading: number;
  /** The heading it is turning to. */
  course: number;
  /** Hits left. */
  hp: number;
  /** Whether it is on a bombing run (else between runs). */
  dropping: boolean;
  /** Distance (tiles) left in this run or gap, and to the next bomb. */
  leg: number;
  nextDrop: number;
}

export const BOMBER_RADIUS = 0.6;
export const BOMBER_POINTS = 250;
export const BOMBER_HITS = 3;
/** Height bombers keep above the ground under and just ahead of them. */
export const BOMBER_CRUISE = 3.5;
/** Tiles bombed in a row, then tiles flown before the next run. */
export const RUN_LENGTH = 6;
const GAP_LENGTH = 14;
const DROP_SPACING = 1;
/** Chance of turning by 45° at the end of each gap, and how fast (rad/s). */
const TURN_CHANCE = 0.35;
const TURN_RATE = 0.8;
const CLIMB_RATE = 1.5;
const MAX_CLIMB = 3;

export function spawnBomber(id: number, x: number, z: number, terrain: Terrain, rng: () => number): Bomber {
  // Along one of the eight compass directions, so the lines it lays are clean.
  const heading = Math.floor(rng() * 8) * (Math.PI / 4);
  return {
    id,
    pos: { x, y: terrain.heightAt(x, z) + BOMBER_CRUISE, z },
    vel: { x: 0, y: 0, z: 0 },
    heading,
    course: heading,
    hp: BOMBER_HITS,
    dropping: false,
    leg: GAP_LENGTH * rng(),
    nextDrop: 0,
  };
}

/** Moves one bomber by `dt` at `speed`. Returns a bomb (a spore, which infects the tile it lands on) when it drops one. */
export function flyBomber(b: Bomber, terrain: Terrain, dt: number, speed: number, rng: () => number): Spore | null {
  const turn = Math.atan2(Math.sin(b.course - b.heading), Math.cos(b.course - b.heading));
  b.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn));
  b.vel.x = Math.sin(b.heading) * speed;
  b.vel.z = -Math.cos(b.heading) * speed;
  const ground = Math.max(terrain.heightAt(b.pos.x, b.pos.z), terrain.heightAt(b.pos.x + b.vel.x, b.pos.z + b.vel.z));
  b.vel.y = Math.max(-MAX_CLIMB, Math.min(MAX_CLIMB, (ground + BOMBER_CRUISE - b.pos.y) * CLIMB_RATE));
  b.pos.x = terrain.wrap(b.pos.x + b.vel.x * dt);
  b.pos.y += b.vel.y * dt;
  b.pos.z = terrain.wrap(b.pos.z + b.vel.z * dt);

  const travelled = speed * dt;
  b.leg -= travelled;
  if (b.leg <= 0) {
    b.dropping = !b.dropping;
    b.leg += b.dropping ? RUN_LENGTH : GAP_LENGTH;
    b.nextDrop = 0;
    if (!b.dropping && rng() < TURN_CHANCE) b.course += (rng() < 0.5 ? 1 : -1) * (Math.PI / 4);
  }
  if (!b.dropping) return null;
  b.nextDrop -= travelled;
  if (b.nextDrop > 0) return null;
  b.nextDrop += DROP_SPACING;
  if (!terrain.canInfect(Math.floor(b.pos.x), Math.floor(b.pos.z))) return null;
  return { pos: { ...b.pos, y: b.pos.y - 0.3 }, vel: { x: b.vel.x * 0.3, y: 0, z: b.vel.z * 0.3 } };
}
