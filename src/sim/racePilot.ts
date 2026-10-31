import { autopilotInput, CLEARANCE, highestObstacle, steer } from './autopilot';
import { spawnCraft, stepCraft, type CraftInput, type CraftState, type Physics } from './craft';
import { createRace, stepRace, type Course, type RaceState } from './race';
import type { Terrain } from './terrain';

/** The pilot's speed between gates and through them (u/s). */
const RACE_SPEED = 5.5;
/** It lines up this far in front of a gate before flying through it. */
const APPROACH = 3.5;
/** Within this sideways and vertical offset from the gate's axis, it is lined up and goes through. */
const LINED_UP = 0.9;
/** How hard it corrects its height (1/s), and the fastest it climbs or sinks. */
const HEIGHT_GAIN = 1.6;
const MAX_CLIMB = 3;
/** The pilot leans no further than this, so it doesn't lose height in the turns. */
const PILOT_LEAN = (32 * Math.PI) / 180;
/** A computer run gives up after this long (s). */
const GIVE_UP = 240;

/**
 * The computer's racing line: line up in front of the next gate, fly through it, and after the
 * last land back on the pad (the auto-refuel's landing). It flies over anything in the way.
 */
export function racePilotInput(race: RaceState, craft: CraftState, terrain: Terrain, physics: Physics): CraftInput {
  const gates = race.course.gates;
  if (race.next >= gates.length) return autopilotInput(craft, terrain, physics);
  const gate = gates[race.next]!;
  const gx = terrain.delta(craft.pos.x, gate.pos.x);
  const gz = terrain.delta(craft.pos.z, gate.pos.z);
  // Along the gate's axis (negative: still in front of it) and across it.
  const along = -(gx * gate.dir.x + gz * gate.dir.z);
  const across = gx * -gate.dir.z + gz * gate.dir.x;
  const lined = along < 0 && Math.abs(across) < LINED_UP && Math.abs(craft.pos.y - gate.pos.y) < LINED_UP * 1.5;
  // Head for the approach point until lined up, then straight through the centre and beyond.
  const reach = lined ? 2 : APPROACH;
  const tx = gx + gate.dir.x * (lined ? reach : -reach);
  const tz = gz + gate.dir.z * (lined ? reach : -reach);
  const distance = Math.hypot(tx, tz);
  const speed = Math.min(RACE_SPEED, 0.5 + distance * 0.8);
  const vx = distance > 1e-6 ? (tx / distance) * speed : 0;
  const vz = distance > 1e-6 ? (tz / distance) * speed : 0;
  // Gate height, but never lower than what stands between here and the gate.
  const obstacle = highestObstacle(terrain, craft.pos.x, craft.pos.z, tx, tz, Math.max(1e-6, distance)) + CLEARANCE;
  const wantY = Math.max(gate.pos.y, distance > APPROACH ? obstacle : -Infinity);
  const vy = Math.max(-MAX_CLIMB, Math.min(MAX_CLIMB, (wantY - craft.pos.y) * HEIGHT_GAIN));
  return steer(craft, physics, vx, vy, vz, PILOT_LEAN);
}

/**
 * Flies the whole course with the computer pilot, from the pad, and returns the finished race
 * (or the unfinished one after `GIVE_UP` seconds): its time, splits and ghost.
 */
export function flyCourse(course: Course, terrain: Terrain, physics: Physics, dt = 1 / 60): RaceState {
  const race = createRace(course);
  const craft = spawnCraft(terrain, physics);
  for (let t = 0; t < GIVE_UP && !race.finished; t += dt) {
    const from = { ...craft.pos };
    stepCraft(craft, racePilotInput(race, craft, terrain, physics), terrain, dt, physics);
    stepRace(race, craft, from, terrain, dt, physics);
  }
  return race;
}
