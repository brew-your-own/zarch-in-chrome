import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLUME } from './render/exhaustView';
import { defaultSettings, loadSettings, saveSettings } from './settings';
import { DEFAULT_PHYSICS } from './sim/craft';
import { DEFAULT_MAP_ID } from './sim/maps';

describe('settings', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('round-trips through storage', () => {
    const s = defaultSettings();
    s.physics.gravity = 1.2;
    s.plume.rate = 900;
    s.mapId = 'highlands';
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  it('ignores invalid values, unknown keys and unknown maps', () => {
    store.set(
      'zarch.settings.v1',
      JSON.stringify({ physics: { gravity: 'heavy', thrust: 9, bogus: 1 }, plume: null, mapId: 'atlantis' }),
    );
    const s = loadSettings();
    expect(s.physics).toEqual({ ...DEFAULT_PHYSICS, thrust: 9 });
    expect(s.plume).toEqual(DEFAULT_PLUME);
    expect(s.mapId).toBe(DEFAULT_MAP_ID);
  });

  it('survives corrupt or unavailable storage', () => {
    store.set('zarch.settings.v1', '{not json');
    expect(loadSettings()).toEqual(defaultSettings());
    vi.stubGlobal('localStorage', undefined);
    expect(loadSettings()).toEqual(defaultSettings());
    expect(() => saveSettings(defaultSettings())).not.toThrow();
  });
});
