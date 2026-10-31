import { formatTime, type RaceState } from '../sim/race';
import type { Terrain } from '../sim/terrain';

/** How long a split stays up after a gate (s). */
const SPLIT_SHOW = 2;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

/**
 * The race readout at the top of the screen: the clock, the gate count, an arrow to the next
 * gate (or the pad), what to do next, and each gate's time against the best run's.
 */
export class RaceHud {
  private readonly root: HTMLDivElement;
  private readonly clock: HTMLDivElement;
  private readonly gates: HTMLSpanElement;
  private readonly arrow: HTMLSpanElement;
  private readonly distance: HTMLSpanElement;
  private readonly hint: HTMLDivElement;
  private readonly split: HTMLDivElement;
  private readonly best: HTMLDivElement;
  private splitFor = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'race-hud hidden', parent);
    this.clock = el('div', 'race-clock', this.root);
    const row = el('div', 'race-row', this.root);
    this.gates = el('span', 'race-gates', row);
    this.arrow = el('span', 'pad-arrow', row);
    this.arrow.innerHTML =
      '<svg viewBox="-10 -10 20 20" width="20" height="20"><path d="M0 -9 L7 7 L0 3 L-7 7 Z" fill="#ff0" stroke="#000" stroke-width="1.5"/></svg>';
    this.distance = el('span', 'race-distance', row);
    this.split = el('div', 'race-split', this.root);
    this.hint = el('div', 'race-hint', this.root);
    this.best = el('div', 'race-best', this.root);
  }

  /**
   * A gate was passed at `time`; `against` is the best run's clock at that gate (or null),
   * shown as the difference for a moment.
   */
  gate(time: number, against: number | null): void {
    this.splitFor = SPLIT_SHOW;
    if (against === null) {
      this.split.textContent = formatTime(time);
      this.split.className = 'race-split';
    } else {
      const d = time - against;
      this.split.textContent = `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
      this.split.className = `race-split ${d <= 0 ? 'ahead' : 'behind'}`;
    }
  }

  /** Shows `race` (null hides the readout), with the best time on this map and who set it. */
  update(race: RaceState | null, terrain: Terrain, craft: { x: number; z: number }, best: { time: number; who: string } | null, dt: number): void {
    this.root.classList.toggle('hidden', race === null);
    if (!race) return;
    this.clock.textContent = formatTime(race.time);
    const total = race.course.gates.length;
    this.gates.textContent = `GATE ${Math.min(race.next + 1, total)}/${total}`;
    const target = race.course.gates[race.next]?.pos ?? terrain.padCentre();
    const dx = terrain.delta(craft.x, target.x);
    const dz = terrain.delta(craft.z, target.z);
    this.arrow.style.transform = `rotate(${Math.atan2(dx, -dz)}rad)`;
    this.distance.textContent = `${Math.round(Math.hypot(dx, dz))}`;
    this.hint.textContent = !race.started
      ? 'LIFT OFF TO START THE CLOCK'
      : race.finished
        ? 'FINISHED'
        : race.next >= total
          ? 'LAND ON THE PAD!'
          : '';
    this.best.textContent = best ? `BEST ${formatTime(best.time)} · ${best.who}` : '';
    this.splitFor = Math.max(0, this.splitFor - dt);
    this.split.style.visibility = this.splitFor > 0 ? 'visible' : 'hidden';
  }
}
