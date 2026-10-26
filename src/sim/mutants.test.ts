import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS as P, spawnCraft, type CraftState } from './craft';
import { createEnemies, DEFAULT_ENEMIES, stepEnemies, waveSettings, type EnemyEvent, type EnemyState } from './enemies';
import { DIVE_RANGE, MUTANT_FLOOR, MUTANT_POINTS, mutate } from './mutants';
import { Terrain } from './terrain';

const DT = 1 / 60;
/** No spores, so the tests watch the mutants alone. */
const QUIET = { ...DEFAULT_ENEMIES, sporeInterval: 99 };

// 48x48 rolling land (no sea) with the pad in the middle, as in the enemies tests.
function world(): Terrain {
  const n = 48;
  const rows = Array.from({ length: n }, (_, z) =>
    Array.from({ length: n }, (_, x) => 1 + 0.5 * Math.sin((x / n) * Math.PI * 4) * Math.cos((z / n) * Math.PI * 2)),
  );
  return Terrain.fromRows(rows, { i: 23, j: 23, w: 2, h: 2 });
}

function hovering(t: Terrain): CraftState {
  const craft = spawnCraft(t);
  craft.status = 'flying';
  craft.pos = { x: 10.5, y: t.heightAt(10.5, 10.5) + 3, z: 10.5 };
  return craft;
}

/** Mid-wave enemies (no new wave due) with one mutant at (x, z). */
function oneMutant(t: Terrain, x: number, z: number, seed = 7): EnemyState {
  const enemies = createEnemies(seed);
  enemies.wave = 2;
  enemies.nextWaveIn = 1e9;
  enemies.mutants.push(mutate(enemies.nextId++, { x, y: t.heightAt(x, z) + 3, z }, { x: 0, y: 0, z: 0 }, enemies.rng));
  return enemies;
}

/**
 * Runs for up to `seconds`, moving the craft (never stepped by physics) round a circle at
 * `speed` u/s. Returns the time the craft was wrecked, or null.
 */
function chase(enemies: EnemyState, craft: CraftState, t: Terrain, seconds: number, speed = 0): number | null {
  for (let k = 0; k < seconds / DT; k++) {
    const a = (k * DT * speed) / 6;
    craft.vel = { x: -Math.sin(a) * speed, y: 0, z: Math.cos(a) * speed };
    craft.pos.x += craft.vel.x * DT;
    craft.pos.z += craft.vel.z * DT;
    craft.pos.y = t.heightAt(craft.pos.x, craft.pos.z) + 3;
    stepEnemies(enemies, craft, [], t, DT, QUIET, P);
    if (craft.status === 'crashed') return k * DT;
  }
  return null;
}

describe('mutants', () => {
  it('grow from seeders left alive too long, keeping their id', () => {
    const t = world();
    const craft = spawnCraft(t);
    const enemies = createEnemies(1);
    const settings = { ...QUIET, mutateAfter: 5 };
    stepEnemies(enemies, craft, [], t, DT, settings, P);
    const ids = enemies.seeders.map((s) => s.id).sort();
    const events: EnemyEvent[] = [];
    for (let k = 0; k < 4.9 / DT; k++) events.push(...stepEnemies(enemies, craft, [], t, DT, settings, P));
    expect(enemies.mutants).toHaveLength(0);
    for (let k = 0; k < 0.2 / DT; k++) events.push(...stepEnemies(enemies, craft, [], t, DT, settings, P));
    expect(enemies.seeders).toHaveLength(0);
    expect(enemies.mutants.map((m) => m.id).sort()).toEqual(ids);
    expect(events.filter((e) => e.type === 'seederMutated')).toHaveLength(ids.length);
  });

  it('never grow when switched off, and grow sooner in later waves', () => {
    const t = world();
    const craft = spawnCraft(t);
    const enemies = createEnemies(1);
    const settings = { ...QUIET, mutateAfter: 0 };
    for (let k = 0; k < 120 / DT; k++) stepEnemies(enemies, craft, [], t, DT, settings, P);
    expect(enemies.mutants).toHaveLength(0);
    expect(waveSettings(DEFAULT_ENEMIES, 5).mutateAfter).toBeLessThan(DEFAULT_ENEMIES.mutateAfter);
  });

  it('dive into a craft that hovers still, but miss one that keeps moving', () => {
    let rammedStill = 0;
    let rammedMoving = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const t = world();
      const still = hovering(t);
      if (chase(oneMutant(t, 20, 20, seed), still, t, 15) !== null) rammedStill++;
      const moving = hovering(t);
      if (chase(oneMutant(t, 20, 20, seed), moving, t, 15, 4) !== null) rammedMoving++;
    }
    expect(rammedStill).toBe(10);
    expect(rammedMoving).toBeLessThanOrEqual(2);
  });

  it('dive only from close by, and keep clear of the ground', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = oneMutant(t, 30, 30);
    let lowest = Infinity;
    for (let k = 0; k < 2 / DT; k++) {
      stepEnemies(enemies, craft, [], t, DT, QUIET, P);
      const m = enemies.mutants[0]!;
      const far = Math.hypot(t.delta(m.pos.x, craft.pos.x), m.pos.y - craft.pos.y, t.delta(m.pos.z, craft.pos.z)) > DIVE_RANGE;
      if (far) expect(m.phase).not.toBe('dive');
      lowest = Math.min(lowest, m.pos.y - t.heightAt(m.pos.x, m.pos.z));
    }
    // Hovering 3 above the ground, the craft draws dives downwards; they pull out above the floor.
    craft.pos.y = t.heightAt(craft.pos.x, craft.pos.z) + 0.6;
    chase(enemies, craft, t, 6);
    for (const m of enemies.mutants) lowest = Math.min(lowest, m.pos.y - t.heightAt(m.pos.x, m.pos.z));
    expect(lowest).toBeGreaterThan(MUTANT_FLOOR * 0.4);
  });

  it('leave a craft on the pad alone', () => {
    const t = world();
    const craft = spawnCraft(t); // landed on the pad
    const enemies = oneMutant(t, 30, 30);
    for (let k = 0; k < 15 / DT; k++) {
      stepEnemies(enemies, craft, [], t, DT, QUIET, P);
      expect(enemies.mutants[0]!.phase).not.toBe('dive');
    }
    expect(craft.status).toBe('landed');
  });

  it('die to a bullet and score', () => {
    const t = world();
    const enemies = oneMutant(t, 20, 20);
    const m = enemies.mutants[0]!;
    const bullets = [{ pos: { ...m.pos }, vel: { x: 0, y: 0, z: 0 }, age: 0 }];
    const events = stepEnemies(enemies, hovering(t), bullets, t, DT, QUIET, P);
    expect(events).toContainEqual(expect.objectContaining({ type: 'mutantDestroyed', byBullet: true }));
    expect(enemies.mutants).toHaveLength(0);
    expect(enemies.score).toBe(MUTANT_POINTS);
  });
});
