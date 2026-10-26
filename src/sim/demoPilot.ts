import { autopilotInput, CLEARANCE, highestObstacle, steer } from './autopilot';
import { noseDirection, type CraftInput, type CraftState, type Physics } from './craft';
import { DEFAULT_ENEMIES, SEEDER_RADIUS, type EnemySettings, type EnemyState, type Seeder } from './enemies';
import { createRng } from './rng';
import type { Terrain } from './terrain';
import type { Arsenal, WeaponSettings } from './weapons';

/**
 * The title screen's computer pilot. It guards the area around `home` (the title lettering):
 * it hunts seeders that come within `LEASH` of it, hovers about while there are none,
 * and flies back to the pad to refuel when low or between waves. It uses every control
 * the player has, so the title screen can show each one as it happens.
 */
export type DemoMode = 'patrol' | 'hunt' | 'refuel';

export interface DemoPilot {
  mode: DemoMode;
  targetId: number | null;
  patrol: { x: number; z: number };
  /** Seconds until a new patrol point is picked. */
  patrolIn: number;
  /** Seconds until a missile may be fired. */
  missileIn: number;
  rng: () => number;
}

/** What the pilot does this step: the craft input plus the buttons a player would press. */
export interface DemoCommand {
  input: CraftInput;
  fire: boolean;
  bomb: boolean;
  missile: boolean;
  mode: DemoMode;
}

/** Enemies on the title screen: fewer, slower seeders that never mutate, no fighters or bombers, a quicker virus. */
export const DEMO_ENEMIES: Readonly<EnemySettings> = Object.freeze({
  ...DEFAULT_ENEMIES,
  firstWave: 2,
  seederSpeed: 2,
  sporeInterval: 1.2,
  virusSpread: 0.05,
  fighters: 0,
  mutateAfter: 0,
  bombers: 0,
  difficultyRamp: 0.15,
});

/** Seeders further than this from home are left alone. */
const LEASH = 14;
/** Patrol points lie within this distance of home. */
const PATROL_RADIUS = 6;
const PATROL_SPEED = 2.5;
const HUNT_SPEED = 5;
/** The pilot starts a gun run from this far, and breaks off nearer than `CLOSEST`. */
const GUN_RANGE = 5.5;
const FIRE_RANGE = 7;
const CLOSEST = 2.5;
const RETREAT_SPEED = 2;
/** Lean during a gun run, and the steepest lean on the way to one. */
const GUN_LEAN = (10 * Math.PI) / 180;
const APPROACH_LEAN = (25 * Math.PI) / 180;
/** A shot is taken when it would pass within this many seeder radii. */
const HIT_MARGIN = 0.9;
/** Heads for the pad below this share of a full tank, and takes off again once refilled. */
const LOW_FUEL = 0.35;
const FULL = 0.98;
/** A bomb goes off when this many seeders are within this share of the bomb's radius. */
const BOMB_CROWD = 2;
const BOMB_REACH = 0.7;

export function createDemoPilot(seed: number): DemoPilot {
  return { mode: 'refuel', targetId: null, patrol: { x: 0, z: 0 }, patrolIn: 0, missileIn: 6, rng: createRng(seed) };
}

const IDLE: CraftInput = { aimX: 0, aimY: 0, thrust: false };

export function stepDemoPilot(
  pilot: DemoPilot,
  craft: CraftState,
  enemies: EnemyState,
  arsenal: Arsenal,
  terrain: Terrain,
  physics: Physics,
  weapons: WeaponSettings,
  home: { x: number; z: number },
  dt: number,
): DemoCommand {
  const command = (input: CraftInput, fire = false, bomb = false, missile = false): DemoCommand => ({ input, fire, bomb, missile, mode: pilot.mode });
  if (craft.status === 'crashed') {
    pilot.mode = 'refuel';
    return command(IDLE);
  }

  // Refuel when low, and wait on the pad between waves.
  const onPad = craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
  if (craft.fuel < LOW_FUEL * physics.maxFuel || enemies.seeders.length === 0) pilot.mode = 'refuel';
  if (pilot.mode === 'refuel') {
    if (!onPad) return command(autopilotInput(craft, terrain, physics));
    if (craft.fuel < FULL * physics.maxFuel || enemies.seeders.length === 0) return command(IDLE);
    pilot.mode = 'patrol';
  }

  const fromHome = (p: { x: number; z: number }) => Math.hypot(terrain.delta(home.x, p.x), terrain.delta(home.z, p.z));
  const fromCraft = (p: { x: number; z: number }) => Math.hypot(terrain.delta(craft.pos.x, p.x), terrain.delta(craft.pos.z, p.z));
  const near = enemies.seeders.filter((s) => fromHome(s.pos) < LEASH);
  let target = near.find((s) => s.id === pilot.targetId);
  if (!target) target = near.reduce<Seeder | undefined>((best, s) => (!best || fromCraft(s.pos) < fromCraft(best.pos) ? s : best), undefined);
  pilot.targetId = target?.id ?? null;
  pilot.mode = target ? 'hunt' : 'patrol';

  const bomb = arsenal.bombs > 0 && enemies.seeders.filter((s) => fromCraft(s.pos) < weapons.bombRadius * BOMB_REACH).length >= BOMB_CROWD;
  pilot.missileIn -= dt;
  let missile = false;
  if (target && arsenal.missiles > 0 && pilot.missileIn <= 0 && fromCraft(target.pos) > FIRE_RANGE + 3) {
    missile = true;
    pilot.missileIn = 8 + 8 * pilot.rng();
  }

  if (!target) return command(patrol(pilot, craft, terrain, physics, home, dt), false, bomb, missile);
  const { input, fire } = hunt(craft, target, terrain, physics);
  return command(input, fire, bomb, missile);
}

/** Drifts between random points near home, high enough to clear what lies on the way. */
function patrol(pilot: DemoPilot, craft: CraftState, terrain: Terrain, physics: Physics, home: { x: number; z: number }, dt: number): CraftInput {
  pilot.patrolIn -= dt;
  let dx = terrain.delta(craft.pos.x, pilot.patrol.x);
  let dz = terrain.delta(craft.pos.z, pilot.patrol.z);
  if (pilot.patrolIn <= 0 || Math.hypot(dx, dz) < 0.8) {
    const angle = pilot.rng() * Math.PI * 2;
    const r = PATROL_RADIUS * Math.sqrt(pilot.rng());
    pilot.patrol = { x: terrain.wrap(home.x + Math.cos(angle) * r), z: terrain.wrap(home.z + Math.sin(angle) * r) };
    pilot.patrolIn = 4 + 3 * pilot.rng();
    dx = terrain.delta(craft.pos.x, pilot.patrol.x);
    dz = terrain.delta(craft.pos.z, pilot.patrol.z);
  }
  const distance = Math.hypot(dx, dz);
  const cruise = highestObstacle(terrain, craft.pos.x, craft.pos.z, dx, dz, distance) + CLEARANCE + 0.8;
  const speed = Math.min(PATROL_SPEED, distance * 0.8);
  const ux = distance > 1e-6 ? dx / distance : 0;
  const uz = distance > 1e-6 ? dz / distance : 0;
  return steer(craft, physics, ux * speed, climb(craft, cruise), uz * speed);
}

/**
 * Makes gun runs at the seeder, aiming at where it will be when a bullet gets there. Out of
 * range, or too close, the craft flies to `GUN_RANGE` from it. In range, it leans gently
 * towards it: the nose follows the lean and dips with it, so the craft holds a little above
 * the seeder to keep the nose on it. It fires whenever a bullet fired now would hit.
 */
function hunt(craft: CraftState, s: Seeder, terrain: Terrain, physics: Physics): { input: CraftInput; fire: boolean } {
  const dx = terrain.delta(craft.pos.x, s.pos.x);
  const dz = terrain.delta(craft.pos.z, s.pos.z);
  const lead = Math.hypot(dx, dz) / Math.max(1, physics.bulletSpeed);
  const ax = dx + s.vel.x * lead;
  const az = dz + s.vel.z * lead;
  const aimDistance = Math.max(1e-6, Math.hypot(ax, az));
  const ux = ax / aimDistance;
  const uz = az / aimDistance;

  const reach = Math.min(aimDistance, 3);
  const clear = highestObstacle(terrain, craft.pos.x, craft.pos.z, ux * reach, uz * reach, reach) + CLEARANCE;
  const wantVy = climb(craft, Math.max(clear, s.pos.y + aimDistance * Math.tan(GUN_LEAN)));
  const fire = aimDistance < FIRE_RANGE && wouldHit(craft, s, terrain, physics);
  if (aimDistance > FIRE_RANGE || aimDistance < CLOSEST) {
    const speed = Math.max(-RETREAT_SPEED, Math.min(HUNT_SPEED, (aimDistance - GUN_RANGE) * 1.2));
    return { input: steer(craft, physics, s.vel.x + ux * speed, wantVy, s.vel.z + uz * speed, APPROACH_LEAN), fire };
  }
  const aim = physics.maxTilt > 0 ? Math.min(1, GUN_LEAN / physics.maxTilt) : 0;
  return { input: { aimX: ux * aim, aimY: -uz * aim, thrust: craft.vel.y < wantVy }, fire };
}

/**
 * Whether a bullet fired now would pass within reach of the seeder, both flying straight:
 * the closest approach of the two paths within the bullet's life.
 */
export function wouldHit(craft: CraftState, s: Seeder, terrain: Terrain, physics: Physics): boolean {
  const nose = noseDirection(craft, physics);
  const rx = terrain.delta(craft.pos.x + nose.x * 0.5, s.pos.x);
  const ry = s.pos.y - (craft.pos.y + nose.y * 0.5);
  const rz = terrain.delta(craft.pos.z + nose.z * 0.5, s.pos.z);
  const wx = s.vel.x - craft.vel.x - nose.x * physics.bulletSpeed;
  const wy = s.vel.y - craft.vel.y - nose.y * physics.bulletSpeed;
  const wz = s.vel.z - craft.vel.z - nose.z * physics.bulletSpeed;
  const w2 = wx * wx + wy * wy + wz * wz;
  const t = w2 > 1e-9 ? Math.max(0, Math.min(physics.bulletLife, -(rx * wx + ry * wy + rz * wz) / w2)) : 0;
  const reach = SEEDER_RADIUS * HIT_MARGIN;
  return Math.hypot(rx + wx * t, rz + wz * t) < reach && Math.abs(ry + wy * t) < reach;
}

/** Vertical speed that brings the craft to height `y`. */
function climb(craft: CraftState, y: number): number {
  return Math.max(-3, Math.min(3, (y - craft.pos.y) * 1.2));
}
