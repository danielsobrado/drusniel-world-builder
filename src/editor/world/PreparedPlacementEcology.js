import { ForestHabitatField } from '../stylized/forest/ForestHabitatField.js';
import { ScatterClusterField } from '../stylized/forest/ScatterClusterField.js';
import { RegionalCharacterField } from '../stylized/RegionalCharacterField.js';
import { resolveForestCandidateBudget } from '../stylized/forest/ForestRuntimeConfig.js';
import { cellCenterToWorld } from './WorldCoordinates.js';
import { scatterRandom01 } from '../stylized/scatterMath.js';
import { FOREST_FLOOR_CANOPY_SAMPLES } from '../stylized/forestFloorTexture.js';

/** Pre-evaluate existing exact samples and existing grids; no new approximations. */
export function preparePlacementEcology(page, request, generator) {
  const config = request.placementSamplingConfig;
  if (!config.ecology) return;
  const { trees, rocks, regionalPlacement, seed, tileSize } = config.ecology;
  const { chunkX, chunkZ, chunkSize } = request;
  const tileOverrides = new Map(config.tileOverrides);
  const heightOverrides = new Map(config.heightOverrides);
  const tileAt = (x, z) => tileOverrides.get(`${x}:${z}`) ?? generator.sampleTile(x, z);
  const vertex = (x, z) => heightOverrides.get(`${x}:${z}`) ?? generator.sampleHeight(x, z);
  const heightAt = (x, z) => {
    const cx = x / tileSize;
    const cz = -z / tileSize;
    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const tx = cx - x0;
    const tz = cz - z0;
    const nw = vertex(x0, z0), ne = vertex(x0 + 1, z0);
    const sw = vertex(x0, z0 + 1), se = vertex(x0 + 1, z0 + 1);
    const north = nw + (ne - nw) * tx;
    const south = sw + (se - sw) * tx;
    return north + (south - north) * tz;
  };
  const water = page.fields.water;
  const waterTarget = config.targets.find(target => target.label === 'water');
  const waterDistanceAt = water ? (x, z) => {
    const cx = Math.floor(x / tileSize) - water.originX + water.margin;
    const cz = Math.floor(-z / tileSize) - water.originZ + water.margin;
    const distance = water.distances[cz * water.size + cx];
    return distance > waterTarget.maxCells ? Infinity : distance * tileSize;
  } : null;
  const regionalCharacterField = new RegionalCharacterField({ seed, config: regionalPlacement });
  if (trees.habitat?.enabled !== false) {
    const forest = new ForestHabitatField({ seed, tileSize, tileAt, heightAt,
      waterDistanceAt, regionalCharacterField, config: trees.habitat });
    const samples = new Map();
    const sample = (x, z) => samples.set(`${x}:${z}`, forest.sample(x, z));
    const budget = resolveForestCandidateBudget(trees.perChunk, trees.habitat?.candidateBudgetPerChunk);
    const eligible = new Set(trees.tileIds);
    for (let index = 0; index < budget; index++) {
      const random = channel => scatterRandom01(chunkX, chunkZ, index, channel);
      const cellX = chunkX * chunkSize + Math.floor(random(0) * chunkSize);
      const cellZ = chunkZ * chunkSize + Math.floor(random(1) * chunkSize);
      if (!eligible.has(tileAt(cellX, cellZ))) continue;
      const center = cellCenterToWorld(cellX, cellZ, tileSize);
      sample(center.x + (random(2) - 0.5) * tileSize, center.z + (random(3) - 0.5) * tileSize);
    }
    const size = chunkSize * tileSize;
    const centerX = (chunkX + 0.5) * size;
    const centerZ = -(chunkZ + 0.5) * size;
    for (let z = 0; z < FOREST_FLOOR_CANOPY_SAMPLES; z++) for (let x = 0; x < FOREST_FLOOR_CANOPY_SAMPLES; x++) {
      sample(centerX - size * 0.5 + (x + 0.5) / FOREST_FLOOR_CANOPY_SAMPLES * size,
        centerZ + size * 0.5 - (z + 0.5) / FOREST_FLOOR_CANOPY_SAMPLES * size);
    }
    // Ground cover samples the existing edge-aligned grid; canopy textures use
    // cell centers above. Retain both exact coordinate sets.
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      sample(centerX - size * 0.5 + x / 15 * size,
        centerZ + size * 0.5 - z / 15 * size);
    }
    page.forestSamples = samples;
  }
  const cluster = new ScatterClusterField({ kind: 'rock', seed, seedOffset: 0xa7, heightAt,
    slopeSampleDistance: trees.habitat?.slopeSampleDistance ?? 4, config: rocks });
  const size = chunkSize * tileSize;
  const spacing = cluster.sampleSpacing;
  const nodes = new Map();
  for (let z = Math.floor(-(chunkZ + 1) * size / spacing); z <= Math.floor(-chunkZ * size / spacing) + 1; z++) {
    for (let x = Math.floor(chunkX * size / spacing); x <= Math.floor((chunkX + 1) * size / spacing) + 1; x++) {
      nodes.set(`${x}:${z}`, cluster.nodeAt(x, z));
    }
  }
  page.rockNodes = nodes;
}
