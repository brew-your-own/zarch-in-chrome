import { describe, expect, it } from 'vitest';
import { highestObstacle } from './autopilot';
import { DEFAULT_PHYSICS, spawnCraft } from './craft';
import { buildMap, MAPS } from './maps';
import {
  buildCourse, createRace, formatTime, GATE_CLEARANCE, GATE_COUNT, GATE_RADIUS, ghostPose, GHOST_RATE, passesGate, stepRace, type Gate,
} from './race';
import { Terrain } from './terrain';

const flat = () => Terrain.fromRows(Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => 1)), { i: 15, j: 15, w: 2, h: 2 });

describe('race courses', () => {
  for (const preset of MAPS) {
    it(`on ${preset.name} loop round the pad with every gate clear of the land`, () => {
      const terrain = buildMap(preset);
      const { gates } = buildCourse(terrain, preset.seed);
      expect(gates).toHaveLength(GATE_COUNT);
      const pad = terrain.padCentre();
      const far = Math.max(...gates.map((g) => Math.hypot(terrain.delta(pad.x, g.pos.x), terrain.delta(pad.z, g.pos.z))));
      expect(far).toBeGreaterThan(15); // it goes somewhere
      for (const [k, g] of gates.entries()) {
        // The ring's bottom is above everything under it, but not far up in the sky.
        const side = { x: -g.dir.z, z: g.dir.x };
        const top = highestObstacle(terrain, g.pos.x - side.x * GATE_RADIUS, g.pos.z - side.z * GATE_RADIUS, side.x * 4, side.z * 4, 4);
        expect(g.pos.y - GATE_RADIUS).toBeGreaterThanOrEqual(top + GATE_CLEARANCE - 1e-9);
        expect(g.pos.y - terrain.heightAt(g.pos.x, g.pos.z)).toBeLessThan(14);
        const next = gates[k + 1];
        if (next) {
          const gap = Math.hypot(terrain.delta(g.pos.x, next.pos.x), terrain.delta(g.pos.z, next.pos.z));
          expect(gap).toBeGreaterThan(4);
          expect(gap).toBeLessThan(20);
        }
      }
    });
  }

  it('are the same every time for a map', () => {
    const terrain = buildMap(MAPS[0]!);
    expect(buildCourse(terrain, 1)).toEqual(buildCourse(terrain, 1));
    expect(buildCourse(terrain, 1)).not.toEqual(buildCourse(terrain, 2));
  });
});

describe('passing a gate', () => {
  const t = flat();
  const gate: Gate = { pos: { x: 10, y: 5, z: 10 }, dir: { x: 1, z: 0 } };

  it('counts flying through the ring the right way', () => {
    expect(passesGate(gate, { x: 9.8, y: 5.5, z: 10.5 }, { x: 10.2, y: 5.5, z: 10.5 }, t)).toBe(true);
  });

  it("doesn't count the wrong way, outside the ring, or short of it", () => {
    expect(passesGate(gate, { x: 10.2, y: 5, z: 10 }, { x: 9.8, y: 5, z: 10 }, t)).toBe(false);
    expect(passesGate(gate, { x: 9.8, y: 5, z: 12.5 }, { x: 10.2, y: 5, z: 12.5 }, t)).toBe(false);
    expect(passesGate(gate, { x: 9.8, y: 8, z: 10 }, { x: 10.2, y: 8, z: 10 }, t)).toBe(false);
    expect(passesGate(gate, { x: 9.5, y: 5, z: 10 }, { x: 9.9, y: 5, z: 10 }, t)).toBe(false);
  });

  it('counts across the wrap', () => {
    const edge: Gate = { pos: { x: 0.1, y: 5, z: 10 }, dir: { x: 1, z: 0 } };
    expect(passesGate(edge, { x: 31.9, y: 5, z: 10 }, { x: 32.3, y: 5, z: 10 }, t)).toBe(true);
    expect(passesGate(edge, { x: -0.1, y: 5, z: 10 }, { x: 0.3, y: 5, z: 10 }, t)).toBe(true);
  });
});

describe('a race', () => {
  const t = flat();
  const gates: Gate[] = [
    { pos: { x: 20, y: 4, z: 16 }, dir: { x: 1, z: 0 } },
    { pos: { x: 24, y: 4, z: 16 }, dir: { x: 1, z: 0 } },
  ];
  const dt = 1 / 60;

  /** Teleports the craft to `pos` and steps the race once. */
  function move(race: ReturnType<typeof createRace>, craft: ReturnType<typeof spawnCraft>, pos: { x: number; y: number; z: number }) {
    const from = { ...craft.pos };
    craft.pos = { ...pos };
    return stepRace(race, craft, from, t, dt, DEFAULT_PHYSICS);
  }

  it('starts at liftoff, takes the gates in order, and finishes landed on the pad', () => {
    const race = createRace({ gates });
    const craft = spawnCraft(t);
    expect(stepRace(race, craft, craft.pos, t, dt, DEFAULT_PHYSICS)).toEqual([]);
    expect(race.started).toBe(false);
    craft.status = 'flying';
    expect(move(race, craft, { x: 19.9, y: 4, z: 16 }).map((e) => e.type)).toEqual(['raceStarted']);
    // Over the first gate, then through the second: it doesn't count before the first.
    move(race, craft, { x: 20.1, y: 9, z: 16 });
    move(race, craft, { x: 23.9, y: 4, z: 16 });
    move(race, craft, { x: 24.1, y: 4, z: 16 });
    expect(race.next).toBe(0);
    move(race, craft, { x: 19.8, y: 4, z: 16 });
    expect(move(race, craft, { x: 20.2, y: 4, z: 16 }).map((e) => e.type)).toEqual(['gatePassed']);
    move(race, craft, { x: 23.9, y: 4, z: 16 });
    move(race, craft, { x: 24.1, y: 4, z: 16 });
    expect(race.next).toBe(2);
    expect(race.splits).toHaveLength(2);
    craft.status = 'landed';
    const events = move(race, craft, { ...t.padCentre() });
    expect(events).toEqual([{ type: 'raceFinished', time: race.time }]);
    expect(race.time).toBeCloseTo(9 * dt);
    // The clock stops.
    move(race, craft, { ...t.padCentre() });
    expect(race.time).toBeCloseTo(9 * dt);
  });

  it("doesn't finish on the pad before every gate is passed", () => {
    const race = createRace({ gates });
    const craft = spawnCraft(t);
    craft.status = 'flying';
    move(race, craft, { x: 16, y: 3, z: 16 });
    craft.status = 'landed';
    move(race, craft, { ...t.padCentre() });
    expect(race.finished).toBe(false);
  });

  it('brings a wrecked craft back at the last gate passed, and keeps the tank full', () => {
    const race = createRace({ gates });
    const craft = spawnCraft(t);
    craft.status = 'flying';
    move(race, craft, { x: 19.9, y: 4, z: 16 });
    move(race, craft, { x: 20.1, y: 4, z: 16 });
    craft.fuel = 1;
    craft.status = 'crashed';
    move(race, craft, { x: 22, y: 1, z: 16 });
    expect(craft.fuel).toBe(DEFAULT_PHYSICS.maxFuel);
    expect(race.crashes).toBe(1);
    // stepCraft respawns it on the pad...
    Object.assign(craft, spawnCraft(t));
    const events = move(race, craft, craft.pos);
    // ...and the race moves it to the gate.
    expect(events).toEqual([{ type: 'raceRespawned', index: 0 }]);
    expect(craft.status).toBe('flying');
    expect(craft.pos).toEqual(gates[0]!.pos);
  });

  it('records a ghost that plays back where the craft flew', () => {
    const race = createRace({ gates });
    const craft = spawnCraft(t);
    craft.status = 'flying';
    for (let k = 0; k < 120; k++) move(race, craft, { x: 16 + k * 0.05, y: 3, z: 16 });
    expect(race.ghost.length / 5).toBeCloseTo(2 * GHOST_RATE, -1);
    const pose = ghostPose(race.ghost, 1)!;
    expect(pose.pos.x).toBeCloseTo(16 + 60 * 0.05, 0);
    expect(ghostPose(race.ghost, 10)).toBeNull();
    expect(ghostPose([], 0)).toBeNull();
  });
});

describe('race times', () => {
  it('read as minutes, seconds and hundredths', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(23.456)).toBe('0:23.46');
    expect(formatTime(83.5)).toBe('1:23.50');
  });
});
