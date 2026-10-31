import { DEFAULT_SOUND, type SoundSettings } from './audio/sound';
import { DEFAULT_CONTROLS, type ControlSettings } from './input';
import { DEFAULT_CAMERA, type CameraSettings } from './render/cameraRig';
import { DEFAULT_SHIP, type ShipSettings } from './render/craftView';
import { DEFAULT_DISPLAY, type DisplaySettings } from './ui/hud';
import { DEFAULT_PLUME, type PlumeSettings } from './render/exhaustView';
import { DEFAULT_COLOURS, type ColourSettings } from './render/palette';
import { DEFAULT_AUTOPILOT, type AutopilotSettings } from './sim/autopilot';
import { DEFAULT_PHYSICS, type Physics } from './sim/craft';
import { DEFAULT_ENEMIES, type EnemySettings } from './sim/enemies';
import { DEFAULT_WEAPONS, type WeaponSettings } from './sim/weapons';
import { DEFAULT_MAP_ID, findMap } from './sim/maps';

/**
 * Everything the pause panel can change. The objects are mutated in place:
 * the sim, views and sound engine hold references to `physics`, `plume`, `colours`, `enemies`, `weapons`, `autopilot`, `camera`, `sound`, `controls`, `ship` and `display`.
 */
export interface Settings {
  physics: Physics;
  plume: PlumeSettings;
  colours: ColourSettings;
  enemies: EnemySettings;
  weapons: WeaponSettings;
  autopilot: AutopilotSettings;
  camera: CameraSettings;
  sound: SoundSettings;
  controls: ControlSettings;
  ship: ShipSettings;
  display: DisplaySettings;
  mapId: string;
}

const STORAGE_KEY = 'zarch.settings.v1';

export function defaultSettings(): Settings {
  return {
    physics: { ...DEFAULT_PHYSICS },
    plume: { ...DEFAULT_PLUME },
    colours: { ...DEFAULT_COLOURS },
    enemies: { ...DEFAULT_ENEMIES },
    weapons: { ...DEFAULT_WEAPONS },
    autopilot: { ...DEFAULT_AUTOPILOT },
    camera: { ...DEFAULT_CAMERA },
    sound: { ...DEFAULT_SOUND },
    controls: { ...DEFAULT_CONTROLS },
    ship: { ...DEFAULT_SHIP },
    display: { ...DEFAULT_DISPLAY },
    mapId: DEFAULT_MAP_ID,
  };
}

/**
 * Copies finite numbers and booleans from `source` onto `target`, only for keys `target`
 * already has and only when the saved value has the same type as the default.
 */
function mergeValues<T extends object>(target: T, source: unknown): void {
  if (typeof source !== 'object' || source === null) return;
  for (const key of Object.keys(target) as (keyof T)[]) {
    const value = (source as Record<string, unknown>)[key as string];
    if (typeof value !== typeof target[key]) continue;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) target[key] = value as T[keyof T];
  }
}

/** Loads saved settings over the defaults. Storage can be unavailable; then defaults are used. */
export function loadSettings(): Settings {
  const settings = defaultSettings();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return settings;
    const s = saved as Partial<Record<keyof Settings, unknown>>;
    mergeValues(settings.physics, s.physics);
    mergeValues(settings.plume, s.plume);
    mergeValues(settings.colours, s.colours);
    mergeValues(settings.enemies, s.enemies);
    mergeValues(settings.weapons, s.weapons);
    mergeValues(settings.autopilot, s.autopilot);
    mergeValues(settings.camera, s.camera);
    mergeValues(settings.sound, s.sound);
    mergeValues(settings.controls, s.controls);
    mergeValues(settings.ship, s.ship);
    mergeValues(settings.display, s.display);
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
