import { describe, expect, it } from 'vitest';
import { attenuation, EXPLOSION_SIZE, explosionShape, SoundEngine, DEFAULT_SOUND } from './sound';

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

  it('does nothing until resumed (no AudioContext in tests)', () => {
    const engine = new SoundEngine({ ...DEFAULT_SOUND });
    expect(() => {
      engine.resume();
      engine.thruster(true);
      engine.cannon();
      engine.explosion('craft', 3);
      engine.update();
    }).not.toThrow();
  });
});
