import { noseDirection, thrustDirection, type CraftState, type Physics, type Vec3 } from './craft';
import type { Terrain } from './terrain';
import { TREE_NONE, treeHit, type TreeKind } from './trees';

export interface Bullet {
  pos: Vec3;
  vel: Vec3;
  age: number;
}

export interface CannonState {
  bullets: Bullet[];
  /** Seconds until the next shot is allowed. */
  cooldown: number;
  /** Shots fired so far; the sound layer plays one shot per increase. */
  shots: number;
}

export type ImpactKind = 'ground' | 'sea' | 'tree';

/** Where a bullet stopped, so the renderer can show a spark or splash. */
export interface Impact {
  pos: Vec3;
  vel: Vec3;
  kind: ImpactKind;
  /** For `tree` impacts: the tree that was destroyed (already removed from the terrain). */
  tree?: { i: number; j: number; kind: Exclude<TreeKind, typeof TREE_NONE> };
}

const BULLET_RADIUS = 0.04;
/** The muzzle sits at the nose tip, in craft-local units. */
const MUZZLE_FORWARD = 0.5;
const MUZZLE_UP = 0.06;
/** Collision checks per unit of distance travelled, so bullets can't skip through trunks. */
const CHECKS_PER_UNIT = 8;

export function createCannon(): CannonState {
  return { bullets: [], cooldown: 0, shots: 0 };
}

/**
 * Fires while `fire` is held (not while crashed) and moves every bullet, removing those
 * that hit the terrain or a tree, or outlive `physics.bulletLife`. Bullets fly straight,
 * inheriting the craft's velocity. A tree hit by a bullet is destroyed: it is removed
 * from the terrain. Returns this step's impacts.
 */
export function stepCannon(
  cannon: CannonState,
  craft: CraftState,
  fire: boolean,
  terrain: Terrain,
  dt: number,
  physics: Physics,
): Impact[] {
  cannon.cooldown = Math.max(0, cannon.cooldown - dt);
  if (fire && craft.status !== 'crashed' && cannon.cooldown === 0 && physics.fireRate > 0) {
    cannon.bullets.push(launch(craft, physics));
    cannon.cooldown = 1 / physics.fireRate;
    cannon.shots++;
  }

  const impacts: Impact[] = [];
  cannon.bullets = cannon.bullets.filter((b) => {
    b.age += dt;
    if (b.age > physics.bulletLife) return false;
    const distance = Math.hypot(b.vel.x, b.vel.y, b.vel.z) * dt;
    const steps = Math.max(1, Math.ceil(distance * CHECKS_PER_UNIT));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      b.pos.x += b.vel.x * h;
      b.pos.y += b.vel.y * h;
      b.pos.z += b.vel.z * h;
      const impact = collide(b, terrain);
      if (impact) {
        if (impact.tree) terrain.setTree(impact.tree.i, impact.tree.j, TREE_NONE);
        impacts.push(impact);
        return false;
      }
    }
    return true;
  });
  return impacts;
}

function launch(craft: CraftState, physics: Physics): Bullet {
  const nose = noseDirection(craft, physics);
  const up = thrustDirection(craft, physics);
  return {
    pos: {
      x: craft.pos.x + nose.x * MUZZLE_FORWARD + up.x * MUZZLE_UP,
      y: craft.pos.y + nose.y * MUZZLE_FORWARD + up.y * MUZZLE_UP,
      z: craft.pos.z + nose.z * MUZZLE_FORWARD + up.z * MUZZLE_UP,
    },
    vel: {
      x: craft.vel.x + nose.x * physics.bulletSpeed,
      y: craft.vel.y + nose.y * physics.bulletSpeed,
      z: craft.vel.z + nose.z * physics.bulletSpeed,
    },
    age: 0,
  };
}

function collide(b: Bullet, terrain: Terrain): Impact | null {
  const ground = terrain.heightAt(b.pos.x, b.pos.z);
  if (b.pos.y <= ground) {
    b.pos.y = ground;
    return { pos: b.pos, vel: b.vel, kind: terrain.tileTypeAt(b.pos.x, b.pos.z) === 'sea' ? 'sea' : 'ground' };
  }
  const tree = treeHit(terrain, b.pos.x, b.pos.y, b.pos.z, BULLET_RADIUS);
  return tree ? { pos: b.pos, vel: b.vel, kind: 'tree', tree } : null;
}
