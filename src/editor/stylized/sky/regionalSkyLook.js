import * as THREE from 'three/webgpu';

import { SKY_CLIMATES } from './skyRegionClimate.js';

/**
 * A region's air laid over any sky look: dusty pale horizons over deserts,
 * deep crisp blue over the taiga, low grey-green mist over wetlands, humid
 * haze and heavy cloud in the tropics, bright cyan air on the coast, thin
 * clear air on the peaks. Every change is relative — a tint, a paling toward
 * the colour's own grey, a scale or a small offset — so it composes with the
 * time of day, the weather and snow country: night over a desert stays night.
 */

const IDENTITY = Object.freeze({ tint: {}, pale: {}, scale: {}, add: {} });

const CLIMATE_AIR = Object.freeze({
  temperate: IDENTITY,
  boreal: {
    tint: { lowColor: [0.86, 0.98, 1.1], highColor: [0.72, 0.88, 1.14], fogColor: [0.86, 0.96, 1.08],
      directionalColor: [0.94, 0.98, 1.06], sunGlowColor: [0.92, 0.98, 1.08], cloudCore: [0.94, 0.98, 1.04] },
    pale: { lowColor: 0.15 },
    scale: { fogDensityScale: 0.75, ambientSaturation: 0.82, sunGlowIntensity: 0.8 },
    add: { cloudDensity: 0.08, cloudOpacity: -0.1 },
  },
  arid: {
    tint: { lowColor: [1.22, 1.04, 0.74], highColor: [1.1, 1.0, 0.82], fogColor: [1.28, 1.06, 0.72],
      sunColor: [1.06, 1.0, 0.86], directionalColor: [1.08, 1.0, 0.84], groundLightColor: [1.35, 1.1, 0.72],
      cloudCore: [1.08, 1.0, 0.88], cloudEdge: [1.06, 1.0, 0.9] },
    pale: { lowColor: 0.4, highColor: 0.35, fogColor: 0.3 },
    scale: { fogDensityScale: 1.7, directionalIntensity: 1.15, ambientSaturation: 0.65 },
    add: { cloudDensity: 0.2, cloudOpacity: -0.15 },
  },
  tropical: {
    tint: { lowColor: [0.9, 1.08, 1.0], highColor: [0.86, 1.04, 1.02], fogColor: [0.84, 1.08, 0.96],
      groundLightColor: [0.8, 1.2, 0.82], cloudCore: [0.94, 0.97, 0.98] },
    pale: { highColor: 0.15 },
    scale: { fogDensityScale: 1.8, ambientSaturation: 1.2, directionalIntensity: 0.85 },
    add: { cloudDensity: -0.22, cloudOpacity: 0.18 },
  },
  wetland: {
    tint: { lowColor: [0.84, 0.96, 0.9], highColor: [0.72, 0.84, 0.84], fogColor: [0.8, 0.94, 0.86],
      cloudCore: [0.8, 0.84, 0.84], cloudEdge: [0.88, 0.9, 0.9], groundLightColor: [0.72, 0.92, 0.74],
      directionalColor: [0.94, 0.98, 0.94] },
    pale: { lowColor: 0.5, highColor: 0.45, fogColor: 0.55, directionalColor: 0.2 },
    scale: { fogDensityScale: 2.6, directionalIntensity: 0.72, sunGlowIntensity: 0.5, ambientSaturation: 0.7 },
    add: { cloudDensity: -0.28, cloudOpacity: 0.22 },
  },
  coastal: {
    tint: { lowColor: [0.9, 1.06, 1.12], highColor: [0.92, 1.02, 1.08], fogColor: [0.9, 1.05, 1.12] },
    pale: {},
    scale: { fogDensityScale: 1.25, ambientIntensity: 1.06 },
    add: { cloudDensity: -0.12, cloudOpacity: 0.06 },
  },
  alpine: {
    tint: { highColor: [0.7, 0.86, 1.16], fogColor: [0.94, 1.0, 1.06] },
    pale: { lowColor: 0.2 },
    scale: { fogDensityScale: 0.55, directionalIntensity: 1.1 },
    // Mountains gather cloud: thin, clear air, but rarely an empty sky.
    add: { cloudDensity: -0.04 },
  },
});

const WARM = Object.freeze([1.05, 1.0, 0.93]);
const scratch = new THREE.Color();

function weightedTint(weights, key) {
  const tint = [0, 0, 0];
  let pale = 0;
  for (const climate of SKY_CLIMATES) {
    const w = weights[climate] ?? 0;
    if (!w) continue;
    const air = CLIMATE_AIR[climate];
    const t = air.tint[key] ?? [1, 1, 1];
    tint[0] += w * t[0];
    tint[1] += w * t[1];
    tint[2] += w * t[2];
    pale += w * (air.pale[key] ?? 0);
  }
  const total = SKY_CLIMATES.reduce((sum, climate) => sum + (weights[climate] ?? 0), 0) || 1;
  return { tint: tint.map((value) => value / total), pale: pale / total };
}

function recolour(hex, tint, pale) {
  scratch.set(hex);
  const luminance = scratch.r * 0.2126 + scratch.g * 0.7152 + scratch.b * 0.0722;
  const channel = (value, factor) => Math.min(1, (value + (luminance - value) * pale) * factor);
  return `#${scratch.setRGB(channel(scratch.r, tint[0]), channel(scratch.g, tint[1]), channel(scratch.b, tint[2])).getHexString()}`;
}

function weightedNumber(weights, kind, key, neutral) {
  let value = 0;
  let total = 0;
  for (const climate of SKY_CLIMATES) {
    const w = weights[climate] ?? 0;
    value += w * (CLIMATE_AIR[climate][kind][key] ?? neutral);
    total += w;
  }
  return total ? value / total : neutral;
}

const COLOUR_KEYS = Object.freeze(['lowColor', 'highColor', 'sunColor', 'sunGlowColor', 'cloudCore', 'cloudEdge',
  'fogColor', 'groundLightColor', 'directionalColor']);
const SCALED_KEYS = Object.freeze(['fogDensityScale', 'directionalIntensity', 'ambientSaturation',
  'ambientIntensity', 'sunGlowIntensity']);
const ADDED_KEYS = Object.freeze(['cloudDensity', 'cloudOpacity']);

/**
 * @param {object} look a resolved sky look (SkyLook)
 * @param {{weights: object, personality: {haze:number, warmth:number, cloudiness:number}}} region
 */
export function regionalSkyLook(look, region) {
  if (!region) return look;
  const { weights, personality } = region;
  const result = { ...look };
  const warmth = personality.warmth ?? 0;
  for (const key of COLOUR_KEYS) {
    const { tint, pale } = weightedTint(weights, key);
    const warm = key === 'highColor' ? 0.4 : 1;
    const mood = WARM.map((w) => 1 + (w - 1) * warmth * 1.2 * warm);
    const haze = ['lowColor', 'fogColor'].includes(key) ? Math.max(0, personality.haze ?? 0) * 0.25 : 0;
    result[key] = recolour(look[key], tint.map((t, i) => t * mood[i]), Math.min(0.8, pale + haze));
  }
  for (const key of SCALED_KEYS) result[key] = look[key] * weightedNumber(weights, 'scale', key, 1);
  for (const key of ADDED_KEYS) result[key] = look[key] + weightedNumber(weights, 'add', key, 0);
  result.fogDensityScale *= 1 + 0.5 * (personality.haze ?? 0);
  result.cloudDensity -= 0.2 * (personality.cloudiness ?? 0);
  result.cloudOpacity = Math.max(0, Math.min(1, result.cloudOpacity + 0.12 * (personality.cloudiness ?? 0)));
  const resolved = applyRegionalCharacter(result, airCharacter(region));
  resolved.fogDensityScale = boundRegionalFogScale(resolved.fogDensityScale, look.fogDensityScale);
  return resolved;
}

/** Climate, personality and humid-air extinction describe overlapping air.
 * Compress their combined excess instead of letting three multipliers erase
 * the same middle distance. Local valley mist retains its separate structure;
 * weather and the time-of-day base still own their full density response. */
export function boundRegionalFogScale(combined, base) {
  if (!(base > 0) || combined <= base) return combined;
  const excess = combined / base - 1;
  const headroom = 1.4;
  return base * (1 + headroom * excess / (headroom + excess));
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
/** The clearest a region's sky may get (cloud threshold on the 0..1 field). */
const MAX_CLOUD_DENSITY = 0.68;

/**
 * What the place's air is like, from its moisture and temperature plus the
 * per-area noise, so two mountain ranges — or two stretches of the same
 * taiga — need not look alike. Neutral air (moisture and temperature 0.5, a
 * zero personality) is all zeros, which leaves a look unchanged.
 *
 * - `mist` 0..1: wet air hangs in the valleys and greys the distance.
 * - `form` -1..1: warm, moist air builds rounded cumulus (+); cold or dry air
 *   draws thin, broken wisps (−).
 * - `cold` -1..1 and `damp` -1..1 steer the snow: cold dry powder is bright with
 *   deep blue shade, mild damp snow is duller and greyer.
 */
export function airCharacter(region) {
  const air = region.air ?? { moisture: 0.5, temperature: 0.5 };
  const personality = region.personality ?? {};
  const damp = Math.max(-1, Math.min(1, (air.moisture - 0.5) * 2));
  const cold = Math.max(-1, Math.min(1, (0.5 - air.temperature) * 2));
  const mist = clamp01(Math.max(0, damp) * 0.6 + (personality.mist ?? 0) * 0.7
    + Math.max(0, damp) * Math.max(0, personality.mist ?? 0) * 0.5);
  const form = Math.max(-1, Math.min(1, (personality.cloudForm ?? 0) * 0.8 - cold * 0.5 + damp * 0.25));
  return { mist, form, cold, damp };
}

/** Lay a place's air character over a look (see airCharacter). */
export function applyRegionalCharacter(look, { mist, form, cold, damp }) {
  const result = { ...look };
  const cumulus = Math.max(0, form);
  const wisps = Math.max(0, -form);
  // Mist: thicker distance haze, a lower, softer, closer cloud deck, a dimmer
  // and more diffuse sun, and the valley fog switched on.
  result.fogDensityScale *= 1 + 2.4 * mist;
  result.fogColor = recolour(look.fogColor, [1, 1, 1], 0.35 * mist);
  result.cloudDensity -= 0.22 * mist;
  result.cloudOpacity = clamp01(result.cloudOpacity + 0.18 * mist + 0.16 * cumulus - 0.18 * wisps);
  result.directionalIntensity *= 1 - 0.3 * mist;
  result.sunGlowIntensity *= 1 + 0.4 * mist;
  result.mist = clamp01((look.mist ?? 0) + mist);
  // A truly empty sky is rare: above this threshold the fbm field shows almost
  // no cloud, so stop short of it (deserts included).
  result.cloudDensity = Math.min(result.cloudDensity, MAX_CLOUD_DENSITY);
  // Cloud form: crisp rounded masses or soft broken wisps.
  const sharpness = look.cloudSharpness ?? 0.24;
  result.cloudSharpness = Math.max(0.04, sharpness * (1 - 0.6 * cumulus) + 0.16 * wisps + 0.22 * mist);
  result.cloudDetail = Math.max(0.3, (look.cloudDetail ?? 1) * (1 - 0.45 * cumulus + 0.6 * wisps));
  // Snow: cold dry powder is bright with deep blue shade; damp mild snow is
  // duller and greyer; mist flattens the light that models it.
  result.snowBrightness = Math.max(0.6, Math.min(0.92, (look.snowBrightness ?? 0.82) + 0.03 * cold - 0.1 * damp));
  result.snowShade = clamp01((look.snowShade ?? 0.35) * (1 + 0.45 * cold - 0.2 * damp) * (1 - 0.45 * mist));
  result.snowBlue = clamp01((look.snowBlue ?? 0.6) + 0.35 * cold - 0.3 * damp - 0.2 * mist);
  return result;
}
