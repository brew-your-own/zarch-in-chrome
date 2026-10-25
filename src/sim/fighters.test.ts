import { describe, expect, it } from 'vitest';
import type { Bullet } from './cannon';
import { DEFAULT_PHYSICS as P, spawnCraft, type CraftState } from './craft';
import { createEnemies, DEFAULT_ENEMIES, nearestEnemyDistance, stepEnemies, type EnemyEvent, type EnemyState } from './enemies';
import { FIGHTER_FLOOR, FIGHTER_POINTS, spawnFighter } from './fighters';
import { Terrain } from './terrain';

const DT = 1 / 60;

// 48x48 rolling land (no sea) with the pad in the middle, as in the enemies tests.
function world(): Terrain {
  const n = 48;
  const rows = Array.from({ length: n }, (_, z) =>
    Array.from({ length: n }, (_, x) => 1 + 0.5 * Math.sin((x / n) * Math.PI * 4) * Math.cos((z / n) * Math.PI * 2)),
  );
  return Terrain.fromRows(rows, { i: 23, j: 23, w: 2, h: 2 });
}

/** A craft hovering in place (never stepped), away from the pad. */
function hovering(t: Terrain): CraftState {
  const craft = spawnCraft(t);
  craft.status = 'flying';
  craft.pos = { x: 10.5, y: t.heightAt(10.5, 10.5) + 3, z: 10.5 };
  return craft;
}

/** Enemies with no seeders and one fighter at (x, z), mid-wave so no new wave starts. */
function oneFighter(t: Terrain, x: number, z: number): EnemyState {
  const enemies = createEnemies(7);
  enemies.wave = 2;
  enemies.nextWaveIn = 999;
  enemies.fighters.push(spawnFighter(enemies.nextId++, x, z, t, enemies.rng));
  return enemies;
}

function run(enemies: EnemyState, craft: CraftState, t: Terrain, seconds: number, settings = DEFAULT_ENEMIES): EnemyEvent[] {
  const events: EnemyEvent[] = [];
  for (let time = 0; time < seconds; time += DT) events.push(...stepEnemies(enemies, craft, [], t, DT, settings, P));
  return events;
}

describe('fighters', () => {
  it('join from the second wave, one more per wave by default, and can be switched off', () => {
    const t = world();
    const craft = spawnCraft(t);
    const enemies = createEnemies(1);
    stepEnemies(enemies, craft, [], t, DT, DEFAULT_ENEMIES, P);
    expect(enemies.fighters).toHaveLength(0);
    enemies.seeders = [];
    for (let k = 0; k < 5 / DT && enemies.wave < 2; k++) stepEnemies(enemies, craft, [], t, DT, DEFAULT_ENEMIES, P);
    expect(enemies.wave).toBe(2);
    expect(enemies.fighters).toHaveLength(1);

    const none = createEnemies(1);
    const settings = { ...DEFAULT_ENEMIES, fighters: 0 };
    stepEnemies(none, craft, [], t, DT, settings, P);
    none.seeders = [];
    for (let k = 0; k < 5 / DT && none.wave < 2; k++) stepEnemies(none, craft, [], t, DT, settings, P);
    expect(none.fighters).toHaveLength(0);
  });

  it('holds the next wave until the fighters are gone too', () => {
    const t = world();
    const craft = spawnCraft(t);
    const enemies = oneFighter(t, 30, 30);
    enemies.nextWaveIn = 0;
    run(enemies, craft, t, 1);
    expect(enemies.wave).toBe(2);
  });

  it('closes in on the craft and circles it, clear of the ground', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = oneFighter(t, 35, 30);
    const settings = { ...DEFAULT_ENEMIES, fighterFireInterval: 1e9 };
    let lowest = Infinity;
    for (let time = 0; time < 20; time += DT) {
      stepEnemies(enemies, craft, [], t, DT, settings, P);
      const f = enemies.fighters[0]!;
      lowest = Math.min(lowest, f.pos.y - t.heightAt(f.pos.x, f.pos.z));
    }
    const distance = nearestEnemyDistance(enemies, craft.pos, t);
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(8);
    expect(lowest).toBeGreaterThan(FIGHTER_FLOOR * 0.6);
  });

  it('shoots the craft down when in range', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = oneFighter(t, 14, 10.5);
    const events = run(enemies, craft, t, 15);
    expect(events.some((e) => e.type === 'fighterFired')).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'craftShot' }));
    expect(craft.status).toBe('crashed');
  });

  it('can be dodged: a craft that keeps moving is hit far less than one hovering still', () => {
    /** Share of shots that hit a craft weaving at `speed`, turning every 1.5 s, over two minutes. */
    const hitRate = (speed: number) => {
      const t = world();
      const craft = hovering(t);
      const enemies = oneFighter(t, 20, 10);
      let hits = 0;
      let fired = 0;
      for (let time = 0; time < 120; time += DT) {
        const angle = Math.floor(time / 1.5) * 2.1;
        craft.vel = { x: Math.cos(angle) * speed, y: 0, z: Math.sin(angle) * speed };
        craft.pos.x += craft.vel.x * DT;
        craft.pos.z += craft.vel.z * DT;
        craft.pos.y = t.heightAt(craft.pos.x, craft.pos.z) + 3;
        for (const e of stepEnemies(enemies, craft, [], t, DT, DEFAULT_ENEMIES, P)) {
          if (e.type === 'fighterFired') fired++;
          if (e.type === 'craftShot') {
            hits++;
            craft.status = 'flying'; // shrug it off and keep counting
          }
        }
      }
      return hits / fired;
    };
    const still = hitRate(0);
    const weaving = hitRate(3);
    expect(still).toBeGreaterThan(0.2);
    expect(weaving).toBeLessThan(0.1);
    expect(weaving).toBeLessThan(still / 3);
  });

  it('holds fire while the craft sits on the pad', () => {
    const t = world();
    const craft = spawnCraft(t); // landed on the pad
    const pad = t.padCentre();
    const enemies = oneFighter(t, pad.x + 4, pad.z);
    const events = run(enemies, craft, t, 10);
    expect(events.filter((e) => e.type === 'fighterFired')).toHaveLength(0);
    expect(craft.status).toBe('landed');
  });

  it('dies to a bullet, scoring more than a seeder', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = oneFighter(t, 30, 30);
    const f = enemies.fighters[0]!;
    const bullets: Bullet[] = [{ pos: { ...f.pos, z: f.pos.z - t.size }, vel: { x: 0, y: 0, z: 0 }, age: 0 }];
    const events = stepEnemies(enemies, craft, bullets, t, DT, DEFAULT_ENEMIES, P);
    expect(events).toContainEqual(expect.objectContaining({ type: 'fighterDestroyed', byBullet: true }));
    expect(enemies.fighters).toHaveLength(0);
    expect(bullets).toHaveLength(0);
    expect(enemies.score).toBe(FIGHTER_POINTS);
  });

  it('wrecks the craft when it rams it', () => {
    const t = world();
    const craft = hovering(t);
    const enemies = oneFighter(t, 30, 30);
    enemies.fighters[0]!.pos = { ...craft.pos };
    const events = stepEnemies(enemies, craft, [], t, DT, DEFAULT_ENEMIES, P);
    expect(craft.status).toBe('crashed');
    expect(events).toContainEqual(expect.objectContaining({ type: 'fighterDestroyed', byBullet: false }));
  });
});
