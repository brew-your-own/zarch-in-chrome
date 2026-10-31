import { highestObstacle } from './autopilot';
import { tiltAngle, type CraftState, type Physics, type Vec3 } from './craft';
import { createRng } from './rng';
import { SEA_LEVEL, type Terrain } from './terrain';

/** Gates in a course. */
export const GATE_COUNT = 10;
/** A gate's inner radius: the craft must pass within it. */
export const GATE_RADIUS = 2;
/** The bottom of a gate's ring clears the ground, trees and roofs under it by this much. */
export const GATE_CLEARANCE = 1.2;
/** The course loops round a centre this far from the pad (about a quarter of a 64-tile map). */
export const LOOP_RADIUS = 15;
/** How much each gate's distance from the loop's centre may vary, as a share of the radius. */
export const LOOP_WOBBLE = 0.35;
/** Landing within this distance of the pad's centre, after the last gate, finishes the race. */
export const FINISH_REACH = 1.6;
/** After a crash the craft comes back at the last gate passed, drifting through it at this speed. */
export const RESPAWN_DRIFT = 1.5;
/** Ghost frames per second; each frame is x, y, z, tilt angle and heading. */
export const GHOST_RATE = 30;
export const GHOST_STRIDE = 5;

export interface Gate {
  /** Centre of the ring, wrapped into the map. */
  pos: Vec3;
  /** Horizontal unit vector the craft must fly along to pass. */
  dir: { x: number; z: number };
}

export interface Course {
  gates: Gate[];
}

export type RaceEvent =
  | { type: 'raceStarted' }
  /** `index` is the gate's place in the course; `time` the race clock as it was passed. */
  | { type: 'gatePassed'; index: number; time: number }
  | { type: 'raceFinished'; time: number }
  /** The craft came back at gate `index` after a crash. */
  | { type: 'raceRespawned'; index: number };

export interface RaceState {
  course: Course;
  /** The next gate to pass; `course.gates.length` once they're all passed (then land on the pad). */
  next: number;
  /** The race clock (s): it starts at liftoff and stops on landing back on the pad. */
  time: number;
  started: boolean;
  finished: boolean;
  /** The clock at each gate passed. */
  splits: number[];
  crashes: number;
  /** The run so far, `GHOST_STRIDE` numbers per frame at `GHOST_RATE`, for the next ghost. */
  ghost: number[];
  /** Set while the craft is wrecked, so its respawn can be moved to the last gate. */
  wrecked: boolean;
}

/**
 * The course for a map: `GATE_COUNT` gates on a wobbly loop that starts and ends at the pad, each
 * facing along the loop and floating `GATE_CLEARANCE` over whatever stands under it. The same
 * terrain and seed always give the same course.
 */
export function buildCourse(terrain: Terrain, seed: number): Course {
  const rng = createRng(seed ^ 0x6a7e5);
  const pad = terrain.padCentre();
  // The loop's centre lies one radius from the pad, so the loop passes through the pad.
  const start = rng() * Math.PI * 2;
  const clockwise = rng() < 0.5 ? 1 : -1;
  const cx = pad.x - Math.cos(start) * LOOP_RADIUS;
  const cz = pad.z - Math.sin(start) * LOOP_RADIUS;
  const points: { x: number; z: number }[] = [];
  // Point 0 is the pad; the gates are points 1 to GATE_COUNT.
  for (let k = 0; k <= GATE_COUNT + 1; k++) {
    const angle = start + (clockwise * 2 * Math.PI * k) / (GATE_COUNT + 1);
    const r = k === 0 || k === GATE_COUNT + 1 ? LOOP_RADIUS : LOOP_RADIUS * (1 + LOOP_WOBBLE * (rng() * 2 - 1));
    points.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r });
  }
  const gates: Gate[] = [];
  for (let k = 1; k <= GATE_COUNT; k++) {
    const before = points[k - 1]!;
    const here = points[k]!;
    const after = points[k + 1]!;
    const tx = after.x - before.x;
    const tz = after.z - before.z;
    const length = Math.hypot(tx, tz) || 1;
    const dir = { x: tx / length, z: tz / length };
    // Clear everything under the ring, from one side of it to the other.
    const side = { x: -dir.z, z: dir.x };
    const top = highestObstacle(
      terrain,
      here.x - side.x * GATE_RADIUS,
      here.z - side.z * GATE_RADIUS,
      side.x * 2 * GATE_RADIUS,
      side.z * 2 * GATE_RADIUS,
      2 * GATE_RADIUS,
    );
    const ground = Math.max(SEA_LEVEL, top, terrain.heightAt(here.x + side.x * GATE_RADIUS, here.z + side.z * GATE_RADIUS));
    gates.push({ pos: { x: terrain.wrap(here.x), y: ground + GATE_CLEARANCE + GATE_RADIUS, z: terrain.wrap(here.z) }, dir });
  }
  return { gates };
}

export function createRace(course: Course): RaceState {
  return { course, next: 0, time: 0, started: false, finished: false, splits: [], crashes: 0, ghost: [], wrecked: false };
}

/** Whether the move from `from` to `to` passes through `gate` the right way, inside the ring. */
export function passesGate(gate: Gate, from: Vec3, to: Vec3, terrain: Terrain): boolean {
  const ax = terrain.delta(gate.pos.x, from.x);
  const az = terrain.delta(gate.pos.z, from.z);
  const ay = from.y - gate.pos.y;
  // Measure the end from the start, so a move across the wrap stays one short move.
  const bx = ax + terrain.delta(from.x, to.x);
  const bz = az + terrain.delta(from.z, to.z);
  const by = to.y - gate.pos.y;
  const before = ax * gate.dir.x + az * gate.dir.z;
  const after = bx * gate.dir.x + bz * gate.dir.z;
  if (!(before < 0 && after >= 0)) return false;
  const t = before / (before - after);
  const hx = ax + (bx - ax) * t;
  const hy = ay + (by - ay) * t;
  const hz = az + (bz - az) * t;
  return Math.hypot(hx, hy, hz) <= GATE_RADIUS;
}

/** Whether the craft sits landed on the pad, close enough to its centre to finish. */
function onPad(craft: CraftState, terrain: Terrain): boolean {
  if (craft.status !== 'landed') return false;
  const pad = terrain.padCentre();
  return Math.hypot(terrain.delta(craft.pos.x, pad.x), terrain.delta(craft.pos.z, pad.z)) <= FINISH_REACH;
}

/**
 * Advances the race after the craft has stepped from `from`: starts the clock at liftoff, checks
 * the next gate, finishes on landing back on the pad after the last one, keeps the tank full,
 * records the ghost, and brings a wrecked craft back at the last gate passed rather than the pad.
 */
export function stepRace(race: RaceState, craft: CraftState, from: Vec3, terrain: Terrain, dt: number, physics: Physics): RaceEvent[] {
  const events: RaceEvent[] = [];
  craft.fuel = physics.maxFuel;
  if (race.finished) return events;

  if (craft.status === 'crashed') {
    if (!race.wrecked) race.crashes++;
    race.wrecked = true;
  } else if (race.wrecked) {
    // `stepCraft` has just respawned it on the pad; past the first gate, move it to the last one.
    race.wrecked = false;
    if (race.next > 0) {
      const gate = race.course.gates[race.next - 1]!;
      craft.pos = { ...gate.pos };
      craft.vel = { x: gate.dir.x * RESPAWN_DRIFT, y: 0, z: gate.dir.z * RESPAWN_DRIFT };
      craft.tilt = { x: 0, z: 0 };
      craft.heading = Math.atan2(gate.dir.x, -gate.dir.z);
      craft.status = 'flying';
      events.push({ type: 'raceRespawned', index: race.next - 1 });
      return events;
    }
  }

  if (!race.started) {
    if (craft.status !== 'flying') return events;
    race.started = true;
    events.push({ type: 'raceStarted' });
  }
  race.time += dt;

  const gates = race.course.gates;
  if (race.next < gates.length && craft.status !== 'crashed' && passesGate(gates[race.next]!, from, craft.pos, terrain)) {
    race.splits.push(race.time);
    events.push({ type: 'gatePassed', index: race.next, time: race.time });
    race.next++;
  }
  if (race.next === gates.length && onPad(craft, terrain)) {
    race.finished = true;
    events.push({ type: 'raceFinished', time: race.time });
  }

  // One ghost frame every 1/GHOST_RATE s of race time.
  const frames = race.ghost.length / GHOST_STRIDE;
  if (race.time >= frames / GHOST_RATE) {
    race.ghost.push(craft.pos.x, craft.pos.y, craft.pos.z, craft.status === 'crashed' ? NaN : tiltAngle(craft, physics), craft.heading);
  }
  return events;
}

export interface GhostPose {
  pos: Vec3;
  /** Tilt angle (rad), as `tiltAngle` gives it. */
  tilt: number;
  heading: number;
}

/** Where a recorded run was `time` seconds in, or null before it starts, after it ends or while it was wrecked. */
export function ghostPose(ghost: readonly number[], time: number): GhostPose | null {
  const frames = ghost.length / GHOST_STRIDE;
  const f = time * GHOST_RATE;
  if (frames < 2 || f < 0 || f > frames - 1) return null;
  const k = Math.min(frames - 2, Math.floor(f));
  const u = f - k;
  const a = k * GHOST_STRIDE;
  const b = a + GHOST_STRIDE;
  const at = (n: number) => ghost[a + n]! + (ghost[b + n]! - ghost[a + n]!) * u;
  // A jump (respawn) or a wreck isn't flown through.
  if (Number.isNaN(ghost[a + 3]!) || Number.isNaN(ghost[b + 3]!)) return null;
  if (Math.hypot(ghost[b]! - ghost[a]!, ghost[b + 2]! - ghost[a + 2]!) > 3) return null;
  const turn = Math.atan2(Math.sin(ghost[b + 4]! - ghost[a + 4]!), Math.cos(ghost[b + 4]! - ghost[a + 4]!));
  return { pos: { x: at(0), y: at(1), z: at(2) }, tilt: at(3), heading: ghost[a + 4]! + turn * u };
}

/** "0:23.45": a race time as minutes, seconds and hundredths. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(total / 6000);
  const rest = total - minutes * 6000;
  return `${minutes}:${String(Math.floor(rest / 100)).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}
