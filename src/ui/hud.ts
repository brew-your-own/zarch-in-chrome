import { autopilotReady, type AutopilotState } from '../sim/autopilot';
import type { CraftState, Physics } from '../sim/craft';
import type { EnemySettings, EnemyState } from '../sim/enemies';
import type { Terrain } from '../sim/terrain';

/** Fuel share below which the bar turns red and warns. */
export const LOW_FUEL = 0.25;
/** The virus readout turns red past this share of the game-over threshold. */
const VIRUS_WARNING = 0.75;
/** How long the "WAVE n" banner stays up (s). */
const BANNER_TIME = 2.5;

/**
 * Direction and distance from `pos` to the launch pad centre across the wrapping world.
 * `angle` is a screen bearing: 0 = north (up, since the camera looks north), clockwise.
 */
export function padBearing(terrain: Terrain, pos: { x: number; z: number }): { angle: number; distance: number } {
  const pad = terrain.padCentre();
  const dx = terrain.delta(pos.x, pad.x);
  const dz = terrain.delta(pos.z, pad.z);
  return { angle: Math.atan2(dx, -dz), distance: Math.hypot(dx, dz) };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

/** The head-up display: fuel bar, flight readouts, score, wave, infection and a pad compass. */
export class Hud {
  private readonly fuelFill: HTMLDivElement;
  private readonly fuelText: HTMLSpanElement;
  private readonly flight: HTMLDivElement;
  private readonly game: HTMLDivElement;
  private readonly virus: HTMLDivElement;
  private readonly arrow: HTMLSpanElement;
  private readonly padText: HTMLSpanElement;
  private readonly auto: HTMLSpanElement;
  private readonly status: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private shownWave = 0;
  private bannerFor = 0;

  constructor(root: HTMLElement, bannerParent: HTMLElement) {
    const fuel = el('div', 'hud-row', root);
    el('span', 'hud-label', fuel).textContent = 'FUEL';
    const bar = el('div', 'fuel-bar', fuel);
    this.fuelFill = el('div', 'fuel-fill', bar);
    this.fuelText = el('span', 'hud-value', fuel);
    this.flight = el('div', 'hud-row', root);
    this.game = el('div', 'hud-row', root);
    this.virus = el('div', 'hud-row', root);
    const compass = el('div', 'hud-row', root);
    el('span', 'hud-label', compass).textContent = 'PAD';
    this.arrow = el('span', 'pad-arrow', compass);
    this.arrow.innerHTML =
      '<svg viewBox="-10 -10 20 20" width="20" height="20"><path d="M0 -9 L7 7 L0 3 L-7 7 Z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
    this.padText = el('span', 'hud-value', compass);
    const auto = el('div', 'hud-row', root);
    el('span', 'hud-label', auto).textContent = 'AUTO';
    this.auto = el('span', 'hud-auto', auto);
    this.status = el('div', 'hud-status', root);
    this.banner = el('div', 'wave-banner', bannerParent);
  }

  update(
    craft: CraftState,
    physics: Physics,
    enemies: EnemyState,
    rules: EnemySettings,
    terrain: Terrain,
    autopilot: AutopilotState,
    dt: number,
  ): void {
    const fuel = Math.max(0, Math.min(1, craft.fuel / physics.maxFuel));
    const low = fuel < LOW_FUEL;
    this.fuelFill.style.width = `${fuel * 100}%`;
    this.fuelFill.classList.toggle('low', low);
    this.fuelText.textContent = `${Math.round(fuel * 100)}%`;

    const ground = terrain.heightAt(craft.pos.x, craft.pos.z);
    const speed = craft.status === 'crashed' ? 0 : Math.hypot(craft.vel.x, craft.vel.y, craft.vel.z);
    this.flight.textContent = `ALT ${(craft.pos.y - ground).toFixed(1).padStart(5)}   SPEED ${speed.toFixed(1).padStart(4)}`;
    this.game.textContent = `SCORE ${enemies.score}   WAVE ${enemies.wave} (${enemies.seeders.length} left)`;
    const infected = terrain.infectedFraction();
    this.virus.textContent = `VIRUS ${(infected * 100).toFixed(1)}% / ${Math.round(rules.overrunAt * 100)}%`;
    this.virus.classList.toggle('alert', infected >= rules.overrunAt * VIRUS_WARNING);

    const { angle, distance } = padBearing(terrain, craft.pos);
    const onPad = terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
    this.arrow.style.transform = `rotate(${angle}rad)`;
    this.arrow.style.visibility = onPad ? 'hidden' : 'visible';
    this.padText.textContent = onPad ? 'here' : distance.toFixed(0);

    // Auto-refuel: once per wave. On the pad it isn't needed, so it reads as waiting rather than used.
    const used = autopilot.usedInWave === enemies.wave;
    this.auto.textContent = autopilot.active ? 'RETURNING TO PAD'
      : used ? 'USED THIS WAVE'
      : autopilotReady(autopilot, craft, terrain, enemies.wave) ? 'READY  [R]'
      : 'STANDBY';
    this.auto.className = `hud-auto${autopilot.active ? ' engaged' : used ? ' spent' : ''}`;

    const refuelling = craft.status === 'landed' && onPad && fuel < 1;
    this.status.textContent =
      craft.status === 'crashed' ? 'CRASHED'
      : refuelling ? 'REFUELLING'
      : low ? (fuel === 0 ? 'OUT OF FUEL' : 'LOW FUEL')
      : autopilot.active ? 'AUTOPILOT'
      : craft.status === 'landed' ? 'LANDED'
      : '';
    this.status.className = `hud-status${craft.status === 'crashed' || low ? ' warn' : ''}`;

    if (enemies.wave !== this.shownWave) {
      this.shownWave = enemies.wave;
      if (enemies.wave > 0) {
        this.banner.textContent = `WAVE ${enemies.wave}`;
        this.bannerFor = BANNER_TIME;
      }
    }
    this.bannerFor = Math.max(0, this.bannerFor - dt);
    this.banner.classList.toggle('visible', this.bannerFor > 0);
  }
}
