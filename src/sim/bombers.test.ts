import { describe, expect, it } from 'vitest';
import { BOMBER_CRUISE, BOMBER_HITS, BOMBER_POINTS, RUN_LENGTH, spawnBomber } from './bombers';
import type { Bullet } from './cannon';
import { DEFAULT_PHYSICS as P, spawnCraft } from './craft';
import { createEnemies, DEFAULT_ENEMIES, stepEnemies, type EnemyEvent, type EnemyState } from './enemies';
import { Terrain } from './terrain';

const DT = 1 / 60;
/** No virus spread, so every infected tile was bombed. */
const SETTINGS = { ...DEFAULT_ENEMIES, virusSpread: 0 };

// 48x48 rolling land (no sea) with the pad in the middle, as in the enemies tests.
function world(): Terrain {
  const n = 48;
  const rows = Array.from({ length: n }, (_, z) =>
    Array.from({ length: n }, (_, x) => 1 + 0.5 * Math.sin((x / n) * Math.PI * 4) * Math.cos((z / n) * Math.PI * 2)),
  );
  return Terrain.fromRows(rows, { i: 23, j: 23, w: 2, h: 2 });
}

/** Mid-wave enemies (no new wave due) with one bomber at (x, z). */
function oneBomber(t: Terrain, x: number, z: number, seed = 3): EnemyState {
  const enemies = createEnemies(seed);
  enemies.wave = 3;
  enemies.nextWaveIn = 1e9;
  enemies.bombers.push(spawnBomber(enemies.nextId++, x, z, t, enemies.rng));
  return enemies;
}

function run(enemies: EnemyState, t: Terrain, seconds: number, bullets: Bullet[] = []): EnemyEvent[] {
  const craft = spawnCraft(t);
  const events: EnemyEvent[] = [];
  for (let k = 0; k < seconds / DT; k++) events.push(...stepEnemies(enemies, craft, bullets, t, DT, SETTINGS, P));
  return events;
}

describe('bombers', () => {
  it('join from their wave on, and can be switched off', () => {
    const t = world();
    const craft = spawnCraft(t);
    const waves = (settings: typeof DEFAULT_ENEMIES) => {
      const enemies = createEnemies(1);
      const counts: number[] = [];
      for (let k = 0; k < 40 / DT && enemies.wave < 4; k++) {
        const wave = enemies.wave;
        stepEnemies(enemies, craft, [], t, DT, settings, P);
        if (enemies.wave !== wave) {
          counts.push(enemies.bombers.length);
          enemies.seeders = [];
          enemies.fighters = [];
          enemies.bombers = [];
        }
      }
      return counts;
    };
    expect(waves(SETTINGS)).toEqual([0, 0, 1, 1]);
    expect(waves({ ...SETTINGS, bombers: 0 })).toEqual([0, 0, 0, 0]);
  });

  it('cruise high over the terrain, inside the wrapped world', () => {
    const t = world();
    const enemies = oneBomber(t, 5, 5);
    for (let k = 0; k < 30; k++) {
      run(enemies, t, 1);
      const b = enemies.bombers[0]!;
      expect(b.pos.y - t.heightAt(b.pos.x, b.pos.z)).toBeGreaterThan(BOMBER_CRUISE * 0.7);
      expect(b.pos.x).toBeGreaterThanOrEqual(0);
      expect(b.pos.x).toBeLessThan(t.size);
    }
  });

  it('lay the virus in straight runs of neighbouring tiles', () => {
    const t = world();
    const enemies = oneBomber(t, 5.5, 40);
    enemies.bombers[0]!.course = enemies.bombers[0]!.heading = 0; // due north
    enemies.bombers[0]!.leg = 0.5;
    // The run, plus time for the last bombs to fall (the gap after it is longer than this).
    run(enemies, t, (RUN_LENGTH + 0.5) / SETTINGS.bomberSpeed + 2.5);
    const infected: [number, number][] = [];
    for (let j = 0; j < t.size; j++) for (let i = 0; i < t.size; i++) if (t.isInfected(i, j)) infected.push([i, j]);
    expect(infected.length).toBeGreaterThanOrEqual(RUN_LENGTH - 1);
    // One column, each tile next to the last.
    expect(new Set(infected.map(([i]) => i)).size).toBe(1);
    const rows = infected.map(([, j]) => j).sort((a, b) => a - b);
    expect(rows[rows.length - 1]! - rows[0]!).toBe(rows.length - 1);
  });

  it('take several hits, then die and score', () => {
    const t = world();
    const enemies = oneBomber(t, 5, 5);
    const events: EnemyEvent[] = [];
    for (let k = 0; k < BOMBER_HITS; k++) {
      const b = enemies.bombers[0]!;
      events.push(...run(enemies, t, DT, [{ pos: { ...b.pos }, vel: { x: 0, y: 0, z: 0 }, age: 0 }]));
    }
    expect(events.filter((e) => e.type === 'bomberHit')).toHaveLength(BOMBER_HITS - 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'bomberDestroyed', byBullet: true }));
    expect(enemies.bombers).toHaveLength(0);
    expect(enemies.score).toBe(BOMBER_POINTS);
  });
});
