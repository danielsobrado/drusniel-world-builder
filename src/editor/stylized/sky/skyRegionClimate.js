import { valueNoise } from '../../world/valueNoise2d.js';
import { ringPoints } from '../../world/sampleTilesAround.js';

/**
 * What kind of country the sky is over, sampled at two scales.
 *
 * The macro rings (kilometres out) decide the region's character, so skies
 * change a lot between distant parts of the map; the local rings (a few hundred
 * metres) only nudge it, so walking across a field shifts the air slightly.
 * Two noise octaves add a personality per area — hazier, warmer, cloudier,
 * mistier, and which form its clouds take — that is large and slow over tens
 * of kilometres and small over one or two. The air's moisture and temperature
 * come from the country around (and cool with height), so a mountain range
 * above rainforest wears mist while one above desert stands in clear air.
 * Pure: biomes come from a callback, nothing is stored.
 */

export const SKY_CLIMATES = Object.freeze(['temperate', 'boreal', 'arid', 'tropical', 'wetland', 'coastal', 'alpine']);

// Azgaar standard biome ids (AzgaarBiomeCatalog). Snowy biomes cool the sky
// through SnowCountryWeight already; here tundra and glacier read as boreal air.
const BIOME_CLIMATE = Object.freeze({
  0: { coastal: 1 },
  1: { arid: 1 },
  2: { arid: 0.6, boreal: 0.4 },
  3: { arid: 0.7, tropical: 0.3 },
  4: { temperate: 1 },
  5: { tropical: 1 },
  6: { temperate: 1 },
  7: { tropical: 1 },
  8: { wetland: 0.5, temperate: 0.5 },
  9: { boreal: 1 },
  10: { boreal: 1 },
  11: { boreal: 1 },
  12: { wetland: 1 },
});

// Moisture and temperature, 0..1, of each Azgaar biome's air.
const BIOME_AIR = Object.freeze({
  0: [0.9, 0.5], // marine
  1: [0, 1], // hot desert
  2: [0.1, 0.3], // cold desert
  3: [0.3, 0.9], // savanna
  4: [0.45, 0.6], // grassland
  5: [0.7, 0.9], // tropical seasonal forest
  6: [0.6, 0.55], // temperate deciduous forest
  7: [1, 0.95], // tropical rainforest
  8: [0.95, 0.5], // temperate rainforest
  9: [0.55, 0.2], // taiga
  10: [0.4, 0.05], // tundra
  11: [0.3, 0], // glacier
  12: [1, 0.5], // wetland
});
/** How much colder the air is on fully alpine ground. */
const ALPINE_COOLING = 0.3;
export const NEUTRAL_AIR = Object.freeze({ moisture: 0.5, temperature: 0.5 });

/** Mean moisture and temperature over a list of biome ids (unknown ids skipped). */
export function airOf(biomes) {
  let moisture = 0;
  let temperature = 0;
  let count = 0;
  for (const biome of biomes) {
    const air = BIOME_AIR[biome];
    if (!air) continue;
    moisture += air[0];
    temperature += air[1];
    count += 1;
  }
  return count ? { moisture: moisture / count, temperature: temperature / count } : { ...NEUTRAL_AIR };
}

export const MACRO_RINGS = Object.freeze([3000, 9000, 24000]);
export const LOCAL_RINGS = Object.freeze([0, 120, 400]);
export const LOCAL_SHARE = 0.22;
const DIRECTIONS = 8;
const LARGE_WAVELENGTH = 30000;
const SMALL_WAVELENGTH = 1500;
const SMALL_AMPLITUDE = 0.25;
const ALPINE_START = 600;
const ALPINE_FULL = 1800;

function emptyWeights() {
  return Object.fromEntries(SKY_CLIMATES.map((climate) => [climate, 0]));
}

/** Normalised climate weights for a list of biome ids (unknown ids are skipped). */
export function climateWeights(biomes) {
  const weights = emptyWeights();
  let total = 0;
  for (const biome of biomes) {
    const share = BIOME_CLIMATE[biome];
    if (!share) continue;
    for (const [climate, amount] of Object.entries(share)) weights[climate] += amount;
    total += 1;
  }
  if (total === 0) return { ...emptyWeights(), temperate: 1 };
  for (const climate of SKY_CLIMATES) weights[climate] /= total;
  return weights;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Per-area character in [-1, 1]: big over tens of kilometres, small over one or two. */
export function skyPersonality(x, z, seed = 0) {
  const octave = (salt) => valueNoise(x / LARGE_WAVELENGTH, z / LARGE_WAVELENGTH, seed + salt)
    + SMALL_AMPLITUDE * valueNoise(x / SMALL_WAVELENGTH, z / SMALL_WAVELENGTH, seed + salt + 101);
  const scale = 1 / (1 + SMALL_AMPLITUDE);
  return Object.freeze({
    haze: octave(11) * scale,
    warmth: octave(23) * scale,
    cloudiness: octave(37) * scale,
    mist: octave(53) * scale,
    cloudForm: octave(71) * scale,
  });
}

function sampleBiomes(getBiome, tileSize, x, z, rings) {
  const biomes = [];
  for (const point of ringPoints({ x, z, rings, directions: DIRECTIONS })) {
    const biome = getBiome(Math.floor(point.x / tileSize), Math.floor(-point.z / tileSize));
    if (Number.isInteger(biome)) biomes.push(biome);
  }
  return biomes;
}

/**
 * The sky region at a canonical point.
 *
 * @param {object} options
 * @param {(cellX: number, cellZ: number) => number|null} options.getBiome
 * @param {number} options.tileSize
 * @param {number} options.x canonical metres
 * @param {number} options.z canonical metres
 * @param {number} [options.heightAboveSea] metres, for thin alpine air
 * @param {number} [options.seed]
 */
export function skyRegionAt({ getBiome, tileSize, x, z, heightAboveSea = 0, seed = 0 }) {
  const macroBiomes = sampleBiomes(getBiome, tileSize, x, z, MACRO_RINGS);
  const localBiomes = sampleBiomes(getBiome, tileSize, x, z, LOCAL_RINGS);
  const macro = climateWeights(macroBiomes);
  const local = climateWeights(localBiomes);
  const alpine = smoothstep(ALPINE_START, ALPINE_FULL, heightAboveSea);
  const weights = emptyWeights();
  for (const climate of SKY_CLIMATES) {
    weights[climate] = (macro[climate] * (1 - LOCAL_SHARE) + local[climate] * LOCAL_SHARE) * (1 - alpine);
  }
  weights.alpine += alpine;
  // The air comes from the country below the mountains too: alpine weight
  // replaces their climate, not their moisture.
  const macroAir = airOf(macroBiomes);
  const localAir = airOf(localBiomes);
  const air = Object.freeze({
    moisture: macroAir.moisture * (1 - LOCAL_SHARE) + localAir.moisture * LOCAL_SHARE,
    temperature: Math.max(0, macroAir.temperature * (1 - LOCAL_SHARE) + localAir.temperature * LOCAL_SHARE
      - alpine * ALPINE_COOLING),
  });
  return Object.freeze({ weights: Object.freeze(weights), personality: skyPersonality(x, z, seed), air });
}

export const NEUTRAL_SKY_REGION = Object.freeze({
  weights: Object.freeze({ ...emptyWeights(), temperate: 1 }),
  personality: Object.freeze({ haze: 0, warmth: 0, cloudiness: 0, mist: 0, cloudForm: 0 }),
  air: NEUTRAL_AIR,
});
