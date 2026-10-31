import type { ControlSettings } from '../input';
import type { EnemySettings } from '../sim/enemies';
import type { WeaponSettings } from '../sim/weapons';
import { MOUSE_NOTE } from './controls';

/** Set once the player has flown from the how-to-play screen, so it isn't shown before every game. */
const SEEN_KEY = 'zarch.howto.v1';

/** Whether the how-to-play screen has been seen in this browser (true if storage is unavailable). */
export function howToPlaySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage unavailable: it will just show again next time.
  }
}

/** A card's text: plain strings and key chips, some read from the live settings. */
type Part = string | { key: string };
type Rules = { enemies: EnemySettings; weapons: WeaponSettings; controls: ControlSettings };
interface Card {
  title: string;
  lines: (rules: Rules) => Part[][];
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

const CARDS: Card[] = [
  {
    title: 'Fly',
    lines: ({ controls }) =>
      controls.trackpad
        ? [
            ['Swipe the trackpad to tilt the craft: it leans the way you swipe, further the further you go. The lean stays when you lift your finger. ', { key: 'C' }, ' levels it out.'],
            [{ key: 'SPACE' }, ' fires the thruster. It pushes along the craft\'s lean, so lean a little to move and keep thrusting to stay up: gravity never lets go.'],
            ['The pointer is captured while you fly. ', { key: 'ESC' }, ' pauses and lets it go.'],
          ]
        : [
            [{ key: 'MOUSE' }, ' tilts the craft: it leans the way you push, further the further you push.'],
            [{ key: 'LEFT' }, ' fires the thruster. It pushes along the craft\'s lean, so lean a little to move and keep thrusting to stay up: gravity never lets go.'],
            ['The mouse is captured while you fly. ', { key: 'ESC' }, ' pauses and lets it go.'],
          ],
  },
  {
    title: 'Land and refuel',
    lines: () => [
      ['Thrust burns fuel. Land on the grey launch pad to refuel: come down slowly, nearly level, onto flat ground.'],
      ['Land too fast, too tilted or on a slope, touch the sea, or fly into a tree or a building, and you crash.'],
      [{ key: 'R' }, ' flies you home and lands for you, once per wave.'],
    ],
  },
  {
    title: 'Stop the virus',
    lines: ({ enemies, controls }) => [
      ['Seeders drop spores that turn the land crimson, and the virus spreads from there.'],
      [{ key: controls.trackpad ? 'F' : 'RIGHT' }, ' fires the cannon where the nose points. The nose dips as you lean, so lean gently at a target.'],
      [`If the virus covers ${pct(enemies.overrunAt)} of the land, the game is over.`],
    ],
  },
  {
    title: 'Save the villages',
    lines: ({ enemies }) => [
      [`An infected building pulses crimson and falls after ${Math.round(enemies.buildingFallTime)} s. Its ruin keeps spreading the virus.`],
      ['Hover low over it for 2 s to save it and clean the land around it.'],
      [
        enemies.buildingBonus > 0 ? `Each wave pays ${Math.round(enemies.buildingBonus)} points for every building still standing. ` : '',
        enemies.buildingsLostAt <= 0 ? '' : enemies.buildingsLostAt < 1 ? `Lose ${pct(enemies.buildingsLostAt)} of them and the game is over.` : 'Lose them all and the game is over.',
      ],
    ],
  },
  {
    title: 'Special weapons',
    lines: ({ weapons, controls }) => [
      [{ key: 'E' }, controls.trackpad ? ' fires' : ' or the middle button fires', ' a homing missile at the nearest enemy. You get more each wave.'],
      [
        { key: controls.trackpad ? 'Q' : 'SPACE' },
        weapons.bombsPerWave >= 1
          ? ` sets off a smart bomb, which destroys everything around you. From wave ${Math.round(weapons.bombsFromWave)} you get ${Math.round(weapons.bombsPerWave)} a wave, and they don't carry over.`
          : ' sets off a smart bomb, when you have one.',
      ],
    ],
  },
  {
    title: 'Survive the waves',
    lines: ({ enemies }) => [
      [`You have ${Math.round(enemies.lives)} craft. Each wave brings more enemies, and harder ones: mutants, fighters, bombers and pests.`],
      ['The Guide on the title screen shows what each one does and how to beat it.'],
    ],
  },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The how-to-play screen in `#howto`: how to fly, land, fight the virus and save the
 * villages. It comes up before the first game in a browser, and from the title screen's
 * How to play button. Its numbers are read from the live settings each time it opens.
 */
export class HowToPlay {
  private readonly cards = el('div', 'howto-cards');
  private readonly note = el('p', 'howto-note');

  constructor(
    private readonly root: HTMLElement,
    private readonly rules: Rules,
    handlers: { onBack: () => void; onFly: () => void },
  ) {
    const panel = el('div', 'panel howto');
    const header = el('header');
    const back = el('button', 'reset', '◂ Back');
    back.addEventListener('click', handlers.onBack);
    const fly = el('button', 'fly', 'FLY ▸');
    fly.addEventListener('click', () => {
      markSeen();
      handlers.onFly();
    });
    header.append(el('h1', undefined, 'HOW TO PLAY'), el('p', 'status', 'Defend the land from the virus.'), back, fly);
    panel.append(header, this.cards, this.note);
    root.append(panel);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    this.cards.replaceChildren(
      ...CARDS.map((card) => {
        const node = el('article', 'howto-card');
        node.append(el('h3', undefined, card.title));
        for (const line of card.lines(this.rules)) {
          const p = el('p');
          for (const part of line) p.append(typeof part === 'string' ? part : el('kbd', undefined, part.key));
          node.append(p);
        }
        return node;
      }),
    );
    // The other ways to fly stay in a footnote: the game is made for a mouse.
    const parts: Part[] = this.rules.controls.trackpad
      ? [MOUSE_NOTE, ' Switch to the mouse on the title screen.']
      : [
          MOUSE_NOTE,
          ' No mouse? Pick Trackpad on the title screen. You can also fly by keyboard: ',
          { key: 'A' }, { key: 'D' }, ' turn the nose, ', { key: 'W' }, ' leans along it, ', { key: 'S' }, ' brakes, ',
          { key: 'J' }, ' or ', { key: 'SHIFT' }, ' thrusts, ', { key: 'K' }, ' fires. The arrows work too.',
        ];
    this.note.replaceChildren(...parts.map((part) => (typeof part === 'string' ? part : el('kbd', undefined, part.key))));
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
