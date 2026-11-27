import { SpatialOverrideMap } from './SpatialOverrideMap.js';
import { sampleWorldStoreWater, sampleWorldStoreWaterSurface } from '../water/TerrainWaterQueries.js';

/** Same canonical edit and water semantics as the store, evaluated in a worker. */
export function createEditedChunkSampling(generator, chunkSize, overrides) {
  if (!overrides?.tiles?.length && !overrides?.heights?.length) return generator;
  const convert = rows => (rows ?? []).map(([x, z, value]) => [`${x}:${z}`, value]);
  const tileOverrides = new SpatialOverrideMap(chunkSize, convert(overrides.tiles));
  const heightOverrides = new SpatialOverrideMap(chunkSize, convert(overrides.heights));
  const sampleTile = (x, z) => tileOverrides.getAt(x, z) ?? generator.sampleTile(x, z);
  const vertex = (x, z) => heightOverrides.getAt(x, z) ?? generator.sampleHeight(x, z);
  const sampleHeight = (x, z) => {
    const ix = Math.floor(x); const iz = Math.floor(z);
    const fx = x - ix; const fz = z - iz;
    const a = vertex(ix, iz); const b = vertex(ix + 1, iz);
    const c = vertex(ix, iz + 1); const d = vertex(ix + 1, iz + 1);
    const north = a + (b - a) * fx;
    return north + (c + (d - c) * fx - north) * fz;
  };
  const sampleEnvironmentClimate = (cellX, cellZ, out = { temperature: 0, moisture: 0.5, fertility: 0.5, valid: false }) => {
    if (tileOverrides.getAt(Math.floor(cellX), Math.floor(cellZ)) !== undefined) {
      out.valid = false;
      return out;
    }
    if (typeof generator.sampleEnvironmentClimate === 'function') {
      return generator.sampleEnvironmentClimate(cellX, cellZ, out);
    }
    out.valid = false;
    return out;
  };
  const store = { generator, getTile: sampleTile, sampleHeight, tileOverrides, heightOverrides };
  return { sampleTile, sampleHeight: vertex, sampleEnvironmentClimate,
    sampleWater: (x, z) => sampleWorldStoreWater(store, x, z),
    sampleWaterSurface: (x, z) => sampleWorldStoreWaterSurface(store, x, z) };
}
