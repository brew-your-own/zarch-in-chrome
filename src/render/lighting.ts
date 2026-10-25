/**
 * Unit vector pointing *toward* the sun. Shared by the CPU-shaded terrain, the minimap,
 * the scene's directional light and the slanted tree shadows, so they all agree.
 */
export const SUN = (() => {
  const x = -0.5;
  const y = 1;
  const z = 0.35;
  const len = Math.hypot(x, y, z);
  return Object.freeze({ x: x / len, y: y / len, z: z / len });
})();
