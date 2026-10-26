import { describe, expect, it } from 'vitest';
import { buildingHit, RESCUE_TIME, stepBuildings, type Building, type BuildingEvent } from './buildings';
import { createCannon, stepCannon } from './cannon';
import { DEFAULT_PHYSICS as P, spawnCraft, stepCraft, type CraftState } from './craft';
import { buildingsLost, createEnemies, DEFAULT_ENEMIES, stepEnemies } from './enemies';
import { buildMap, MAPS } from './maps';
import { createRng } from './rng';
import { Terrain } from './terrain';
import { TREE_NONE } from './trees';

const DT = 1 / 60;
const RULES = { buildingFallTime: 10 };

/** Flat 32x32 land with the pad in the middle and one house on tile (8, 8). */
function hamlet(): { terrain: Terrain; house: Building } {
  const terrain = Terrain.fromRows(Array.from({ length: 32 }, () => Array<number>(32).fill(1)), { i: 15, j: 15, w: 3, h: 3 });
  const house: Building = { id: 1, i: 8, j: 8, kind: 'house', turned: false, status: 'standing', timer: 0, rescue: 0 };
  terrain.addBuilding(house);
  return { terrain, house };
}

/** A craft hovering still at `height` over (x, z), never stepped by physics. */
function hoverAt(terrain: Terrain, x: number, z: number, height: number): CraftState {
  const craft = spawnCraft(terrain);
  craft.status = 'flying';
  craft.pos = { x, y: terrain.heightAt(x, z) + height, z };
  return craft;
}

function run(terrain: Terrain, craft: CraftState, seconds: number): BuildingEvent[] {
  const rng = createRng(1);
  const events: BuildingEvent[] = [];
  for (let k = 0; k < seconds / DT; k++) events.push(...stepBuildings(terrain, craft, DT, RULES, rng).events);
  return events;
}

describe('villages', () => {
  it('stand on every preset map, on dry, fairly flat land away from the pad, in clearings', () => {
    for (const preset of MAPS) {
      const t = buildMap(preset);
      expect(t.buildings.length).toBeGreaterThanOrEqual(10);
      expect(t.buildings.filter((b) => b.kind === 'tower').length).toBeGreaterThanOrEqual(3);
      const pad = t.padCentre();
      for (const b of t.buildings) {
        expect(t.tileType(b.i, b.j)).toBe('land');
        expect(t.treeAt(b.i, b.j)).toBe(TREE_NONE);
        expect(t.buildingAt(b.i, b.j)).toBe(b);
        expect(Math.hypot(t.delta(pad.x, b.i + 0.5), t.delta(pad.z, b.j + 0.5))).toBeGreaterThanOrEqual(10);
        // No two side by side.
        for (const o of t.buildings) {
          if (o !== b) expect(Math.max(Math.abs(t.delta(b.i, o.i)), Math.abs(t.delta(b.j, o.j)))).toBeGreaterThan(1);
        }
      }
    }
  });

  it('are the same every time a map is built', () => {
    const a = buildMap(MAPS[0]!).buildings.map((b) => [b.i, b.j, b.kind]);
    expect(buildMap(MAPS[0]!).buildings.map((b) => [b.i, b.j, b.kind])).toEqual(a);
  });
});

describe('buildings', () => {
  it('are solid: the craft crashes into one, and bullets stop on it without harming it', () => {
    const { terrain, house } = hamlet();
    expect(buildingHit(terrain, 8.5, 1.3, 8.5, 0)).toBe(house);
    expect(buildingHit(terrain, 8.5, 1.7, 8.5, 0)).toBeNull();
    expect(buildingHit(terrain, 8.5 + 32, 1.3, 8.5, 0)).toBe(house); // across the wrap

    const craft = hoverAt(terrain, 7, 8.5, 0.3);
    craft.vel = { x: 3, y: 0, z: 0 };
    for (let k = 0; k < 60 && craft.status !== 'crashed'; k++) stepCraft(craft, { aimX: 0, aimY: 0, thrust: true }, terrain, DT, P);
    expect(craft.status).toBe('crashed');

    const gunner = hoverAt(terrain, 8.5, 12, 0.25); // south of the house, nose north
    const cannon = createCannon();
    const impacts = [];
    for (let k = 0; k < 40; k++) impacts.push(...stepCannon(cannon, gunner, k === 0, terrain, DT, P));
    expect(impacts.map((i) => i.kind)).toEqual(['building']);
    expect(house.status).toBe('standing');
  });

  it('fall a while after the virus reaches them, then keep spreading it', () => {
    const { terrain, house } = hamlet();
    const away = hoverAt(terrain, 20, 20, 3);
    expect(run(terrain, away, 1)).toEqual([]);
    terrain.infect(8, 8);
    expect(run(terrain, away, RULES.buildingFallTime - 0.5).map((e) => e.type)).toEqual(['buildingInfected']);
    expect(house.status).toBe('infected');
    expect(run(terrain, away, 1).map((e) => e.type)).toEqual(['buildingLost']);
    expect(house.status).toBe('ruin');
    const rng = createRng(2);
    let spores = 0;
    for (let k = 0; k < 20 / DT; k++) spores += stepBuildings(terrain, away, DT, RULES, rng).spores.length;
    expect(spores).toBeGreaterThanOrEqual(3);
  });

  it('are saved by hovering low over them, which cleans the tiles around them', () => {
    const { terrain, house } = hamlet();
    for (let j = 6; j <= 10; j++) for (let i = 6; i <= 10; i++) terrain.infect(i, j);
    const craft = hoverAt(terrain, 8.5, 8.5, 1.8);
    const events = run(terrain, craft, RESCUE_TIME + 0.1);
    expect(events.map((e) => e.type)).toEqual(['buildingInfected', 'buildingSaved']);
    expect(house.status).toBe('standing');
    for (let j = 7; j <= 9; j++) for (let i = 7; i <= 9; i++) expect(terrain.isInfected(i, j)).toBe(false);
    expect(terrain.isInfected(6, 6)).toBe(true); // only the 3x3 around it
    expect(terrain.infectedCount).toBe(25 - 9);
  });

  it('are not saved by flying high over them, or too briefly', () => {
    const { terrain, house } = hamlet();
    terrain.infect(8, 8);
    run(terrain, hoverAt(terrain, 8.5, 8.5, 4), RESCUE_TIME + 1);
    expect(house.status).toBe('infected');
    const low = hoverAt(terrain, 8.5, 8.5, 1.5);
    run(terrain, low, RESCUE_TIME * 0.6);
    run(terrain, hoverAt(terrain, 20, 20, 3), RESCUE_TIME * 0.6); // the progress drains away
    run(terrain, low, RESCUE_TIME * 0.6);
    expect(house.status).toBe('infected');
  });

  it('pay a bonus each wave while standing, and end the game once they have all fallen', () => {
    const { terrain, house } = hamlet();
    const enemies = createEnemies(1);
    const craft = spawnCraft(terrain);
    stepEnemies(enemies, craft, [], terrain, DT, DEFAULT_ENEMIES, P);
    expect(enemies.score).toBe(0); // no bonus for the first wave
    enemies.seeders = [];
    let bonus = 0;
    for (let k = 0; k < 6 / DT && enemies.wave < 2; k++) {
      for (const e of stepEnemies(enemies, craft, [], terrain, DT, DEFAULT_ENEMIES, P)) if (e.type === 'waveStarted') bonus = e.bonus;
    }
    expect(bonus).toBe(DEFAULT_ENEMIES.buildingBonus);
    expect(enemies.score).toBe(bonus);

    expect(buildingsLost(terrain, DEFAULT_ENEMIES)).toBe(false);
    house.status = 'ruin';
    expect(buildingsLost(terrain, DEFAULT_ENEMIES)).toBe(true);
    expect(buildingsLost(terrain, { ...DEFAULT_ENEMIES, buildingsLostAt: 0 })).toBe(false);
  });
});
