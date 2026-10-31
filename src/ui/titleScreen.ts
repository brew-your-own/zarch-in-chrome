import type { ControlSettings } from '../input';
import { findMap, MAPS } from '../sim/maps';
import { controlLabels, MOUSE_NOTE, type ControlLabel } from './controls';
import { loadBest } from './gameOver';
import { githubLink } from './github';

export type ControlId = ControlLabel['id'];

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
  onHowTo: () => void;
  onMapChange: (mapId: string) => void;
  /** The player switched between the mouse and trackpad schemes (already set in the settings). */
  onSchemeChange: () => void;
  /** Starts Demo mode: a real game on the chosen map, flown by the computer. */
  onDemo: () => void;
}

/**
 * The title screen's DOM, laid over the attract mode: the mouse or trackpad switch and that
 * scheme's controls, lit as the demo pilot uses them, the Fly, Demo, How to play, Settings and
 * Guide buttons, the best score and the map to play.
 */
export class TitleScreen {
  private readonly chips = new Map<ControlId, { node: HTMLElement; glow: number }>();
  private readonly best = el('span', 'title-best');
  private readonly mapName = el('span', 'title-map-name');
  private readonly lost = el('p', 'title-lost', 'THE VIRUS HAS TAKEN THE LAND');
  private readonly keys = el('div', 'title-keys');
  private readonly schemeButtons: { button: HTMLButtonElement; trackpad: boolean }[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly mapId: () => string,
    private readonly controls: ControlSettings,
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
    goal.append('Shoot the seeders before their ', el('span', 'title-virus', 'virus'), ' takes the land, and save the villages it reaches.');

    // The scheme switch: the game is made for a mouse, and says so; a trackpad is the fallback.
    const scheme = el('div', 'title-scheme');
    scheme.append(el('span', 'title-mouse-note', MOUSE_NOTE));
    const choice = el('span', 'title-scheme-choice');
    for (const [label, trackpad] of [['Mouse', false], ['Trackpad', true]] as const) {
      const button = el('button', 'title-scheme-button', label);
      button.addEventListener('click', () => {
        if (this.controls.trackpad === trackpad) return;
        this.controls.trackpad = trackpad;
        handlers.onSchemeChange();
        this.refresh();
      });
      this.schemeButtons.push({ button, trackpad });
      choice.append(button);
    }
    scheme.append(choice);

    const fly = el('button', 'fly', 'FLY ▸');
    fly.addEventListener('click', handlers.onFly);
    const settings = el('button', 'reset', 'Settings');
    settings.addEventListener('click', handlers.onSettings);
    const guide = el('button', 'reset', 'Guide');
    guide.addEventListener('click', handlers.onGuide);
    const howTo = el('button', 'reset', 'How to play');
    howTo.addEventListener('click', handlers.onHowTo);
    const demo = el('button', 'reset', 'Demo');
    demo.title = 'Watch the computer play a real game on this map';
    demo.addEventListener('click', handlers.onDemo);
    const buttons = el('div', 'title-buttons');
    buttons.append(fly, demo, howTo, settings, guide);

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
    bottom.append(goal, scheme, this.keys, buttons, meta);
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

  /** Updates the controls, best score and map name, e.g. after a game or a change in the settings. */
  refresh(): void {
    this.chips.clear();
    this.keys.replaceChildren(
      ...controlLabels(this.controls).map(({ id, key, label }) => {
        const chip = el('span', 'title-key');
        chip.append(el('kbd', undefined, key), el('span', undefined, label));
        this.chips.set(id, { node: chip, glow: 0 });
        return chip;
      }),
    );
    for (const { button, trackpad } of this.schemeButtons) button.classList.toggle('selected', trackpad === this.controls.trackpad);
    const best = loadBest();
    this.best.textContent = best > 0 ? `BEST ${best}` : '';
    this.mapName.textContent = findMap(this.mapId()).name;
  }
}
