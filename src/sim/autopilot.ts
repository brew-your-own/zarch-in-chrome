import type { CraftInput, CraftState, Physics } from './craft';
import type { Terrain } from './terrain';
import { TREE_NONE, TREE_SHAPES, treeBase, treeScale } from './trees';

/**
 * Auto-refuel: flies the craft back to the launch pad and lands it, once per wave.
 * The player's thrust and aim are ignored while it is engaged; the cannon still fires.
 */
export interface AutopilotState {
  active: boolean;
  /** Wave in which it was last engaged, or -1; it can't be engaged twice in one wave. */
  usedInWave: number;
}

/** Top cruise speed towards the pad (units/s). */
const CRUISE_SPEED = 4;
/** Height kept above the highest ground or treetop on the way. */
const CLEARANCE = 1.2;
/** How far ahead along the route the clearance looks (units). */
const LOOKAHEAD = 5;
/** Below the cruise height by more than this, the craft climbs in place before moving on. */
const CLIMB_FIRST = 0.6;
/** Over the pad within this distance and slower than this, the craft starts its descent. */
const OVER_PAD = 0.35;
const SETTLED_SPEED = 0.4;
/** Fastest descent (units/s), used high up; it slows in proportion to height above the target. */
const DESCENT_FAST = 3;
/** Touchdown speed (units/s), well inside a safe landing. */
const DESCENT_SLOW = 0.5;
/** Steepest lean the autopilot uses. Kept well under the landing limit. */
const MAX_LEAN = (35 * Math.PI) / 180;

export function createAutopilot(): AutopilotState {
  return { active: false, usedInWave: -1 };
}

/** Whether the autopilot can be engaged now: not yet used this wave, and the craft needs it. */
export function autopilotReady(ap: AutopilotState, craft: CraftState, terrain: Terrain, wave: number): boolean {
  if (ap.active || ap.usedInWave === wave || craft.status === 'crashed') return false;
  return !(craft.status === 'landed' && terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad');
}

/**
 * Engages the autopilot if it is ready, or cancels it if it is flying (the wave's use is spent
 * either way). Returns whether it is now engaged.
 */
export function toggleAutopilot(ap: AutopilotState, craft: CraftState, terrain: Terrain, wave: number): boolean {
  if (ap.active) {
    ap.active = false;
  } else if (autopilotReady(ap, craft, terrain, wave)) {
    ap.active = true;
    ap.usedInWave = wave;
  }
  return ap.active;
}

/**
 * The input for this step while the autopilot is engaged, or null when it isn't. It
 * disengages once the craft has landed on the pad (where it refuels) or has crashed.
 */
export function stepAutopilot(ap: AutopilotState, craft: CraftState, terrain: Terrain, physics: Physics): CraftInput | null {
  if (!ap.active) return null;
  const onPad = terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'pad';
  if (craft.status === 'crashed' || (craft.status === 'landed' && onPad)) {
    ap.active = false;
    return null;
  }
  return autopilotInput(craft, terrain, physics);
}

/**
 * Flies to the pad: climbs clear of the ground and trees ahead, cruises towards the pad
 * slowing as it nears, then settles straight down onto it. Thrust is on/off, so vertical
 * speed is held by switching it every step; the lean sets the horizontal acceleration.
 */
export function autopilotInput(craft: CraftState, terrain: Terrain, physics: Physics): CraftInput {
  const pad = terrain.padCentre();
  const dx = terrain.delta(craft.pos.x, pad.x);
  const dz = terrain.delta(craft.pos.z, pad.z);
  const distance = Math.hypot(dx, dz);
  const hSpeed = Math.hypot(craft.vel.x, craft.vel.z);

  const cruise = Math.max(pad.y, highestObstacle(terrain, craft.pos.x, craft.pos.z, dx, dz, distance)) + CLEARANCE;
  const landing = distance < OVER_PAD && hSpeed < SETTLED_SPEED;

  let wantVy: number;
  if (landing) {
    wantVy = -Math.min(DESCENT_FAST, Math.max(DESCENT_SLOW, (craft.pos.y - pad.y) * 0.5));
  } else {
    wantVy = Math.max(-DESCENT_FAST, Math.min(3, (cruise - craft.pos.y) * 0.8));
  }

  // Desired horizontal velocity: towards the pad, easing off on approach; hold still while
  // climbing out of a low spot so the craft doesn't fly into the slope or trees ahead.
  const tooLow = craft.pos.y < cruise - CLIMB_FIRST;
  const speed = tooLow || distance < 1e-6 ? 0 : Math.min(CRUISE_SPEED, distance * 0.9);
  const wantVx = distance < 1e-6 ? 0 : (dx / distance) * speed;
  const wantVz = distance < 1e-6 ? 0 : (dz / distance) * speed;
  const ax = (wantVx - craft.vel.x) * 1.5;
  const az = (wantVz - craft.vel.z) * 1.5;
  const accel = Math.hypot(ax, az);

  // Hovering, the thrust's average vertical push equals gravity, so a lean of θ gives
  // g·tanθ sideways. Never lean so far that full thrust can't hold altitude.
  const holdable = physics.thrust > 1.3 * physics.gravity ? Math.acos((1.3 * physics.gravity) / physics.thrust) : 0;
  const lean = Math.min(Math.atan2(accel, physics.gravity), MAX_LEAN, holdable, physics.maxTilt);
  const aim = accel > 1e-9 && physics.maxTilt > 0 ? lean / physics.maxTilt : 0;
  const tiltX = accel > 1e-9 ? (ax / accel) * aim : 0;
  const tiltZ = accel > 1e-9 ? (az / accel) * aim : 0;

  // Screen up (aim +y) is world -z.
  return { aimX: tiltX, aimY: -tiltZ, thrust: craft.vel.y < wantVy };
}

/**
 * Highest ground or treetop near the craft and along the route ahead, sampling every half
 * unit and checking the trees on the 3x3 tiles around each sample.
 */
function highestObstacle(terrain: Terrain, x: number, z: number, dx: number, dz: number, distance: number): number {
  const reach = Math.min(LOOKAHEAD, distance);
  const steps = Math.ceil(reach / 0.5);
  let top = -Infinity;
  for (let s = 0; s <= steps; s++) {
    const f = distance > 1e-6 ? (s / Math.max(1, steps)) * (reach / distance) : 0;
    const px = x + dx * f;
    const pz = z + dz * f;
    top = Math.max(top, terrain.heightAt(px, pz));
    const ci = Math.floor(px);
    const cj = Math.floor(pz);
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const kind = terrain.treeAt(i, j);
        if (kind === TREE_NONE) continue;
        top = Math.max(top, treeBase(terrain, i, j).y + TREE_SHAPES[kind].height * treeScale(terrain, i, j));
      }
    }
  }
  return top;
}
