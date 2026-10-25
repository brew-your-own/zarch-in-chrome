import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBest, recordScore } from './gameOver';

describe('best score', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts at 0 and only records improvements', () => {
    expect(loadBest()).toBe(0);
    expect(recordScore(300)).toBe(true);
    expect(recordScore(200)).toBe(false);
    expect(recordScore(300)).toBe(false);
    expect(loadBest()).toBe(300);
  });

  it('ignores junk and survives missing storage', () => {
    store.set('zarch.best.v1', 'lots');
    expect(loadBest()).toBe(0);
    vi.stubGlobal('localStorage', undefined);
    expect(loadBest()).toBe(0);
    expect(() => recordScore(100)).not.toThrow();
  });
});
