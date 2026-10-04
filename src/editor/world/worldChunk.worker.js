import { bakeTerrainMaterialPage } from '../materials/TerrainMaterialBakeCpu.js';
import { sampleTableBuffers } from './PreparedSampleTable.js';
import { generatePreparedPlacementChunk } from './PreparedPlacementChunk.js';
import { generateBaseWorldChunk } from './generateWorldChunk.js';
import { createWorldGenerator } from './WorldGeneratorFactory.js';

let baseTerrain = null;
let worldGenerator = null;
let generatorMetadata = null;

self.addEventListener('message', async (event) => {
  if (event.data?.type === 'configure') {
    baseTerrain = event.data.baseTerrain ?? null;
    worldGenerator = generatorMetadata
      ? createWorldGenerator(generatorMetadata, baseTerrain)
      : null;
    return;
  }
  const { id, request } = event.data ?? {};
  try {
    if (request.materialBakeRequest) {
      const page = await bakeTerrainMaterialPage(request.materialBakeRequest);
      self.postMessage({ id, page }, Object.values(page.value.channels).map(channel => channel.buffer));
      return;
    }
    const metadataChanged = !generatorMetadata
      || JSON.stringify(generatorMetadata) !== JSON.stringify(request.generator);
    if (!worldGenerator || metadataChanged) {
      generatorMetadata = request.generator;
      worldGenerator = createWorldGenerator(generatorMetadata, baseTerrain);
    }
    const page = request.placementSamplingConfig
      ? generatePreparedPlacementChunk(request, worldGenerator)
      : generateBaseWorldChunk({ ...request, worldGenerator });
    if (page.canonicalHeights) {
      self.postMessage({ id, page }, [page.tiles.buffer, page.canonicalHeights.buffer,
        ...Object.values(page.fields).map(field => field.distances.buffer),
        ...sampleTableBuffers(page.forestSamples), ...sampleTableBuffers(page.rockNodes)]);
      return;
    }
    const transfer = [
      page.tiles.buffer,
      page.heights.buffer,
      page.waterFieldPixels.buffer,
      page.waterFlowPixels.buffer,
    ];
    if (page.tilePixels?.buffer) {
      transfer.push(page.tilePixels.buffer);
    }
    if (page.surfaceMaskPixels?.buffer) {
      transfer.push(page.surfaceMaskPixels.buffer);
    }
    if (page.grassScatter?.base?.buffer) {
      transfer.push(page.grassScatter.base.buffer, page.grassScatter.parameters.buffer);
    }
    if (page.flowerScatter?.base?.buffer) {
      transfer.push(page.flowerScatter.base.buffer, page.flowerScatter.parameters.buffer);
    }
    self.postMessage({ id, page }, transfer);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
