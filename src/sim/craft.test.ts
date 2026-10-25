import { describe, expect, it } from 'vitest';
import { CRAFT, spawnCraft, stepCraft, thrustDirection, type CraftInput, type CraftState } from './craft';
import { Terrain } from './terrain';

const DT = 1 / 60;
const IDLE: CraftInput = { aimX: 0, aimY: 0, thrust: false };

// 8x8 world: flat land at height 1, a pad at tiles (0..1, 0..1), sea in the last rows.
function flatWorld(): Terrain {
  const rows = Array.from({ length: 8 }, (_, z) => Array.from({ length: 8 }, () => (z >= 6 ? 0 : 1)));
  return Terrain.fromRows(rows, { i: 0, j: 0, w: 2, h: 2 });
}

function run(state: CraftState, input: CraftInput, terrain: Terrain, seconds: number) {
  for (let t = 0; t < seconds; t += DT) stepCraft(state, input, terrain, DT);
  return state;
}

function airborne(terrain: Terrain, x: number, y: number, z: number): CraftState {
  const s = spawnCraft(terrain);
  s.pos = { x, y, z };
  s.status = 'flying';
  return s;
}

describe('craft', () => {
  it('spawns landed on the pad with full fuel', () => {
    const s = spawnCraft(flatWorld());
    expect(s.status).toBe('landed');
    expect(s.pos).toEqual({ x: 1, y: 1, z: 1 });
    expect(s.fuel).toBe(CRAFT.MAX_FUEL);
  });

  it('falls under gravity', () => {
    const t = flatWorld();
    const s = run(airborne(t, 3, 10, 3), IDLE, t, 0.5);
    expect(s.vel.y).toBeLessThan(0);
    expect(s.pos.y).toBeLessThan(10);
  });

  it('climbs when thrusting upright', () => {
    const t = flatWorld();
    const s = run(spawnCraft(t), { ...IDLE, thrust: true }, t, 1);
    expect(s.status).toBe('flying');
    expect(s.pos.y).toBeGreaterThan(1.5);
    expect(s.fuel).toBeLessThan(CRAFT.MAX_FUEL);
  });

  it('tilts toward the mouse and pushes the craft that way', () => {
    const t = flatWorld();
    // Mouse to the right and up the screen: lean toward +x and -z.
    const s = run(airborne(t, 3, 10, 3), { aimX: 0.7, aimY: 0.7, thrust: true }, t, 1);
    const dir = thrustDirection(s);
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.z).toBeLessThan(0);
    expect(s.vel.x).toBeGreaterThan(0);
    expect(s.vel.z).toBeLessThan(0);
  });

  it('caps the tilt when the aim leaves the unit disk', () => {
    const t = flatWorld();
    const s = run(airborne(t, 3, 10, 3), { aimX: 5, aimY: 0, thrust: false }, t, 2);
    expect(Math.acos(thrustDirection(s).y)).toBeCloseTo(CRAFT.MAX_TILT, 3);
  });

  it('does not thrust without fuel', () => {
    const t = flatWorld();
    const s = airborne(t, 4.5, 1, 4.5); // off the pad, which would refuel it
    s.status = 'landed';
    s.fuel = 0;
    run(s, { ...IDLE, thrust: true }, t, 0.5);
    expect(s.status).toBe('landed');
  });

  it('lands softly when slow and upright', () => {
    const t = flatWorld();
    const s = airborne(t, 3.5, 1.05, 3.5);
    s.vel.y = -0.5;
    run(s, IDLE, t, 0.2);
    expect(s.status).toBe('landed');
    expect(s.pos.y).toBe(1);
  });

  it('crashes when hitting the ground too fast', () => {
    const t = flatWorld();
    const s = airborne(t, 3.5, 1.05, 3.5);
    s.vel.y = -5;
    run(s, IDLE, t, 0.1);
    expect(s.status).toBe('crashed');
  });

  it('crashes when touching down tilted', () => {
    const t = flatWorld();
    const s = airborne(t, 3.5, 1.05, 3.5);
    s.tilt = { x: 1, z: 0 };
    run(s, { aimX: 1, aimY: 0, thrust: false }, t, 0.2);
    expect(s.status).toBe('crashed');
  });

  it('crashes on the sea even when slow', () => {
    const t = flatWorld();
    const s = airborne(t, 3.5, 0.05, 6.5);
    run(s, IDLE, t, 0.2);
    expect(s.status).toBe('crashed');
  });

  it('stays upright while sitting on the ground', () => {
    const t = flatWorld();
    const s = run(spawnCraft(t), { aimX: 1, aimY: 0, thrust: false }, t, 1);
    expect(s.status).toBe('landed');
    expect(thrustDirection(s)).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('lifts off vertically even when the mouse is off-centre', () => {
    const t = flatWorld();
    const s = spawnCraft(t);
    stepCraft(s, { aimX: 1, aimY: 0, thrust: true }, t, DT);
    expect(s.status).toBe('flying');
    expect(s.vel.x).toBe(0);
    expect(s.vel.z).toBe(0);
  });

  it('levels out on a safe touchdown', () => {
    const t = flatWorld();
    const s = airborne(t, 3.5, 1.02, 3.5);
    s.tilt = { x: 0.2, z: 0 };
    s.vel.y = -0.5;
    run(s, { aimX: 0.2, aimY: 0, thrust: false }, t, 0.2);
    expect(s.status).toBe('landed');
    expect(s.tilt).toEqual({ x: 0, z: 0 });
  });

  it('reports whether the thruster is firing', () => {
    const t = flatWorld();
    const s = spawnCraft(t);
    stepCraft(s, { ...IDLE, thrust: true }, t, DT);
    expect(s.thrusting).toBe(true);
    s.fuel = 0;
    s.status = 'flying';
    stepCraft(s, { ...IDLE, thrust: true }, t, DT);
    expect(s.thrusting).toBe(false);
  });

  it('respawns on the pad after a crash', () => {
    const t = flatWorld();
    const s = airborne(t, 3.5, 1.05, 3.5);
    s.vel.y = -5;
    run(s, IDLE, t, 0.1);
    run(s, IDLE, t, CRAFT.RESPAWN_DELAY + 0.1);
    expect(s.status).toBe('landed');
    expect(s.pos).toEqual(t.padCentre());
  });

  it('refuels only on the pad', () => {
    const t = flatWorld();
    const onPad = spawnCraft(t);
    onPad.fuel = 10;
    run(onPad, IDLE, t, 1);
    expect(onPad.fuel).toBeGreaterThan(30);

    const offPad = airborne(t, 4.5, 1, 4.5);
    offPad.status = 'landed';
    offPad.fuel = 10;
    run(offPad, IDLE, t, 1);
    expect(offPad.fuel).toBe(10);
  });
});
