import { sampleWorldStoreWater } from './TerrainWaterQueries.js';

/** Placement samples exclude animated swell and remain stable across revisits. */
export function staticWaterAt(view, x, z) {
  const world = view.worldStore;
  return typeof world?.generator?.sampleWater === 'function' && world.getTile && world.sampleHeight
    ? sampleWorldStoreWater(world, x / world.tileSize, -z / world.tileSize)
    : view.getCanonicalWater?.(x, z);
}
