import { formatTime } from '../sim/race';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface RaceResultStats {
  time: number;
  /** The best before this run, and who set it (you, or the computer's par). */
  previous: { time: number; who: string } | null;
  /** Whether this run is the new best on the map. */
  record: boolean;
  crashes: number;
  mapName: string;
}

/** The screen after landing back on the pad: the time, against the best, and what next. */
export class RaceResultScreen {
  private readonly time = el('p', 'race-result-time');
  private readonly verdict = el('p', 'gameover-best');
  private readonly stats = el('div', 'gameover-stats');
  private readonly heading = el('h1', undefined, 'RACE');

  constructor(
    private readonly root: HTMLElement,
    handlers: { onAgain: () => void; onTitle: () => void },
  ) {
    const panel = el('div', 'panel gameover race-result');
    const again = el('button', 'fly', 'RACE AGAIN ▸');
    again.addEventListener('click', handlers.onAgain);
    const title = el('button', 'reset', 'Title screen');
    title.addEventListener('click', handlers.onTitle);
    const buttons = el('div', 'gameover-buttons');
    buttons.append(again, title);
    panel.append(this.heading, this.time, this.verdict, this.stats, buttons);
    root.append(panel);
  }

  show({ time, previous, record, crashes, mapName }: RaceResultStats): void {
    this.heading.textContent = mapName.toUpperCase();
    this.time.textContent = formatTime(time);
    this.verdict.classList.toggle('new', record);
    if (!previous) this.verdict.textContent = 'FIRST RUN: THE TIME TO BEAT';
    else if (record) this.verdict.textContent = `NEW RECORD! ${(previous.time - time).toFixed(2)} s faster than ${previous.who === 'PAR' ? 'par' : 'your best'}`;
    else this.verdict.textContent = `${(time - previous.time).toFixed(2)} s behind ${previous.who === 'PAR' ? 'par' : 'your best'} (${formatTime(previous.time)})`;
    const row = (label: string, value: string) => {
      const r = el('div', 'gameover-row');
      r.append(el('span', 'hud-label', label), el('span', 'gameover-value', value));
      return r;
    };
    this.stats.replaceChildren(row('CRASHES', String(crashes)));
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }
}
