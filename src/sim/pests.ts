import type { CraftState, Vec3 } from './craft';
import type { Terrain } from './terrain';

/**
 * Pests come in swarms. They loiter low over the ground until the craft comes within
 * `PEST_SENSE`, then buzz after it, each darting about its own jittering spot near the
 * craft. They don't spread the virus and can't wreck the craft: a pest that reaches it
 * bites, draining `pestDrain` fuel, and dies. They keep off a craft sitting on the pad.
 * Like seeders, their positions are kept wrapped into [0, size).
 */
export interface Pest {
  id: number;
  pos: Vec3;
  vel: Vec3;
  /** Where it loiters while the craft is out of reach. */
  home: { x: number; z: number };
  /** Its current offset from what it chases, re-rolled every `jitterIn` seconds. */
  jitter: Vec3;
  jitterIn: number;
}

export const PEST_RADIUS = 0.22;
export const PEST_POINTS = 50;
/** Pests go for the craft within this horizontal distance. */
export const PEST_SENSE = 14;
/** Height above the ground they loiter at, and the lowest they go. */
const LOITER_HEIGHT = 1.2;
export const PEST_FLOOR = 0.5;
/** Swarm members spawn within this distance of the swarm's centre and loiter this far from home. */
const SWARM_SPREAD = 1.5;
const LOITER_RADIUS = 2;
/** How far (units) and how often (s, random in the range) each pest's aim point jitters. */
const JITTER = 1.1;
const JITTER_TIME = [0.25, 0.6] as const;
/** Very nimble: velocity follows the wanted velocity this fast. */
const STEER_RATE = 4;
/** They hover at least this far (horizontally) from a craft sitting on the pad. */
export const PAD_KEEP_OFF = 4;

/** One member of a swarm centred on (x, z). */
export function spawnPest(id: number, x: number, z: number, terrain: Terrain, rng: () => number): Pest {
  const a = rng() * Math.PI * 2;
  const r = rng() * SWARM_SPREAD;
  const px = terrain.wrap(x + Math.cos(a) * r);
  const pz = terrain.wrap(z + Math.sin(a) * r);
  return {
    id,
    pos: { x: px, y: terrain.heightAt(px, pz) + LOITER_HEIGHT, z: pz },
    vel: { x: 0, y: 0, z: 0 },
    home: { x, z },
    jitter: { x: 0, y: 0, z: 0 },
    jitterIn: 0,
  };
}

/** Whether a craft is close enough for pests to go after it (and isn't wrecked or on the pad). */
function prey(craft: CraftState, terrain: Terrain): boolean {
  return craft.status !== 'crashed' && !(craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad');
}

/** Moves one pest at up to `speed`: after the craft if it is near, otherwise round its home. */
export function flyPest(p: Pest, craft: CraftState, terrain: Terrain, dt: number, speed: number, maxAltitude: number, rng: () => number): void {
  p.jitterIn -= dt;
  if (p.jitterIn <= 0) {
    p.jitterIn = JITTER_TIME[0] + (JITTER_TIME[1] - JITTER_TIME[0]) * rng();
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * JITTER;
    p.jitter = { x: Math.cos(a) * r, y: (rng() * 2 - 1) * JITTER * 0.5, z: Math.sin(a) * r };
  }

  const cx = terrain.delta(p.pos.x, craft.pos.x);
  const cz = terrain.delta(p.pos.z, craft.pos.z);
  const toCraft = Math.hypot(cx, cz);
  const ground = Math.max(terrain.heightAt(p.pos.x, p.pos.z), terrain.heightAt(p.pos.x + p.vel.x * 0.4, p.pos.z + p.vel.z * 0.4));

  let tx: number;
  let tz: number;
  let ty: number;
  if (toCraft < PEST_SENSE && prey(craft, terrain)) {
    // Straight at the craft, give or take the jitter, which shrinks as it closes in.
    const close = Math.min(1, toCraft / 4);
    tx = cx + p.jitter.x * close;
    tz = cz + p.jitter.z * close;
    ty = craft.pos.y + p.jitter.y * close;
  } else {
    tx = terrain.delta(p.pos.x, p.home.x) + p.jitter.x * LOITER_RADIUS;
    tz = terrain.delta(p.pos.z, p.home.z) + p.jitter.z * LOITER_RADIUS;
    ty = ground + LOITER_HEIGHT + p.jitter.y;
    if (craft.status === 'landed' && toCraft < PAD_KEEP_OFF + 2) {
      // Hover round the pad's edge, waiting.
      const away = toCraft > 1e-6 ? (PAD_KEEP_OFF + 1 - toCraft) : 0;
      tx = -(cx / Math.max(toCraft, 1e-6)) * away + p.jitter.x;
      tz = -(cz / Math.max(toCraft, 1e-6)) * away + p.jitter.z;
    }
  }

  const reach = Math.hypot(tx, tz);
  const want = Math.min(speed, reach * 3);
  const wantX = reach > 1e-6 ? (tx / reach) * want : 0;
  const wantZ = reach > 1e-6 ? (tz / reach) * want : 0;
  const target = Math.min(maxAltitude, Math.max(ground + PEST_FLOOR, ty));
  const wantY = Math.max(-speed, Math.min(speed, (target - p.pos.y) * 3));
  const k = Math.min(1, dt * STEER_RATE);
  p.vel.x += (wantX - p.vel.x) * k;
  p.vel.y += (wantY - p.vel.y) * k;
  p.vel.z += (wantZ - p.vel.z) * k;

  p.pos.x = terrain.wrap(p.pos.x + p.vel.x * dt);
  p.pos.y = Math.min(maxAltitude, Math.max(p.pos.y + p.vel.y * dt, terrain.heightAt(p.pos.x, p.pos.z) + PEST_FLOOR * 0.5));
  p.pos.z = terrain.wrap(p.pos.z + p.vel.z * dt);
}
