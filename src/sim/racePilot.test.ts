import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS } from './craft';
import { buildMap, MAPS } from './maps';
import { buildCourse } from './race';
import { flyCourse } from './racePilot';

describe('the computer racer', () => {
  for (const preset of MAPS) {
    it(`flies the whole ${preset.name} course and lands back on the pad`, () => {
      const terrain = buildMap(preset);
      const race = flyCourse(buildCourse(terrain, preset.seed), terrain, DEFAULT_PHYSICS);
      expect(race.finished).toBe(true);
      expect(race.crashes).toBe(0);
      expect(race.time).toBeLessThan(120);
    });
  }
});
