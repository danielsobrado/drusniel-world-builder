import { float, mix } from 'three/tsl';

/** Per-biome response to the meadow's existing lush, dry and worn area masks. */
export const MEADOW_MICROHABITAT_DEFAULTS = Object.freeze({
  lushLift: 0,
  drySettle: 0,
  shelter: 0,
  accentBias: 0,
});

const LIMITS = Object.freeze({
  lushLift: [0, 1],
  drySettle: [0, 1],
  shelter: [0, 1],
  accentBias: [0, 1],
});
const KEYS = Object.freeze(Object.keys(MEADOW_MICROHABITAT_DEFAULTS));
const WORN_HEIGHT_SHARE = 0.2;
const WORN_WIDTH_SHARE = 0.12;
const DRY_WIDTH_SHARE = 0.35;
const WIND_SHELTER_SHARE = 0.5;
const ACCENT_NOISE_SHIFT = 0.14;

export function resolveMeadowMicrohabitat(source, path) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Invalid editor configuration: ${path} must be an object.`);
  }
  const result = { ...MEADOW_MICROHABITAT_DEFAULTS };
  for (const [key, value] of Object.entries(source)) {
    const limits = LIMITS[key];
    if (!limits) throw new Error(`Invalid editor configuration: ${path}.${key} is unknown.`);
    if (!Number.isFinite(value) || value < limits[0] || value > limits[1]) {
      throw new Error(`Invalid editor configuration: ${path}.${key} must be in [${limits.join(', ')}].`);
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

/** Reuse the accents buffer's fourth row; no new texture or uniform binding. */
export function meadowMicrohabitatWeights(profile) {
  const source = profile.microhabitat ?? MEADOW_MICROHABITAT_DEFAULTS;
  return KEYS.map(key => source[key]);
}

/**
 * Shift existing growth inside its original envelope. Wet niches recover tall
 * stems, dry patches settle, and sheltered clumps resist wind. The field comes
 * from meadowGroundStyle so visual ground and stems use identical area masks.
 */
export function meadowMicrohabitatNodes(area, weights) {
  if (!area) return {
    lush: float(0), dry: float(0), worn: float(0),
    lift: float(0), settle: float(0), width: float(1),
    wind: float(1), accentShift: float(0),
  };
  const lush = area.lush.clamp(0, 1);
  const dry = area.dry.clamp(0, 1);
  const worn = area.worn.clamp(0, 1);
  const lift = lush.mul(weights.x);
  const settle = dry.add(worn.mul(WORN_HEIGHT_SHARE)).mul(weights.y).clamp(0, 1);
  const width = float(1).sub(dry.mul(weights.y).mul(DRY_WIDTH_SHARE)
    .add(worn.mul(weights.y).mul(WORN_WIDTH_SHARE)).clamp(0, 0.5));
  const wind = float(1).sub(lush.mul(weights.z).mul(WIND_SHELTER_SHARE));
  const accentShift = lush.sub(dry).mul(weights.w).mul(ACCENT_NOISE_SHIFT);
  return { lush, dry, worn, lift, settle, width, wind, accentShift };
}

export function meadowMicrohabitatShare(share, micro) {
  return mix(share, 1, micro.lift).mul(micro.settle.oneMinus()).clamp(0, 1);
}

const unit = value => Math.max(0, Math.min(1, value));

/** CPU twin for numerical bounds and neutral-fallback regression tests. */
export function meadowMicrohabitatNumber(share, area, settings = MEADOW_MICROHABITAT_DEFAULTS) {
  const lush = unit(area?.lush ?? 0);
  const dry = unit(area?.dry ?? 0);
  const worn = unit(area?.worn ?? 0);
  const lift = lush * settings.lushLift;
  const settle = unit((dry + worn * WORN_HEIGHT_SHARE) * settings.drySettle);
  return {
    share: unit((unit(share) * (1 - lift) + lift) * (1 - settle)),
    width: 1 - Math.min(0.5, dry * settings.drySettle * DRY_WIDTH_SHARE
      + worn * settings.drySettle * WORN_WIDTH_SHARE),
    wind: 1 - lush * settings.shelter * WIND_SHELTER_SHARE,
    accentShift: (lush - dry) * settings.accentBias * ACCENT_NOISE_SHIFT,
  };
}
