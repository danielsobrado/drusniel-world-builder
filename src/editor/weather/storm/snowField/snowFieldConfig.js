/**
 * Settings for the storm snow field (`weatherEffects.snowField` in
 * config/weather-effects.yaml): where a storm's snow builds and melts first.
 * See docs/plans/storm-snow-field-2026-11-21.md.
 *
 * Off compiles every coverage reader exactly as before and runs no GPU work,
 * so materials read the registered settings when they are built.
 */

export const DEFAULT_SNOW_FIELD = Object.freeze({
  enabled: true,
  /** Metres the camera-centred field spans; texels are `windowMetres / resolution`. */
  windowMetres: 512,
  resolution: 128,
  /** Build rate on open flat ground, relative to the global SnowCover. */
  flatGain: 1.15,
  /** Extra rate on lee slopes, less on windward ones (× the slope's lee share). */
  leeGain: 0.6,
  /** Extra rate in hollows, less on crests. */
  hollowGain: 0.35,
  /** Rate taken off faces steeper than ~35°. */
  steepLoss: 0.6,
  /** Share of the rate the wind-streaked drift pattern varies (0 = no drifts). */
  driftContrast: 0.7,
  /** Drift streak lengths, metres along and across the prevailing wind. */
  driftAlongMetres: 70,
  driftAcrossMetres: 18,
  /** Metres per second the drifts creep downwind at full snowfall and calm-reference wind. */
  driftSpeed: 0.25,
  /** Share of the rate a sun-facing slope loses while melting. */
  sunMelt: 0.65,
  /** Share of the cover a closed canopy holds off the ground beneath it. */
  canopyShelter: 0.3,
});

const RANGES = Object.freeze({
  windowMetres: [64, 4096], resolution: [16, 512], flatGain: [0.1, 4], leeGain: [0, 3], hollowGain: [0, 3],
  steepLoss: [0, 1], driftContrast: [0, 1], driftAlongMetres: [1, 2000], driftAcrossMetres: [1, 2000],
  driftSpeed: [0, 10], sunMelt: [0, 1], canopyShelter: [0, 1],
});

/**
 * @param {object} [source] YAML block
 * @param {string} [search] page query: `?snowField=0|1` overrides `enabled` (QA A/B)
 */
export function resolveSnowFieldConfig(source = {}, search = '') {
  const config = { ...DEFAULT_SNOW_FIELD, ...(source ?? {}) };
  for (const key of Object.keys(config)) {
    if (!(key in DEFAULT_SNOW_FIELD)) throw new Error(`Invalid editor configuration: weatherEffects.snowField.${key} is not a setting.`);
  }
  if (typeof config.enabled !== 'boolean') throw new Error('Invalid editor configuration: weatherEffects.snowField.enabled must be true or false.');
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max) {
      throw new Error(`Invalid editor configuration: weatherEffects.snowField.${key} must be a number from ${min} to ${max}.`);
    }
  }
  if (!Number.isInteger(config.resolution)) throw new Error('Invalid editor configuration: weatherEffects.snowField.resolution must be an integer.');
  const override = new URLSearchParams(search ?? '').get('snowField');
  if (override === '0' || override === '1') config.enabled = override === '1';
  return Object.freeze(config);
}

let registered = resolveSnowFieldConfig();

/** Called once by the config loader; materials built afterwards read it. */
export function registerSnowFieldConfig(config) {
  registered = config;
}

export function snowFieldConfig() {
  return registered;
}
