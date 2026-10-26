import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS as P, spawnCraft, type CraftState } from './craft';
import { createEnemies, DEFAULT_ENEMIES, stepEnemies, type EnemyEvent, type EnemyState } from './enemies';
import { PAD_KEEP_OFF, PEST_FLOOR, PEST_POINTS, spawnPest } from './pests';
import { Terrain } from './terrain';

const DT = 1 / 60;
/** No spores, so the tests watch the pests alone. */
const QUIET = { ...DEFAULT_ENEMIES, sporeInterval: 99 };

// 48x48 rolling land (no sea) with the pad in the middle, as in the enemies tests.
function world(): Terrain {
  const n = 48;
  const rows = Array.from({ length: n }, (_, z) =>
    Array.from({ length: n }, (_, x) => 1 + 0.5 * Math.sin((x / n) * Math.PI * 4) * Math.cos((z / n) * Math.PI * 2)),
  );
  return Terrain.fromRows(rows, { i: 23, j: 23, w: 2, h: 2 });
}

/** Mid-wave enemies (no new wave due) with a swarm of `count` centred on (x, z). */
function swarm(t: Terrain, x: number, z: number, count = 4): EnemyState {
  const enemies = createEnemies(3);
  enemies.wave = 4;
  enemies.nextWaveIn = 1e9;
  for (let k = 0; k < count; k++) enemies.pests.push(spawnPest(enemies.nextId++, x, z, t, enemies.pestRng));
  return enemies;
}

function hovering(t: Terrain, x = 10.5, z = 10.5): CraftState {
  const craft = spawnCraft(t);
  craft.status = 'flying';
  craft.pos = { x, y: t.heightAt(x, z) + 2, z };
  return craft;
}

/** Steps for `seconds` with the craft held still (never stepped by physics). */
function run(enemies: EnemyState, craft: CraftState, t: Terrain, seconds: number): EnemyEvent[] {
  const events: EnemyEvent[] = [];
  const y = craft.pos.y;
  for (let k = 0; k < seconds / DT; k++) {
    craft.pos.y = y;
    events.push(...stepEnemies(enemies, craft, [], t, DT, QUIET, P));
  }
  return events;
}

describe('pests', () => {
  it('swarm a craft that comes near and bite it for fuel without wrecking it', () => {
    const t = world();
    const enemies = swarm(t, 18, 10.5);
    const craft = hovering(t);
    const events = run(enemies, craft, t, 10);
    const bites = events.filter((e) => e.type === 'craftBitten');
    expect(bites).toHaveLength(4);
    expect(craft.status).toBe('flying');
    expect(craft.fuel).toBeCloseTo(P.maxFuel - 4 * QUIET.pestDrain);
    expect(enemies.pests).toHaveLength(0);
    expect(enemies.score).toBe(0);
  });

  it('loiter low over the ground while the craft is out of reach', () => {
    const t = world();
    const enemies = swarm(t, 40, 40);
    const craft = hovering(t, 10.5, 10.5);
    run(enemies, craft, t, 8);
    expect(enemies.pests).toHaveLength(4);
    for (const p of enemies.pests) {
      expect(Math.hypot(t.delta(40, p.pos.x), t.delta(40, p.pos.z))).toBeLessThan(5);
      expect(p.pos.y - t.heightAt(p.pos.x, p.pos.z)).toBeGreaterThan(PEST_FLOOR * 0.5 - 1e-6);
    }
  });

  it('keep off a craft sitting on the pad', () => {
    const t = world();
    const craft = spawnCraft(t);
    expect(craft.status).toBe('landed');
    const enemies = swarm(t, craft.pos.x + 8, craft.pos.z);
    const events = run(enemies, craft, t, 10);
    expect(events.some((e) => e.type === 'craftBitten')).toBe(false);
    for (const p of enemies.pests) {
      expect(Math.hypot(t.delta(craft.pos.x, p.pos.x), t.delta(craft.pos.z, p.pos.z))).toBeGreaterThan(PAD_KEEP_OFF - 1.5);
    }
  });

  it('die to a bullet and score', () => {
    const t = world();
    const enemies = swarm(t, 40, 40, 1);
    const pest = enemies.pests[0]!;
    const bullets = [{ pos: { ...pest.pos }, vel: { x: 0, y: 0, z: 0 }, age: 0 }];
    const events = stepEnemies(enemies, hovering(t), bullets, t, DT, QUIET, P);
    expect(events).toContainEqual(expect.objectContaining({ type: 'pestDestroyed', byBullet: true }));
    expect(enemies.score).toBe(PEST_POINTS);
  });

  it('arrive as one swarm from the configured wave', () => {
    const t = world();
    const craft = spawnCraft(t);
    const settings = { ...QUIET, pestsFromWave: 3, pests: 5 };
    const enemies = createEnemies(9);
    for (let wave = 1; wave <= 3; wave++) {
      enemies.seeders = [];
      enemies.fighters = [];
      enemies.bombers = [];
      enemies.pests = [];
      enemies.nextWaveIn = 0;
      stepEnemies(enemies, craft, [], t, DT, settings, P);
      expect(enemies.wave).toBe(wave);
      expect(enemies.pests).toHaveLength(wave >= 3 ? 5 : 0);
    }
    const [first] = enemies.pests;
    for (const p of enemies.pests) expect(Math.hypot(t.delta(first!.pos.x, p.pos.x), t.delta(first!.pos.z, p.pos.z))).toBeLessThan(3.1);
  });
});
