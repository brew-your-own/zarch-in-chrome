import { crashCraft, CRAFT_RADIUS, type CraftState, type Physics, type Vec3 } from './craft';
import type { Bullet } from './cannon';
import { FIGHTER_POINTS, FIGHTER_RADIUS, flyFighter, moveShot, spawnFighter, type EnemyShot, type Fighter } from './fighters';
import { createRng } from './rng';
import type { Terrain } from './terrain';
import { stepVirus } from './virus';

/** Tunable enemy behaviour, edited live from the settings panel. */
export interface EnemySettings {
  /** Seeders in the first wave; each later wave brings one more. 0 disables enemies. */
  firstWave: number;
  /** Cruise speed (units/s). */
  seederSpeed: number;
  /** Mean seconds between spores dropped by one seeder. */
  sporeInterval: number;
  /** Chance per second that an infected tile infects a neighbour. */
  virusSpread: number;
  /** Share of the land (0-1) the virus must infect to end the game. */
  overrunAt: number;
  /** Fighters per wave after the first: wave n brings round(fighters × (n − 1)). 0 means none. */
  fighters: number;
  /** Fighter top speed (units/s). */
  fighterSpeed: number;
  /** Mean seconds between one fighter's shots. */
  fighterFireInterval: number;
  /** Craft per game; losing the last one ends it. */
  lives: number;
}

export const DEFAULT_ENEMIES: Readonly<EnemySettings> = Object.freeze({
  firstWave: 3,
  seederSpeed: 2.5,
  sporeInterval: 1.5,
  virusSpread: 0.02,
  overrunAt: 0.6,
  fighters: 1,
  fighterSpeed: 4.5,
  fighterFireInterval: 1.4,
  lives: 3,
});

/** Whether the virus has taken over enough land to end the game. */
export function isOverrun(terrain: Terrain, settings: EnemySettings): boolean {
  return terrain.infectedFraction() >= settings.overrunAt;
}

/** Horizontal distance (wrapped) from `pos` to the nearest seeder or fighter, or Infinity if there is none. */
export function nearestEnemyDistance(enemies: EnemyState, pos: { x: number; z: number }, terrain: Terrain): number {
  let nearest = Infinity;
  for (const s of [...enemies.seeders, ...enemies.fighters]) {
    nearest = Math.min(nearest, Math.hypot(terrain.delta(pos.x, s.pos.x), terrain.delta(pos.z, s.pos.z)));
  }
  return nearest;
}

/** Height seeders keep above the ground under and just ahead of them. */
export const SEEDER_CRUISE = 2.5;
/** Collision radius of a seeder (bullets and the craft). */
export const SEEDER_RADIUS = 0.4;
export const SEEDER_POINTS = 100;
/** Seeders spawn at least this far (wrapped, horizontally) from the craft. */
const SPAWN_DISTANCE = 16;
/** Waypoints are picked within this distance of the seeder. */
const WANDER = 14;
const STEER_RATE = 1.5;
const CLIMB_RATE = 2;
const MAX_CLIMB = 3;
const WAVE_DELAY = 4;

/** World positions of seeders and spores are kept wrapped into [0, size). */
export interface Seeder {
  id: number;
  pos: Vec3;
  vel: Vec3;
  target: { x: number; z: number };
  dropIn: number;
}

export interface Spore {
  pos: Vec3;
  vel: Vec3;
}

export interface EnemyState {
  seeders: Seeder[];
  spores: Spore[];
  fighters: Fighter[];
  /** Fighters' shots in flight. */
  shots: EnemyShot[];
  wave: number;
  score: number;
  /** Seconds until the next wave, once the current one is cleared. */
  nextWaveIn: number;
  nextId: number;
  rng: () => number;
}

export type EnemyEvent =
  | { type: 'seederDestroyed'; seeder: Seeder; byBullet: boolean }
  | { type: 'fighterDestroyed'; fighter: Fighter; byBullet: boolean }
  | { type: 'fighterFired'; pos: Vec3 }
  /** A fighter's shot wrecked the craft. */
  | { type: 'craftShot'; pos: Vec3 }
  | { type: 'sporeLanded'; pos: Vec3; infected: boolean }
  | { type: 'waveStarted'; wave: number };

export function createEnemies(seed: number): EnemyState {
  return { seeders: [], spores: [], fighters: [], shots: [], wave: 0, score: 0, nextWaveIn: 0, nextId: 1, rng: createRng(seed) };
}

/**
 * Advances seeders, fighters, their spores and shots, and the virus by `dt`. Bullets that
 * hit an enemy are removed from `bullets`; an enemy touching the craft wrecks both, and so
 * does a fighter's shot hitting it. Returns what happened, for the
 * renderer (explosions) and the HUD.
 */
export function stepEnemies(
  enemies: EnemyState,
  craft: CraftState,
  bullets: Bullet[],
  terrain: Terrain,
  dt: number,
  settings: EnemySettings,
  physics: Physics,
): EnemyEvent[] {
  const events: EnemyEvent[] = [];

  if (enemies.seeders.length === 0 && enemies.fighters.length === 0 && settings.firstWave >= 1) {
    enemies.nextWaveIn -= dt;
    if (enemies.nextWaveIn <= 0) {
      enemies.wave++;
      const count = Math.round(settings.firstWave) + enemies.wave - 1;
      for (let k = 0; k < count; k++) enemies.seeders.push(spawnSeeder(enemies, craft, terrain, settings));
      const fighters = Math.round(Math.max(0, settings.fighters) * (enemies.wave - 1));
      for (let k = 0; k < fighters; k++) {
        const { x, z } = spawnPoint(enemies.rng, craft, terrain);
        enemies.fighters.push(spawnFighter(enemies.nextId++, x, z, terrain, enemies.rng));
      }
      enemies.nextWaveIn = WAVE_DELAY;
      events.push({ type: 'waveStarted', wave: enemies.wave });
    }
  }

  for (const s of enemies.seeders) fly(s, enemies, terrain, dt, settings);
  for (const f of enemies.fighters) {
    const shot = flyFighter(f, craft, terrain, dt, settings, physics.maxAltitude, enemies.rng);
    if (shot) {
      enemies.shots.push(shot);
      events.push({ type: 'fighterFired', pos: { ...f.pos } });
    }
  }
  enemies.shots = enemies.shots.filter((shot) => {
    const outcome = moveShot(shot, craft, terrain, dt);
    if (outcome === 'hitCraft') {
      crashCraft(craft, physics);
      events.push({ type: 'craftShot', pos: shot.pos });
    }
    return outcome === 'flying';
  });

  // Spores fall and infect the tile they land on.
  enemies.spores = enemies.spores.filter((spore) => {
    spore.vel.y -= physics.gravity * dt;
    spore.pos.x = terrain.wrap(spore.pos.x + spore.vel.x * dt);
    spore.pos.y += spore.vel.y * dt;
    spore.pos.z = terrain.wrap(spore.pos.z + spore.vel.z * dt);
    const ground = terrain.heightAt(spore.pos.x, spore.pos.z);
    if (spore.pos.y > ground) return true;
    spore.pos.y = ground;
    const infected = terrain.infect(Math.floor(spore.pos.x), Math.floor(spore.pos.z));
    events.push({ type: 'sporeLanded', pos: spore.pos, infected });
    return false;
  });

  stepVirus(terrain, settings.virusSpread, dt, enemies.rng);

  // Bullets and the craft against seeders.
  enemies.seeders = enemies.seeders.filter((s) => {
    const hit = bullets.findIndex((b) => near(terrain, b.pos, s.pos, SEEDER_RADIUS, SEEDER_RADIUS));
    if (hit >= 0) {
      bullets.splice(hit, 1);
      enemies.score += SEEDER_POINTS;
      events.push({ type: 'seederDestroyed', seeder: s, byBullet: true });
      return false;
    }
    if (craft.status !== 'crashed' && near(terrain, craft.pos, s.pos, SEEDER_RADIUS + CRAFT_RADIUS, SEEDER_RADIUS)) {
      crashCraft(craft, physics);
      events.push({ type: 'seederDestroyed', seeder: s, byBullet: false });
      return false;
    }
    return true;
  });
  enemies.fighters = enemies.fighters.filter((f) => {
    const hit = bullets.findIndex((b) => near(terrain, b.pos, f.pos, FIGHTER_RADIUS, FIGHTER_RADIUS));
    if (hit >= 0) {
      bullets.splice(hit, 1);
      enemies.score += FIGHTER_POINTS;
      events.push({ type: 'fighterDestroyed', fighter: f, byBullet: true });
      return false;
    }
    if (craft.status !== 'crashed' && near(terrain, craft.pos, f.pos, FIGHTER_RADIUS + CRAFT_RADIUS, FIGHTER_RADIUS)) {
      crashCraft(craft, physics);
      events.push({ type: 'fighterDestroyed', fighter: f, byBullet: false });
      return false;
    }
    return true;
  });

  return events;
}

/** Whether `a` is within a horizontal `radius` and vertical `height` of `b`, across the wrap. */
function near(terrain: Terrain, a: Vec3, b: Vec3, radius: number, height: number): boolean {
  const dx = terrain.delta(b.x, a.x);
  const dz = terrain.delta(b.z, a.z);
  return dx * dx + dz * dz < radius * radius && Math.abs(a.y - b.y) < height;
}

/** A random point at least `SPAWN_DISTANCE` from the craft (or the last one tried). */
function spawnPoint(rng: () => number, craft: CraftState, terrain: Terrain): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (let tries = 0; tries < 50; tries++) {
    x = rng() * terrain.size;
    z = rng() * terrain.size;
    if (Math.hypot(terrain.delta(craft.pos.x, x), terrain.delta(craft.pos.z, z)) >= SPAWN_DISTANCE) break;
  }
  return { x, z };
}

function spawnSeeder(enemies: EnemyState, craft: CraftState, terrain: Terrain, settings: EnemySettings): Seeder {
  const rng = enemies.rng;
  const { x, z } = spawnPoint(rng, craft, terrain);
  return {
    id: enemies.nextId++,
    pos: { x, y: terrain.heightAt(x, z) + SEEDER_CRUISE, z },
    vel: { x: 0, y: 0, z: 0 },
    target: wander(rng, terrain, x, z),
    dropIn: settings.sporeInterval * rng(),
  };
}

function wander(rng: () => number, terrain: Terrain, x: number, z: number): { x: number; z: number } {
  return { x: terrain.wrap(x + (rng() * 2 - 1) * WANDER), z: terrain.wrap(z + (rng() * 2 - 1) * WANDER) };
}

function fly(s: Seeder, enemies: EnemyState, terrain: Terrain, dt: number, settings: EnemySettings): void {
  const dx = terrain.delta(s.pos.x, s.target.x);
  const dz = terrain.delta(s.pos.z, s.target.z);
  const dist = Math.hypot(dx, dz);
  if (dist < 1) s.target = wander(enemies.rng, terrain, s.pos.x, s.pos.z);
  const k = Math.min(1, dt * STEER_RATE);
  const speed = settings.seederSpeed;
  s.vel.x += ((dist > 0 ? (dx / dist) * speed : 0) - s.vel.x) * k;
  s.vel.z += ((dist > 0 ? (dz / dist) * speed : 0) - s.vel.z) * k;

  // Hold cruise height over the ground here and a moment ahead, so hills are climbed early.
  const ground = Math.max(
    terrain.heightAt(s.pos.x, s.pos.z),
    terrain.heightAt(s.pos.x + s.vel.x, s.pos.z + s.vel.z),
  );
  s.vel.y = Math.max(-MAX_CLIMB, Math.min(MAX_CLIMB, (ground + SEEDER_CRUISE - s.pos.y) * CLIMB_RATE));

  s.pos.x = terrain.wrap(s.pos.x + s.vel.x * dt);
  s.pos.y += s.vel.y * dt;
  s.pos.z = terrain.wrap(s.pos.z + s.vel.z * dt);

  s.dropIn -= dt;
  if (s.dropIn <= 0 && terrain.canInfect(Math.floor(s.pos.x), Math.floor(s.pos.z))) {
    enemies.spores.push({ pos: { ...s.pos, y: s.pos.y - 0.2 }, vel: { x: s.vel.x * 0.3, y: 0, z: s.vel.z * 0.3 } });
    s.dropIn = settings.sporeInterval * (0.7 + 0.6 * enemies.rng());
  }
}
