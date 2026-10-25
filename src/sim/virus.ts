import type { Terrain } from './terrain';

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Grows the infection: each infected tile has a `rate` per second chance of infecting one
 * random edge-neighbour (which only takes if that neighbour is clean land). Tiles infected
 * during this step don't spread until the next one.
 */
export function stepVirus(terrain: Terrain, rate: number, dt: number, rng: () => number): void {
  if (rate <= 0 || terrain.infectedCount === 0) return;
  const n = terrain.size;
  const chance = rate * dt;
  const spreading: number[] = [];
  for (let k = 0; k < terrain.infection.length; k++) {
    if (terrain.infection[k] === 1 && rng() < chance) spreading.push(k);
  }
  for (const k of spreading) {
    const [di, dj] = NEIGHBOURS[Math.floor(rng() * NEIGHBOURS.length)]!;
    terrain.infect((k % n) + di, Math.floor(k / n) + dj);
  }
}
