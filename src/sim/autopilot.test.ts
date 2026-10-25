import { describe, expect, it } from 'vitest';
import { autopilotReady, createAutopilot, stepAutopilot, toggleAutopilot } from './autopilot';
import { CRAFT_RADIUS, DEFAULT_PHYSICS as P, spawnCraft, stepCraft, type CraftState } from './craft';
import { buildMap, MAPS } from './maps';
import { createRng } from './rng';
import type { Terrain } from './terrain';
import { hitsTree } from './trees';

const DT = 1 / 60;

/** Flies with the autopilot until it lets go. Returns the craft and the seconds it took. */
function autoFly(craft: CraftState, terrain: Terrain, limit = 90) {
  const ap = createAutopilot();
  toggleAutopilot(ap, craft, terrain, 1);
  let t = 0;
  let crashed = false;
  for (; t < limit; t += DT) {
    const input = stepAutopilot(ap, craft, terrain, P);
    if (!input) break;
    stepCraft(craft, input, terrain, DT, P);
    if (craft.status === 'crashed') crashed = true;
  }
  return { craft, seconds: t, crashed, stillActive: ap.active };
}

/** Land tiles across the map where the craft can sit without touching a tree. */
function startTiles(terrain: Terrain, count: number, seed: number): { x: number; z: number }[] {
  const rng = createRng(seed);
  const out: { x: number; z: number }[] = [];
  while (out.length < count) {
    const x = Math.floor(rng() * terrain.size) + 0.5;
    const z = Math.floor(rng() * terrain.size) + 0.5;
    if (terrain.tileTypeAt(x, z) !== 'land') continue;
    if (hitsTree(terrain, x, terrain.heightAt(x, z), z, CRAFT_RADIUS)) continue;
    out.push({ x, z });
  }
  return out;
}

describe('autopilot', () => {
  for (const map of MAPS) {
    it(`lands safely on the pad from all over ${map.name}`, () => {
      const terrain = buildMap(map);
      for (const [k, { x, z }] of startTiles(terrain, 12, map.seed).entries()) {
        const craft = spawnCraft(terrain, P);
        craft.pos = { x, y: terrain.heightAt(x, z), z };
        if (k % 2 === 1) {
          // Airborne and moving away, a few units up.
          craft.status = 'flying';
          craft.pos.y += 4;
          craft.vel = { x: 3, y: -1, z: -2 };
        }
        const result = autoFly(craft, terrain);
        expect(result.crashed, `from (${x}, ${z})`).toBe(false);
        expect(result.stillActive, `from (${x}, ${z})`).toBe(false);
        expect(craft.status).toBe('landed');
        expect(terrain.tileTypeAt(craft.pos.x, craft.pos.z)).toBe('pad');
      }
    });
  }

  it('takes the short way across the wrap', () => {
    const terrain = buildMap(MAPS[0]!);
    const pad = terrain.padCentre();
    const craft = spawnCraft(terrain, P);
    // Half a map away in unwrapped coordinates is the same place; fly from just past the pad's antipode.
    craft.status = 'flying';
    craft.pos = { x: pad.x + terrain.size * 2 + 8, y: 12, z: pad.z };
    const result = autoFly(craft, terrain);
    expect(result.crashed).toBe(false);
    expect(terrain.tileTypeAt(craft.pos.x, craft.pos.z)).toBe('pad');
    expect(result.seconds).toBeLessThan(15);
  });

  it('comes down quickly from the ceiling without burning much fuel', () => {
    const terrain = buildMap(MAPS[0]!);
    const pad = terrain.padCentre();
    const craft = spawnCraft(terrain, P);
    craft.status = 'flying';
    craft.pos = { x: pad.x + 12, y: P.maxAltitude, z: pad.z - 18 };
    const result = autoFly(craft, terrain);
    expect(result.crashed).toBe(false);
    expect(terrain.tileTypeAt(craft.pos.x, craft.pos.z)).toBe('pad');
    expect(result.seconds).toBeLessThan(20);
    expect(P.maxFuel - craft.fuel).toBeLessThan(30);
  });

  it('can be used once per wave, and not while sitting on the pad or wrecked', () => {
    const terrain = buildMap(MAPS[0]!);
    const craft = spawnCraft(terrain, P);
    const ap = createAutopilot();
    expect(autopilotReady(ap, craft, terrain, 1)).toBe(false); // already on the pad
    expect(toggleAutopilot(ap, craft, terrain, 1)).toBe(false);

    craft.status = 'flying';
    craft.pos.y += 3;
    expect(toggleAutopilot(ap, craft, terrain, 1)).toBe(true);
    expect(toggleAutopilot(ap, craft, terrain, 1)).toBe(false); // cancelled
    expect(toggleAutopilot(ap, craft, terrain, 1)).toBe(false); // spent for wave 1
    expect(autopilotReady(ap, craft, terrain, 2)).toBe(true);

    craft.status = 'crashed';
    expect(autopilotReady(ap, craft, terrain, 2)).toBe(false);
  });

  it('lets go when the craft crashes', () => {
    const terrain = buildMap(MAPS[0]!);
    const craft = spawnCraft(terrain, P);
    craft.status = 'flying';
    craft.pos.y += 3;
    const ap = createAutopilot();
    toggleAutopilot(ap, craft, terrain, 1);
    expect(stepAutopilot(ap, craft, terrain, P)).not.toBeNull();
    craft.status = 'crashed';
    expect(stepAutopilot(ap, craft, terrain, P)).toBeNull();
    expect(ap.active).toBe(false);
  });
});
