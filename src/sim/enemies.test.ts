import { describe, expect, it } from 'vitest';
import type { Bullet } from './cannon';
import { DEFAULT_PHYSICS as P, spawnCraft } from './craft';
import { createEnemies, DEFAULT_ENEMIES, isOverrun, SEEDER_CRUISE, SEEDER_POINTS, stepEnemies, type EnemyEvent } from './enemies';
import { Terrain } from './terrain';

const DT = 1 / 60;

// 48x48 rolling land (no sea) with the pad in the middle.
function world(): Terrain {
  const n = 48;
  const rows = Array.from({ length: n }, (_, z) =>
    Array.from({ length: n }, (_, x) => 1 + 0.5 * Math.sin((x / n) * Math.PI * 4) * Math.cos((z / n) * Math.PI * 2)),
  );
  return Terrain.fromRows(rows, { i: 23, j: 23, w: 2, h: 2 });
}

function run(seconds: number, t: Terrain, enemies = createEnemies(1), settings = DEFAULT_ENEMIES, bullets: Bullet[] = []) {
  const craft = spawnCraft(t);
  const events: EnemyEvent[] = [];
  for (let time = 0; time < seconds; time += DT) events.push(...stepEnemies(enemies, craft, bullets, t, DT, settings, P));
  return { enemies, craft, events };
}

describe('enemies', () => {
  it('starts the first wave away from the craft', () => {
    const t = world();
    const { enemies, events, craft } = run(DT, t);
    expect(enemies.wave).toBe(1);
    expect(enemies.seeders).toHaveLength(DEFAULT_ENEMIES.firstWave);
    expect(events).toContainEqual({ type: 'waveStarted', wave: 1 });
    for (const s of enemies.seeders) {
      expect(Math.hypot(t.delta(craft.pos.x, s.pos.x), t.delta(craft.pos.z, s.pos.z))).toBeGreaterThanOrEqual(16);
    }
  });

  it('can be switched off', () => {
    const { enemies } = run(1, world(), createEnemies(1), { ...DEFAULT_ENEMIES, firstWave: 0 });
    expect(enemies.seeders).toHaveLength(0);
    expect(enemies.wave).toBe(0);
  });

  it('keeps seeders at cruise height over the terrain and inside the wrapped world', () => {
    const t = world();
    const enemies = createEnemies(2);
    run(20, t, enemies);
    for (const s of enemies.seeders) {
      const clearance = s.pos.y - t.heightAt(s.pos.x, s.pos.z);
      expect(clearance).toBeGreaterThan(SEEDER_CRUISE * 0.6);
      expect(clearance).toBeLessThan(SEEDER_CRUISE * 1.6);
      expect(s.pos.x).toBeGreaterThanOrEqual(0);
      expect(s.pos.x).toBeLessThan(t.size);
    }
  });

  it('drops spores that infect the land', () => {
    const t = world();
    const { events } = run(15, t, createEnemies(3), { ...DEFAULT_ENEMIES, virusSpread: 0 });
    const landed = events.filter((e) => e.type === 'sporeLanded');
    expect(landed.length).toBeGreaterThan(5);
    expect(t.infectedCount).toBeGreaterThan(5);
    expect(t.infectedCount).toBe(landed.filter((e) => e.type === 'sporeLanded' && e.infected).length);
    expect(t.isInfected(23, 23)).toBe(false); // pad stays clean
  });

  it('dies to a bullet, consuming it and scoring', () => {
    const t = world();
    const enemies = createEnemies(4);
    run(DT, t, enemies);
    const target = enemies.seeders[0]!;
    // A bullet placed at the seeder, but in unwrapped coordinates one world-width away.
    const bullets: Bullet[] = [{ pos: { ...target.pos, x: target.pos.x + t.size }, vel: { x: 0, y: 0, z: 0 }, age: 0 }];
    const craft = spawnCraft(t);
    const events = stepEnemies(enemies, craft, bullets, t, DT, DEFAULT_ENEMIES, P);
    expect(events).toContainEqual(expect.objectContaining({ type: 'seederDestroyed', byBullet: true }));
    expect(bullets).toHaveLength(0);
    expect(enemies.score).toBe(SEEDER_POINTS);
    expect(enemies.seeders.find((s) => s.id === target.id)).toBeUndefined();
  });

  it('wrecks the craft on contact', () => {
    const t = world();
    const enemies = createEnemies(5);
    run(DT, t, enemies);
    const craft = spawnCraft(t);
    craft.status = 'flying';
    craft.pos = { ...enemies.seeders[0]!.pos };
    const events = stepEnemies(enemies, craft, [], t, DT, DEFAULT_ENEMIES, P);
    expect(craft.status).toBe('crashed');
    expect(events).toContainEqual(expect.objectContaining({ type: 'seederDestroyed', byBullet: false }));
    expect(enemies.score).toBe(0);
  });

  it('sends a bigger wave once one is cleared', () => {
    const t = world();
    const enemies = createEnemies(6);
    run(DT, t, enemies);
    enemies.seeders = [];
    run(5, t, enemies);
    expect(enemies.wave).toBe(2);
    expect(enemies.seeders).toHaveLength(DEFAULT_ENEMIES.firstWave + 1);
  });

  it('is overrun once the virus covers the configured share of land', () => {
    const t = world();
    const settings = { ...DEFAULT_ENEMIES, overrunAt: 0.25 };
    expect(isOverrun(t, settings)).toBe(false);
    for (let j = 0; j < t.size && t.infectedFraction() < 0.25; j++) {
      for (let i = 0; i < t.size && t.infectedFraction() < 0.25; i++) t.infect(i, j);
    }
    expect(isOverrun(t, settings)).toBe(true);
    expect(isOverrun(t, { ...settings, overrunAt: 0.5 })).toBe(false);
  });
});
