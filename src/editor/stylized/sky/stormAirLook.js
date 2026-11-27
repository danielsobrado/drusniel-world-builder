import * as THREE from 'three/webgpu';

import { stormLadder } from './SkyLook.js';

/**
 * Storm air laid over the finished look (after the regional fog bound, snow
 * country and the bog murk): it is weather, not region (plan §4.1–4.2).
 *
 * Fog closes to a visibility target per storm level, converted against the
 * active base density, so it only ever thickens a look. Rain pulls the fog
 * toward a dark blue-grey, snow toward a sky-lit white, and a heavy snowstorm
 * becomes a whiteout: the fog band rises to the zenith and the sun and stars go.
 */

/**
 * Metres seen at 5 % contrast per level (clear, light, moderate, heavy, storm), near
 * real rain (light > 4 km, a downpour a few hundred metres). A 150 m storm left ~57 %
 * fog at 80 m and greyed a woodland view flat; 400 m keeps ~11 % there, so the near
 * trees read and only the far valley goes.
 */
const RAIN_VISIBILITY = Object.freeze([Infinity, 4000, 1500, 700, 400]);
/**
 * A blizzard keeps its near field: FogExp2 at 140 m leaves ~20 % fog at 40 m and
 * ~60 % at 80 m, so footing and rocks read and only the distance goes; the flakes
 * and their curtain carry the density (50 m erased everything past ~25 m).
 */
const SNOW_STORM_VISIBILITY = 140;
/** FogExp2: visibility at 5 % contrast ≈ 1.73 / density. */
const CONTRAST_DISTANCE = 1.73;
const RAIN_FOG = '#4a535c';
const SNOW_FOG = '#dde4ec';
/**
 * Exposure a daylight rainstorm opens to, as a share of the look's: the eye (and a
 * camera) opens up under a dark deck as it stops down for snow (`snowCountryLook`).
 * The 150 m fog used to stand in for this by greying the wood; without it a storm
 * floor under canopy read black. The sky follows only a quarter of it.
 */
const RAIN_EXPOSURE = 1.8;
/** Night scale of the storm fog colours, linear (≈ ×0.35 in sRGB): a storm at night stays dark. */
const NIGHT_FOG = 0.1;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const fogA = new THREE.Color();
const fogB = new THREE.Color();

/** The fog density a storm asks for (FogExp2 units), 0 at clear. */
export function stormFogDensity(storm, snowShare = 0) {
  const visibility = RAIN_VISIBILITY.map((metres, i) => (i === RAIN_VISIBILITY.length - 1
    ? metres + (SNOW_STORM_VISIBILITY - metres) * clamp01(snowShare)
    : metres));
  return stormLadder(visibility.map((metres) => CONTRAST_DISTANCE / metres), storm);
}

/** How white the sky is (0..1): only heavy snow brings a whiteout. */
export function stormWhiteout(storm, snowShare = 0) {
  return clamp01(snowShare) * smoothstep(0.6, 1, storm);
}

/**
 * @param {object} look a finished sky look
 * @param {{ storm: number, snowShare: number }} weather StormState frame values
 * @param {number} baseFogDensity the scene fog density a `fogDensityScale` of 1 means
 */
export function stormAirLook(look, { storm = 0, snowShare = 0 } = {}, baseFogDensity = 0) {
  const s = clamp01(storm);
  if (s === 0) return look;
  const share = clamp01(snowShare);
  const result = { ...look };
  if (baseFogDensity > 0) {
    result.fogDensityScale = Math.max(look.fogDensityScale, stormFogDensity(s, share) / baseFogDensity);
  }
  const nightness = clamp01(look.nightness ?? (look.night ? 1 : 0));
  const night = 1 - (1 - NIGHT_FOG) * nightness;
  fogB.set(RAIN_FOG).lerp(fogA.set(SNOW_FOG), share).multiplyScalar(night);
  result.fogColor = `#${fogA.set(look.fogColor).lerp(fogB, 0.85 * smoothstep(0.2, 1, s)).getHexString()}`;
  // The dome sinks into the murk with the far trees, or the horizon draws a seam.
  const whiteout = stormWhiteout(s, share);
  // Rain keeps its cloud deck in view (0.45); only snow sinks the dome into the air.
  result.skyFog = Math.max(look.skyFog ?? 0, (0.45 + 0.25 * share) * smoothstep(0.4, 1, s), whiteout);
  result.whiteout = Math.max(look.whiteout ?? 0, whiteout);
  // Snow light comes from everywhere: the white air lifts the ambient the cloud took.
  result.ambientIntensity = look.ambientIntensity * (1 + 0.35 * share * s);
  // Rain only, by day: snow air is already bright, and a night storm stays dark.
  const open = (RAIN_EXPOSURE - 1) * smoothstep(0.2, 1, s) * (1 - share) * (1 - nightness);
  result.exposure = (look.exposure ?? 1) * (1 + open);
  return result;
}
