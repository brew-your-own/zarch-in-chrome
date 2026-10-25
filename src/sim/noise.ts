const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * One octave of wrapping value noise over a `size` x `size` grid, values in [0, 1).
 * Random lattice points every `cell` tiles (which must divide `size`), smoothly interpolated.
 * Draws (size / cell)² values from `rng`.
 */
export function valueNoise(rng: () => number, size: number, cell: number): Float32Array {
  if (size % cell !== 0) throw new Error(`size ${size} not divisible by ${cell}`);
  const n = size / cell;
  const lattice = Array.from({ length: n * n }, rng);
  const at = (a: number, b: number) => lattice[mod(b, n) * n + mod(a, n)]!;
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const ci = Math.floor(i / cell);
      const cj = Math.floor(j / cell);
      const tx = smooth((i % cell) / cell);
      const tz = smooth((j % cell) / cell);
      const top = at(ci, cj) + tx * (at(ci + 1, cj) - at(ci, cj));
      const bottom = at(ci, cj + 1) + tx * (at(ci + 1, cj + 1) - at(ci, cj + 1));
      out[j * size + i] = top + tz * (bottom - top);
    }
  }
  return out;
}
