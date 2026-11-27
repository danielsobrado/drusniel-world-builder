import { terrainWetlandWetness } from './TerrainWetlandWetness.js';
import { sampleSurfaceMaskChannel } from '../world/SurfaceMaskSampling.js';
import { floatToHalf } from './HalfFloat.js';
import {
  createTerrainMaterialFarStyle,
  encodeTerrainMaterialFarColor,
} from './TerrainMaterialBakeFarColor.js';
import { encodeTerrainMaterialWeights } from './TerrainMaterialBakePacking.js';
import { snowAtPoint } from './SnowAccumulation.js';
import { terrainBakeMacroSeed, terrainBakeValueNoise as valueNoise } from './TerrainBakeNoise.js';
import { padTerrainMaterialBakeSource } from './TerrainMaterialBakeSourcePad.js';
import { ENV_CHANNELS, ENV_CHANNEL_COUNT } from '../world/EnvironmentalField.js';

const DISTANCE_INFINITY = 1e9;
const SQRT_TWO = Math.SQRT2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smoothstep(edge0, edge1, value) {
  const span = Math.max(1e-9, edge1 - edge0);
  const t = clamp01((value - edge0) / span);
  return t * t * (3 - 2 * t);
}

/**
 * An edge-aligned texel's position in cells from the chunk's min edge: texel 0
 * and `resolution - 1` lie on the chunk edges, so neighbours bake the same border.
 */
function texelCellPosition(index, resolution, chunkSize) {
  return resolution > 1 ? index / (resolution - 1) * chunkSize : chunkSize / 2;
}

/** The padded-grid cell holding an edge-aligned texel (the far edge reads the neighbour's first cell). */
function texelSourceCell(position, chunkSize, pad) {
  return clamp(Math.floor(position), 0, chunkSize) + pad;
}

function cellHeight(heights, size, x, z) {
  const vertexSize = size + 1;
  const x0 = clamp(x, 0, size - 1);
  const z0 = clamp(z, 0, size - 1);
  const topLeft = heights[z0 * vertexSize + x0];
  const topRight = heights[z0 * vertexSize + x0 + 1];
  const bottomLeft = heights[(z0 + 1) * vertexSize + x0];
  const bottomRight = heights[(z0 + 1) * vertexSize + x0 + 1];
  return (topLeft + topRight + bottomLeft + bottomRight) * 0.25;
}

/** Shape of cell (x, z) of a `size × size` cell grid whose heights are `(size + 1)²` vertices. */
function terrainShape(heights, size, tileSize, x, z) {
  const vertexSize = size + 1;
  const topLeft = heights[z * vertexSize + x];
  const topRight = heights[z * vertexSize + x + 1];
  const bottomLeft = heights[(z + 1) * vertexSize + x];
  const bottomRight = heights[(z + 1) * vertexSize + x + 1];
  const center = (topLeft + topRight + bottomLeft + bottomRight) * 0.25;
  const dx = (topRight + bottomRight - topLeft - bottomLeft) / (2 * tileSize);
  const dz = (bottomLeft + bottomRight - topLeft - topRight) / (2 * tileSize);
  const slope = Math.hypot(dx, dz);
  return { center, dx, dz, slope, curvature: cellCurvature(heights, size, tileSize, x, z) };
}

// Reads the neighbouring cells, which the padded grid carries across the chunk
// edge; only its own outer ring takes the nearest interior cell's curvature.
function cellCurvature(heights, size, tileSize, x, z) {
  if (size < 3) return 0;
  const cx = clamp(x, 1, size - 2);
  const cz = clamp(z, 1, size - 2);
  const left = cellHeight(heights, size, cx - 1, cz);
  const right = cellHeight(heights, size, cx + 1, cz);
  const near = cellHeight(heights, size, cx, cz - 1);
  const far = cellHeight(heights, size, cx, cz + 1);
  return (left + right + near + far - cellHeight(heights, size, cx, cz) * 4) / (tileSize * tileSize);
}

function octNormal(dx, dz) {
  let x = -dx;
  let y = 1;
  let z = -dz;
  const length = Math.hypot(x, y, z) || 1;
  x /= length;
  y /= length;
  z /= length;
  const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  x /= l1;
  y /= l1;
  z /= l1;
  if (y < 0) {
    const oldX = x;
    x = (1 - Math.abs(z)) * Math.sign(oldX || 1);
    z = (1 - Math.abs(oldX)) * Math.sign(z || 1);
  }
  return [Math.round(clamp(x, -1, 1) * 127), Math.round(clamp(z, -1, 1) * 127)];
}

function distanceField(mask, size) {
  const distance = new Float32Array(size * size);
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = mask[index] > 0 ? 0 : DISTANCE_INFINITY;
  }
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = z * size + x;
      let value = distance[index];
      if (x > 0) value = Math.min(value, distance[index - 1] + 1);
      if (z > 0) value = Math.min(value, distance[index - size] + 1);
      if (x > 0 && z > 0) value = Math.min(value, distance[index - size - 1] + SQRT_TWO);
      if (x + 1 < size && z > 0) value = Math.min(value, distance[index - size + 1] + SQRT_TWO);
      distance[index] = value;
    }
  }
  for (let z = size - 1; z >= 0; z -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      const index = z * size + x;
      let value = distance[index];
      if (x + 1 < size) value = Math.min(value, distance[index + 1] + 1);
      if (z + 1 < size) value = Math.min(value, distance[index + size] + 1);
      if (x + 1 < size && z + 1 < size) value = Math.min(value, distance[index + size + 1] + SQRT_TWO);
      if (x > 0 && z + 1 < size) value = Math.min(value, distance[index + size - 1] + SQRT_TWO);
      distance[index] = value;
    }
  }
  return distance;
}

function localWaterMask(surfaceMaskPixels, chunkSize) {
  const water = new Uint8Array(chunkSize * chunkSize);
  for (let index = 0; index < water.length; index += 1) {
    water[index] = surfaceMaskPixels[index * 4 + 2];
  }
  return water;
}

function waterDistanceSource(source, chunkSize) {
  if (source.waterHaloPixels instanceof Uint8Array
      && Number.isInteger(source.waterHaloRadius)
      && source.waterHaloRadius >= 0
      && source.waterHaloSize === chunkSize + source.waterHaloRadius * 2
      && source.waterHaloPixels.length === source.waterHaloSize ** 2) {
    return {
      distance: distanceField(source.waterHaloPixels, source.waterHaloSize),
      size: source.waterHaloSize,
      radius: source.waterHaloRadius,
    };
  }
  return {
    distance: distanceField(localWaterMask(source.surfaceMaskPixels, chunkSize), chunkSize),
    size: chunkSize,
    radius: 0,
  };
}

function sampleCanopy(source, x, z, resolution) {
  const pixels = source.canopyPixels;
  const size = source.canopySize;
  if (!pixels || !Number.isInteger(size) || size < 1) return 0;
  // Both grids are edge-aligned (forestFloorTexture.js), so their edges coincide.
  const along = resolution > 1 ? (size - 1) / (resolution - 1) : 0;
  const sampleX = clamp(Math.round(x * along), 0, size - 1);
  const sampleZ = clamp(Math.round(z * along), 0, size - 1);
  // Four bytes a texel: R is the canopy, G the contact shade the streamed ground
  // also reads (see `StylizedSurfaceViewBase.paintContactShade`). The stride is the
  // whole contract between the two — a one-byte stride here would read the canopy
  // out of the alpha bytes and shade a forest by nothing.
  return pixels[(sampleZ * size + sampleX) * 4] / 255;
}

export function captureTerrainMaterialBakeSource({
  page,
  chunkSize = Math.round(Math.sqrt(page?.surfaceMaskPixels?.length / 4)),
  pageAt = null,
  canopyPixels = null,
  canopySize = 0,
  waterHaloPixels = null,
  waterHaloSize = 0,
  waterHaloRadius = 0,
}) {
  if (!(page?.tilePixels instanceof Uint8Array)
      || !(page.surfaceMaskPixels instanceof Uint8Array)
      || !(page.heights instanceof Float32Array)) {
    throw new Error('Terrain material bake source requires committed tile, surface-mask and height arrays.');
  }
  return Object.freeze({
    originX: page.originX,
    originZ: page.originZ,
    // The neighbours' border cells, for an edge-aligned bake (TerrainMaterialBakeSourcePad.js).
    padded: padTerrainMaterialBakeSource({ page, chunkSize, pageAt }),
    tilePixels: page.tilePixels.slice(),
    // Tile ids are the Azgaar biome ids: snow cover follows glacier and tundra.
    tiles: page.tiles ? Uint8Array.from(page.tiles) : null,
    snowBiomeCover: page.snowBiomeCover instanceof Uint8Array ? page.snowBiomeCover.slice() : null,
    aridEcotone: page.aridEcotone instanceof Uint8Array ? page.aridEcotone.slice() : null,
    envField: page.envField instanceof Uint8Array ? page.envField.slice() : null,
    surfaceMaskPixels: page.surfaceMaskPixels.slice(),
    heights: page.heights.slice(),
    canopyPixels: canopyPixels instanceof Uint8Array ? canopyPixels.slice() : null,
    canopySize: Number.isInteger(canopySize) ? canopySize : 0,
    waterHaloPixels: waterHaloPixels instanceof Uint8Array ? waterHaloPixels.slice() : null,
    waterHaloSize: Number.isInteger(waterHaloSize) ? waterHaloSize : 0,
    waterHaloRadius: Number.isInteger(waterHaloRadius) ? waterHaloRadius : 0,
  });
}

export async function yieldTerrainMaterialBake() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    await globalThis.scheduler.yield();
    return;
  }
  if (typeof globalThis.setImmediate === 'function') {
    await new Promise((resolve) => globalThis.setImmediate(resolve));
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function bakeTerrainMaterialPage({
  source,
  descriptor,
  config,
  chunkSize,
  tileSize,
  worldSeed = 0,
  materialStyle = null,
  yieldControl = yieldTerrainMaterialBake,
}) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const resolution = config.qualityTiers[descriptor.quality].resolution;
  const texelCount = resolution * resolution;
  const macroTint = new Uint8Array(texelCount * 4);
  const terrainShapePixels = new Uint16Array(texelCount * 2);
  const materialWeights = new Uint8Array(texelCount * 4);
  const wetnessShoreline = new Uint8Array(texelCount * 2);
  const farColor = new Uint8Array(texelCount * 4);
  const farNormal = new Int8Array(texelCount * 2);
  const canopyWater = new Uint8Array(texelCount * 2);
  const heights = new Float32Array(texelCount);
  const slopes = new Float32Array(texelCount);
  const gradientsX = new Float32Array(texelCount);
  const gradientsZ = new Float32Array(texelCount);
  const curvatures = new Float32Array(texelCount);
  const sourceIndices = new Uint32Array(texelCount);
  const waterSource = waterDistanceSource(source, chunkSize);
  // Cell arrays with the neighbours' border; a source captured without one pads by clamping.
  const padded = source.padded ?? padTerrainMaterialBakeSource({ page: source, chunkSize });
  const { pad, size: paddedSize } = padded;
  const rowsPerYield = config.build.rowsPerYield;
  const farStyle = createTerrainMaterialFarStyle(materialStyle, config.render, config.families?.substrates,
    config.classification?.glacierCover);

  for (let z = 0; z < resolution; z += 1) {
    const sourceZ = texelSourceCell(texelCellPosition(z, resolution, chunkSize), chunkSize, pad);
    for (let x = 0; x < resolution; x += 1) {
      const sourceX = texelSourceCell(texelCellPosition(x, resolution, chunkSize), chunkSize, pad);
      const index = z * resolution + x;
      const sourceIndex = sourceZ * paddedSize + sourceX;
      const shape = terrainShape(padded.heights, paddedSize, tileSize, sourceX, sourceZ);
      sourceIndices[index] = sourceIndex;
      heights[index] = shape.center;
      slopes[index] = shape.slope;
      gradientsX[index] = shape.dx;
      gradientsZ[index] = shape.dz;
      curvatures[index] = shape.curvature;
      terrainShapePixels[index * 2] = floatToHalf(shape.slope);
      terrainShapePixels[index * 2 + 1] = floatToHalf(shape.curvature);
      const [normalX, normalZ] = octNormal(shape.dx, shape.dz);
      farNormal[index * 2] = normalX;
      farNormal[index * 2 + 1] = normalZ;
    }
    if ((z + 1) % rowsPerYield === 0 && z + 1 < resolution) await yieldControl();
  }

  const classification = config.classification;
  const macro = config.macro;
  const macroSeed = terrainBakeMacroSeed(macro.seedOffset, worldSeed);

  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = z * resolution + x;
      const sourceIndex = sourceIndices[index];
      // Chunk-local cell (0..chunkSize: the far edge is the neighbour's first cell).
      const sourceX = sourceIndex % paddedSize - pad;
      const sourceZ = Math.floor(sourceIndex / paddedSize) - pad;
      const sourceOffset = sourceIndex * 4;
      const cellX = texelCellPosition(x, resolution, chunkSize);
      const cellZ = texelCellPosition(z, resolution, chunkSize);
      const path = padded.surfaceMaskPixels[sourceOffset] / 255;
      const grassCoverage = sampleSurfaceMaskChannel(padded.surfaceMaskPixels, paddedSize, paddedSize,
        cellX + pad, cellZ + pad, 1);
      const waterByte = padded.surfaceMaskPixels[sourceOffset + 2];
      const waterCoverage = waterByte / 255;
      const slope = slopes[index];
      const height = heights[index];
      const land = 1 - waterCoverage;
      const worldX = (source.originX + cellX) * tileSize;
      const worldZ = -(source.originZ + cellZ) * tileSize;
      const envOffset = padded.envField ? sourceIndex * ENV_CHANNEL_COUNT : -1;
      const envSolar = envOffset >= 0 ? padded.envField[envOffset + ENV_CHANNELS.SOLAR] / 255 : 0.5;
      const envTemp = envOffset >= 0 ? (padded.envField[envOffset + ENV_CHANNELS.TEMP] / 255) * 2 - 1 : undefined;
      const envMoist = envOffset >= 0 ? padded.envField[envOffset + ENV_CHANNELS.MOISTURE] / 255 : null;
      const envGeo = envOffset >= 0 ? padded.envField[envOffset + ENV_CHANNELS.GEOLOGY] / 255 : null;
      const slopeRock = smoothstep(classification.rockSlopeStart, classification.rockSlopeFull, slope) * land;
      const talusConcavity = envOffset >= 0 ? smoothstep(-0.002, -0.025, curvatures[index]) : 0;
      const talusSlope = smoothstep(classification.rockSlopeStart * 0.45, classification.rockSlopeFull * 0.85, slope);
      const talusRock = talusConcavity * talusSlope * land * 0.65;
      const rock = Math.max(slopeRock, talusRock);
      const snow = snowAtPoint({
        height,
        slope,
        dx: gradientsX[index],
        dz: gradientsZ[index],
        curvature: curvatures[index],
        tileId: padded.tiles ? padded.tiles[sourceIndex] : -1,
        biomeCover: padded.snowBiomeCover ? padded.snowBiomeCover[sourceIndex] / 255 : undefined,
        solarExposure: envSolar,
        temperature: envTemp,
        worldX,
        worldZ,
        // The mask's continuous dry share, not the binary water class: cut by
        // that, snow ended at every shore along the cell staircase.
      }, classification, macroSeed) * smoothstep(0.25, 0.85, padded.surfaceMaskPixels[sourceOffset + 3] / 255);
      const grass = grassCoverage * (1 - path) * (1 - rock) * (1 - snow) * land;
      // Bare bed under water as well as bare land: with snow no longer cut by the
      // water class, a wet cell must still weigh dirt against it.
      const dirt = Math.max(path, 1 - grassCoverage) * (1 - rock) * (1 - snow);
      const weightTotal = grass + dirt + rock + snow;
      const inverseWeightTotal = weightTotal > 1e-9 ? 1 / weightTotal : 0;
      const grassWeight = weightTotal > 1e-9 ? grass * inverseWeightTotal : 0;
      const dirtWeight = weightTotal > 1e-9 ? dirt * inverseWeightTotal : 1;
      const rockWeight = weightTotal > 1e-9 ? rock * inverseWeightTotal : 0;
      const snowWeight = weightTotal > 1e-9 ? snow * inverseWeightTotal : 0;
      encodeTerrainMaterialWeights(
        materialWeights,
        index * 4,
        grassWeight,
        dirtWeight,
        rockWeight,
        snowWeight,
      );

      const waterLimit = waterSource.size - waterSource.radius - 1;
      const waterIndex = (Math.min(sourceZ, waterLimit) + waterSource.radius) * waterSource.size
        + Math.min(sourceX, waterLimit) + waterSource.radius;
      const waterDistanceCells = waterSource.distance[waterIndex];
      const shoreline = clamp01(1 - waterDistanceCells / classification.shorelineRadiusCells);
      const wetness = terrainWetlandWetness(Math.max(
        waterCoverage,
        clamp01(1 - waterDistanceCells / classification.wetnessRadiusCells),
      ), padded.tilePixels[sourceOffset + 3], slope);
      const canopy = sampleCanopy(source, x, z, resolution);
      wetnessShoreline[index * 2] = Math.round(wetness * 255);
      wetnessShoreline[index * 2 + 1] = Math.round(shoreline * 255);
      canopyWater[index * 2] = Math.round(canopy * 255);
      canopyWater[index * 2 + 1] = waterByte;

      const macroBase = valueNoise(worldX, worldZ, macro.scaleMeters, macroSeed) * 2 - 1;
      const geoShift = envGeo !== null ? (envGeo - 0.5) * 0.09 : 0;
      const moistShade = envMoist !== null ? 1 - Math.max(0, envMoist - 0.45) * 0.12 : 1;
      const macroRed = (1 + macroBase * macro.strength + geoShift) * moistShade;
      const macroGreen = (1
        + (valueNoise(worldX, worldZ, macro.scaleMeters, macroSeed + 17) * 2 - 1)
          * macro.strength * 0.72 + geoShift * 0.35) * moistShade;
      const macroBlue = (1
        + (valueNoise(worldX, worldZ, macro.scaleMeters, macroSeed + 31) * 2 - 1)
          * macro.strength * 0.55 - geoShift * 0.65) * moistShade;
      macroTint[index * 4] = Math.round(clamp01(macroRed * 0.5) * 255);
      macroTint[index * 4 + 1] = Math.round(clamp01(macroGreen * 0.5) * 255);
      macroTint[index * 4 + 2] = Math.round(clamp01(macroBlue * 0.5) * 255);
      macroTint[index * 4 + 3] = padded.aridEcotone ? padded.aridEcotone[sourceIndex] : 255;

      const heightShade = clamp(
        1 + height * macro.heightShadeScale,
        macro.minHeightShade,
        macro.maxHeightShade,
      );
      if (farStyle) {
        encodeTerrainMaterialFarColor(
          farColor,
          index * 4,
          padded.tilePixels,
          sourceOffset,
          farStyle,
          grassWeight,
          dirtWeight,
          rockWeight,
          snowWeight,
          macroRed,
          macroGreen,
          macroBlue,
          shoreline,
          wetness,
          canopy,
          heightShade,
          path,
        );
      } else {
        const wetShade = 1 - wetness * macro.wetDarkening;
        farColor[index * 4] = Math.round(clamp(
          padded.tilePixels[sourceOffset] * macroRed * heightShade * wetShade,
          0,
          255,
        ));
        farColor[index * 4 + 1] = Math.round(clamp(
          padded.tilePixels[sourceOffset + 1] * macroGreen * heightShade * wetShade,
          0,
          255,
        ));
        farColor[index * 4 + 2] = Math.round(clamp(
          padded.tilePixels[sourceOffset + 2] * macroBlue * heightShade * wetShade,
          0,
          255,
        ));
        farColor[index * 4 + 3] = 255;
      }
    }
    if ((z + 1) % rowsPerYield === 0 && z + 1 < resolution) await yieldControl();
  }

  const channels = Object.freeze({
    macroTint,
    terrainShape: terrainShapePixels,
    materialWeights,
    wetnessShoreline,
    farColor,
    farNormal,
    canopyWater,
  });
  const byteLength = Object.values(channels).reduce(
    (total, pixels) => total + pixels.byteLength,
    0,
  );
  const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Object.freeze({
    value: Object.freeze({
      descriptor,
      resolution,
      channels,
      durationMs: Math.max(0, finishedAt - startedAt),
    }),
    byteLength,
  });
}
