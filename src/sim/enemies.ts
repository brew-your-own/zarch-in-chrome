import { crashCraft, CRAFT_RADIUS, type CraftState, type Physics, type Vec3 } from './craft';
import { BOMBER_POINTS, BOMBER_RADIUS, flyBomber, spawnBomber, type Bomber } from './bombers';
import type { Bullet } from './cannon';
import { FIGHTER_POINTS, FIGHTER_RADIUS, flyFighter, moveShot, spawnFighter, type EnemyShot, type Fighter } from './fighters';
import { flyMutant, mutate, MUTANT_POINTS, MUTANT_RADIUS, type Mutant } from './mutants';
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
  /** 0-1: how well fighters aim (spread, and how far they lead a moving craft). */
  fighterAccuracy: number;
  /** Seconds a seeder lives before it mutates into a mutant, which hunts the craft. 0 means never. */
  mutateAfter: number;
  /** Mutant top speed (units/s); it dives faster than this. */
  mutantSpeed: number;
  /** Bombers in each wave from `bombersFromWave` on. 0 means none. */
  bombers: number;
  bombersFromWave: number;
  /** Bomber speed (units/s). */
  bomberSpeed: number;
  /** Craft per game; losing the last one ends it. */
  lives: number;
  /** How much harder each wave after the first gets (0.1 = 10% per wave). See `waveSettings`. */
  difficultyRamp: number;
  /** The most the ramp can multiply the difficulty by. */
  difficultyCap: number;
}

export const DEFAULT_ENEMIES: Readonly<EnemySettings> = Object.freeze({
  firstWave: 3,
  seederSpeed: 2.5,
  sporeInterval: 1.5,
  virusSpread: 0.02,
  overrunAt: 0.6,
  fighters: 1,
  fighterSpeed: 4.5,
  fighterFireInterval: 2.5,
  fighterAccuracy: 0.35,
  mutateAfter: 40,
  mutantSpeed: 4.5,
  bombers: 1,
  bombersFromWave: 3,
  bomberSpeed: 2.5,
  lives: 3,
  difficultyRamp: 0.12,
  difficultyCap: 2.5,
});

/** Fighters never aim better than this, however late the wave. */
const MAX_RAMPED_ACCURACY = 0.85;

/**
 * The enemy settings in force during `wave`. Each wave after the first multiplies the
 * difficulty by `1 + difficultyRamp × (wave − 1)`, capped at `difficultyCap`: spores drop,
 * fighters fire and seeders mutate that much sooner, enemies fly faster by half that, and
 * fighters aim better. Virus spread, wave sizes and the game rules are not ramped.
 */
export function waveSettings(settings: EnemySettings, wave: number): EnemySettings {
  const f = Math.max(1, Math.min(Math.max(1, settings.difficultyCap), 1 + Math.max(0, settings.difficultyRamp) * (wave - 1)));
  const speed = 1 + (f - 1) * 0.5;
  return {
    ...settings,
    seederSpeed: settings.seederSpeed * speed,
    sporeInterval: settings.sporeInterval / f,
    fighterSpeed: settings.fighterSpeed * speed,
    mutateAfter: settings.mutateAfter / f,
    mutantSpeed: settings.mutantSpeed * speed,
    bomberSpeed: settings.bomberSpeed * speed,
    fighterFireInterval: settings.fighterFireInterval / f,
    fighterAccuracy: Math.min(Math.max(settings.fighterAccuracy, MAX_RAMPED_ACCURACY), settings.fighterAccuracy + (f - 1) * 0.25),
  };
}

/** Whether the virus has taken over enough land to end the game. */
export function isOverrun(terrain: Terrain, settings: EnemySettings): boolean {
  return terrain.infectedFraction() >= settings.overrunAt;
}

/** An enemy of any kind, as weapons and the scanner see it. */
export interface Target {
  id: number;
  pos: Vec3;
  /** Collision radius (bullets, missiles and the craft). */
  radius: number;
}

/** Every enemy alive, of every kind. */
export function targets(enemies: EnemyState): Target[] {
  return [
    ...enemies.fighters.map((e) => ({ id: e.id, pos: e.pos, radius: FIGHTER_RADIUS })),
    ...enemies.mutants.map((e) => ({ id: e.id, pos: e.pos, radius: MUTANT_RADIUS })),
    ...enemies.bombers.map((e) => ({ id: e.id, pos: e.pos, radius: BOMBER_RADIUS })),
    ...enemies.seeders.map((e) => ({ id: e.id, pos: e.pos, radius: SEEDER_RADIUS })),
  ];
}

export function enemyCount(enemies: EnemyState): number {
  return enemies.seeders.length + enemies.fighters.length + enemies.mutants.length + enemies.bombers.length;
}

/**
 * Removes the enemy with this `id`, whatever its kind, and returns its event. Kills by a
 * bullet, missile or bomb (`byBullet`) score; ramming the craft doesn't.
 */
export function killEnemy(enemies: EnemyState, id: number, byBullet: boolean): EnemyEvent | null {
  const take = <T extends { id: number }>(list: T[]) => {
    const k = list.findIndex((e) => e.id === id);
    return k < 0 ? undefined : list.splice(k, 1)[0];
  };
  const score = (points: number) => {
    if (byBullet) enemies.score += points;
  };
  const seeder = take(enemies.seeders);
  if (seeder) {
    score(SEEDER_POINTS);
    return { type: 'seederDestroyed', seeder, byBullet };
  }
  const fighter = take(enemies.fighters);
  if (fighter) {
    score(FIGHTER_POINTS);
    return { type: 'fighterDestroyed', fighter, byBullet };
  }
  const mutant = take(enemies.mutants);
  if (mutant) {
    score(MUTANT_POINTS);
    return { type: 'mutantDestroyed', mutant, byBullet };
  }
  const bomber = take(enemies.bombers);
  if (bomber) {
    score(BOMBER_POINTS);
    return { type: 'bomberDestroyed', bomber, byBullet };
  }
  return null;
}

/** Horizontal distance (wrapped) from `pos` to the nearest enemy, or Infinity if there is none. */
export function nearestEnemyDistance(enemies: EnemyState, pos: { x: number; z: number }, terrain: Terrain): number {
  let nearest = Infinity;
  for (const s of targets(enemies)) {
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
  /** Seconds alive; it mutates at `mutateAfter`. */
  age: number;
}

export interface Spore {
  pos: Vec3;
  vel: Vec3;
}

export interface EnemyState {
  seeders: Seeder[];
  spores: Spore[];
  fighters: Fighter[];
  mutants: Mutant[];
  bombers: Bomber[];
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
  | { type: 'mutantDestroyed'; mutant: Mutant; byBullet: boolean }
  | { type: 'bomberDestroyed'; bomber: Bomber; byBullet: boolean }
  /** A bullet hit a bomber that still has hits left. */
  | { type: 'bomberHit'; bomber: Bomber; pos: Vec3 }
  /** A seeder left alive too long turned into a mutant. */
  | { type: 'seederMutated'; mutant: Mutant }
  | { type: 'fighterFired'; pos: Vec3 }
  /** A fighter's shot wrecked the craft. */
  | { type: 'craftShot'; pos: Vec3 }
  | { type: 'sporeLanded'; pos: Vec3; infected: boolean }
  | { type: 'waveStarted'; wave: number };

export function createEnemies(seed: number): EnemyState {
  return { seeders: [], spores: [], fighters: [], mutants: [], bombers: [], shots: [], wave: 0, score: 0, nextWaveIn: 0, nextId: 1, rng: createRng(seed) };
}

/**
 * Advances seeders, fighters, mutants, bombers, their spores and shots, and the virus by
 * `dt`. Seeders alive for `mutateAfter` turn into mutants. Bullets that hit an enemy are
 * removed from `bullets`; an enemy touching the craft wrecks both, and so does a fighter's
 * shot hitting it. `base` is the panel's settings; the wave's are derived
 * from them by `waveSettings`. Returns what happened, for the renderer (explosions) and the HUD.
 */
export function stepEnemies(
  enemies: EnemyState,
  craft: CraftState,
  bullets: Bullet[],
  terrain: Terrain,
  dt: number,
  base: EnemySettings,
  physics: Physics,
): EnemyEvent[] {
  const events: EnemyEvent[] = [];
  let settings = waveSettings(base, enemies.wave);

  if (enemyCount(enemies) === 0 && settings.firstWave >= 1) {
    enemies.nextWaveIn -= dt;
    if (enemies.nextWaveIn <= 0) {
      enemies.wave++;
      settings = waveSettings(base, enemies.wave);
      const count = Math.round(settings.firstWave) + enemies.wave - 1;
      for (let k = 0; k < count; k++) enemies.seeders.push(spawnSeeder(enemies, craft, terrain, settings));
      const fighters = Math.round(Math.max(0, settings.fighters) * (enemies.wave - 1));
      for (let k = 0; k < fighters; k++) {
        const { x, z } = spawnPoint(enemies.rng, craft, terrain);
        enemies.fighters.push(spawnFighter(enemies.nextId++, x, z, terrain, enemies.rng));
      }
      const bombers = enemies.wave >= settings.bombersFromWave ? Math.round(Math.max(0, settings.bombers)) : 0;
      for (let k = 0; k < bombers; k++) {
        const { x, z } = spawnPoint(enemies.rng, craft, terrain);
        enemies.bombers.push(spawnBomber(enemies.nextId++, x, z, terrain, enemies.rng));
      }
      enemies.nextWaveIn = WAVE_DELAY;
      events.push({ type: 'waveStarted', wave: enemies.wave });
    }
  }

  for (const s of enemies.seeders) fly(s, enemies, terrain, dt, settings);
  if (settings.mutateAfter > 0) {
    enemies.seeders = enemies.seeders.filter((s) => {
      if (s.age < settings.mutateAfter) return true;
      const mutant = mutate(s.id, s.pos, s.vel, enemies.rng);
      enemies.mutants.push(mutant);
      events.push({ type: 'seederMutated', mutant });
      return false;
    });
  }
  for (const m of enemies.mutants) {
    flyMutant(m, craft, terrain, dt, settings.mutantSpeed, physics.maxAltitude, enemies.rng);
    // Mutants still spread the virus, as seeders do.
    m.dropIn -= dt;
    if (m.dropIn <= 0 && terrain.canInfect(Math.floor(m.pos.x), Math.floor(m.pos.z))) {
      enemies.spores.push({ pos: { ...m.pos, y: m.pos.y - 0.2 }, vel: { x: m.vel.x * 0.3, y: 0, z: m.vel.z * 0.3 } });
      m.dropIn = settings.sporeInterval * (0.7 + 0.6 * enemies.rng());
    }
  }
  for (const b of enemies.bombers) {
    const bomb = flyBomber(b, terrain, dt, settings.bomberSpeed, enemies.rng);
    if (bomb) enemies.spores.push(bomb);
  }
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

  // Bullets and the craft against every enemy. A bomber takes several hits.
  for (const t of targets(enemies)) {
    const hit = bullets.findIndex((b) => near(terrain, b.pos, t.pos, t.radius, t.radius));
    if (hit >= 0) {
      const [bullet] = bullets.splice(hit, 1);
      const bomber = enemies.bombers.find((b) => b.id === t.id);
      if (bomber && --bomber.hp > 0) {
        events.push({ type: 'bomberHit', bomber, pos: { ...bullet!.pos } });
        continue;
      }
      events.push(killEnemy(enemies, t.id, true)!);
    } else if (craft.status !== 'crashed' && near(terrain, craft.pos, t.pos, t.radius + CRAFT_RADIUS, t.radius)) {
      crashCraft(craft, physics);
      events.push(killEnemy(enemies, t.id, false)!);
    }
  }

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
    age: 0,
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

  s.age += dt;
  s.dropIn -= dt;
  if (s.dropIn <= 0 && terrain.canInfect(Math.floor(s.pos.x), Math.floor(s.pos.z))) {
    enemies.spores.push({ pos: { ...s.pos, y: s.pos.y - 0.2 }, vel: { x: s.vel.x * 0.3, y: 0, z: s.vel.z * 0.3 } });
    s.dropIn = settings.sporeInterval * (0.7 + 0.6 * enemies.rng());
  }
}
