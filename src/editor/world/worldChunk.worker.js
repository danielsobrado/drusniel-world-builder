import { bakeTerrainMaterialPage } from '../materials/TerrainMaterialBakeCpu.js';
import { sampleTableBuffers } from './PreparedSampleTable.js';
import { generatePreparedPlacementChunk } from './PreparedPlacementChunk.js';
import { generateBaseWorldChunk } from './generateWorldChunk.js';
import { createWorldGenerator } from './WorldGeneratorFactory.js';
import { generateSettlementPlan, generateSettlementRegistry } from './settlements/SettlementPlanRequest.js';
import { SettlementPlanPortAuthority, SettlementPlanPortClient } from './settlements/SettlementPlanPorts.js';
import { getSurfaceMaskSearchRadius } from './ChunkRenderPixels.js';

let baseTerrain = null;
let worldGenerator = null;
let generatorMetadata = null;
const planClient = new SettlementPlanPortClient();
const planAuthority = new SettlementPlanPortAuthority(ensureGenerator,
  () => self.postMessage({ type: 'settlement-plan-generated' }));

function ensureGenerator(metadata) {
  if (!worldGenerator || JSON.stringify(generatorMetadata) !== JSON.stringify(metadata)) {
    generatorMetadata = metadata;
    worldGenerator = createWorldGenerator(metadata, baseTerrain);
  }
  return worldGenerator;
}

async function preparePlans(generator, request) {
  if (!request.sharedSettlementPlans) return;
  const field = generator.ensureSettlementField?.();
  if (!field) return;
  field.requirePreparedPlans = true;
  const margin = Math.max(2, getSurfaceMaskSearchRadius(request.surfaceMaskConfig?.blendCells ?? 1),
    ...(request.placementSamplingConfig?.targets ?? []).map(target => Math.ceil(target.maxCells) + 1));
  const centerX = (request.chunkX + .5) * request.chunkSize, centerZ = (request.chunkZ + .5) * request.chunkSize;
  const radius = (request.chunkSize / 2 + margin) * Math.SQRT2;
  for (const { entry } of field.entriesNear(centerX, centerZ, radius)) {
    if (entry.plan === undefined) await planClient.prepare(generator, request.generator, entry.settlement.id);
  }
}

async function generatePage(generator, request) {
  await preparePlans(generator, request);
  for (;;) {
    try {
      return request.placementSamplingConfig ? generatePreparedPlacementChunk(request, generator)
        : generateBaseWorldChunk({ ...request, worldGenerator: generator });
    } catch (error) {
      // Ecology can sample beyond the mask halo. Resolve that exact missing
      // plan through the authority rather than silently planning it again.
      if (!request.sharedSettlementPlans || error.code !== 'settlement_plan_required') throw error;
      await planClient.prepare(generator, request.generator, error.settlementId);
    }
  }
}

self.addEventListener('message', async (event) => {
  if (event.data?.type === 'configure') {
    planClient.disconnect();
    planAuthority.reset(event.data.revision);
    baseTerrain = event.data.baseTerrain ?? null;
    worldGenerator = generatorMetadata
      ? createWorldGenerator(generatorMetadata, baseTerrain)
      : null;
    return;
  }
  if (event.data?.type === 'connect-settlement-plan-authority') {
    planAuthority.connect(event.data.port, event.data.revision); return;
  }
  if (event.data?.type === 'connect-settlement-plans') {
    planClient.connect(event.data.port, event.data.revision); return;
  }
  if (event.data?.type === 'settlement-authority-unavailable') {
    planClient.disconnect('Settlement plan authority is unavailable.'); return;
  }
  const { id, request } = event.data ?? {};
  try {
    if (request.materialBakeRequest) {
      const page = await bakeTerrainMaterialPage(request.materialBakeRequest);
      self.postMessage({ id, page }, Object.values(page.value.channels).map(channel => channel.buffer));
      return;
    }
    const generator = ensureGenerator(request.generator);
    if (request.settlementPlanId !== null && request.settlementPlanId !== undefined) {
      const missing = generator.ensureSettlementField()?.findById(request.settlementPlanId)?.plan === undefined;
      const page = generateSettlementPlan(generator, request.settlementPlanId);
      if (missing) self.postMessage({ type: 'settlement-plan-generated' });
      self.postMessage({ id, page }, [page.skyline.positions.buffer, page.skyline.colors.buffer,
        page.skyline.normals.buffer, page.skyline.indices.buffer]);
      return;
    }
    if (request.settlementRegistry) {
      self.postMessage({ id, page: generateSettlementRegistry(generator) });
      return;
    }
    const page = await generatePage(generator, request);
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
      page.waterAppearancePixels.buffer,
    ];
    if (page.tilePixels?.buffer) {
      transfer.push(page.tilePixels.buffer);
    }
    if (page.surfaceMaskPixels?.buffer) {
      transfer.push(page.surfaceMaskPixels.buffer);
    }
    if (page.snowBiomeCover?.buffer) {
      transfer.push(page.snowBiomeCover.buffer);
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
      error: { message: error instanceof Error ? error.message : String(error),
        code: error?.code, retryable: error?.retryable === true },
    });
  }
});
