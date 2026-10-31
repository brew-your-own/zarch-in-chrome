import * as THREE from 'three';
import { bomberGeometry } from '../render/bomberView';
import { fighterGeometry } from '../render/fighterView';
import { pestGeometry } from '../render/pestView';
import { mutantGeometry, seederGeometry } from '../render/seederView';
import { padModel, treesModel, villageModel } from '../render/guideModels';
import { Turntable, TURNTABLE_HEIGHT, TURNTABLE_WIDTH } from '../render/turntable';
import { BOMBER_HITS, BOMBER_POINTS } from '../sim/bombers';
import { RESCUE_TIME } from '../sim/buildings';
import { SEEDER_POINTS, type EnemySettings } from '../sim/enemies';
import { FIGHTER_POINTS } from '../sim/fighters';
import { MUTANT_POINTS } from '../sim/mutants';
import { PEST_POINTS } from '../sim/pests';

/** Text on a card: fixed, or read from the live settings each time the guide opens. */
type Text = string | ((e: EnemySettings) => string);

interface Card {
  name: string;
  /** Top right of the card: an enemy's points, or a short tag. */
  tag: Text;
  geometry: THREE.BufferGeometry;
  /** Model scale, and the radius of its shadow, so each fills its picture. */
  size: number;
  shadow: number;
  /** Its pose at time `t` (seconds). */
  pose: (t: number, out: THREE.Euler) => THREE.Euler;
  /** Where or when it turns up. */
  appears: Text;
  does: Text;
  /** The tip, in the accent colour. */
  beat: Text;
}

const text = (t: Text, e: EnemySettings) => (typeof t === 'string' ? t : t(e));
const spin = (rate: number) => (t: number, out: THREE.Euler) => out.set(0, t * rate, 0);

const wave = (n: number) => `wave ${Math.max(1, Math.round(n))}`;

const LAND: Card[] = [
  {
    name: 'Launch pad',
    tag: 'Base',
    geometry: padModel(),
    size: 0.6,
    shadow: 0,
    pose: spin(0.4),
    appears: 'At the centre of every map, where each life begins.',
    does: 'Land on it gently to refuel. The virus can never take it.',
    beat: 'A safe haven: fighters hold fire and mutants won\'t dive while you sit on it.',
  },
  {
    name: 'Trees',
    tag: 'Obstacle',
    geometry: treesModel(),
    size: 0.68,
    shadow: 0,
    pose: spin(0.35),
    appears: 'Forests on every map: pines in the hills, round trees and palms lower down, palms most of all by the sea. They turn crimson on infected land.',
    does: 'Solid: flying into one wrecks the craft, and they block shots, yours and the fighters\'.',
    beat: 'A bullet knocks a tree down, which clears a way out of a tight spot.',
  },
  {
    name: 'Villages',
    tag: (e) => (e.buildingBonus > 0 ? `+${Math.round(e.buildingBonus)} / wave` : 'Protect'),
    geometry: villageModel(),
    size: 0.68,
    shadow: 0,
    pose: spin(0.3),
    appears: (e) =>
      e.buildingsLostAt < 1
        ? `A few on each map. Lose ${Math.round(e.buildingsLostAt * 100)}% of the buildings and the game is over.`
        : 'A few on each map. Lose them all and the game is over.',
    does: (e) =>
      `When the virus reaches a building it pulses crimson, and after ${Math.round(e.buildingFallTime)} s it falls. Its ruin keeps spreading the virus.`,
    beat: `Hover low over an infected building for ${RESCUE_TIME} s to save it and clean the land around it.`,
  },
];

const ENEMIES: Card[] = [
  {
    name: 'Seeder',
    tag: `${SEEDER_POINTS} pts`,
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
    tag: `${MUTANT_POINTS} pts`,
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
    tag: `${FIGHTER_POINTS} pts`,
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
    tag: `${BOMBER_POINTS} pts`,
    geometry: bomberGeometry(),
    size: 1.45,
    shadow: 1,
    pose: (t, out) => out.set(0.35, t * 0.7, Math.sin(t * 0.9) * 0.2, 'YXZ'),
    appears: (e) => (e.bombers >= 1 ? `From ${wave(e.bombersFromWave)}: ${Math.round(e.bombers)} each wave.` : 'Off: no bombers.'),
    does: 'Flies dead straight across the map, laying the virus in long lines.',
    beat: `Takes ${BOMBER_HITS} cannon hits. A homing missile or a smart bomb brings it down at once.`,
  },
  {
    name: 'Pests',
    tag: `${PEST_POINTS} pts`,
    geometry: pestGeometry(),
    size: 2.8,
    shadow: 0.5,
    pose: (t, out) => out.set(Math.sin(t * 23) * 0.12, t * 1.1, Math.sin(t * 37) * 0.3, 'YXZ'),
    appears: (e) => (e.pests >= 1 ? `From ${wave(e.pestsFromWave)}: a swarm of ${Math.round(e.pests)} each wave.` : 'Off: no pests.'),
    does: (e) => `Loiter low until you come near, then swarm you. Each one that reaches you bites off ${Math.round(e.pestDrain)} fuel and dies. They don't spread the virus.`,
    beat: 'Outrun them, or turn and shoot: they fly straight at you. They keep off the pad, so land to refuel.',
  },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SECTIONS = [
  { title: 'The land', cards: LAND },
  { title: 'Enemies', cards: ENEMIES },
];
const CARDS = SECTIONS.flatMap((s) => s.cards);

/**
 * The field guide in `#guide`: a card for each thing in the world, the land first (the
 * pad, trees, villages) and then the enemies. Each has its model turning in a picture, a
 * tag (an enemy's points), where or when it turns up, what it does and a tip. Text that
 * depends on the settings is read from them each time the guide opens.
 */
export class FieldGuide {
  private readonly pictures: HTMLCanvasElement[] = [];
  /** Per card: its live text nodes and how to fill them. */
  private readonly live: { node: HTMLElement; text: Text }[] = [];
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
    header.append(el('h1', undefined, 'GUIDE'), el('p', 'status', 'Know the land, and what is out to take it.'), back);
    panel.append(header);

    const live = (node: HTMLElement, t: Text) => (this.live.push({ node, text: t }), node);
    for (const section of SECTIONS) {
      const cards = el('div', 'guide-cards');
      for (const card of section.cards) {
        const picture = el('canvas', 'guide-picture');
        this.pictures.push(picture);
        const title = el('h3');
        title.append(el('span', undefined, card.name), live(el('span', 'guide-tag'), card.tag));
        const body = el('div', 'guide-text');
        body.append(title, live(el('p', 'guide-appears'), card.appears), live(el('p'), card.does), live(el('p', 'guide-beat'), card.beat));
        const node = el('article', 'guide-card');
        node.append(picture, body);
        cards.append(node);
      }
      panel.append(el('h2', 'guide-section', section.title), cards);
    }
    panel.append(el('p', 'note', 'Every wave after the first is harder: enemies fly faster, drop spores and fire more often, aim better and mutate sooner. The Enemies section of the settings tunes all of this.'));
    root.append(panel);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    for (const { node, text: t } of this.live) node.textContent = text(t, this.enemies);
    this.root.classList.remove('hidden');
    if (!this.turntable) {
      this.turntable = new Turntable();
      for (const picture of this.pictures) {
        picture.width = TURNTABLE_WIDTH * this.turntable.pixelRatio;
        picture.height = TURNTABLE_HEIGHT * this.turntable.pixelRatio;
      }
    }
    cancelAnimationFrame(this.frame);
    const turn = (now: number) => {
      const t = now / 1000;
      CARDS.forEach((card, k) => this.turntable!.draw(card.geometry, this.pictures[k]!, card.size, card.pose(t + k, this.euler), card.shadow));
      this.frame = requestAnimationFrame(turn);
    };
    this.frame = requestAnimationFrame(turn);
  }

  hide(): void {
    cancelAnimationFrame(this.frame);
    this.root.classList.add('hidden');
  }
}
