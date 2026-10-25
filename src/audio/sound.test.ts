import { describe, expect, it } from 'vitest';
import { attenuation, EXPLOSION_SIZE, explosionShape, FULL_ALERT_DISTANCE, proximityLevel, SoundEngine, DEFAULT_SOUND } from './sound';

describe('sound helpers', () => {
  it('fades with distance: full at 0, half at 8 tiles, never silent', () => {
    expect(attenuation(0)).toBe(1);
    expect(attenuation(8)).toBeCloseTo(0.5);
    expect(attenuation(32)).toBeGreaterThan(0);
    expect(attenuation(-3)).toBe(1);
  });

  it('makes bigger explosions louder, longer and deeper', () => {
    const craft = explosionShape(EXPLOSION_SIZE.craft);
    const seeder = explosionShape(EXPLOSION_SIZE.seeder);
    const tree = explosionShape(EXPLOSION_SIZE.tree);
    expect(craft.peak).toBeGreaterThan(seeder.peak);
    expect(seeder.peak).toBeGreaterThan(tree.peak);
    expect(craft.duration).toBeGreaterThan(tree.duration);
    expect(craft.thump).toBe(true);
    expect(tree.thump).toBe(false);
  });

  it('raises the proximity alarm from quiet at the alert distance to full inside the inner circle', () => {
    expect(proximityLevel(Infinity, 10)).toBe(0);
    expect(proximityLevel(10, 10)).toBe(0);
    const edge = proximityLevel(9.9, 10);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.25);
    expect(proximityLevel(6, 10)).toBeGreaterThan(edge);
    expect(proximityLevel(FULL_ALERT_DISTANCE, 10)).toBe(1);
    expect(proximityLevel(1, 10)).toBe(1);
    expect(proximityLevel(1, 0)).toBe(0); // switched off
    expect(proximityLevel(1, 2)).toBe(1); // alert distance inside the inner circle
  });

  it('does nothing until resumed (no AudioContext in tests)', () => {
    const engine = new SoundEngine({ ...DEFAULT_SOUND });
    expect(() => {
      engine.resume();
      engine.thruster(true);
      engine.cannon();
      engine.explosion('craft', 3);
      engine.proximity(0.5);
      engine.splash(0.5, 2);
      engine.bomb();
      engine.missile();
      engine.enemyShot(3);
      engine.music(0.5, false, 1 / 60);
      engine.update();
    }).not.toThrow();
  });
});
