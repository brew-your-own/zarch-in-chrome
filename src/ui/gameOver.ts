const BEST_KEY = 'zarch.best.v1';

/** Best score in this browser; 0 when storage is empty or unavailable. */
export function loadBest(): number {
  try {
    const best = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(best) && best > 0 ? best : 0;
  } catch {
    return 0;
  }
}

/** Records `score` if it beats the stored best; returns whether it did. */
export function recordScore(score: number): boolean {
  if (score <= loadBest()) return false;
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Storage unavailable: the best score just won't persist.
  }
  return true;
}

export interface GameOverStats {
  /** What ended the game: the virus took over, the villages fell, or the last craft was lost. */
  reason: 'virus' | 'buildings' | 'lives';
  score: number;
  wave: number;
  infected: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The end screen, shown when the virus takes over, the villages fall or the last life is lost. */
export class GameOverScreen {
  private readonly stats = el('div', 'gameover-stats');
  private readonly best = el('p', 'gameover-best');
  private readonly reason = el('p', 'gameover-reason');

  constructor(
    private readonly root: HTMLElement,
    handlers: { onPlayAgain: () => void; onTitle: () => void },
  ) {
    const panel = el('div', 'panel gameover');
    const again = el('button', 'fly', 'PLAY AGAIN ▸');
    again.addEventListener('click', handlers.onPlayAgain);
    const title = el('button', 'reset', 'Title screen');
    title.addEventListener('click', handlers.onTitle);
    const buttons = el('div', 'gameover-buttons');
    buttons.append(again, title);
    panel.append(el('h1', undefined, 'GAME OVER'), this.reason, this.stats, this.best, buttons);
    root.append(panel);
    this.hide();
  }

  show({ reason, score, wave, infected }: GameOverStats, newBest: boolean): void {
    this.reason.textContent =
      reason === 'virus' ? 'The virus has taken over the land.'
      : reason === 'buildings' ? 'The virus has taken every village.'
      : 'Your last craft has been destroyed.';
    this.stats.replaceChildren(
      ...[
        ['SCORE', String(score)],
        ['WAVE', String(wave)],
        ['INFECTED', `${(infected * 100).toFixed(0)}%`],
      ].map(([label, value]) => {
        const row = el('div', 'gameover-row');
        row.append(el('span', 'hud-label', label), el('span', 'gameover-value', value));
        return row;
      }),
    );
    this.best.textContent = newBest ? 'NEW BEST SCORE!' : `Best: ${loadBest()}`;
    this.best.classList.toggle('new', newBest);
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
