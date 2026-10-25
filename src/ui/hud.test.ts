import { describe, expect, it } from 'vitest';
import { Terrain } from '../sim/terrain';
import { padBearing } from './hud';

// 16x16 flat world with a 2x2 pad whose centre is at (5, 5).
const t = Terrain.fromRows(Array.from({ length: 16 }, () => Array(16).fill(1)), { i: 4, j: 4, w: 2, h: 2 });

describe('padBearing', () => {
  it('points up (north) when the pad is north', () => {
    const b = padBearing(t, { x: 5, z: 9 });
    expect(b.angle).toBeCloseTo(0);
    expect(b.distance).toBeCloseTo(4);
  });

  it('turns clockwise: east is a quarter turn, south a half turn', () => {
    expect(padBearing(t, { x: 2, z: 5 }).angle).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(padBearing(t, { x: 5, z: 2 }).angle)).toBeCloseTo(Math.PI);
  });

  it('takes the short way round the wrapping world', () => {
    // From x = 14 the pad (x = 5) is 7 tiles east across the edge, not 9 west.
    const b = padBearing(t, { x: 14, z: 5 });
    expect(b.distance).toBeCloseTo(7);
    expect(b.angle).toBeCloseTo(Math.PI / 2);
  });
});
