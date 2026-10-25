import { describe, expect, it } from 'vitest';
import { createCannon, stepCannon } from './cannon';
import { DEFAULT_PHYSICS as P, noseDirection, spawnCraft, stepCraft, thrustDirection, type CraftState } from './craft';
import { Terrain } from './terrain';
import { TREE_PINE } from './trees';

const DT = 1 / 60;

// 16x16 flat land at height 1, pad in the corner, sea in rows 12+.
function world(): Terrain {
  const rows = Array.from({ length: 16 }, (_, z) => Array.from({ length: 16 }, () => (z >= 12 ? 0 : 1)));
  return Terrain.fromRows(rows, { i: 0, j: 0, w: 2, h: 2 });
}

function hovering(t: Terrain, x: number, y: number, z: number): CraftState {
  const s = spawnCraft(t);
  s.pos = { x, y, z };
  s.status = 'flying';
  return s;
}

describe('noseDirection', () => {
  it('points along the heading, level when upright', () => {
    const s = spawnCraft(world());
    expect(noseDirection(s).x).toBeCloseTo(0);
    expect(noseDirection(s).y).toBeCloseTo(0);
    expect(noseDirection(s).z).toBeCloseTo(-1);
    s.heading = Math.PI / 2; // facing +x
    expect(noseDirection(s).x).toBeCloseTo(1);
  });

  it('dips when leaning forward and stays perpendicular to the thrust axis', () => {
    const s = spawnCraft(world());
    s.tilt = { x: 0.6, z: 0 };
    s.heading = Math.PI / 2;
    const nose = noseDirection(s);
    const up = thrustDirection(s);
    expect(nose.y).toBeLessThan(0);
    expect(nose.x * up.x + nose.y * up.y + nose.z * up.z).toBeCloseTo(0);
    expect(Math.hypot(nose.x, nose.y, nose.z)).toBeCloseTo(1);
  });
});

describe('cannon', () => {
  it('fires from the nose at the configured rate', () => {
    const t = world();
    const craft = hovering(t, 5.5, 6, 5.5);
    const cannon = createCannon();
    let fired = 0;
    for (let i = 0; i < 60; i++) {
      const before = cannon.bullets.length;
      stepCannon(cannon, craft, true, t, DT, P);
      if (cannon.bullets.length > before) fired++;
    }
    expect(fired).toBeGreaterThanOrEqual(P.fireRate - 1);
    expect(fired).toBeLessThanOrEqual(P.fireRate + 1);
    const first = cannon.bullets[0]!;
    expect(first.pos.z).toBeLessThan(5.5); // heading 0 faces north (-z)
    expect(first.vel.z).toBeCloseTo(-P.bulletSpeed);
  });

  it('does not fire when the button is up or the craft is wrecked', () => {
    const t = world();
    const craft = hovering(t, 5.5, 6, 5.5);
    const cannon = createCannon();
    stepCannon(cannon, craft, false, t, DT, P);
    craft.status = 'crashed';
    stepCannon(cannon, craft, true, t, DT, P);
    expect(cannon.bullets).toHaveLength(0);
  });

  it('adds the craft velocity to the bullets', () => {
    const t = world();
    const craft = hovering(t, 5.5, 6, 5.5);
    craft.vel = { x: 3, y: 0, z: 0 };
    const cannon = createCannon();
    stepCannon(cannon, craft, true, t, DT, P);
    expect(cannon.bullets[0]!.vel.x).toBeCloseTo(3);
  });

  it('expires bullets that hit nothing', () => {
    const t = world();
    const craft = hovering(t, 5.5, 6, 5.5);
    const cannon = createCannon();
    stepCannon(cannon, craft, true, t, DT, P);
    for (let time = 0; time < P.bulletLife + 0.1; time += DT) stepCannon(cannon, craft, false, t, DT, P);
    expect(cannon.bullets).toHaveLength(0);
  });

  it('reports ground and sea impacts when shooting downward', () => {
    const t = world();
    const cannon = createCannon();
    const steep = { ...P, maxTilt: Math.PI / 2 - 0.05 }; // nose almost straight down

    const overLand = hovering(t, 5.5, 3, 5.5);
    overLand.tilt = { x: 0, z: -1 };
    stepCannon(cannon, overLand, true, t, DT, steep);
    const land = Array.from({ length: 30 }, () => stepCannon(cannon, overLand, false, t, DT, steep)).flat();
    expect(land.map((i) => i.kind)).toEqual(['ground']);
    expect(land[0]!.pos.y).toBeCloseTo(1);

    const overSea = hovering(t, 5.5, 3, 14.5);
    overSea.tilt = { x: 0, z: -1 };
    cannon.cooldown = 0;
    stepCannon(cannon, overSea, true, t, DT, steep);
    const sea = Array.from({ length: 30 }, () => stepCannon(cannon, overSea, false, t, DT, steep)).flat();
    expect(sea.map((i) => i.kind)).toEqual(['sea']);
  });

  it('stops at trees', () => {
    const t = world();
    t.setTree(5, 2, TREE_PINE);
    const craft = hovering(t, 5.5, 1.4, 6.5); // low, facing north toward the pine
    const cannon = createCannon();
    stepCannon(cannon, craft, true, t, DT, P);
    const impacts = Array.from({ length: 30 }, () => stepCannon(cannon, craft, false, t, DT, P)).flat();
    expect(impacts.map((i) => i.kind)).toEqual(['tree']);
    expect(impacts[0]!.pos.z).toBeGreaterThan(2.5);
  });
});

describe('crash momentum', () => {
  it('keeps the impact velocity for the explosion', () => {
    const t = world();
    const craft = hovering(t, 5.5, 1.05, 5.5);
    craft.vel = { x: 2, y: -5, z: 0 };
    stepCraft(craft, { aimX: 0, aimY: 0, thrust: false }, t, DT);
    expect(craft.status).toBe('crashed');
    expect(craft.vel.x).toBeCloseTo(2, 1);
    expect(craft.vel.y).toBeLessThan(-4);
  });
});
