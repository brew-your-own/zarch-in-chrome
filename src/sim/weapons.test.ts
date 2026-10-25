import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS as P, spawnCraft, type CraftState } from './craft';
import { createEnemies, DEFAULT_ENEMIES, SEEDER_POINTS, stepEnemies, waveSettings, type EnemyState } from './enemies';
import { FIGHTER_POINTS, spawnFighter } from './fighters';
import { Terrain } from './terrain';
import { createArsenal, DEFAULT_WEAPONS as W, detonateBomb, fireMissile, MAX_MISSILES, restock, stepMissiles } from './weapons';

const DT = 1 / 60;

// 48x48 rolling land with the pad in the middle, as in the enemies tests.
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

/** Mid-wave enemies (no new wave due) with one wave-1 seeder at each of `seeders` and fighters at `fighters`. */
function enemiesAt(t: Terrain, seeders: [number, number][], fighters: [number, number][]): EnemyState {
  const enemies = createEnemies(9);
  enemies.wave = 3;
  enemies.nextWaveIn = 1e9;
  const template = (() => {
    const e = createEnemies(1);
    stepEnemies(e, spawnCraft(t), [], t, DT, DEFAULT_ENEMIES, P);
    return e.seeders[0]!;
  })();
  for (const [x, z] of seeders) enemies.seeders.push({ ...template, id: enemies.nextId++, pos: { x, y: t.heightAt(x, z) + 2.5, z }, vel: { x: 0, y: 0, z: 0 } });
  for (const [x, z] of fighters) enemies.fighters.push(spawnFighter(enemies.nextId++, x, z, t, enemies.rng));
  return enemies;
}

describe('difficulty curve', () => {
  it('leaves wave 1 alone, then ramps each wave up to the cap', () => {
    expect(waveSettings(DEFAULT_ENEMIES, 1)).toEqual(DEFAULT_ENEMIES);
    const w3 = waveSettings(DEFAULT_ENEMIES, 3);
    const w6 = waveSettings(DEFAULT_ENEMIES, 6);
    expect(w3.seederSpeed).toBeGreaterThan(DEFAULT_ENEMIES.seederSpeed);
    expect(w6.seederSpeed).toBeGreaterThan(w3.seederSpeed);
    expect(w6.sporeInterval).toBeLessThan(w3.sporeInterval);
    expect(w6.fighterFireInterval).toBeLessThan(w3.fighterFireInterval);
    expect(w6.fighterAccuracy).toBeGreaterThan(w3.fighterAccuracy);
    const late = waveSettings(DEFAULT_ENEMIES, 100);
    expect(late.sporeInterval).toBeCloseTo(DEFAULT_ENEMIES.sporeInterval / DEFAULT_ENEMIES.difficultyCap);
    expect(late.fighterAccuracy).toBeLessThanOrEqual(0.85);
    expect(late.virusSpread).toBe(DEFAULT_ENEMIES.virusSpread);
  });

  it('can be switched off', () => {
    expect(waveSettings({ ...DEFAULT_ENEMIES, difficultyRamp: 0 }, 9)).toEqual({ ...DEFAULT_ENEMIES, difficultyRamp: 0 });
  });
});

describe('smart bombs', () => {
  it('are handed out one per wave from wave 3, and do not carry over', () => {
    const a = createArsenal();
    restock(a, 1, W);
    expect(a.bombs).toBe(0);
    restock(a, 3, W);
    expect(a.bombs).toBe(1);
    restock(a, 4, W);
    expect(a.bombs).toBe(1);
  });

  it('clear every enemy, spore and shot within range, scoring the kills', () => {
    const t = world();
    const craft = hovering(t);
    // One seeder and one fighter near (the seeder across the wrap), one of each far away.
    const enemies = enemiesAt(t, [[10.5 - 6 + 48, 10.5], [34, 34]], [[14, 12], [35, 30]]);
    enemies.spores.push({ pos: { x: 12, y: 3, z: 10 }, vel: { x: 0, y: 0, z: 0 } });
    enemies.shots.push({ pos: { x: 11, y: 4, z: 11 }, vel: { x: 0, y: 0, z: 0 }, age: 0 });
    const a = createArsenal();
    a.bombs = 1;
    const events = detonateBomb(a, craft, enemies, t, W)!;
    expect(events[0]).toMatchObject({ type: 'bombDetonated', radius: W.bombRadius });
    expect(enemies.seeders).toHaveLength(1);
    expect(enemies.fighters).toHaveLength(1);
    expect(enemies.spores).toHaveLength(0);
    expect(enemies.shots).toHaveLength(0);
    expect(enemies.score).toBe(SEEDER_POINTS + FIGHTER_POINTS);
    expect(a.bombs).toBe(0);
    expect(detonateBomb(a, craft, enemies, t, W)).toBeNull(); // none left
  });
});

describe('homing missiles', () => {
  it('build up one per wave, to a limit', () => {
    const a = createArsenal();
    for (let wave = 1; wave <= 3; wave++) restock(a, wave, W);
    expect(a.missiles).toBe(3);
    for (let wave = 4; wave <= 30; wave++) restock(a, wave, W);
    expect(a.missiles).toBe(MAX_MISSILES);
  });

  it('are kept when there is nothing to lock onto', () => {
    const t = world();
    const craft = hovering(t);
    const a = createArsenal();
    a.missiles = 2;
    expect(fireMissile(a, craft, enemiesAt(t, [], []), t, P)).toBeNull();
    expect(a.missiles).toBe(2);
  });

  it('chase down a fighter circling the craft', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = enemiesAt(t, [], [[18, 6]]);
    const a = createArsenal();
    a.missiles = 1;
    expect(fireMissile(a, craft, enemies, t, P)).toMatchObject({ type: 'missileLaunched' });
    expect(a.missiles).toBe(0);
    let hit = false;
    const quiet = { ...DEFAULT_ENEMIES, fighterFireInterval: 1e9 };
    for (let time = 0; time < 6 && !hit; time += DT) {
      stepEnemies(enemies, craft, [], t, DT, quiet, P);
      hit = stepMissiles(a, enemies, t, DT, W).some((e) => e.type === 'fighterDestroyed');
    }
    expect(hit).toBe(true);
    expect(enemies.fighters).toHaveLength(0);
    expect(enemies.score).toBe(FIGHTER_POINTS);
  });

  it('go for another enemy if their target is destroyed first', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = enemiesAt(t, [[22, 10.5], [10.5, 22]], []);
    const a = createArsenal();
    a.missiles = 1;
    fireMissile(a, craft, enemies, t, P);
    const first = a.inFlight[0]!.target;
    enemies.seeders = enemies.seeders.filter((s) => s.id !== first);
    let hit = false;
    for (let time = 0; time < 6 && !hit; time += DT) hit = stepMissiles(a, enemies, t, DT, W).some((e) => e.type === 'seederDestroyed');
    expect(hit).toBe(true);
    expect(enemies.seeders).toHaveLength(0);
  });
});
