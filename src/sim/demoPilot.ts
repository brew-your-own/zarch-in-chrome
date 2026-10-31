import { autopilotInput, CLEARANCE, CRUISE_SPEED, highestObstacle, steer } from './autopilot';
import { buildingBase, buildingHeight, RESCUE_HEIGHT, RESCUE_TIME, type Building } from './buildings';
import { noseDirection, type CraftInput, type CraftState, type Physics } from './craft';
import { DEFAULT_ENEMIES, enemyCount, targets, type EnemySettings, type EnemyState, type Target } from './enemies';
import { createRng } from './rng';
import type { Terrain } from './terrain';
import type { Arsenal, WeaponSettings } from './weapons';

/**
 * The title screen's computer pilot. It guards the area around `home` (the title lettering):
 * it hunts enemies that come within `LEASH` of it, bombers first, hovers about while there
 * are none, sidesteps a mutant's dive, saves infected buildings nearby by hovering over them,
 * and flies back to the pad to refuel when low or between waves. It uses every control the player has, so the title screen can show each
 * one as it happens.
 */
export type DemoMode = 'patrol' | 'hunt' | 'evade' | 'rescue' | 'refuel';

export interface DemoPilot {
  mode: DemoMode;
  targetId: number | null;
  patrol: { x: number; z: number };
  /** Seconds until a new patrol point is picked. */
  patrolIn: number;
  /** Seconds until a missile may be fired. */
  missileIn: number;
  /** While evading a mutant, the direction it is running in. */
  run: { x: number; z: number } | null;
  /** Committed to landing on the pad in a gap between a mutant's dives (`carefulLanding`). */
  landing: boolean;
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

/**
 * Enemies on the title screen: fewer, slower seeders that mutate sooner, a bomber from the
 * second wave, a small swarm of pests with a weak bite from the third, no fighters, and a
 * quicker virus.
 */
export const DEMO_ENEMIES: Readonly<EnemySettings> = Object.freeze({
  ...DEFAULT_ENEMIES,
  firstWave: 2,
  seederSpeed: 2,
  sporeInterval: 1.2,
  virusSpread: 0.05,
  fighters: 0,
  mutateAfter: 60,
  bombers: 1,
  bombersFromWave: 2,
  pests: 3,
  pestsFromWave: 3,
  pestDrain: 6,
  difficultyRamp: 0.15,
});

/** Enemies further than this from home are left alone. */
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
/** A shot is taken when it would pass within this many of the target's radii. */
const HIT_MARGIN = 0.9;
/** Heads for the pad below this share of a full tank, and takes off again once refilled. */
const LOW_FUEL = 0.35;
/** Below this share of a tank it stops evading and goes home regardless. */
const DRY = 0.12;
/**
 * Landing carefully: it runs about within `LAND_LEASH` of the pad, and starts down from within
 * `LAND_NEAR` of it once the mutant is climbing away from a dive or has `SAFE_STALK` seconds of
 * stalking left.
 */
const LAND_LEASH = 3;
const LAND_NEAR = 3;
const SAFE_STALK = 1;
const LANDING_LEAN = (12 * Math.PI) / 180;
/** A gun run at a mutant needs this many seconds of its stalking left, and it within this height. */
const COUNTER_STALK = 1.2;
const COUNTER_HEIGHT = 1.5;
/** Seconds between missiles fired at a mutant it is running from. */
const MUTANT_MISSILE_GAP = 4;
const FULL = 0.98;
/** A bomb goes off when this many enemies are within this share of the bomb's radius. */
const BOMB_CROWD = 2;
const BOMB_REACH = 0.7;
/**
 * With a mutant this close (3D), the pilot runs in straight lines at this speed, the way a
 * player should: a mutant's dive is a straight line too, and it misses a craft that keeps
 * moving. Running further than `RUN_LEASH` from home, it turns back.
 */
const EVADE_RANGE = 12;
const EVADE_SPEED = 5;
const RUN_LEASH = 9;
const RUN_LEAN = (35 * Math.PI) / 180;
/**
 * Infected buildings within this distance of home are saved, if the pilot can get there
 * (at about `RESCUE_SPEED`) and hover `RESCUE_TIME` before they fall. It hovers this far
 * above the roof, and settles once within `OVER_BUILDING` of it.
 */
const RESCUE_LEASH = 18;
const RESCUE_SPEED = 4;
const ROOF_CLEARANCE = 0.7;
const OVER_BUILDING = 0.8;

/**
 * How far from home the pilot ranges: it hunts enemies within `leash`, saves buildings within
 * `rescueLeash`, and turns back from a run past `runLeash`. The title screen keeps it close to
 * the lettering; Demo mode plays a whole map, so it goes wherever the enemies are.
 */
export interface DemoReach {
  leash: number;
  rescueLeash: number;
  runLeash: number;
  /** Heads home once fuel only covers the trip back with a margin (`fuelForTrip`), not just below `LOW_FUEL`. */
  tripFuel: boolean;
  /**
   * Picks older seeders first, before they mutate, by counting each second of a seeder's age
   * as this many tiles nearer (0: the nearest enemy first).
   */
  agePull: number;
  /**
   * With a mutant about, goes home at speed and circles near the pad, landing only in the gap
   * after one of its dives; it keeps evading while low on fuel instead of going straight home.
   */
  carefulLanding: boolean;
  /** Turns on a mutant for a gun run in the gap between its dives, instead of only running. */
  counter: boolean;
}

export const TITLE_REACH: Readonly<DemoReach> = Object.freeze({ leash: LEASH, rescueLeash: RESCUE_LEASH, runLeash: RUN_LEASH, tripFuel: false, agePull: 0, carefulLanding: false, counter: false });
export const GAME_REACH: Readonly<DemoReach> = Object.freeze({ leash: Infinity, rescueLeash: Infinity, runLeash: Infinity, tripFuel: true, agePull: 1, carefulLanding: true, counter: true });

/** Seconds the climb out and the landing add to a trip home. */
const TRIP_OVERHEAD = 10;
/** Share of the time the thruster fires on a trip home, and the margin kept on top. */
const TRIP_DUTY = 0.55;
const TRIP_MARGIN = 1.5;

/** Fuel to fly home to the pad from here and land, with a margin. */
export function fuelForTrip(craft: CraftState, terrain: Terrain, physics: Physics): number {
  const pad = terrain.padCentre();
  const distance = Math.hypot(terrain.delta(craft.pos.x, pad.x), terrain.delta(craft.pos.z, pad.z));
  return (distance / CRUISE_SPEED + TRIP_OVERHEAD) * physics.fuelBurn * TRIP_DUTY * TRIP_MARGIN;
}

export function createDemoPilot(seed: number): DemoPilot {
  return { mode: 'refuel', targetId: null, patrol: { x: 0, z: 0 }, patrolIn: 0, missileIn: 6, run: null, landing: false, rng: createRng(seed) };
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
  reach: Readonly<DemoReach> = TITLE_REACH,
): DemoCommand {
  const command = (input: CraftInput, fire = false, bomb = false, missile = false): DemoCommand => ({ input, fire, bomb, missile, mode: pilot.mode });
  if (craft.status === 'crashed') {
    pilot.mode = 'refuel';
    return command(IDLE);
  }

  // Refuel when low, and wait on the pad between waves.
  // A building to save comes before waiting on the pad, but not before refuelling when low.
  const onPad = craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
  const none = enemyCount(enemies) === 0;
  const low = craft.fuel < Math.max(LOW_FUEL * physics.maxFuel, reach.tripFuel ? fuelForTrip(craft, terrain, physics) : 0);
  const saving = low ? null : buildingToSave(craft, terrain, home, reach.rescueLeash);
  if (low || (none && !saving)) pilot.mode = 'refuel';
  else if (saving) pilot.mode = 'rescue';

  // A mutant close by comes first, even on the way to the pad: a craft slowing down to land
  // is what a diving mutant hits. Keep moving round it, shooting when it lines up. On the
  // pad itself the craft is safe, since mutants don't dive at it there.
  // With the tank nearly dry it heads home whatever is about: running out is a sure crash.
  const dry = craft.fuel < Math.max(DRY * physics.maxFuel, reach.tripFuel ? fuelForTrip(craft, terrain, physics) / TRIP_MARGIN : 0);
  // Going home carefully, it runs about near the pad rather than wherever it was.
  const careful = reach.carefulLanding && pilot.mode === 'refuel';
  const pad = terrain.padCentre();
  if (!careful || onPad) pilot.landing = false;
  const evading =
    onPad || (dry && !careful)
      ? null
      : careful
        ? evade(pilot, craft, enemies, terrain, physics, pad, LAND_LEASH, reach.counter)
        : evade(pilot, craft, enemies, terrain, physics, home, reach.runLeash, reach.counter);
  pilot.run = evading ? pilot.run : null;
  pilot.missileIn -= dt;
  if (evading) {
    // Running only buys time, and burns fuel: a missile finishes the mutant, and when fuel
    // is getting low a smart bomb does, if it is close enough.
    const missile = arsenal.missiles > 0 && pilot.missileIn <= 0;
    if (missile) pilot.missileIn = MUTANT_MISSILE_GAP;
    const bomb = low && arsenal.bombs > 0 && evading.distance < weapons.bombRadius * BOMB_REACH;
    if (careful) {
      // Land in the gap after a dive: the mutant climbs away, then stalks a while before the next.
      const mutant = enemies.mutants.find((m) => m.id === pilot.targetId);
      const gap = !mutant || mutant.phase === 'recover' || (mutant.phase === 'stalk' && mutant.timer > SAFE_STALK);
      const padDistance = Math.hypot(terrain.delta(craft.pos.x, pad.x), terrain.delta(craft.pos.z, pad.z));
      if (pilot.landing || (gap && padDistance < LAND_NEAR)) {
        pilot.landing = true;
        return command(quickLanding(craft, terrain, physics), evading.fire, bomb, missile);
      }
      return command(evading.input, evading.fire, bomb, missile);
    }
    pilot.mode = 'evade';
    return command(evading.input, evading.fire, bomb, missile);
  }

  if (pilot.mode === 'refuel') {
    if (!onPad) return command(autopilotInput(craft, terrain, physics));
    if (craft.fuel < FULL * physics.maxFuel || none) return command(IDLE);
    pilot.mode = 'patrol';
  }

  const all = targets(enemies);
  if (saving) {
    pilot.mode = 'rescue';
    return command(rescue(craft, saving, terrain, physics), all.some((t) => wouldHit(craft, t, terrain, physics)));
  }

  const fromHome = (p: { x: number; z: number }) => Math.hypot(terrain.delta(home.x, p.x), terrain.delta(home.z, p.z));
  const fromCraft = (p: { x: number; z: number }) => Math.hypot(terrain.delta(craft.pos.x, p.x), terrain.delta(craft.pos.z, p.z));
  const near = all.filter((t) => fromHome(t.pos) < reach.leash);
  // Bombers lay the most virus, so they are hunted first; otherwise the nearest, keeping the
  // current target. Pests come to the craft anyway, so they are only hunted when nothing else is
  // about; any pest that lines up is shot at whatever the pilot is doing.
  const isPest = (t: Target) => enemies.pests.some((p) => p.id === t.id);
  const bombers = near.filter((t) => enemies.bombers.some((b) => b.id === t.id));
  const others = near.filter((t) => !isPest(t));
  const pool = bombers.length > 0 ? bombers : others.length > 0 ? others : near;
  const swat = all.some((t) => isPest(t) && wouldHit(craft, t, terrain, physics));
  let target = pool.find((t) => t.id === pilot.targetId);
  const age = (t: Target) => enemies.seeders.find((s) => s.id === t.id)?.age ?? 0;
  const cost = (t: Target) => fromCraft(t.pos) - reach.agePull * age(t);
  if (!target) target = pool.reduce<Target | undefined>((best, t) => (!best || cost(t) < cost(best) ? t : best), undefined);
  pilot.targetId = target?.id ?? null;
  pilot.mode = target ? 'hunt' : 'patrol';

  const bomb = arsenal.bombs > 0 && all.filter((t) => fromCraft(t.pos) < weapons.bombRadius * BOMB_REACH).length >= BOMB_CROWD;
  let missile = false;
  if (target && arsenal.missiles > 0 && pilot.missileIn <= 0 && fromCraft(target.pos) > FIRE_RANGE + 3) {
    missile = true;
    pilot.missileIn = 8 + 8 * pilot.rng();
  }

  if (!target) return command(patrol(pilot, craft, terrain, physics, home, dt), swat, bomb, missile);
  const { input, fire } = hunt(craft, target, terrain, physics);
  return command(input, fire || swat, bomb, missile);
}

/**
 * Lands on the pad quickly: it closes on the pad's centre and comes down at the same time,
 * rather than settling over it first as the autopilot does, while keeping inside the safe
 * touchdown speeds. It is used in the gap between a mutant's dives.
 */
function quickLanding(craft: CraftState, terrain: Terrain, physics: Physics): CraftInput {
  const pad = terrain.padCentre();
  const dx = terrain.delta(craft.pos.x, pad.x);
  const dz = terrain.delta(craft.pos.z, pad.z);
  const d = Math.hypot(dx, dz) || 1;
  const speed = Math.min(physics.safeLandingHSpeed * 0.6, d * 1.2);
  const height = craft.pos.y - pad.y;
  const sink = Math.min(physics.safeLandingVSpeed * 0.8, Math.max(0.5, height * 0.9));
  return steer(craft, physics, (dx / d) * speed, -sink, (dz / d) * speed, LANDING_LEAN);
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
 * The infected building near home the pilot should save: the nearest one it can reach and
 * hover over before it falls. Null if there is none.
 */
function buildingToSave(craft: CraftState, terrain: Terrain, home: { x: number; z: number }, leash: number): Building | null {
  let best: Building | null = null;
  let bestDistance = Infinity;
  for (const b of terrain.buildings) {
    if (b.status !== 'infected') continue;
    const base = buildingBase(terrain, b);
    if (Math.hypot(terrain.delta(home.x, base.x), terrain.delta(home.z, base.z)) > leash) continue;
    const distance = Math.hypot(terrain.delta(craft.pos.x, base.x), terrain.delta(craft.pos.z, base.z));
    if (b.timer < distance / RESCUE_SPEED + RESCUE_TIME - b.rescue + 0.5) continue;
    if (distance < bestDistance) {
      best = b;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Flies to the building clear of what lies on the way, then settles just above its roof,
 * low enough to save it, and holds still there.
 */
function rescue(craft: CraftState, b: Building, terrain: Terrain, physics: Physics): CraftInput {
  const base = buildingBase(terrain, b);
  const dx = terrain.delta(craft.pos.x, base.x);
  const dz = terrain.delta(craft.pos.z, base.z);
  const distance = Math.hypot(dx, dz);
  const speed = Math.min(RESCUE_SPEED, distance * 1.2);
  const ux = distance > 1e-6 ? dx / distance : 0;
  const uz = distance > 1e-6 ? dz / distance : 0;
  let y: number;
  if (distance > OVER_BUILDING) {
    y = highestObstacle(terrain, craft.pos.x, craft.pos.z, dx, dz, distance) + CLEARANCE;
  } else {
    // Over it: clear of the roof and anything else close by, but under the rescue height.
    const nearby = highestObstacle(terrain, craft.pos.x, craft.pos.z, 0, 0, 0) + 0.4;
    const ceiling = terrain.heightAt(craft.pos.x, craft.pos.z) + RESCUE_HEIGHT - 0.4;
    y = Math.min(ceiling, Math.max(base.y + buildingHeight(b) + ROOF_CLEARANCE, nearby));
  }
  return steer(craft, physics, ux * speed, climb(craft, y), uz * speed, APPROACH_LEAN);
}

/**
 * Runs in a straight line across the nearest mutant within `EVADE_RANGE`, at `EVADE_SPEED`,
 * firing whenever a bullet would hit it. The run starts across the line to the mutant and
 * turns back towards home when it strays too far. Null when no mutant is that close.
 */
function evade(
  pilot: DemoPilot,
  craft: CraftState,
  enemies: EnemyState,
  terrain: Terrain,
  physics: Physics,
  home: { x: number; z: number },
  runLeash: number,
  counter = false,
): { input: CraftInput; fire: boolean; distance: number } | null {
  let nearest: Target | undefined;
  let nearestDistance = EVADE_RANGE;
  for (const t of targets(enemies)) {
    if (!enemies.mutants.some((m) => m.id === t.id)) continue;
    const d = Math.hypot(terrain.delta(craft.pos.x, t.pos.x), t.pos.y - craft.pos.y, terrain.delta(craft.pos.z, t.pos.z));
    if (d < nearestDistance) {
      nearest = t;
      nearestDistance = d;
    }
  }
  if (!nearest) return null;
  pilot.targetId = nearest.id;

  const hx = terrain.delta(craft.pos.x, home.x);
  const hz = terrain.delta(craft.pos.z, home.z);
  const away = Math.hypot(hx, hz);
  if (!pilot.run) {
    // Across the line to the mutant, on the side nearer home.
    const dx = terrain.delta(craft.pos.x, nearest.pos.x);
    const dz = terrain.delta(craft.pos.z, nearest.pos.z);
    const d = Math.hypot(dx, dz) || 1;
    const side = -dz * hx + dx * hz >= 0 ? 1 : -1;
    pilot.run = { x: (-dz / d) * side, z: (dx / d) * side };
  } else if (away > runLeash && pilot.run.x * hx + pilot.run.z * hz < 0) {
    // Heading away from home: turn back towards it, a little off the straight line.
    const angle = Math.atan2(hz, hx) + (pilot.rng() - 0.5);
    pilot.run = { x: Math.cos(angle), z: Math.sin(angle) };
  }
  // Between dives the mutant pulls out low and climbs away, and only dives again after a
  // while: a window for a gun run at it, if it is close and not far above.
  const mutant = enemies.mutants.find((m) => m.id === nearest!.id);
  const window = mutant && (mutant.phase === 'recover' || (mutant.phase === 'stalk' && mutant.timer > COUNTER_STALK));
  const horizontal = Math.hypot(terrain.delta(craft.pos.x, nearest.pos.x), terrain.delta(craft.pos.z, nearest.pos.z));
  if (counter && window && horizontal < GUN_RANGE + 2 && Math.abs(nearest.pos.y - craft.pos.y) < COUNTER_HEIGHT) {
    const run = hunt(craft, nearest, terrain, physics);
    return { input: run.input, fire: run.fire, distance: nearestDistance };
  }
  const vx = pilot.run.x * EVADE_SPEED;
  const vz = pilot.run.z * EVADE_SPEED;
  const clear = highestObstacle(terrain, craft.pos.x, craft.pos.z, vx, vz, EVADE_SPEED) + CLEARANCE;
  const input = steer(craft, physics, vx, climb(craft, Math.max(clear, craft.pos.y)), vz, RUN_LEAN);
  return { input, fire: wouldHit(craft, nearest, terrain, physics), distance: nearestDistance };
}

/**
 * Makes gun runs at the target, aiming at where it will be when a bullet gets there. Out of
 * range, or too close, the craft flies to `GUN_RANGE` from it. In range, it leans gently
 * towards it: the nose follows the lean and dips with it, so the craft holds a little above
 * the target to keep the nose on it. It fires whenever a bullet fired now would hit.
 */
function hunt(craft: CraftState, s: Target, terrain: Terrain, physics: Physics): { input: CraftInput; fire: boolean } {
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
 * Whether a bullet fired now would pass within reach of the target, both flying straight:
 * the closest approach of the two paths within the bullet's life.
 */
export function wouldHit(craft: CraftState, s: Target, terrain: Terrain, physics: Physics): boolean {
  const nose = noseDirection(craft, physics);
  const rx = terrain.delta(craft.pos.x + nose.x * 0.5, s.pos.x);
  const ry = s.pos.y - (craft.pos.y + nose.y * 0.5);
  const rz = terrain.delta(craft.pos.z + nose.z * 0.5, s.pos.z);
  const wx = s.vel.x - craft.vel.x - nose.x * physics.bulletSpeed;
  const wy = s.vel.y - craft.vel.y - nose.y * physics.bulletSpeed;
  const wz = s.vel.z - craft.vel.z - nose.z * physics.bulletSpeed;
  const w2 = wx * wx + wy * wy + wz * wz;
  const t = w2 > 1e-9 ? Math.max(0, Math.min(physics.bulletLife, -(rx * wx + ry * wy + rz * wz) / w2)) : 0;
  const reach = s.radius * HIT_MARGIN;
  return Math.hypot(rx + wx * t, rz + wz * t) < reach && Math.abs(ry + wy * t) < reach;
}

/** Vertical speed that brings the craft to height `y`. */
function climb(craft: CraftState, y: number): number {
  return Math.max(-3, Math.min(3, (y - craft.pos.y) * 1.2));
}
