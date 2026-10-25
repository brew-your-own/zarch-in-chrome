import { generateTerrain, type Terrain, type TerrainOptions } from './terrain';

export interface MapPreset {
  id: string;
  name: string;
  seed: number;
  options: TerrainOptions;
}

export const MAPS: readonly MapPreset[] = [
  { id: 'valleys', name: 'Green Valleys', seed: 1987, options: {} },
  { id: 'archipelago', name: 'Archipelago', seed: 4242, options: { seaBias: 0.57, amplitude: 12 } },
  { id: 'highlands', name: 'Highlands', seed: 314, options: { seaBias: 0.36, amplitude: 12, roughness: 0.65 } },
];

export const DEFAULT_MAP_ID = MAPS[0]!.id;

export function findMap(id: string): MapPreset {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]!;
}

export function buildMap(preset: MapPreset): Terrain {
  return generateTerrain(preset.seed, preset.options);
}
