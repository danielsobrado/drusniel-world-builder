import { createMacroAtlasPayload } from '../../src/editor/import/AzgaarMacroWorldSource.js';
import { createAzgaarBiomeDefinitions } from '../../src/editor/AzgaarBiomeCatalog.js';

export const settlementReviewMetadata = { seed: 91, version: 1, heightScale: 12, seaLevel: -1.5 };

export function settlementReviewSource(width = 16, height = 16) {
  const size = width * height;
  return { kind: 'azgaar-macro-v1', version: 1, source: { mapId: 'settlement-review' },
    atlas: { width, height, ...createMacroAtlasPayload({
      heights: Uint8Array.from({ length: size }, (_, index) => 40 + index % 37),
      biomes: new Uint8Array(size).fill(4), features: new Uint16Array(size).fill(1),
    }) },
    physical: { widthMeters: 4096, heightMeters: 4096, distanceScale: 1, distanceUnit: 'km' },
    bounds: { minCellX: -1024, minCellZ: -1024, widthCells: 2048, heightCells: 2048 },
    oceanTransitionCells: 4, terrain: { minHeight: -16, maxHeight: 48, seaLevel: -1.5 },
    biomes: createAzgaarBiomeDefinitions(), rivers: [], routes: [],
    settlements: [{ id: 18, name: 'Review city', cellX: 0, cellZ: 0, population: 28,
      capital: true, walls: true, plaza: true }],
  };
}
