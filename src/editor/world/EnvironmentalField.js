import { valueNoise } from './valueNoise2d.js';
import { hexToRgbBytes } from '../tileCatalog.js';
import { resolveBiomePriorForTile } from './EnvironmentalFieldConfig.js';

/**
 * Packed 8-byte-per-cell continuous environmental fields for a chunk.
 * Logical Azgaar biome IDs stay untouched in `page.tiles`; visual rendering,
 * snow accumulation, soil appearance, and vegetation density read these fields.
 */
export const ENV_CHANNELS = Object.freeze({
  TEMP: 0,
  MOISTURE: 1,
  WIND: 2,
  SOLAR: 3,
  FERTILITY: 4,
  GEOLOGY: 5,
  SNOW_COVER: 6,
  ARID_CODE: 7,
});

export const ENV_CHANNEL_COUNT = 8;

const SALT_WIDTH = 0x41b7;
const SALT_WARP_X = 0x91e3;
const SALT_WARP_Z = 0xa2f1;
const SALT_TEMP = 0x29c5;
const SALT_MOIST = 0x63d1;
const SALT_FERT = 0x7b19;
const SALT_GEO = 0x8e47;
const SALT_SNOW_A = 0x55a1;
const SALT_SNOW_B = 0x77c3;
const SALT_ARID = 0x3c9d;

function clamp(value, minimum, maximum) {
  return value < minimum ? minimum : (value > maximum ? maximum : value);
}

function clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** O(1)-per-cell separable box blur run twice (tent kernel) over `size × size`. */
export function tentBlurField(values, size, radius, out = null, scratch = null) {
  const length = size * size;
  const target = out ?? new Float32Array(length);
  const temp = scratch ?? new Float32Array(length);
  if (target !== values) target.set(values);
  const r = Math.max(0, radius | 0);
  if (r === 0 || size <= 1) return target;
  const windowSize = r * 2 + 1;

  const boxPass = (from, to, stride, step) => {
    for (let line = 0; line < size; line += 1) {
      const start = line * stride;
      let sum = 0;
      for (let k = -r; k <= r; k += 1) {
        sum += from[start + clamp(k, 0, size - 1) * step];
      }
      for (let i = 0; i < size; i += 1) {
        to[start + i * step] = sum / windowSize;
        sum += from[start + clamp(i + r + 1, 0, size - 1) * step]
          - from[start + clamp(i - r, 0, size - 1) * step];
      }
    }
  };

  for (let pass = 0; pass < 2; pass += 1) {
    boxPass(target, temp, size, 1);
    boxPass(temp, target, 1, size);
  }
  return target;
}

function sampleBilinear(field, size, x, z) {
  const fx = clamp(x, 0, size - 1);
  const fz = clamp(z, 0, size - 1);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(size - 1, x0 + 1);
  const z1 = Math.min(size - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const top = lerp(field[z0 * size + x0], field[z0 * size + x1], tx);
  const bottom = lerp(field[z1 * size + x0], field[z1 * size + x1], tx);
  return lerp(top, bottom, tz);
}

function weightedBlurPair(halo, size, includeFn, valueFn, minRadius, maxRadius, shareFields, scratch) {
  const length = halo.length;
  const raw = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    raw[i] = includeFn(halo[i]) ? valueFn(halo[i]) : 0;
  }
  const crisp = tentBlurField(raw, size, minRadius, new Float32Array(length), scratch);
  const wide = tentBlurField(raw, size, maxRadius, raw, scratch);
  if (shareFields) {
    for (let i = 0; i < length; i += 1) {
      if (shareFields.crisp[i] > 1e-6) crisp[i] /= shareFields.crisp[i];
      if (shareFields.wide[i] > 1e-6) wide[i] /= shareFields.wide[i];
    }
  }
  return { crisp, wide };
}

function buildHaloTopography({
  haloSize,
  searchRadius,
  chunkSize,
  originX,
  originZ,
  tileSize,
  heights,
  sampleHeight,
}) {
  const cellCount = haloSize * haloSize;
  const cellHeight = new Float32Array(cellCount);
  const dx = new Float32Array(cellCount);
  const dz = new Float32Array(cellCount);
  const slope = new Float32Array(cellCount);
  const curvature = new Float32Array(cellCount);

  if (!heights && typeof sampleHeight !== 'function') {
    return { height: cellHeight, dx, dz, slope, curvature };
  }

  const vSize = haloSize + 1;
  const vHeights = new Float32Array(vSize * vSize);
  for (let vz = 0; vz < vSize; vz += 1) {
    const cz = originZ + vz - searchRadius;
    const lz = vz - searchRadius;
    for (let vx = 0; vx < vSize; vx += 1) {
      const cx = originX + vx - searchRadius;
      const lx = vx - searchRadius;
      let h;
      if (heights && lx >= 0 && lz >= 0 && lx <= chunkSize && lz <= chunkSize) {
        h = heights[lz * (chunkSize + 1) + lx];
      } else if (sampleHeight) {
        h = sampleHeight(cx, cz);
      } else if (heights) {
        const clx = clamp(lx, 0, chunkSize);
        const clz = clamp(lz, 0, chunkSize);
        h = heights[clz * (chunkSize + 1) + clx];
      } else {
        h = 0;
      }
      vHeights[vz * vSize + vx] = Number.isFinite(h) ? h : 0;
    }
  }

  const invTwoTile = 1 / (2 * tileSize);
  const invTileSq = 1 / (tileSize * tileSize);
  for (let z = 0; z < haloSize; z += 1) {
    for (let x = 0; x < haloSize; x += 1) {
      const idx = z * haloSize + x;
      const tl = vHeights[z * vSize + x];
      const tr = vHeights[z * vSize + x + 1];
      const bl = vHeights[(z + 1) * vSize + x];
      const br = vHeights[(z + 1) * vSize + x + 1];
      cellHeight[idx] = (tl + tr + bl + br) * 0.25;
      const gx = (tr + br - tl - bl) * invTwoTile;
      const gz = (bl + br - tl - tr) * invTwoTile;
      dx[idx] = gx;
      dz[idx] = gz;
      slope[idx] = Math.hypot(gx, gz);
    }
  }
  for (let z = 0; z < haloSize; z += 1) {
    const cz = clamp(z, 1, haloSize - 2);
    for (let x = 0; x < haloSize; x += 1) {
      const cx = clamp(x, 1, haloSize - 2);
      const center = cellHeight[cz * haloSize + cx];
      const lap = cellHeight[cz * haloSize + cx - 1]
        + cellHeight[cz * haloSize + cx + 1]
        + cellHeight[(cz - 1) * haloSize + cx]
        + cellHeight[(cz + 1) * haloSize + cx]
        - center * 4;
      curvature[z * haloSize + x] = lap * invTileSq;
    }
  }
  return { height: cellHeight, dx, dz, slope, curvature };
}

/**
 * Computes continuous per-cell environmental fields, wide variable-width organic
 * biome ecotones, thermal-clash buffer soil, and climate-modulated snow/soil
 * outputs for a streamed terrain page.
 */
export function buildChunkEnvironmentalField({
  halo,
  haloSize,
  searchRadius,
  chunkSize,
  originX,
  originZ,
  tileSize = 2,
  worldSeed = 0,
  heights = null,
  water = null,
  sampleHeight = null,
  sampleEnvironmentClimate = null,
  tileColor = null,
  aridKinds = null,
  snowCoverByTile = null,
  roadTileId = 13,
  waterTileId = 0,
  seaLevel = -1.5,
  environmentConfig,
  biomeLooks = null,
  tilePixelsOut = null,
  tiles = null,
}) {
  const env = environmentConfig;
  const { climate, ecotone } = env;
  const length = haloSize * haloSize;
  const scratch = new Float32Array(length);
  const topo = buildHaloTopography({
    haloSize,
    searchRadius,
    chunkSize,
    originX,
    originZ,
    tileSize,
    heights,
    sampleHeight,
  });

  const blends = (t) => t !== waterTileId && t !== roadTileId;
  const hasExcluded = halo.some((t) => !blends(t));
  let shareFields = null;
  if (hasExcluded) {
    const mask = new Float32Array(length);
    for (let i = 0; i < length; i += 1) mask[i] = blends(halo[i]) ? 1 : 0;
    shareFields = {
      crisp: tentBlurField(mask, haloSize, ecotone.minRadiusCells, new Float32Array(length), scratch),
      wide: tentBlurField(mask, haloSize, ecotone.maxRadiusCells, mask, scratch),
    };
  }

  const priors = new Map();
  const priorOf = (tileId) => {
    let p = priors.get(tileId);
    if (!p) {
      p = resolveBiomePriorForTile(tileId, env, biomeLooks);
      priors.set(tileId, p);
    }
    return p;
  };

  const tempPriors = weightedBlurPair(halo, haloSize, blends, (t) => priorOf(t).temperature, ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);
  const moistPriors = weightedBlurPair(halo, haloSize, blends, (t) => priorOf(t).moisture, ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);
  const fertPriors = weightedBlurPair(halo, haloSize, blends, (t) => priorOf(t).fertility, ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);
  const geoPriors = weightedBlurPair(halo, haloSize, blends, (t) => priorOf(t).geology, ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);

  const snowRead = (t) => (snowCoverByTile ? (snowCoverByTile[t] ?? 0) : 0);
  const hasSnowBiome = snowCoverByTile && Object.keys(snowCoverByTile).length > 0;
  const snowPriors = hasSnowBiome
    ? weightedBlurPair(halo, haloSize, (t) => t !== roadTileId, snowRead, ecotone.minRadiusCells, ecotone.maxRadiusCells, null, scratch)
    : null;
  const coldPriors = weightedBlurPair(
    halo,
    haloSize,
    blends,
    (t) => (priorOf(t).temperature < -0.25 || snowRead(t) > 0.25 ? 1 : 0),
    ecotone.minRadiusCells,
    ecotone.maxRadiusCells,
    shareFields,
    scratch,
  );

  const sandSet = new Set(aridKinds?.sand ?? []);
  const mineralSet = new Set(aridKinds?.mineral ?? []);
  const hasSand = sandSet.size > 0 && halo.some((t) => sandSet.has(t));
  const hasMineral = mineralSet.size > 0 && halo.some((t) => mineralSet.has(t));
  const sandPriors = hasSand
    ? weightedBlurPair(halo, haloSize, blends, (t) => (sandSet.has(t) ? 1 : 0), ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch)
    : null;
  const mineralPriors = hasMineral
    ? weightedBlurPair(halo, haloSize, blends, (t) => (mineralSet.has(t) ? 1 : 0), ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch)
    : null;

  let soilR = null;
  let soilG = null;
  let soilB = null;
  if (tilePixelsOut && tileColor) {
    soilR = weightedBlurPair(halo, haloSize, blends, (t) => tileColor(t)[0], ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);
    soilG = weightedBlurPair(halo, haloSize, blends, (t) => tileColor(t)[1], ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);
    soilB = weightedBlurPair(halo, haloSize, blends, (t) => tileColor(t)[2], ecotone.minRadiusCells, ecotone.maxRadiusCells, shareFields, scratch);
  }

  // Water distance inside halo for riparian capillary moisture.
  const waterReach = climate.waterMoistureReachCells;
  const waterDist = water ? new Float32Array(length) : null;
  if (waterDist) {
    for (let i = 0; i < length; i += 1) waterDist[i] = water[i] > 0.25 ? 0 : 1e9;
    for (let z = 0; z < haloSize; z += 1) {
      for (let x = 0; x < haloSize; x += 1) {
        const i = z * haloSize + x;
        let d = waterDist[i];
        if (x > 0) d = Math.min(d, waterDist[i - 1] + 1);
        if (z > 0) d = Math.min(d, waterDist[i - haloSize] + 1);
        waterDist[i] = d;
      }
    }
    for (let z = haloSize - 1; z >= 0; z -= 1) {
      for (let x = haloSize - 1; x >= 0; x -= 1) {
        const i = z * haloSize + x;
        let d = waterDist[i];
        if (x + 1 < haloSize) d = Math.min(d, waterDist[i + 1] + 1);
        if (z + 1 < haloSize) d = Math.min(d, waterDist[i + haloSize] + 1);
        waterDist[i] = d;
      }
    }
  }

  const haloTemp = new Float32Array(length);
  const haloSolar = new Float32Array(length);
  const haloMoisture = new Float32Array(length);
  const haloFertility = new Float32Array(length);
  const haloSnowCover = new Float32Array(length);
  const haloWidthFactor = new Float32Array(length);
  const envField = new Uint8Array(chunkSize * chunkSize * ENV_CHANNEL_COUNT);
  const aridEcotone = new Uint8Array(chunkSize * chunkSize);
  aridEcotone.fill(128);
  let hasAridEcotone = false;

  const [solarX, solarZ] = climate.solarDirection;
  const [windX, windZ] = climate.prevailingWind;
  const { macroMeters, mesoMeters, geologyMeters, temperatureSwing, moistureSwing, fertilitySwing } = climate.variation;
  const steppeRgb = hexToRgbBytes(ecotone.thermalSteppeSoil);
  const climateScratch = { temperature: 0, moisture: 0.5, fertility: 0.5, valid: false };
  const seed = worldSeed | 0;

  for (let z = 0; z < haloSize; z += 1) {
    const cellZ = originZ + z - searchRadius;
    const localZ = z - searchRadius;
    const worldZ = -(cellZ + 0.5) * tileSize;
    for (let x = 0; x < haloSize; x += 1) {
      const i = z * haloSize + x;
      const cellX = originX + x - searchRadius;
      const localX = x - searchRadius;
      const worldX = (cellX + 0.5) * tileSize;
      const inside = localX >= 0 && localZ >= 0 && localX < chunkSize && localZ < chunkSize;

      const s = topo.slope[i];
      const dx = topo.dx[i];
      const dz = topo.dz[i];
      const curv = topo.curvature[i];
      const h = topo.height[i];

      // Variable ecotone width & canonical domain warp.
      const widthNoise = valueNoise(worldX / ecotone.widthScaleMeters, worldZ / ecotone.widthScaleMeters, seed ^ SALT_WIDTH) * 0.5 + 0.5;
      const slopeNarrow = 1 / (1 + s * s * 6);
      const widthFactor = clamp01(widthNoise * slopeNarrow);
      haloWidthFactor[i] = widthFactor;
      const warpX = (
        valueNoise(worldX / ecotone.warpMeters + 3.1, worldZ / ecotone.warpMeters - 1.7, seed ^ SALT_WARP_X) * 0.7
        + valueNoise(worldX / (ecotone.warpMeters * 0.42) + 8.3, worldZ / (ecotone.warpMeters * 0.42) - 4.1, seed ^ (SALT_WARP_X + 17)) * 0.3
      ) * ecotone.warpReachCells * (0.35 + 0.65 * widthFactor);
      const warpZ = (
        valueNoise(worldX / ecotone.warpMeters - 5.3, worldZ / ecotone.warpMeters + 2.9, seed ^ SALT_WARP_Z) * 0.7
        + valueNoise(worldX / (ecotone.warpMeters * 0.42) - 2.7, worldZ / (ecotone.warpMeters * 0.42) + 6.9, seed ^ (SALT_WARP_Z + 17)) * 0.3
      ) * ecotone.warpReachCells * (0.35 + 0.65 * widthFactor);
      const wx = x + warpX;
      const wz = z - warpZ;
      const ecotoneMix = (pair) => lerp(pair.crisp[i], sampleBilinear(pair.wide, haloSize, wx, wz), widthFactor);

      // Solar exposure: equator-facing normal (-dx, -dz) · solarDirection.
      const solarDot = -(dx * solarX + dz * solarZ);
      const solar = clamp01(0.5 + solarDot * 0.65);
      haloSolar[i] = solar;

      // Wind exposure: windward > 0, lee < 0, boosted on exposed ridges.
      const slopeLen = Math.hypot(dx, dz);
      const windAlign = slopeLen > 1e-6 ? (dx * windX + dz * windZ) / slopeLen : 0;
      const wind = clamp(windAlign * Math.min(1, s * 2.2) * climate.windExposureGain - curv * 1.4, -1, 1);

      const macroTempNoise = valueNoise(worldX / macroMeters, worldZ / macroMeters, seed ^ SALT_TEMP);
      const mesoMoistNoise = valueNoise(worldX / mesoMeters, worldZ / mesoMeters, seed ^ SALT_MOIST);
      const mesoFertNoise = valueNoise(worldX / mesoMeters, worldZ / mesoMeters, seed ^ SALT_FERT);
      const geoNoise = valueNoise(worldX / geologyMeters, worldZ / geologyMeters, seed ^ SALT_GEO) * 0.5 + 0.5;

      let baseTemp = ecotoneMix(tempPriors);
      let baseMoist = ecotoneMix(moistPriors);
      let baseFert = ecotoneMix(fertPriors);
      if (sampleEnvironmentClimate) {
        const gen = sampleEnvironmentClimate(cellX, cellZ, climateScratch);
        if (gen?.valid) {
          const blend = climate.generatorClimateBlend;
          baseTemp = lerp(baseTemp, gen.temperature, blend * 0.55);
          baseMoist = lerp(baseMoist, gen.moisture, blend * 0.5);
          baseFert = lerp(baseFert, gen.fertility, blend * 0.45);
        }
      }

      const lapse = Math.max(0, h - seaLevel) * 0.001 * climate.lapseRatePerKm;
      const temperature = clamp(
        baseTemp - lapse + (solar - 0.5) * 2 * climate.solarWarmth + macroTempNoise * temperatureSwing,
        -1,
        1,
      );
      haloTemp[i] = temperature;

      const riparian = waterDist && waterDist[i] < waterReach
        ? (1 - smoothstep(0, waterReach, waterDist[i])) * climate.waterMoistureGain
        : 0;
      const moisture = clamp01(
        baseMoist
          + riparian
          + clamp(curv * climate.concavityMoistureGain, -0.25, 0.35)
          - Math.max(0, solar - 0.5) * climate.solarDrying
          + mesoMoistNoise * moistureSwing,
      );
      haloMoisture[i] = moisture;

      const geology = clamp01(lerp(ecotoneMix(geoPriors), geoNoise, 0.35));
      const thermalSuitability = 1 - Math.abs(temperature - 0.15) * 0.55;
      const fertility = clamp01(
        baseFert * (0.65 + 0.55 * moisture) * clamp(thermalSuitability, 0.25, 1.1)
          - s * 0.4
          - Math.max(0, -curv) * climate.ridgeSoilLoss
          + mesoFertNoise * fertilitySwing,
      );
      haloFertility[i] = fertility;

      // Snow biome cover + patchy cold-hollow outliers + solar/thermal edge melt.
      const baseSnow = snowPriors ? ecotoneMix(snowPriors) : 0;
      const coldHollow = clamp01((0.52 - solar) * 2.1) * 0.55
        + clamp01(-wind * 1.3) * 0.25
        + clamp01(curv * 12) * 0.35;
      const outlierNoise = 0.5
        + valueNoise(worldX / 26, worldZ / 26, seed ^ SALT_SNOW_A) * 0.35
        + valueNoise(worldX / 11, worldZ / 11, seed ^ SALT_SNOW_B) * 0.15;
      const neighborCold = snowPriors
        ? smoothstep(0.02, 0.38, sampleBilinear(snowPriors.wide, haloSize, wx, wz))
          * (1 - smoothstep(0.45, 0.85, baseSnow))
        : 0;
      const tempCold = smoothstep(-0.18, -0.58, temperature) * 0.55;
      const outlierBoost = ecotone.snowOutlierStrength
        * Math.max(neighborCold, tempCold)
        * smoothstep(0.32, 0.68, outlierNoise + coldHollow * 0.38);
      const warmMelt = smoothstep(0.08, 0.42, temperature) * (1 - smoothstep(0.75, 1, baseSnow) * 0.5);
      const snowCover = clamp01((baseSnow + outlierBoost) * (1 - warmMelt * 0.75));
      haloSnowCover[i] = snowCover;

      if (!inside) continue;

      const cellIndex = localZ * chunkSize + localX;
      const tileId = tiles ? tiles[cellIndex] : halo[i];

      // Arid sand/mineral ecotone with downwind drift and hot-cold thermal clash buffer.
      const aridDriftX = wx - windX * 3.5;
      const aridDriftZ = wz + windZ * 3.5;
      const aridBreakup = valueNoise(worldX / 32, worldZ / 32, seed ^ SALT_ARID) * 0.12;
      const rawSand = sandPriors
        ? clamp01(lerp(sandPriors.crisp[i], sampleBilinear(sandPriors.wide, haloSize, aridDriftX, aridDriftZ), widthFactor) + aridBreakup * (sandPriors.wide[i] > 0.01 ? 1 : 0))
        : 0;
      const rawMineral = mineralPriors
        ? clamp01(lerp(mineralPriors.crisp[i], sampleBilinear(mineralPriors.wide, haloSize, wx, wz), widthFactor))
        : 0;
      const coldShare = ecotoneMix(coldPriors);
      const thermalClash = rawSand > 0.005
        ? clamp01(Math.max(smoothstep(0.24, -0.04, temperature), smoothstep(0.04, 0.36, coldShare)))
        : 0;
      const sandShare = rawSand * (1 - thermalClash);
      const mineralShare = clamp01(rawMineral + rawSand * thermalClash * 0.85);
      let aridCode = 128;
      if (sandShare >= mineralShare && sandShare > 0.004) {
        aridCode = 128 + Math.round(sandShare * 127);
        hasAridEcotone = true;
      } else if (mineralShare > 0.004) {
        aridCode = 128 - Math.round(mineralShare * 128);
        hasAridEcotone = true;
      }
      aridEcotone[cellIndex] = aridCode;

      const envOffset = cellIndex * ENV_CHANNEL_COUNT;
      envField[envOffset + ENV_CHANNELS.TEMP] = Math.round((temperature * 0.5 + 0.5) * 255);
      envField[envOffset + ENV_CHANNELS.MOISTURE] = Math.round(moisture * 255);
      envField[envOffset + ENV_CHANNELS.WIND] = Math.round((wind * 0.5 + 0.5) * 255);
      envField[envOffset + ENV_CHANNELS.SOLAR] = Math.round(solar * 255);
      envField[envOffset + ENV_CHANNELS.FERTILITY] = Math.round(fertility * 255);
      envField[envOffset + ENV_CHANNELS.GEOLOGY] = Math.round(geology * 255);
      envField[envOffset + ENV_CHANNELS.SNOW_COVER] = Math.round(snowCover * 255);
      envField[envOffset + ENV_CHANNELS.ARID_CODE] = aridCode;

      if (tilePixelsOut && blends(tileId)) {
        const share = shareFields ? lerp(shareFields.crisp[i], sampleBilinear(shareFields.wide, haloSize, wx, wz), widthFactor) : 1;
        if (share > 1e-6) {
          let r = ecotoneMix(soilR);
          let g = ecotoneMix(soilG);
          let b = ecotoneMix(soilB);
          // Blend into neutral steppe gravel in hot-cold clash buffer so bright sand never meets snow.
          const clashSoil = thermalClash * smoothstep(0.02, 0.45, rawSand + rawMineral);
          if (clashSoil > 0.001) {
            r = lerp(r, steppeRgb[0], clashSoil);
            g = lerp(g, steppeRgb[1], clashSoil);
            b = lerp(b, steppeRgb[2], clashSoil);
          }
          const geoShift = (geology - 0.5) * 0.12;
          const moistShade = 1 - Math.max(0, moisture - 0.45) * 0.16;
          const solarBleach = 1 + Math.max(0, solar - 0.55) * Math.max(0, 0.4 - moisture) * 0.12;
          const multR = (1 + geoShift) * moistShade * solarBleach;
          const multG = (1 + geoShift * 0.4) * moistShade * solarBleach;
          const multB = (1 - geoShift * 0.8) * moistShade * solarBleach;
          tilePixelsOut[cellIndex * 4] = Math.round(clamp(r * multR, 0, 255));
          tilePixelsOut[cellIndex * 4 + 1] = Math.round(clamp(g * multG, 0, 255));
          tilePixelsOut[cellIndex * 4 + 2] = Math.round(clamp(b * multB, 0, 255));
        }
      }
    }
  }

  return {
    envField,
    aridEcotone,
    hasAridEcotone,
    haloTemp,
    haloSolar,
    haloMoisture,
    haloFertility,
    haloSnowCover,
    haloWidthFactor,
  };
}

/**
 * Fast canonical single-point environmental query for ecology/placement callers
 * that do not hold a resident chunk's packed `envField`.
 */
export function sampleEnvironmentalPoint({
  x,
  z,
  tileSize = 2,
  worldSeed = 0,
  tileAt,
  heightAt,
  climateAt = null,
  waterDistance = Infinity,
  environmentConfig,
  biomeLooks = null,
}) {
  const env = environmentConfig;
  const { climate, ecotone } = env;
  const step = Math.max(tileSize, Math.round(ecotone.maxRadiusCells * 0.5) * tileSize);
  let sumTemp = 0;
  let sumMoist = 0;
  let sumFert = 0;
  let sumGeo = 0;
  let count = 0;
  for (let oz = -1; oz <= 1; oz += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const weight = (ox === 0 && oz === 0) ? 2 : 1;
      const cellX = Math.floor((x + ox * step) / tileSize);
      const cellZ = Math.floor(-(z + oz * step) / tileSize);
      const tileId = tileAt(cellX, cellZ);
      const p = resolveBiomePriorForTile(tileId, env, biomeLooks);
      sumTemp += p.temperature * weight;
      sumMoist += p.moisture * weight;
      sumFert += p.fertility * weight;
      sumGeo += p.geology * weight;
      count += weight;
    }
  }
  let baseTemp = sumTemp / count;
  let baseMoist = sumMoist / count;
  let baseFert = sumFert / count;
  const geology = sumGeo / count;

  if (typeof climateAt === 'function') {
    const cellX = Math.floor(x / tileSize);
    const cellZ = Math.floor(-z / tileSize);
    const gen = climateAt(cellX, cellZ);
    if (gen?.valid) {
      const blend = climate.generatorClimateBlend;
      baseTemp = lerp(baseTemp, gen.temperature, blend * 0.55);
      baseMoist = lerp(baseMoist, gen.moisture, blend * 0.5);
      baseFert = lerp(baseFert, gen.fertility, blend * 0.45);
    }
  }

  const d = tileSize * 2;
  const hCenter = heightAt ? heightAt(x, z) : 0;
  const gx = heightAt ? (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d) : 0;
  const gz = heightAt ? (heightAt(x, z - d) - heightAt(x, z + d)) / (2 * d) : 0;
  const slope = Math.hypot(gx, gz);
  const [solarX, solarZ] = climate.solarDirection;
  const solar = clamp01(0.5 - (gx * solarX + gz * solarZ) * 0.65);
  const seed = worldSeed | 0;
  const { macroMeters, mesoMeters, temperatureSwing, moistureSwing, fertilitySwing } = climate.variation;
  const tempNoise = valueNoise(x / macroMeters, z / macroMeters, seed ^ SALT_TEMP);
  const moistNoise = valueNoise(x / mesoMeters, z / mesoMeters, seed ^ SALT_MOIST);
  const fertNoise = valueNoise(x / mesoMeters, z / mesoMeters, seed ^ SALT_FERT);
  const temperature = clamp(
    baseTemp - Math.max(0, hCenter) * 0.001 * climate.lapseRatePerKm + (solar - 0.5) * 2 * climate.solarWarmth + tempNoise * temperatureSwing,
    -1,
    1,
  );
  const riparian = Number.isFinite(waterDistance) && waterDistance < climate.waterMoistureReachCells * tileSize
    ? (1 - smoothstep(0, climate.waterMoistureReachCells * tileSize, waterDistance)) * climate.waterMoistureGain
    : 0;
  const moisture = clamp01(baseMoist + riparian - Math.max(0, solar - 0.5) * climate.solarDrying + moistNoise * moistureSwing);
  const fertility = clamp01(baseFert * (0.65 + 0.55 * moisture) - slope * 0.4 + fertNoise * fertilitySwing);

  return { temperature, moisture, solar, fertility, geology, slope, height: hCenter };
}
