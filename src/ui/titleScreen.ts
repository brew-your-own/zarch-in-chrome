import { findMap, MAPS } from '../sim/maps';
import { loadBest } from './gameOver';
import { githubLink } from './github';

/** The controls the title screen names, in the order shown. */
const CONTROLS = [
  { id: 'tilt', key: 'MOUSE', label: 'tilt' },
  { id: 'thrust', key: 'LEFT', label: 'thrust' },
  { id: 'fire', key: 'RIGHT', label: 'cannon' },
  { id: 'missile', key: 'E', label: 'missile' },
  { id: 'bomb', key: 'SPACE', label: 'smart bomb' },
  { id: 'refuel', key: 'R', label: 'auto-refuel' },
  { id: 'pause', key: 'ESC', label: 'pause' },
] as const;

export type ControlId = (typeof CONTROLS)[number]['id'];

/** Which controls the demo pilot is using this frame. */
export type ControlSignals = Partial<Record<ControlId, boolean>>;

/** Seconds a control stays lit after the demo last used it; one-off presses linger longer. */
const GLOW = 0.3;
const GLOW_PRESS = 1.4;
const PRESSES: readonly ControlId[] = ['missile', 'bomb'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface TitleHandlers {
  onFly: () => void;
  onSettings: () => void;
  onGuide: () => void;
  onMapChange: (mapId: string) => void;
}

/**
 * The title screen's DOM, laid over the attract mode: the controls, lit as the demo pilot
 * uses them, the Fly, Settings and Enemies buttons, the best score and the map to play.
 */
export class TitleScreen {
  private readonly chips = new Map<ControlId, { node: HTMLElement; glow: number }>();
  private readonly best = el('span', 'title-best');
  private readonly mapName = el('span', 'title-map-name');
  private readonly lost = el('p', 'title-lost', 'THE VIRUS HAS TAKEN THE LAND');

  constructor(
    private readonly root: HTMLElement,
    private readonly mapId: () => string,
    handlers: TitleHandlers,
  ) {
    const tag = el('p', 'title-tag');
    // A new tab, so following the link doesn't lose the page.
    const wiki = el('a', undefined, 'Zarch');
    wiki.href = 'https://en.wikipedia.org/wiki/Zarch';
    wiki.target = '_blank';
    wiki.rel = 'noopener';
    tag.append('After ', wiki, ' by David Braben, Acorn Archimedes, 1987');

    const goal = el('p', 'title-goal');
    goal.append('Shoot the seeders before their ', el('span', 'title-virus', 'virus'), ' takes the land.');

    const keys = el('div', 'title-keys');
    for (const { id, key, label } of CONTROLS) {
      const chip = el('span', 'title-key');
      chip.append(el('kbd', undefined, key), el('span', undefined, label));
      keys.append(chip);
      this.chips.set(id, { node: chip, glow: 0 });
    }

    const fly = el('button', 'fly', 'FLY ▸');
    fly.addEventListener('click', handlers.onFly);
    const settings = el('button', 'reset', 'Settings');
    settings.addEventListener('click', handlers.onSettings);
    const guide = el('button', 'reset', 'Guide');
    guide.addEventListener('click', handlers.onGuide);
    const buttons = el('div', 'title-buttons');
    buttons.append(fly, settings, guide);

    const step = (by: number) => {
      const k = MAPS.findIndex((m) => m.id === this.mapId());
      handlers.onMapChange(MAPS[(k + by + MAPS.length) % MAPS.length]!.id);
      this.refresh();
    };
    const prev = el('button', 'title-arrow', '◂');
    prev.setAttribute('aria-label', 'Previous map');
    prev.addEventListener('click', () => step(-1));
    const next = el('button', 'title-arrow', '▸');
    next.setAttribute('aria-label', 'Next map');
    next.addEventListener('click', () => step(1));
    const map = el('span', 'title-map');
    map.append(el('span', 'hud-label', 'MAP'), prev, this.mapName, next);
    const meta = el('div', 'title-meta');
    meta.append(this.best, map);

    const bottom = el('div', 'title-bottom');
    bottom.append(goal, keys, buttons, meta);
    root.append(tag, this.lost, bottom, githubLink('title-github'));
    this.refresh();
  }

  show(): void {
    this.refresh();
    this.showLost(false);
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Lights the controls the demo pilot is using; `dt` is the frame time. */
  update(signals: ControlSignals, dt: number): void {
    for (const [id, chip] of this.chips) {
      chip.glow = Math.max(0, chip.glow - dt);
      if (signals[id]) chip.glow = PRESSES.includes(id) ? GLOW_PRESS : Math.max(chip.glow, GLOW);
      chip.node.classList.toggle('lit', chip.glow > 0);
    }
  }

  /** The banner shown while the demo world, overrun, waits to start again. */
  showLost(on: boolean): void {
    this.lost.classList.toggle('visible', on);
  }

  /** Updates the best score and map name, e.g. after a game or a change in the settings. */
  refresh(): void {
    const best = loadBest();
    this.best.textContent = best > 0 ? `BEST ${best}` : '';
    this.mapName.textContent = findMap(this.mapId()).name;
  }
}
