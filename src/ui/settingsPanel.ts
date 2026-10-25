import { drawMinimap } from '../render/minimap';
import { DEFAULT_PLUME } from '../render/exhaustView';
import { DEFAULT_PHYSICS } from '../sim/craft';
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

const PLUME_SLIDERS: SliderSpec<Settings['plume']>[] = [
  { key: 'rate', label: 'Particles', min: 0, max: 1500, step: 10, unit: '/s' },
  { key: 'speed', label: 'Ejection speed', min: 0, max: 12, step: 0.1, unit: 'u/s' },
  { key: 'spread', label: 'Spread', min: 0, max: 3, step: 0.05 },
  { key: 'lifetime', label: 'Lifetime', min: 0.1, max: 2, step: 0.05, unit: 's' },
  { key: 'size', label: 'Particle size', min: 0.02, max: 0.3, step: 0.01 },
];

export interface SettingsPanelHandlers {
  onFly: () => void;
  onMapChange: (mapId: string) => void;
  /** Called after any physics/plume value changes. */
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
      drawMinimap(thumb, buildMap(preset));
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
    tuning.append(this.ratio, el('h2', undefined, 'Thruster plume'));
    for (const spec of PLUME_SLIDERS) tuning.append(this.slider(settings.plume, spec));
    const reset = el('button', 'reset', 'Reset to defaults');
    reset.addEventListener('click', () => {
      Object.assign(settings.physics, DEFAULT_PHYSICS);
      Object.assign(settings.plume, DEFAULT_PLUME);
      this.refresh();
      handlers.onChange();
    });
    tuning.append(reset);

    const columns = el('div', 'columns');
    columns.append(mapSection, tuning);
    panel.append(
      header,
      columns,
      el('p', 'help', 'Move mouse: tilt craft · Left button: thrust · Right button: fire · Esc: pause'),
    );
    root.append(panel);
    this.highlightMap();
    this.refresh();
  }

  /** Shows the panel. `started` switches the wording from start to resume. */
  show(terrain: Terrain, craftPos: { x: number; z: number }, started: boolean): void {
    this.status.textContent = started ? 'PAUSED' : 'Ready for launch';
    drawMinimap(this.minimap, terrain, craftPos);
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private highlightMap(): void {
    for (const [id, card] of this.mapCards) card.classList.toggle('selected', id === this.settings.mapId);
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
    const twr = this.settings.physics.thrust / this.settings.physics.gravity;
    this.ratio.textContent = `Thrust-to-weight ${twr.toFixed(2)}${twr <= 1 ? ' (cannot take off!)' : ''}`;
    this.ratio.classList.toggle('warn', twr <= 1);
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
