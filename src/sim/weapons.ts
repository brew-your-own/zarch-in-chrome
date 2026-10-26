import { noseDirection, type CraftState, type Physics, type Vec3 } from './craft';
import { killEnemy, targets, type EnemyEvent, type EnemyState } from './enemies';
import type { Terrain } from './terrain';
import { hitsTree } from './trees';

/** Special weapons, edited live from the settings panel. */
export interface WeaponSettings {
  /** Smart bombs handed out at the start of each wave from `bombsFromWave` on (unused ones don't carry over). */
  bombsPerWave: number;
  bombsFromWave: number;
  /** Horizontal radius (tiles) a smart bomb clears around the craft. */
  bombRadius: number;
  /** Homing missiles added at the start of every wave; unused ones carry over. */
  missilesPerWave: number;
  /** Top speed (units/s) and turn rate (rad/s) of a missile. */
  missileSpeed: number;
  missileTurnRate: number;
}

export const DEFAULT_WEAPONS: Readonly<WeaponSettings> = Object.freeze({
  bombsPerWave: 1,
  bombsFromWave: 3,
  bombRadius: 12,
  missilesPerWave: 1,
  missileSpeed: 10,
  missileTurnRate: 3,
});

/** Missiles in stock never exceed this, however many waves go unused. */
export const MAX_MISSILES = 9;
/** Missiles lock onto the nearest enemy within this horizontal distance. */
export const MISSILE_RANGE = 30;
const MISSILE_LIFE = 6;
const MISSILE_ACCEL = 14;
/** Launch kick along the nose, on top of the craft's own velocity. */
const MISSILE_LAUNCH = 3;
/** Extra reach on top of the target's radius. */
const MISSILE_HIT = 0.2;

export interface Missile {
  /** Unwrapped, like the craft and its bullets. */
  pos: Vec3;
  vel: Vec3;
  age: number;
  /** Id of the enemy it is chasing, or null when it has none. */
  target: number | null;
}

export interface Arsenal {
  bombs: number;
  missiles: number;
  inFlight: Missile[];
}

export type WeaponEvent =
  | { type: 'bombDetonated'; pos: Vec3; radius: number }
  | { type: 'missileLaunched'; pos: Vec3 }
  /** A missile blew up without hitting anything (ground, tree or old age). */
  | { type: 'missileSpent'; pos: Vec3 };

export function createArsenal(): Arsenal {
  return { bombs: 0, missiles: 0, inFlight: [] };
}

/** Restocks at the start of `wave`: bombs are reset to the wave's allowance, missiles added to the stock. */
export function restock(arsenal: Arsenal, wave: number, settings: WeaponSettings): void {
  arsenal.bombs = wave >= settings.bombsFromWave ? Math.max(0, Math.round(settings.bombsPerWave)) : 0;
  arsenal.missiles = Math.min(MAX_MISSILES, arsenal.missiles + Math.max(0, Math.round(settings.missilesPerWave)));
}

/**
 * Sets off a smart bomb if one is in stock and the craft is flying or landed: every enemy,
 * spore and enemy shot within `bombRadius` of the craft is destroyed, and the kills
 * are scored. Returns what happened, or null if no bomb went off.
 */
export function detonateBomb(
  arsenal: Arsenal,
  craft: CraftState,
  enemies: EnemyState,
  terrain: Terrain,
  settings: WeaponSettings,
): (EnemyEvent | WeaponEvent)[] | null {
  if (arsenal.bombs <= 0 || craft.status === 'crashed') return null;
  arsenal.bombs--;
  const r = settings.bombRadius;
  const inRange = (p: { x: number; z: number }) => Math.hypot(terrain.delta(craft.pos.x, p.x), terrain.delta(craft.pos.z, p.z)) <= r;
  const events: (EnemyEvent | WeaponEvent)[] = [{ type: 'bombDetonated', pos: { ...craft.pos }, radius: r }];
  for (const t of targets(enemies)) if (inRange(t.pos)) events.push(killEnemy(enemies, t.id, true)!);
  enemies.spores = enemies.spores.filter((s) => !inRange(s.pos));
  enemies.shots = enemies.shots.filter((s) => !inRange(s.pos));
  return events;
}

/** Id of the nearest enemy of any kind to `pos` within `MISSILE_RANGE`. */
function nearestTarget(enemies: EnemyState, pos: Vec3, terrain: Terrain): number | null {
  let best: number | null = null;
  let bestDistance = MISSILE_RANGE;
  for (const e of targets(enemies)) {
    const d = Math.hypot(terrain.delta(pos.x, e.pos.x), terrain.delta(pos.z, e.pos.z));
    if (d < bestDistance) {
      bestDistance = d;
      best = e.id;
    }
  }
  return best;
}

/**
 * Launches a homing missile from the nose if one is in stock and there is an enemy in range
 * to lock onto (otherwise the missile is kept). Returns the launch event, or null.
 */
export function fireMissile(
  arsenal: Arsenal,
  craft: CraftState,
  enemies: EnemyState,
  terrain: Terrain,
  physics: Physics,
): WeaponEvent | null {
  if (arsenal.missiles <= 0 || craft.status === 'crashed') return null;
  const target = nearestTarget(enemies, craft.pos, terrain);
  if (target === null) return null;
  arsenal.missiles--;
  const nose = noseDirection(craft, physics);
  // Launched level-ish and a little up, so a landed or nose-down craft doesn't fire into the ground.
  const dir = { x: nose.x, y: Math.max(0.3, nose.y), z: nose.z };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  const pos = { x: craft.pos.x, y: craft.pos.y + 0.2, z: craft.pos.z };
  arsenal.inFlight.push({
    pos,
    vel: {
      x: craft.vel.x + (dir.x / len) * MISSILE_LAUNCH,
      y: craft.vel.y + (dir.y / len) * MISSILE_LAUNCH,
      z: craft.vel.z + (dir.z / len) * MISSILE_LAUNCH,
    },
    age: 0,
    target,
  });
  return { type: 'missileLaunched', pos: { ...pos } };
}

/**
 * Steers missiles towards their targets (retargeting if one is gone), speeds them up and
 * checks for hits. A hit destroys and scores the enemy; a missile that hits the ground or a
 * tree, or runs out of time, is spent.
 */
export function stepMissiles(
  arsenal: Arsenal,
  enemies: EnemyState,
  terrain: Terrain,
  dt: number,
  settings: WeaponSettings,
): (EnemyEvent | WeaponEvent)[] {
  const events: (EnemyEvent | WeaponEvent)[] = [];
  arsenal.inFlight = arsenal.inFlight.filter((m) => {
    m.age += dt;
    const find = (id: number | null) => (id === null ? undefined : targets(enemies).find((e) => e.id === id));
    let target = find(m.target);
    if (!target) {
      m.target = nearestTarget(enemies, m.pos, terrain);
      target = find(m.target);
    }

    const speed = Math.hypot(m.vel.x, m.vel.y, m.vel.z) || 1;
    let dx = m.vel.x / speed;
    let dy = m.vel.y / speed;
    let dz = m.vel.z / speed;
    if (target) {
      // Turn the heading towards the target by at most the turn rate.
      const tx = terrain.delta(m.pos.x, target.pos.x);
      const ty = target.pos.y - m.pos.y;
      const tz = terrain.delta(m.pos.z, target.pos.z);
      const tl = Math.hypot(tx, ty, tz) || 1;
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * tx + dy * ty + dz * tz) / tl)));
      const turn = Math.min(1, (settings.missileTurnRate * dt) / Math.max(angle, 1e-6));
      dx += (tx / tl - dx) * turn;
      dy += (ty / tl - dy) * turn;
      dz += (tz / tl - dz) * turn;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl;
      dy /= dl;
      dz /= dl;
    }
    const newSpeed = Math.min(settings.missileSpeed, speed + MISSILE_ACCEL * dt);
    m.vel = { x: dx * newSpeed, y: dy * newSpeed, z: dz * newSpeed };

    // Two half steps, so a fast missile can't skip past a target.
    for (let half = 0; half < 2; half++) {
      m.pos.x += m.vel.x * dt * 0.5;
      m.pos.y += m.vel.y * dt * 0.5;
      m.pos.z += m.vel.z * dt * 0.5;
      const hit = hitEnemy(m.pos, enemies, terrain);
      if (hit) {
        events.push(hit);
        return false;
      }
      if (m.pos.y <= terrain.heightAt(m.pos.x, m.pos.z) || hitsTree(terrain, m.pos.x, m.pos.y, m.pos.z, 0)) {
        events.push({ type: 'missileSpent', pos: { ...m.pos } });
        return false;
      }
    }
    if (m.age > MISSILE_LIFE) {
      events.push({ type: 'missileSpent', pos: { ...m.pos } });
      return false;
    }
    return true;
  });
  return events;
}

/** Destroys and scores the first enemy `pos` touches. A missile kills a bomber outright. */
function hitEnemy(pos: Vec3, enemies: EnemyState, terrain: Terrain): EnemyEvent | null {
  const hit = targets(enemies).find((e) => {
    const dx = terrain.delta(e.pos.x, pos.x);
    const dz = terrain.delta(e.pos.z, pos.z);
    const reach = e.radius + MISSILE_HIT;
    return dx * dx + dz * dz < reach * reach && Math.abs(e.pos.y - pos.y) < reach;
  });
  return hit ? killEnemy(enemies, hit.id, true) : null;
}
