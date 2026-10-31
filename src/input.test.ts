import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLS, easeAim, keyAimTarget, keyBindings, type SteerKeys } from './input';

const STEP = 1 / 60;
const STILL = { x: 0, z: 0 };
const keys = (k: Partial<SteerKeys>): SteerKeys => ({ forward: false, brake: false, turn: 0, ...k });

function hold(target: { aimX: number; aimY: number }, seconds: number, aim = { aimX: 0, aimY: 0 }) {
  for (let t = 0; t < seconds; t += STEP) easeAim(aim, target, STEP, DEFAULT_CONTROLS);
  return aim;
}

describe('keyboard flying', () => {
  it('leans forward along the nose', () => {
    const north = keyAimTarget(keys({ forward: true }), 0, STILL, DEFAULT_CONTROLS);
    expect(north.aimX).toBeCloseTo(0);
    expect(north.aimY).toBeCloseTo(DEFAULT_CONTROLS.keyTilt);
    const east = keyAimTarget(keys({ forward: true }), Math.PI / 2, STILL, DEFAULT_CONTROLS);
    expect(east.aimX).toBeCloseTo(DEFAULT_CONTROLS.keyTilt);
    expect(east.aimY).toBeCloseTo(0);
  });

  it('brakes by leaning against the drift, less as it slows, never past the key tilt', () => {
    // Drifting east and north (world -z): lean west and south.
    const slow = keyAimTarget(keys({ brake: true }), 0, { x: 0.4, z: -0.4 }, DEFAULT_CONTROLS);
    expect(slow.aimX).toBeLessThan(0);
    expect(slow.aimY).toBeLessThan(0);
    const fast = keyAimTarget(keys({ brake: true }), 0, { x: 8, z: -8 }, DEFAULT_CONTROLS);
    expect(Math.hypot(fast.aimX, fast.aimY)).toBeCloseTo(DEFAULT_CONTROLS.keyTilt);
    expect(Math.hypot(slow.aimX, slow.aimY)).toBeLessThan(Math.hypot(fast.aimX, fast.aimY));
    expect(keyAimTarget(keys({ brake: true }), 0, STILL, DEFAULT_CONTROLS)).toEqual({ aimX: -0, aimY: 0 });
  });

  it('levels out with nothing held, even while turning', () => {
    expect(keyAimTarget(keys({ turn: 1 }), 1, { x: 3, z: 0 }, DEFAULT_CONTROLS)).toEqual({ aimX: 0, aimY: 0 });
  });

  it('eases gradually towards the target and back to level', () => {
    const target = { aimX: 0, aimY: DEFAULT_CONTROLS.keyTilt };
    const early = hold(target, 0.05);
    expect(early.aimY).toBeGreaterThan(0);
    expect(early.aimY).toBeLessThan(DEFAULT_CONTROLS.keyTilt);
    expect(hold(target, 1).aimY).toBeCloseTo(DEFAULT_CONTROLS.keyTilt);
    const level = hold({ aimX: 0, aimY: 0 }, 1, hold(target, 1));
    expect(level.aimY).toBeCloseTo(0);
  });

  it('never overshoots its target', () => {
    const aim = { aimX: 0.59, aimY: 0 };
    easeAim(aim, { aimX: 0.6, aimY: 0 }, 1, DEFAULT_CONTROLS);
    expect(aim.aimX).toBeCloseTo(0.6);
  });
});

describe('control schemes', () => {
  it('moves thrust to Space and the smart bomb to Q with a trackpad, and turns off key steering', () => {
    const mouse = keyBindings(DEFAULT_CONTROLS);
    expect(mouse.bomb).toContain('Space');
    expect(mouse.steering).toBe(true);
    const trackpad = keyBindings({ ...DEFAULT_CONTROLS, trackpad: true });
    expect(trackpad.thrust).toContain('Space');
    expect(trackpad.bomb).not.toContain('Space');
    expect(trackpad.steering).toBe(false);
  });

  it('never binds one key to two things in a scheme', () => {
    for (const trackpad of [false, true]) {
      const b = keyBindings({ ...DEFAULT_CONTROLS, trackpad });
      const all = [...b.thrust, ...b.fire, ...b.missile, ...b.bomb, ...b.level, 'KeyR', 'Escape'];
      expect(new Set(all).size).toBe(all.length);
    }
  });
});
