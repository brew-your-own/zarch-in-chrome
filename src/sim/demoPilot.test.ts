import { describe, expect, it } from 'vitest';
import { createCannon, stepCannon } from './cannon';
import { DEFAULT_PHYSICS, spawnCraft, stepCraft, type CraftState } from './craft';
import { createDemoPilot, DEMO_ENEMIES, stepDemoPilot, wouldHit, type DemoMode } from './demoPilot';
import { createEnemies, stepEnemies, type EnemyEvent, type Seeder } from './enemies';
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
  const tally = { crashes: 0, kills: 0, bombs: 0, missiles: 0, landedOnPad: 0, modes: new Set<DemoMode>(), lettersAt: [] as number[] };
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
      expect(tally.kills).toBeGreaterThanOrEqual(10);
      expect(tally.crashes).toBeLessThanOrEqual(2);
      expect(cannon.shots).toBeGreaterThan(20);
    }
  });

  it('shows every control: missiles, smart bombs and refuelling on the pad', () => {
    const { tally } = attract(1, 240);
    expect(tally.missiles).toBeGreaterThan(0);
    expect(tally.bombs).toBeGreaterThan(0);
    expect(tally.landedOnPad).toBeGreaterThan(0);
    expect([...tally.modes].sort()).toEqual(['hunt', 'patrol', 'refuel']);
  });

  it('loses in the end: the virus takes the lettering, so the title loop restarts', () => {
    const { tally, terrain, letters } = attract(2, 300);
    expect(tally.lettersAt[1]).toBeLessThan(0.5); // not straight away
    expect(lettersInfected(terrain, letters)).toBeGreaterThan(0.9);
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
  const seeder = (x: number, y: number, z: number): Seeder => ({ id: 1, pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, target: { x, z }, dropIn: 1 });

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
