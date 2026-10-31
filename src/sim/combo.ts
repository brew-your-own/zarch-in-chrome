import type { CraftState } from './craft';
import type { Terrain } from './terrain';

/** Seconds a chain lasts after a kill, unless another kill renews it. */
export const CHAIN_WINDOW = 4;
/** The highest multiplier a chain reaches. */
export const MAX_MULTIPLIER = 8;
/** Flying low drains the chain's clock at this share of the normal rate, so it keeps a chain alive longer. */
export const LOW_CHAIN_DRAIN = 0.35;

/** Flying counts as low below this clearance over the ground (the craft's origin is its base). */
export const LOW_HEIGHT = 1.5;
/** ... and only at this horizontal speed or more, so hovering low doesn't count. */
export const LOW_SPEED = 3;
/** At this speed or more, low flying pays in full. */
export const FULL_SPEED = 7;
/** Points per second for skimming the ground at full speed, before the multiplier. */
export const LOW_RATE = 25;
/** A low-flying run ends after this long out of the band, so a bump doesn't break it. */
export const LOW_GRACE = 0.5;

export interface Combo {
  /** Kills in the current chain; the multiplier follows it. */
  chain: number;
  /** Seconds left before the chain breaks. */
  timer: number;
  /** The longest chain this game. */
  best: number;
  /** 0 when not flying low, rising to 1 skimming the ground at full speed. */
  low: number;
  /** Points earned by the current low-flying run, for the HUD. */
  run: number;
  /** Seconds since the craft last flew low. */
  sinceLow: number;
  /** Low-flying points not yet paid, since they are paid as whole points. */
  owed: number;
}

export function createCombo(): Combo {
  return { chain: 0, timer: 0, best: 0, low: 0, run: 0, sinceLow: Infinity, owed: 0 };
}

/** The score multiplier for the current chain: ×1 without one, up to `MAX_MULTIPLIER`. */
export function multiplier(combo: Combo): number {
  return Math.max(1, Math.min(MAX_MULTIPLIER, combo.chain));
}

/**
 * Counts a scoring kill: it extends the chain (or starts one) and renews its clock. Returns the
 * points it is worth, `points` times the new multiplier.
 */
export function chainKill(combo: Combo, points: number): number {
  combo.chain++;
  combo.timer = CHAIN_WINDOW;
  combo.best = Math.max(combo.best, combo.chain);
  return points * multiplier(combo);
}

/** How low and fast the craft is flying, 0 (not low) to 1 (skimming at full speed). */
export function lowFlying(craft: CraftState, terrain: Terrain): number {
  if (craft.status !== 'flying') return 0;
  const clearance = craft.pos.y - terrain.heightAt(craft.pos.x, craft.pos.z);
  const speed = Math.hypot(craft.vel.x, craft.vel.z);
  if (clearance > LOW_HEIGHT || speed < LOW_SPEED) return 0;
  const closeness = 1 - Math.max(0, clearance) / LOW_HEIGHT;
  const pace = Math.min(1, (speed - LOW_SPEED) / (FULL_SPEED - LOW_SPEED));
  // Half the pay for being in the band at all, the rest for how close and how fast.
  return 0.5 + 0.5 * closeness * (0.5 + 0.5 * pace);
}

/**
 * Advances the chain's clock and pays for low flying, times the multiplier. A crash breaks the
 * chain. Returns the whole points earned this step.
 */
export function stepCombo(combo: Combo, craft: CraftState, terrain: Terrain, dt: number): number {
  if (craft.status === 'crashed') {
    combo.chain = 0;
    combo.timer = 0;
    combo.low = 0;
    combo.run = 0;
    combo.owed = 0;
    combo.sinceLow = Infinity;
    return 0;
  }
  combo.low = lowFlying(craft, terrain);
  if (combo.low > 0) combo.sinceLow = 0;
  else combo.sinceLow += dt;
  if (combo.sinceLow > LOW_GRACE) combo.run = 0;

  if (combo.chain > 0) {
    combo.timer -= dt * (combo.low > 0 ? LOW_CHAIN_DRAIN : 1);
    if (combo.timer <= 0) {
      combo.chain = 0;
      combo.timer = 0;
    }
  }

  combo.owed += combo.low * LOW_RATE * multiplier(combo) * dt;
  const paid = Math.floor(combo.owed);
  combo.owed -= paid;
  combo.run += paid;
  return paid;
}
