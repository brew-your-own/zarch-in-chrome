import { DEFAULT_SOUND } from '../audio/sound';
import { DEFAULT_CAMERA } from '../render/cameraRig';
import { drawMinimap } from '../render/minimap';
import { COLOUR_PRESETS, DEFAULT_COLOURS, Palette } from '../render/palette';
import { DEFAULT_PLUME } from '../render/exhaustView';
import { DEFAULT_AUTOPILOT } from '../sim/autopilot';
import { DEFAULT_PHYSICS } from '../sim/craft';
import { DEFAULT_ENEMIES } from '../sim/enemies';
import { DEFAULT_WEAPONS } from '../sim/weapons';
import { buildMap, MAPS } from '../sim/maps';
import type { Terrain } from '../sim/terrain';
import type { Settings } from '../settings';

const DEG = 180 / Math.PI;

interface SliderSpec<T> {
  key: keyof T & string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Multiplier from stored value to displayed value (e.g. radians to degrees). */
  scale?: number;
}

const PHYSICS_SLIDERS: SliderSpec<Settings['physics']>[] = [
  { key: 'gravity', label: 'Gravity', min: 0.5, max: 8, step: 0.1, unit: 'u/s²' },
  { key: 'thrust', label: 'Thrust', min: 1, max: 20, step: 0.1, unit: 'u/s²' },
  { key: 'maxTilt', label: 'Max tilt', min: 10, max: 90, step: 1, unit: '°', scale: DEG },
  { key: 'attitudeRate', label: 'Attitude response', min: 1, max: 30, step: 0.5, unit: '/s' },
  { key: 'drag', label: 'Drag', min: 0, max: 1.5, step: 0.05 },
  { key: 'fuelBurn', label: 'Fuel burn', min: 0, max: 20, step: 0.5, unit: '/s' },
  { key: 'safeLandingVSpeed', label: 'Max landing speed', min: 0.5, max: 6, step: 0.1, unit: 'u/s' },
];

const CANNON_SLIDERS: SliderSpec<Settings['physics']>[] = [
  { key: 'fireRate', label: 'Fire rate', min: 1, max: 20, step: 0.5, unit: '/s' },
  { key: 'bulletSpeed', label: 'Bullet speed', min: 4, max: 30, step: 0.5, unit: 'u/s' },
  { key: 'bulletLife', label: 'Range', min: 0.3, max: 3, step: 0.1, unit: 's' },
];

const ENEMY_SLIDERS: SliderSpec<Settings['enemies']>[] = [
  { key: 'firstWave', label: 'Seeders (wave 1)', min: 0, max: 10, step: 1 },
  { key: 'seederSpeed', label: 'Seeder speed', min: 0.5, max: 8, step: 0.1, unit: 'u/s' },
  { key: 'sporeInterval', label: 'Spore interval', min: 0.3, max: 6, step: 0.1, unit: 's' },
  { key: 'virusSpread', label: 'Virus spread', min: 0, max: 20, step: 0.5, unit: '%/s', scale: 100 },
  { key: 'fighters', label: 'Fighters per wave', min: 0, max: 3, step: 0.5, unit: '× (wave − 1)' },
  { key: 'fighterSpeed', label: 'Fighter speed', min: 1, max: 10, step: 0.1, unit: 'u/s' },
  { key: 'fighterFireInterval', label: 'Fighter fire interval', min: 0.5, max: 6, step: 0.1, unit: 's' },
  { key: 'fighterAccuracy', label: 'Fighter accuracy', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
];

const GAME_SLIDERS: SliderSpec<Settings['enemies']>[] = [
  { key: 'lives', label: 'Lives', min: 1, max: 9, step: 1 },
  { key: 'difficultyRamp', label: 'Difficulty ramp', min: 0, max: 30, step: 1, unit: '% / wave', scale: 100 },
  { key: 'difficultyCap', label: 'Difficulty cap', min: 1, max: 4, step: 0.1, unit: '×' },
  { key: 'overrunAt', label: 'Game over at', min: 10, max: 100, step: 5, unit: '% land', scale: 100 },
];

const SOUND_SLIDERS: SliderSpec<Settings['sound']>[] = [
  { key: 'volume', label: 'Volume', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'music', label: 'Music', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'alertDistance', label: 'Proximity alarm', min: 0, max: 30, step: 1, unit: 'tiles' },
];

const PLUME_SLIDERS: SliderSpec<Settings['plume']>[] = [
  { key: 'rate', label: 'Particles', min: 0, max: 1500, step: 10, unit: '/s' },
  { key: 'speed', label: 'Ejection speed', min: 0, max: 12, step: 0.1, unit: 'u/s' },
  { key: 'spread', label: 'Spread', min: 0, max: 3, step: 0.05 },
  { key: 'lifetime', label: 'Lifetime', min: 0.1, max: 2, step: 0.05, unit: 's' },
  { key: 'size', label: 'Particle size', min: 0.02, max: 0.3, step: 0.01 },
];

const WEAPON_SLIDERS: SliderSpec<Settings['weapons']>[] = [
  { key: 'bombsPerWave', label: 'Smart bombs / wave', min: 0, max: 3, step: 1 },
  { key: 'bombsFromWave', label: 'Smart bombs from wave', min: 1, max: 10, step: 1 },
  { key: 'bombRadius', label: 'Smart bomb radius', min: 4, max: 30, step: 1, unit: 'tiles' },
  { key: 'missilesPerWave', label: 'Missiles / wave', min: 0, max: 3, step: 1 },
  { key: 'missileSpeed', label: 'Missile speed', min: 4, max: 20, step: 0.5, unit: 'u/s' },
  { key: 'missileTurnRate', label: 'Missile turn rate', min: 0.5, max: 8, step: 0.5, unit: 'rad/s' },
];

const CAMERA_SLIDERS: SliderSpec<Settings['camera']>[] = [
  { key: 'lean', label: 'Lean into turns', min: 0, max: 200, step: 10, unit: '%', scale: 100 },
  { key: 'shake', label: 'Explosion shake', min: 0, max: 200, step: 10, unit: '%', scale: 100 },
  { key: 'zoom', label: 'Zoom out with height', min: 0, max: 200, step: 10, unit: '%', scale: 100 },
];

const COLOUR_SLIDERS: SliderSpec<Settings['colours']>[] = [
  { key: 'autumn', label: 'Autumn leaves', min: 0, max: 100, step: 1, unit: '%', scale: 100 },
  { key: 'grassTone', label: 'Grass tone', min: 0, max: 100, step: 1, unit: '%', scale: 100 },
  { key: 'patches', label: 'Ground patches', min: 0, max: 100, step: 1, unit: '%', scale: 100 },
];

export interface SettingsPanelHandlers {
  onFly: () => void;
  onMapChange: (mapId: string) => void;
  /** Called after any physics/plume/colour value changes. */
  onChange: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function decimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * The pause screen: start/resume button, map picker with minimap, and
 * sliders that edit `settings.physics` / `settings.plume` in place.
 */
export class SettingsPanel {
  private readonly status = el('p', 'status');
  private readonly minimap = el('canvas', 'minimap');
  private readonly mapCards = new Map<string, HTMLButtonElement>();
  private readonly refreshers: (() => void)[] = [];
  private readonly ratio = el('p', 'note');
  private readonly thumbs: { canvas: HTMLCanvasElement; terrain: Terrain; palette: Palette }[] = [];
  private readonly presetButtons = new Map<keyof typeof COLOUR_PRESETS, HTMLButtonElement>();
  private shown?: {
    terrain: Terrain;
    palette: Palette;
    marker: { x: number; z: number };
    enemies: { x: number; z: number }[];
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    private readonly handlers: SettingsPanelHandlers,
  ) {
    const panel = el('div', 'panel');
    const header = el('header');
    const fly = el('button', 'fly', 'FLY ▸');
    fly.addEventListener('click', handlers.onFly);
    header.append(el('h1', undefined, 'ZARCH'), this.status, fly);

    const mapSection = el('section');
    this.minimap.width = this.minimap.height = 256;
    const cards = el('div', 'map-cards');
    for (const preset of MAPS) {
      const card = el('button', 'map-card');
      const thumb = el('canvas');
      thumb.width = thumb.height = 96;
      const terrain = buildMap(preset);
      this.thumbs.push({ canvas: thumb, terrain, palette: new Palette(terrain, settings.colours) });
      card.append(thumb, el('span', undefined, preset.name));
      card.addEventListener('click', () => {
        if (preset.id === this.settings.mapId) return;
        handlers.onMapChange(preset.id);
        this.highlightMap();
      });
      this.mapCards.set(preset.id, card);
      cards.append(card);
    }
    mapSection.append(el('h2', undefined, 'Map'), this.minimap, cards);

    const tuning = el('section');
    tuning.append(el('h2', undefined, 'Physics'));
    for (const spec of PHYSICS_SLIDERS) tuning.append(this.slider(settings.physics, spec));
    tuning.append(this.ratio, el('h2', undefined, 'Cannon'));
    for (const spec of CANNON_SLIDERS) tuning.append(this.slider(settings.physics, spec));
    tuning.append(el('h2', undefined, 'Game'));
    for (const spec of GAME_SLIDERS) tuning.append(this.slider(settings.enemies, spec));
    tuning.append(el('p', 'note', 'Lives apply from the next game. Each wave after the first is harder by the ramp, up to the cap.'));
    tuning.append(el('h2', undefined, 'Enemies'));
    for (const spec of ENEMY_SLIDERS) tuning.append(this.slider(settings.enemies, spec));
    tuning.append(el('h2', undefined, 'Weapons'));
    for (const spec of WEAPON_SLIDERS) tuning.append(this.slider(settings.weapons, spec));
    tuning.append(el('p', 'note', 'Smart bombs are handed out each wave and don\'t carry over; missiles build up (up to 9). New stock amounts apply from the next wave.'));
    tuning.append(el('h2', undefined, 'Assists'));
    tuning.append(this.toggle(settings.autopilot, 'enabled', 'Auto-refuel [R]', 'Once per wave, flies you back to the pad and lands.'));
    tuning.append(el('h2', undefined, 'Thruster plume'));
    for (const spec of PLUME_SLIDERS) tuning.append(this.slider(settings.plume, spec));
    tuning.append(el('h2', undefined, 'Camera'));
    for (const spec of CAMERA_SLIDERS) tuning.append(this.slider(settings.camera, spec));
    tuning.append(el('h2', undefined, 'Colours'));
    const presets = el('div', 'presets');
    for (const [id, preset] of Object.entries(COLOUR_PRESETS) as [keyof typeof COLOUR_PRESETS, (typeof COLOUR_PRESETS)[keyof typeof COLOUR_PRESETS]][]) {
      const button = el('button', 'preset', preset.name);
      button.addEventListener('click', () => {
        Object.assign(settings.colours, preset.colours);
        this.refresh();
        handlers.onChange();
      });
      this.presetButtons.set(id, button);
      presets.append(button);
    }
    tuning.append(presets);
    for (const spec of COLOUR_SLIDERS) tuning.append(this.slider(settings.colours, spec));
    tuning.append(el('h2', undefined, 'Sound'));
    for (const spec of SOUND_SLIDERS) tuning.append(this.slider(settings.sound, spec));
    tuning.append(el('p', 'note', 'The alarm sounds when a seeder comes within this distance, louder as it closes in. 0 turns it off.'));
    const reset = el('button', 'reset', 'Reset to defaults');
    reset.addEventListener('click', () => {
      Object.assign(settings.physics, DEFAULT_PHYSICS);
      Object.assign(settings.plume, DEFAULT_PLUME);
      Object.assign(settings.colours, DEFAULT_COLOURS);
      Object.assign(settings.enemies, DEFAULT_ENEMIES);
      Object.assign(settings.weapons, DEFAULT_WEAPONS);
      Object.assign(settings.autopilot, DEFAULT_AUTOPILOT);
      Object.assign(settings.camera, DEFAULT_CAMERA);
      Object.assign(settings.sound, DEFAULT_SOUND);
      this.refresh();
      handlers.onChange();
    });
    tuning.append(reset);

    const columns = el('div', 'columns');
    columns.append(mapSection, tuning);
    panel.append(
      header,
      columns,
      el('p', 'help', 'Move mouse: tilt craft · Left button: thrust · Right button: fire · Middle button / E: missile · Space: smart bomb · R: auto-refuel · Esc: pause'),
    );
    root.append(panel);
    this.highlightMap();
    this.refresh();
  }

  /** Shows the panel. `started` switches the wording from start to resume. */
  show(
    terrain: Terrain,
    palette: Palette,
    craftPos: { x: number; z: number },
    started: boolean,
    enemies: readonly { pos: { x: number; z: number } }[] = [],
  ): void {
    this.status.textContent = started ? 'PAUSED' : 'Ready for launch';
    this.shown = {
      terrain,
      palette,
      marker: { x: craftPos.x, z: craftPos.z },
      enemies: enemies.map((e) => ({ x: e.pos.x, z: e.pos.z })),
    };
    this.drawMaps();
    this.root.classList.remove('hidden');
  }

  /** Redraws the minimap and thumbnails, e.g. after a colour change. */
  private drawMaps(): void {
    if (this.shown) {
      const { terrain, palette, marker, enemies } = this.shown;
      drawMinimap(this.minimap, terrain, palette, marker, enemies);
    }
    for (const { canvas, terrain, palette } of this.thumbs) drawMinimap(canvas, terrain, palette);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private highlightMap(): void {
    for (const [id, card] of this.mapCards) card.classList.toggle('selected', id === this.settings.mapId);
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
    const c = this.settings.colours;
    for (const [id, button] of this.presetButtons) {
      const p = COLOUR_PRESETS[id].colours;
      button.classList.toggle('selected', p.autumn === c.autumn && p.grassTone === c.grassTone && p.patches === c.patches);
    }
    this.drawMaps();
    const twr = this.settings.physics.thrust / this.settings.physics.gravity;
    this.ratio.textContent = `Thrust-to-weight ${twr.toFixed(2)}${twr <= 1 ? ' (cannot take off!)' : ''}`;
    this.ratio.classList.toggle('warn', twr <= 1);
  }

  /** A checkbox bound to a boolean setting, with a short explanation beside it. */
  private toggle<T extends object>(target: T, key: keyof T & string, label: string, hint: string): HTMLElement {
    const row = el('label', 'toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      (target[key] as boolean) = input.checked;
      this.refresh();
      this.handlers.onChange();
    });
    this.refreshers.push(() => (input.checked = target[key] as boolean));
    row.append(input, el('span', 'name', label), el('span', 'hint', hint));
    return row;
  }

  private slider<T extends object>(target: T, spec: SliderSpec<T>): HTMLElement {
    const scale = spec.scale ?? 1;
    const row = el('label', 'slider');
    const value = el('span', 'value');
    const input = el('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const show = () => {
      const display = (target[spec.key] as number) * scale;
      input.value = String(display);
      value.textContent = `${display.toFixed(decimals(spec.step))}${spec.unit ? ' ' + spec.unit : ''}`;
    };
    input.addEventListener('input', () => {
      (target[spec.key] as number) = Number(input.value) / scale;
      this.refresh();
      this.handlers.onChange();
    });
    this.refreshers.push(show);
    row.append(el('span', 'name', spec.label), input, value);
    return row;
  }
}
