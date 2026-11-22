/**
 * Settings for the desert sand field (`weatherEffects.sandField` in
 * config/weather-effects.yaml): where a sandstorm's windblown sand gathers on
 * desert ground, and how long it stays. It rides the storm snow field's pass
 * and texture. See docs/plans/desert-sand-field-2026-11-22.md.
 *
 * Off compiles every shader exactly as before and runs no GPU work for sand,
 * so materials read the registered settings when they are built.
 */

export const DEFAULT_SAND_FIELD = Object.freeze({
  enabled: true,
  /** Seconds of a full sandstorm to lay full sand cover. */
  buildSeconds: 300,
  /** Seconds for full sand cover to blow away once the storm has passed. */
  fadeSeconds: 2400,
  /** Gain on open flat ground, relative to the global SandCover. */
  flatGain: 0.55,
  /** Extra gain on lee slopes, less on windward ones (× the slope's lee share). */
  leeGain: 1.1,
  /** Extra gain in hollows and at the foot of slopes and outcrops, less on crests. */
  hollowGain: 0.9,
  /** Share of the flat gain taken off faces steeper than ~35° (sand's angle of repose). */
  steepLoss: 1,
  /** Share of the gain the wind-streaked drift pattern varies (0 = no streaks). */
  driftContrast: 0.6,
  /** How much paler fresh drifted sand reads than the erg under it (0 = only the weights). */
  paleness: 0.25,
  /** Share of the dust a fully sheltered lee thins (sandstorm particles; 0 = none). */
  dustThinning: 0.5,
});

const RANGES = Object.freeze({
  buildSeconds: [1, 86400], fadeSeconds: [1, 86400], flatGain: [0, 4], leeGain: [0, 4], hollowGain: [0, 4],
  steepLoss: [0, 1], driftContrast: [0, 1], paleness: [0, 1], dustThinning: [0, 1],
});

/**
 * @param {object} [source] YAML block
 * @param {string} [search] page query: `?sandField=0|1` overrides `enabled` (QA A/B)
 */
export function resolveSandFieldConfig(source = {}, search = '') {
  const config = { ...DEFAULT_SAND_FIELD, ...(source ?? {}) };
  for (const key of Object.keys(config)) {
    if (!(key in DEFAULT_SAND_FIELD)) throw new Error(`Invalid editor configuration: weatherEffects.sandField.${key} is not a setting.`);
  }
  if (typeof config.enabled !== 'boolean') throw new Error('Invalid editor configuration: weatherEffects.sandField.enabled must be true or false.');
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max) {
      throw new Error(`Invalid editor configuration: weatherEffects.sandField.${key} must be a number from ${min} to ${max}.`);
    }
  }
  const override = new URLSearchParams(search ?? '').get('sandField');
  if (override === '0' || override === '1') config.enabled = override === '1';
  return Object.freeze(config);
}

let registered = resolveSandFieldConfig();

/** Called once by the config loader; materials built afterwards read it. */
export function registerSandFieldConfig(config) {
  registered = config;
}

export function sandFieldConfig() {
  return registered;
}
