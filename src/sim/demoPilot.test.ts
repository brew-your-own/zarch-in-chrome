import { describe, expect, it } from 'vitest';
import { createCannon, stepCannon } from './cannon';
import { DEFAULT_PHYSICS, spawnCraft, stepCraft, type CraftState } from './craft';
import { createDemoPilot, DEMO_ENEMIES, GAME_REACH, stepDemoPilot, wouldHit, type DemoMode } from './demoPilot';
import { buildingsLost, createEnemies, DEFAULT_ENEMIES, isOverrun, SEEDER_RADIUS, stepEnemies, type EnemyEvent, type Target } from './enemies';
import { buildMap, MAPS } from './maps';
import { buildVillage, stepBuildings } from './buildings';
import { Terrain } from './terrain';
import { buildTitleMap, lettersInfected } from './titleMap';
import { createArsenal, DEFAULT_WEAPONS, detonateBomb, fireMissile, restock, stepMissiles, type WeaponEvent } from './weapons';

const DT = 1 / 60;

/** Runs the title screen's world for `seconds`, the way main.ts does, and tallies what happened. */
function attract(seed: number, seconds: number) {
  const { terrain, letters, centre } = buildTitleMap();
  const physics = { ...DEFAULT_PHYSICS };
  const craft = spawnCraft(terrain, physics);
  const cannon = createCannon();
  const enemies = createEnemies(seed);
  const arsenal = createArsenal();
  const pilot = createDemoPilot(seed);
  const tally = { crashes: 0, kills: 0, mutantKills: 0, bomberKills: 0, pestKills: 0, bites: 0, saves: 0, lost: 0, mutations: 0, bombs: 0, missiles: 0, landedOnPad: 0, modes: new Set<DemoMode>(), lettersAt: [] as number[] };
  for (let step = 0; step < seconds / DT; step++) {
    const command = stepDemoPilot(pilot, craft, enemies, arsenal, terrain, physics, DEFAULT_WEAPONS, centre, DT);
    tally.modes.add(command.mode);
    const wasCrashed = craft.status === 'crashed';
    const wasOnPad = craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
    stepCraft(craft, command.input, terrain, DT, physics);
    stepCannon(cannon, craft, command.fire, terrain, DT, physics);
    const events: (EnemyEvent | WeaponEvent)[] = stepEnemies(enemies, craft, cannon.bullets, terrain, DT, DEMO_ENEMIES, physics);
    if (command.bomb) {
      const bomb = detonateBomb(arsenal, craft, enemies, terrain, DEFAULT_WEAPONS);
      if (bomb) tally.bombs++;
      events.push(...(bomb ?? []));
    }
    if (command.missile && fireMissile(arsenal, craft, enemies, terrain, physics)) tally.missiles++;
    events.push(...stepMissiles(arsenal, enemies, terrain, DT, DEFAULT_WEAPONS));
    for (const e of events) {
      if (e.type === 'waveStarted') restock(arsenal, e.wave, DEFAULT_WEAPONS);
      if (e.type === 'seederDestroyed' && e.byBullet) tally.kills++;
      if (e.type === 'mutantDestroyed' && e.byBullet) tally.mutantKills++;
      if (e.type === 'bomberDestroyed' && e.byBullet) tally.bomberKills++;
      if (e.type === 'seederMutated') tally.mutations++;
      if (e.type === 'pestDestroyed' && e.byBullet) tally.pestKills++;
      if (e.type === 'craftBitten') tally.bites++;
      if (e.type === 'buildingSaved') tally.saves++;
      if (e.type === 'buildingLost') tally.lost++;
    }
    if (!wasCrashed && craft.status === 'crashed') tally.crashes++;
    if (!wasOnPad && craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad') tally.landedOnPad++;
    if (step % (30 / DT) === 0) tally.lettersAt.push(lettersInfected(terrain, letters));
  }
  return { tally, cannon, terrain, letters };
}

describe('demo pilot', () => {
  it('shoots seeders down and seldom crashes', () => {
    for (const seed of [1, 2, 3]) {
      const { tally, cannon } = attract(seed, 180);
      // Kills and shots are fewer than they could be: it also breaks off to save the village's buildings.
      expect(tally.kills).toBeGreaterThanOrEqual(8);
      // Now and then a mutant catches it, which the title screen may show.
      expect(tally.crashes).toBeLessThanOrEqual(4);
      expect(cannon.shots).toBeGreaterThan(12);
    }
  });

  it('shows every control: missiles, smart bombs and refuelling on the pad', () => {
    const { tally } = attract(1, 240);
    expect(tally.missiles).toBeGreaterThan(0);
    expect(tally.bombs).toBeGreaterThan(0);
    expect(tally.landedOnPad).toBeGreaterThan(0);
    expect([...tally.modes].sort()).toEqual(['evade', 'hunt', 'patrol', 'refuel', 'rescue']);
  });

  it('meets mutants, bombers and pests, and brings them down', () => {
    const totals = { mutations: 0, mutantKills: 0, bomberKills: 0, pestKills: 0, bites: 0 };
    // A mutant kill is rare (about one run in two), so this needs a few more runs than the rest.
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { tally } = attract(seed, 240);
      totals.mutations += tally.mutations;
      totals.mutantKills += tally.mutantKills;
      totals.bomberKills += tally.bomberKills;
      totals.pestKills += tally.pestKills;
      totals.bites += tally.bites;
    }
    expect(totals.mutations).toBeGreaterThan(0);
    expect(totals.mutantKills).toBeGreaterThan(0);
    expect(totals.bomberKills).toBeGreaterThan(0);
    expect(totals.pestKills).toBeGreaterThan(0);
    expect(totals.bites).toBeGreaterThan(0); // the title shows a bite now and then
  });

  it('saves infected buildings in the village', () => {
    let saves = 0;
    let lost = 0;
    for (const seed of [1, 2, 3]) {
      const { tally } = attract(seed, 240);
      saves += tally.saves;
      lost += tally.lost;
    }
    expect(saves).toBeGreaterThan(0);
    expect(saves).toBeGreaterThan(lost / 4);
  });

  it('loses in the end: the virus takes the lettering, so the title loop restarts', () => {
    const { tally, terrain, letters } = attract(2, 300);
    expect(tally.lettersAt[1]).toBeLessThan(0.5); // not straight away
    expect(lettersInfected(terrain, letters)).toBeGreaterThan(0.9);
  });

  it('flies over to an infected building and hovers until it is saved', () => {
    const terrain = Terrain.fromRows(Array.from({ length: 32 }, () => Array<number>(32).fill(1)), { i: 15, j: 15, w: 3, h: 3 });
    buildVillage(terrain, 24, 10, 1, () => 0.5);
    const building = terrain.buildings[0]!;
    expect(building.kind).toBe('tower'); // the tallest, the hardest to hover low over
    terrain.infect(building.i, building.j);
    const craft = spawnCraft(terrain);
    const pilot = createDemoPilot(1);
    const rules = { buildingFallTime: 15 };
    const modes = new Set<DemoMode>();
    let saved = false;
    for (let step = 0; step < 12 / DT && !saved; step++) {
      const command = stepDemoPilot(pilot, craft, createEnemies(1), createArsenal(), terrain, DEFAULT_PHYSICS, DEFAULT_WEAPONS, { x: 16, z: 8 }, DT);
      modes.add(command.mode);
      stepCraft(craft, command.input, terrain, DT, DEFAULT_PHYSICS);
      saved = stepBuildings(terrain, craft, DT, rules, () => 0.5).events.some((e) => e.type === 'buildingSaved');
    }
    expect(saved).toBe(true);
    expect(craft.status).toBe('flying');
    expect(modes).toContain('rescue');
  });

  it('waits on the pad while there is nothing to shoot', () => {
    const terrain = Terrain.fromRows(Array.from({ length: 16 }, () => Array<number>(16).fill(1)), { i: 7, j: 7, w: 3, h: 3 });
    const craft = spawnCraft(terrain);
    const command = stepDemoPilot(createDemoPilot(1), craft, createEnemies(1), createArsenal(), terrain, DEFAULT_PHYSICS, DEFAULT_WEAPONS, { x: 8, z: 3 }, DT);
    expect(command.mode).toBe('refuel');
    expect(command.input.thrust).toBe(false);
    expect(command.fire).toBe(false);
  });
});

describe('wouldHit', () => {
  const terrain = Terrain.fromRows(Array.from({ length: 32 }, () => Array<number>(32).fill(0.5)), { i: 15, j: 15, w: 3, h: 3 });
  const craft = (): CraftState => ({ ...spawnCraft(terrain), pos: { x: 16, y: 3, z: 16 }, status: 'flying', heading: 0 });
  const seeder = (x: number, y: number, z: number): Target => ({ id: 1, pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: SEEDER_RADIUS });

  it('is true for a seeder dead ahead of a level nose', () => {
    expect(wouldHit(craft(), seeder(16, 3, 11), terrain, DEFAULT_PHYSICS)).toBe(true);
  });

  it('is false off to the side, above, or out of range', () => {
    expect(wouldHit(craft(), seeder(18, 3, 11), terrain, DEFAULT_PHYSICS)).toBe(false);
    expect(wouldHit(craft(), seeder(16, 5, 11), terrain, DEFAULT_PHYSICS)).toBe(false);
    expect(wouldHit(craft(), seeder(16, 3, -10), terrain, DEFAULT_PHYSICS)).toBe(false);
  });

  it('works across the wrap', () => {
    const c = craft();
    c.pos.z = 1;
    expect(wouldHit(c, seeder(16, 3, 29), terrain, DEFAULT_PHYSICS)).toBe(true);
  });
});

describe('demo pilot in Demo mode', () => {
  /** Plays a real game on `map` with the default rules until it is lost or `seconds` pass. */
  function play(map: (typeof MAPS)[number], seed: number, seconds: number) {
    const terrain = buildMap(map);
    const physics = { ...DEFAULT_PHYSICS };
    const craft = spawnCraft(terrain, physics);
    const cannon = createCannon();
    const enemies = createEnemies(seed);
    const arsenal = createArsenal();
    const pilot = createDemoPilot(seed);
    const home = terrain.padCentre();
    let crashes = 0;
    for (let step = 0; step < seconds / DT; step++) {
      const command = stepDemoPilot(pilot, craft, enemies, arsenal, terrain, physics, DEFAULT_WEAPONS, home, DT, GAME_REACH);
      const wasCrashed = craft.status === 'crashed';
      stepCraft(craft, command.input, terrain, DT, physics);
      stepCannon(cannon, craft, command.fire, terrain, DT, physics);
      for (const e of stepEnemies(enemies, craft, cannon.bullets, terrain, DT, DEFAULT_ENEMIES, physics)) {
        if (e.type === 'waveStarted') restock(arsenal, e.wave, DEFAULT_WEAPONS);
      }
      if (command.bomb) detonateBomb(arsenal, craft, enemies, terrain, DEFAULT_WEAPONS);
      if (command.missile) fireMissile(arsenal, craft, enemies, terrain, physics);
      stepMissiles(arsenal, enemies, terrain, DT, DEFAULT_WEAPONS);
      if (!wasCrashed && craft.status === 'crashed') crashes++;
      if (crashes >= DEFAULT_ENEMIES.lives || isOverrun(terrain, DEFAULT_ENEMIES) || buildingsLost(terrain, DEFAULT_ENEMIES)) break;
    }
    return enemies;
  }

  it('plays a whole map from the pad, and gets past the first wave on every map', () => {
    for (const map of MAPS) {
      const enemies = play(map, 1, 240);
      expect(enemies.score).toBeGreaterThan(0);
      expect(enemies.wave).toBeGreaterThanOrEqual(2);
    }
  });
});
