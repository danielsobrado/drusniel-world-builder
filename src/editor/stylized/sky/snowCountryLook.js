import * as THREE from 'three/webgpu';

/**
 * Snow country's air (after grass-test's SnowAtmosphere): a cooler, paler sky,
 * a cool haze, light bouncing up off the snow and a slightly warmer sun. Every
 * change is relative to the look it is given, as a tint or a scale, so a
 * moonlit summit stays moonlit and a golden-hour one stays golden.
 */
const COOL_SKY = [0.92, 0.99, 1.08];
/**
 * The zenith pales and lifts too: a winter sky is light, not the deep summer
 * blue (Tiny Glade's snow scenes). Multiplicative, so a night sky stays dark.
 */
const COOL_ZENITH = [1.1, 1.14, 1.08];
const ZENITH_PALING = 0.3;
const COOL_FOG = [0.95, 1.0, 1.06];
const WARM_SUN = [1.04, 1.0, 0.94];
/** How far the horizon and fog pale toward their own luminance. */
const PALING = 0.35;
/**
 * Exposure deep in snow country, as a share of the configured exposure: the
 * eye (and a camera) stops down for a snowfield. At full exposure sunlit snow
 * clipped to flat white at midday and its shade and blue never showed.
 */
const SNOW_EXPOSURE = 0.74;

const scratch = new THREE.Color();

function tinted(hex, tint, weight, paling = 0) {
  scratch.set(hex);
  const luminance = scratch.r * 0.2126 + scratch.g * 0.7152 + scratch.b * 0.0722;
  const r = scratch.r + (luminance - scratch.r) * paling * weight;
  const g = scratch.g + (luminance - scratch.g) * paling * weight;
  const b = scratch.b + (luminance - scratch.b) * paling * weight;
  const mix = (value, factor) => Math.min(1, value * (1 + (factor - 1) * weight));
  return `#${scratch.setRGB(mix(r, tint[0]), mix(g, tint[1]), mix(b, tint[2])).getHexString()}`;
}

/** @param {number} weight 0 lowland … 1 deep in snow country */
export function snowCountryLook(look, weight) {
  const w = Math.max(0, Math.min(1, weight));
  if (w === 0) return look;
  return {
    ...look,
    lowColor: tinted(look.lowColor, COOL_SKY, w, PALING),
    highColor: tinted(look.highColor, COOL_ZENITH, w, ZENITH_PALING),
    fogColor: tinted(look.fogColor, COOL_FOG, w, PALING),
    directionalColor: tinted(look.directionalColor, WARM_SUN, w),
    ambientIntensity: look.ambientIntensity * (1 + 0.15 * w),
    fogDensityScale: look.fogDensityScale * (1 + 0.35 * w),
    exposure: (look.exposure ?? 1) * (1 + (SNOW_EXPOSURE - 1) * w),
  };
}
