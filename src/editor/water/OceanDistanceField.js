import { TileDistanceField } from '../stylized/forest/TileDistanceField.js';
import { WATER_KIND_NONE, WATER_KIND_OCEAN } from './WaterConstants.js';

export function oceanTile(tileId, sample) {
  // An authored water tile with no generated body is the world's ocean.
  return tileId === 0 && (sample.kind === WATER_KIND_OCEAN || sample.kind === WATER_KIND_NONE) ? 0 : 1;
}

export function createOceanDistanceField(view, reachMeters = 48) {
  const world = view.worldStore;
  return new TileDistanceField({
    tileSize: world.tileSize, chunkSize: world.chunkSize, targetTileId: 0,
    maxCells: Math.ceil(reachMeters / world.tileSize), label: 'coast', maxCachedChunks: 25,
    revisionProvider: () => world.revision ?? 0,
    preparedProvider: (x, z) => view.preparedPlacement?.field('coast', x, z),
    tileAt: (x, z) => {
      const tile = view.tileMap.get(x, z);
      return tile === 0 ? oceanTile(tile, world.generator.sampleWater(x + 0.5, z + 0.5)) : 1;
    },
  });
}
