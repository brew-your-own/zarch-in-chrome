import * as THREE from 'three';
import { bomberGeometry } from '../render/bomberView';
import { fighterGeometry } from '../render/fighterView';
import { mutantGeometry, seederGeometry } from '../render/seederView';
import { Turntable, TURNTABLE_HEIGHT, TURNTABLE_WIDTH } from '../render/turntable';
import { BOMBER_HITS, BOMBER_POINTS } from '../sim/bombers';
import { SEEDER_POINTS, type EnemySettings } from '../sim/enemies';
import { FIGHTER_POINTS } from '../sim/fighters';
import { MUTANT_POINTS } from '../sim/mutants';

interface EnemyCard {
  name: string;
  points: number;
  geometry: THREE.BufferGeometry;
  /** Model scale, and the radius of its shadow, so each fills its picture. */
  size: number;
  shadow: number;
  /** Its pose at time `t` (seconds). */
  pose: (t: number, out: THREE.Euler) => THREE.Euler;
  /** When it turns up, from the live settings. */
  appears: (e: EnemySettings) => string;
  does: string;
  beat: string;
}

const wave = (n: number) => `wave ${Math.max(1, Math.round(n))}`;

const CARDS: EnemyCard[] = [
  {
    name: 'Seeder',
    points: SEEDER_POINTS,
    geometry: seederGeometry(),
    size: 2.2,
    shadow: 0.8,
    pose: (t, out) => out.set(0, t * 2.5, 0),
    appears: (e) => (e.firstWave >= 1 ? `Every wave: ${Math.round(e.firstWave)} in wave 1, one more each wave.` : 'Off: enemies are switched off.'),
    does: 'Wanders the land dropping spores. Each spore infects the tile it lands on, and the virus spreads from there.',
    beat: 'Shoot it early, before it mutates. Flying into it wrecks you both.',
  },
  {
    name: 'Mutant',
    points: MUTANT_POINTS,
    geometry: mutantGeometry(),
    size: 2,
    shadow: 0.8,
    pose: (t, out) => out.set(Math.sin(t * 1.7) * 0.5, t * 4, Math.cos(t * 1.3) * 0.5),
    appears: (e) => (e.mutateAfter > 0 ? `A seeder left alive for ${Math.round(e.mutateAfter)} s mutates (sooner in later waves).` : 'Off: seeders never mutate.'),
    does: 'Circles above you, then dives straight at where you are heading. It still spreads the virus.',
    beat: 'Keep moving: a dive is a straight line and misses a craft on the move. It won\'t dive at you on the pad.',
  },
  {
    name: 'Fighter',
    points: FIGHTER_POINTS,
    geometry: fighterGeometry(),
    size: 2.1,
    shadow: 0.85,
    pose: (t, out) => out.set(0.25, t * 0.9, Math.sin(t * 1.2) * 0.35, 'YXZ'),
    appears: (e) => (e.fighters > 0 ? `From wave 2: ${e.fighters} × (wave − 1) per wave.` : 'Off: no fighters.'),
    does: 'Hunts you: it circles at a distance, just above you, and fires slow red shots.',
    beat: 'Keep moving and its shots miss; hovering still is asking to be hit. Fighters hold fire while you sit on the pad.',
  },
  {
    name: 'Bomber',
    points: BOMBER_POINTS,
    geometry: bomberGeometry(),
    size: 1.45,
    shadow: 1,
    pose: (t, out) => out.set(0.35, t * 0.7, Math.sin(t * 0.9) * 0.2, 'YXZ'),
    appears: (e) => (e.bombers >= 1 ? `From ${wave(e.bombersFromWave)}: ${Math.round(e.bombers)} each wave.` : 'Off: no bombers.'),
    does: 'Flies dead straight across the map, laying the virus in long lines.',
    beat: `Takes ${BOMBER_HITS} cannon hits. A homing missile or a smart bomb brings it down at once.`,
  },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The enemy guide in `#guide`: a card per enemy, with its model turning in a picture, its
 * points, when it turns up (read from the live settings each time the guide opens), what
 * it does and how to beat it.
 */
export class EnemyGuide {
  private readonly pictures: HTMLCanvasElement[] = [];
  private readonly appears: HTMLElement[] = [];
  private turntable?: Turntable;
  private frame = 0;
  private readonly euler = new THREE.Euler();

  constructor(
    private readonly root: HTMLElement,
    private readonly enemies: EnemySettings,
    onBack: () => void,
  ) {
    const panel = el('div', 'panel guide');
    const header = el('header');
    const back = el('button', 'fly', '◂ BACK');
    back.addEventListener('click', onBack);
    header.append(el('h1', undefined, 'ENEMIES'), el('p', 'status', 'Stop them before the virus takes the land.'), back);

    const cards = el('div', 'guide-cards');
    for (const card of CARDS) {
      const picture = el('canvas', 'guide-picture');
      this.pictures.push(picture);
      const appears = el('p', 'guide-appears');
      this.appears.push(appears);
      const title = el('h2');
      title.append(el('span', undefined, card.name), el('span', 'guide-points', `${card.points} pts`));
      const text = el('div', 'guide-text');
      text.append(title, appears, el('p', undefined, card.does), el('p', 'guide-beat', card.beat));
      const node = el('article', 'guide-card');
      node.append(picture, text);
      cards.append(node);
    }
    panel.append(header, cards, el('p', 'note', 'Every wave after the first is harder: enemies fly faster, drop spores and fire more often, aim better and mutate sooner. The Enemies section of the settings tunes all of this.'));
    root.append(panel);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    CARDS.forEach((card, k) => (this.appears[k]!.textContent = card.appears(this.enemies)));
    this.root.classList.remove('hidden');
    if (!this.turntable) {
      this.turntable = new Turntable();
      for (const picture of this.pictures) {
        picture.width = TURNTABLE_WIDTH * this.turntable.pixelRatio;
        picture.height = TURNTABLE_HEIGHT * this.turntable.pixelRatio;
      }
    }
    cancelAnimationFrame(this.frame);
    const spin = (now: number) => {
      const t = now / 1000;
      CARDS.forEach((card, k) => this.turntable!.draw(card.geometry, this.pictures[k]!, card.size, card.pose(t + k, this.euler), card.shadow));
      this.frame = requestAnimationFrame(spin);
    };
    this.frame = requestAnimationFrame(spin);
  }

  hide(): void {
    cancelAnimationFrame(this.frame);
    this.root.classList.add('hidden');
  }
}
