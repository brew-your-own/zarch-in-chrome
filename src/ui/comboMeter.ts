import { CHAIN_WINDOW, LOW_GRACE, multiplier, type Combo } from '../sim/combo';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

/**
 * The chain and low-flying readout at the top of the screen: the multiplier, big, with its clock
 * draining under it, and the points of the current low-flying run.
 */
export class ComboMeter {
  private readonly root: HTMLDivElement;
  private readonly chain: HTMLDivElement;
  private readonly times: HTMLSpanElement;
  private readonly clock: HTMLDivElement;
  private readonly low: HTMLDivElement;
  private shownMultiplier = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'combo hidden', parent);
    this.chain = el('div', 'combo-chain', this.root);
    this.times = el('span', 'combo-times', this.chain);
    el('span', 'combo-label', this.chain).textContent = 'CHAIN';
    const bar = el('div', 'combo-bar', this.chain);
    this.clock = el('div', 'combo-clock', bar);
    this.low = el('div', 'combo-low', this.root);
  }

  /** Shows `combo`, or hides the meter with null (title screen, game over). */
  update(combo: Combo | null): void {
    this.root.classList.toggle('hidden', combo === null);
    if (!combo) return;
    const m = multiplier(combo);
    const chaining = m >= 2;
    this.chain.classList.toggle('hidden', !chaining);
    if (chaining) {
      if (m !== this.shownMultiplier) {
        this.times.textContent = `×${m}`;
        // Restart the pop animation on every step up.
        this.chain.classList.remove('bump');
        void this.chain.offsetWidth;
        this.chain.classList.add('bump');
        this.chain.style.setProperty('--heat', String(Math.min(1, (m - 2) / 5)));
      }
      this.clock.style.width = `${Math.max(0, combo.timer / CHAIN_WINDOW) * 100}%`;
    }
    this.shownMultiplier = chaining ? m : 0;
    const flying = combo.run > 0 && combo.sinceLow < LOW_GRACE;
    this.low.classList.toggle('hidden', !flying);
    if (flying) {
      this.low.textContent = `LOW FLYING +${combo.run}`;
      this.low.classList.toggle('fading', combo.low === 0);
    }
  }
}
