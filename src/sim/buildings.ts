import type { CraftState, Vec3 } from './craft';
import { createRng } from './rng';
import type { Terrain } from './terrain';
import { TREE_NONE } from './trees';

/**
 * Villages of buildings to protect. A building stands at the centre of its tile. When the
 * virus reaches its tile it is infected, and after `buildingFallTime` seconds it falls to
 * a ruin that keeps spreading the virus, unless the craft saves it first by hovering low
 * over it for `RESCUE_TIME` seconds, which also cleans the tiles around it.
 */
export type BuildingKind = 'house' | 'barn' | 'tower';
export type BuildingStatus = 'standing' | 'infected' | 'ruin';

export interface Building {
  id: number;
  /** Its tile. */
  i: number;
  j: number;
  kind: BuildingKind;
  /** Turned a quarter turn (its width runs along z). */
  turned: boolean;
  status: BuildingStatus;
  /** While infected: seconds until it falls. As a ruin: seconds until its next spore. */
  timer: number;
  /** Seconds the craft has hovered over it while infected; it is saved at `RESCUE_TIME`. */
  rescue: number;
}

/** Half width (along x unless turned), half depth and full height of each kind, roof included. */
export const BUILDING_SHAPES: Record<BuildingKind, { halfWidth: number; halfDepth: number; height: number }> = {
  house: { halfWidth: 0.34, halfDepth: 0.27, height: 0.6 },
  barn: { halfWidth: 0.44, halfDepth: 0.26, height: 0.55 },
  tower: { halfWidth: 0.2, halfDepth: 0.2, height: 1.3 },
};
/** What is left of a fallen building: a low heap on the same footprint. */
export const RUIN_HEIGHT = 0.2;

/** The settings in `EnemySettings` that govern buildings. */
export interface BuildingRules {
  /** Seconds an infected building stands before it falls. */
  buildingFallTime: number;
}

/** The craft saves an infected building by hovering this close (horizontally) and this low over it, for this long. */
export const RESCUE_RADIUS = 1.6;
export const RESCUE_HEIGHT = 2.5;
export const RESCUE_TIME = 2;
/** A saved building cleans the tiles this far around it (a 3x3 block at 1). */
const CLEANSE_REACH = 1;
/** A ruin drops a spore this often (s), landing within about a tile of it. */
const RUIN_SPORE_INTERVAL = 4;

/** Villages are this far from the pad and from each other (tiles, wrapped). */
const PAD_DISTANCE = 10;
const VILLAGE_SPACING = 14;
/** Buildings of one village lie within this many tiles of its centre. */
const VILLAGE_RADIUS = 2.5;
/** A building only goes on a tile whose corners differ in height by at most this. */
const MAX_SLOPE = 0.3;

export type BuildingEvent =
  | { type: 'buildingInfected'; building: Building }
  | { type: 'buildingSaved'; building: Building }
  | { type: 'buildingLost'; building: Building };

/** World position of a building's base: the centre of its tile, on the ground. */
export function buildingBase(terrain: Terrain, b: { i: number; j: number }): Vec3 {
  const x = b.i + 0.5;
  const z = b.j + 0.5;
  return { x, y: terrain.heightAt(x, z), z };
}

/** Height of a building's top above its base: its full height, or a ruin's. */
export function buildingHeight(b: Building): number {
  return b.status === 'ruin' ? RUIN_HEIGHT : BUILDING_SHAPES[b.kind].height;
}

/**
 * The building that a body of horizontal radius `radius` at (x, y, z) overlaps, or null.
 * Buildings are boxes; only the 3x3 tiles around the point can hold one close enough.
 */
export function buildingHit(terrain: Terrain, x: number, y: number, z: number, radius: number): Building | null {
  const ci = Math.floor(x);
  const cj = Math.floor(z);
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const b = terrain.buildingAt(i, j);
      if (!b) continue;
      const shape = BUILDING_SHAPES[b.kind];
      const halfX = b.turned ? shape.halfDepth : shape.halfWidth;
      const halfZ = b.turned ? shape.halfWidth : shape.halfDepth;
      // The tile may be a copy of the building's across the wrap; measure from this one.
      const dx = x - (i + 0.5);
      const dz = z - (j + 0.5);
      if (Math.abs(dx) >= halfX + radius || Math.abs(dz) >= halfZ + radius) continue;
      if (y < terrain.heightAt(i + 0.5, j + 0.5) + buildingHeight(b)) return b;
    }
  }
  return null;
}

export function hitsBuilding(terrain: Terrain, x: number, y: number, z: number, radius: number): boolean {
  return buildingHit(terrain, x, y, z, radius) !== null;
}

/** Whether a building can go on tile (i, j): dry, fairly flat land, with no building yet. */
function buildable(terrain: Terrain, i: number, j: number): boolean {
  if (terrain.tileType(i, j) !== 'land' || terrain.buildingAt(i, j)) return false;
  const corners = [terrain.vertexHeight(i, j), terrain.vertexHeight(i + 1, j), terrain.vertexHeight(i, j + 1), terrain.vertexHeight(i + 1, j + 1)];
  return Math.max(...corners) - Math.min(...corners) <= MAX_SLOPE;
}

/**
 * Builds a village of up to `count` buildings on buildable tiles within `VILLAGE_RADIUS`
 * of tile (ci, cj), no two side by side; the first is its tower. Clears the trees on
 * their tiles. Builds nothing if there is room for fewer than `minimum`. Returns how many
 * were built.
 */
export function buildVillage(terrain: Terrain, ci: number, cj: number, count: number, rng: () => number, minimum = 1): number {
  const spots: { i: number; j: number }[] = [];
  const r = Math.ceil(VILLAGE_RADIUS);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      if (Math.hypot(di, dj) <= VILLAGE_RADIUS && buildable(terrain, ci + di, cj + dj)) spots.push({ i: terrain.wrap(ci + di), j: terrain.wrap(cj + dj) });
    }
  }
  // Nearest the centre first, with a little shuffle, so the village stays together.
  const scored = spots.map((s) => ({ s, key: Math.hypot(terrain.delta(ci, s.i), terrain.delta(cj, s.j)) + rng() * 1.5 }));
  scored.sort((a, b) => a.key - b.key);
  const chosen: { i: number; j: number }[] = [];
  const touches = (a: { i: number; j: number }, b: { i: number; j: number }) =>
    Math.abs(terrain.delta(a.i, b.i)) <= 1 && Math.abs(terrain.delta(a.j, b.j)) <= 1;
  for (const { s } of scored) {
    if (chosen.length >= count) break;
    const nearOther = terrain.buildings.some((b) => touches(b, s));
    if (!nearOther && !chosen.some((c) => touches(c, s))) chosen.push(s);
  }
  if (chosen.length < minimum) return 0;
  chosen.forEach((s, k) => {
    const kind: BuildingKind = k === 0 ? 'tower' : rng() < 0.7 ? 'house' : 'barn';
    terrain.addBuilding({ id: terrain.buildings.length + 1, i: s.i, j: s.j, kind, turned: rng() < 0.5, status: 'standing', timer: 0, rescue: 0 });
    terrain.setTree(s.i, s.j, TREE_NONE);
  });
  return chosen.length;
}

/**
 * Places up to `villages` villages of 3 to 6 buildings on the map, away from the pad and
 * from each other. Uses its own random stream, so it never changes the map's heights or trees
 * (other than clearing the trees where it builds).
 */
export function placeVillages(terrain: Terrain, seed: number, villages: number): void {
  const rng = createRng(seed ^ 0xb111d1e5);
  const pad = terrain.padCentre();
  const centres: { i: number; j: number }[] = [];
  for (let tries = 0; tries < 400 && centres.length < villages; tries++) {
    const i = Math.floor(rng() * terrain.size);
    const j = Math.floor(rng() * terrain.size);
    const count = 3 + Math.floor(rng() * 4);
    if (!buildable(terrain, i, j)) continue;
    if (Math.hypot(terrain.delta(pad.x, i + 0.5), terrain.delta(pad.z, j + 0.5)) < PAD_DISTANCE) continue;
    if (centres.some((c) => Math.hypot(terrain.delta(c.i, i), terrain.delta(c.j, j)) < VILLAGE_SPACING)) continue;
    // A village needs room for at least three.
    if (buildVillage(terrain, i, j, count, rng, 3) > 0) centres.push({ i, j });
  }
}

/** Share of the buildings that have fallen, 0-1 (0 with none). */
export function buildingsLostFraction(terrain: Terrain): number {
  const all = terrain.buildings.length;
  return all === 0 ? 0 : terrain.buildings.filter((b) => b.status === 'ruin').length / all;
}

export function standingBuildings(terrain: Terrain): number {
  return terrain.buildings.filter((b) => b.status !== 'ruin').length;
}

/**
 * Advances every building by `dt`: infects those whose tile has caught the virus, counts
 * down and fells infected ones, saves one the craft hovers over long enough (cleaning the
 * tiles around it), and has ruins drop spores (returned, for the caller to add to the
 * falling spores).
 */
export function stepBuildings(
  terrain: Terrain,
  craft: CraftState,
  dt: number,
  rules: BuildingRules,
  rng: () => number,
): { events: BuildingEvent[]; spores: { pos: Vec3; vel: Vec3 }[] } {
  const events: BuildingEvent[] = [];
  const spores: { pos: Vec3; vel: Vec3 }[] = [];
  for (const b of terrain.buildings) {
    if (b.status === 'standing') {
      if (!terrain.isInfected(b.i, b.j)) continue;
      b.status = 'infected';
      b.timer = rules.buildingFallTime;
      b.rescue = 0;
      events.push({ type: 'buildingInfected', building: b });
    } else if (b.status === 'infected') {
      const base = buildingBase(terrain, b);
      const over =
        craft.status === 'flying' &&
        Math.hypot(terrain.delta(base.x, craft.pos.x), terrain.delta(base.z, craft.pos.z)) < RESCUE_RADIUS &&
        craft.pos.y - terrain.heightAt(craft.pos.x, craft.pos.z) < RESCUE_HEIGHT;
      b.rescue = over ? b.rescue + dt : Math.max(0, b.rescue - dt);
      if (b.rescue >= RESCUE_TIME) {
        b.status = 'standing';
        b.rescue = 0;
        for (let dj = -CLEANSE_REACH; dj <= CLEANSE_REACH; dj++) {
          for (let di = -CLEANSE_REACH; di <= CLEANSE_REACH; di++) terrain.disinfect(b.i + di, b.j + dj);
        }
        events.push({ type: 'buildingSaved', building: b });
        continue;
      }
      b.timer -= dt;
      if (b.timer > 0) continue;
      b.status = 'ruin';
      b.rescue = 0;
      b.timer = RUIN_SPORE_INTERVAL * rng();
      events.push({ type: 'buildingLost', building: b });
    } else {
      b.timer -= dt;
      if (b.timer > 0) continue;
      b.timer = RUIN_SPORE_INTERVAL * (0.7 + 0.6 * rng());
      const base = buildingBase(terrain, b);
      const angle = rng() * Math.PI * 2;
      spores.push({ pos: { x: base.x, y: base.y + 0.8, z: base.z }, vel: { x: Math.cos(angle) * 1.2, y: 1, z: Math.sin(angle) * 1.2 } });
    }
  }
  return { events, spores };
}
