import { packSampleTable, sampleTableBuffers } from './PreparedSampleTable.js';
import { preparePlacementEcology } from './PreparedPlacementEcology.js';
import { computeRoadDistanceField } from './ChunkRenderPixels.js';
import { oceanTile } from '../water/OceanDistanceField.js';

/** Exact CPU terrain and canonical distance fields; rendering keeps its Float32 payload. */
export function generatePreparedPlacementChunk(request, generator) {
  const { chunkX, chunkZ, chunkSize: size, placementSamplingConfig: config } = request;
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const heights = new Float64Array((size + 1) ** 2);
  const tiles = new Uint8Array(size ** 2);
  const tileOverrides = new Map(config.tileOverrides ?? []);
  const tileAt = (x, z) => tileOverrides.get(`${x}:${z}`) ?? generator.sampleTile(x, z);
  for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) {
    const vx = originX + x;
    const vz = originZ + z;
    heights[z * (size + 1) + x] = generator.sampleHeight(vx, vz);
    if (x < size && z < size) tiles[z * size + x] = generator.sampleTile(vx, vz);
  }
  const fields = {};
  for (const target of config.targets ?? []) {
    const margin = Math.ceil(target.maxCells) + 1;
    const width = size + margin * 2;
    const fieldTiles = new Uint8Array(width ** 2);
    for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
      const cx = originX + x - margin, cz = originZ + z - margin;
      const tile = tileAt(cx, cz);
      fieldTiles[z * width + x] = target.oceanOnly && tile === 0
        ? oceanTile(tile, generator.sampleWater(cx + 0.5, cz + 0.5)) : target.oceanOnly ? 1 : tile;
    }
    fields[target.label] = {
      size: width, margin, originX, originZ,
      distances: computeRoadDistanceField(fieldTiles, width, width, target.targetTileId),
    };
  }
  const page = { chunkX, chunkZ, originX, originZ, tiles, canonicalHeights: heights, fields };
  preparePlacementEcology(page, request, generator);
  if (page.forestSamples) page.forestSamples = packSampleTable(page.forestSamples);
  if (page.rockNodes) page.rockNodes = packSampleTable(page.rockNodes);
  page.arrayBytes = tiles.byteLength + heights.byteLength
    + Object.values(fields).reduce((sum, field) => sum + field.distances.byteLength, 0)
    + [...sampleTableBuffers(page.forestSamples), ...sampleTableBuffers(page.rockNodes)]
      .reduce((sum, buffer) => sum + buffer.byteLength, 0);
  return page;
}
