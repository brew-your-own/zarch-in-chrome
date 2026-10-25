import { DEFAULT_PLUME, type PlumeSettings } from './render/exhaustView';
import { DEFAULT_PHYSICS, type Physics } from './sim/craft';
import { DEFAULT_MAP_ID, findMap } from './sim/maps';

/**
 * Everything the pause panel can change. The objects are mutated in place:
 * the sim and views hold references to `physics` and `plume`.
 */
export interface Settings {
  physics: Physics;
  plume: PlumeSettings;
  mapId: string;
}

const STORAGE_KEY = 'zarch.settings.v1';

export function defaultSettings(): Settings {
  return { physics: { ...DEFAULT_PHYSICS }, plume: { ...DEFAULT_PLUME }, mapId: DEFAULT_MAP_ID };
}

/** Copies finite numbers from `source` onto `target`, only for keys `target` already has. */
function mergeNumbers<T extends object>(target: T, source: unknown): void {
  if (typeof source !== 'object' || source === null) return;
  for (const key of Object.keys(target) as (keyof T)[]) {
    const value = (source as Record<string, unknown>)[key as string];
    if (typeof value === 'number' && Number.isFinite(value)) target[key] = value as T[keyof T];
  }
}

/** Loads saved settings over the defaults. Storage can be unavailable; then defaults are used. */
export function loadSettings(): Settings {
  const settings = defaultSettings();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return settings;
    const s = saved as Partial<Record<keyof Settings, unknown>>;
    mergeNumbers(settings.physics, s.physics);
    mergeNumbers(settings.plume, s.plume);
    if (typeof s.mapId === 'string') settings.mapId = findMap(s.mapId).id;
  } catch {
    // Corrupt or inaccessible storage: keep defaults.
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, blocked): settings just won't persist.
  }
}
