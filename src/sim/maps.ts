import { generateTerrain, type Terrain, type TerrainOptions } from './terrain';

export interface MapPreset {
  id: string;
  name: string;
  seed: number;
  options: TerrainOptions;
}

export const MAPS: readonly MapPreset[] = [
  { id: 'valleys', name: 'Green Valleys', seed: 1987, options: {} },
  { id: 'archipelago', name: 'Archipelago', seed: 4242, options: { seaBias: 0.57, amplitude: 12, palms: 0.9 } },
  { id: 'highlands', name: 'Highlands', seed: 314, options: { seaBias: 0.36, amplitude: 12, roughness: 0.65 } },
  // Flat, open land with twice the usual villages: the most to protect.
  { id: 'farmlands', name: 'Farmlands', seed: 2024, options: { seaBias: 0.28, amplitude: 3, roughness: 0.35, treeDensity: 0.2, palms: 0.3, villages: 8 } },
  // Thick woods to weave through, and trees to hide behind.
  { id: 'forest', name: 'Deep Forest', seed: 1234, options: { seaBias: 0.3, amplitude: 5, roughness: 0.55, treeDensity: 0.95, palms: 0.25, villages: 3 } },
  // Bumpy land dotted with small lakes; a rough fine octave (over 1) breaks the water up.
  { id: 'lakes', name: 'Lake District', seed: 11, options: { seaBias: 0.44, amplitude: 6, roughness: 1.1 } },
];

export const DEFAULT_MAP_ID = MAPS[0]!.id;

export function findMap(id: string): MapPreset {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]!;
}

export function buildMap(preset: MapPreset): Terrain {
  return generateTerrain(preset.seed, preset.options);
}
