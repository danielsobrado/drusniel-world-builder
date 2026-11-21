/**
 * Rain wetness settings (`stylizedSurface.wetness`): how fast ground soaks and
 * dries, and how a soaked surface looks. See surfaceWetness.js.
 */

/**
 * The GPU wetness field (`wetness.field`, weather/wetness/): rain darkens the
 * ground unevenly, pools in hollows and dries patchily. Off, every shader is the
 * one the global wetness value built before the field existed, and no pass runs.
 */
export const DEFAULT_WETNESS_FIELD = Object.freeze({
  enabled: false,
  /** Shortest gap between two field renders while the clocks move. */
  intervalSeconds: 0.25,
});

export const DEFAULT_SURFACE_WETNESS = Object.freeze({
  /** Seconds of full rain to soak dry ground. */
  wetSeconds: 40,
  /** Seconds for soaked ground to dry once the rain stops. */
  drySeconds: 240,
  /** Share of colour lost at full wetness. */
  darkening: 0.3,
  /** Roughness a soaked surface falls to (never raised). */
  wetRoughness: 0.55,
  /** How much a full canopy keeps the ground under it dry. */
  canopyShelter: 0.7,
  field: DEFAULT_WETNESS_FIELD,
});

function resolveField(source = {}, search = '') {
  const field = { ...DEFAULT_WETNESS_FIELD, ...source };
  // QA A/B: `?wetnessField=0|1` overrides the YAML.
  const params = new URLSearchParams(search);
  if (params.has('wetnessField')) field.enabled = params.get('wetnessField') === '1';
  if (typeof field.enabled !== 'boolean') {
    throw new Error('Invalid editor configuration: stylizedSurface.wetness.field.enabled must be a boolean.');
  }
  if (!Number.isFinite(field.intervalSeconds) || field.intervalSeconds < 0.05 || field.intervalSeconds > 2) {
    throw new Error('Invalid editor configuration: stylizedSurface.wetness.field.intervalSeconds must be within [0.05, 2].');
  }
  const unknown = Object.keys(field).find((key) => !(key in DEFAULT_WETNESS_FIELD));
  if (unknown) throw new Error(`Invalid editor configuration: unknown stylizedSurface.wetness.field.${unknown}.`);
  return Object.freeze(field);
}

export function resolveSurfaceWetnessConfig(source = {}, search = '') {
  const { field, ...scalars } = { ...DEFAULT_SURFACE_WETNESS, ...source };
  const config = { ...scalars };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid editor configuration: stylizedSurface.wetness.${key} must be a non-negative number.`);
    }
  }
  if (config.wetSeconds <= 0 || config.drySeconds <= 0) {
    throw new Error('Invalid editor configuration: stylizedSurface.wetness wetSeconds and drySeconds must be positive.');
  }
  for (const key of ['darkening', 'wetRoughness', 'canopyShelter']) {
    if (config[key] > 1) throw new Error(`Invalid editor configuration: stylizedSurface.wetness.${key} must be within [0, 1].`);
  }
  return Object.freeze({ ...config, field: resolveField(field, search) });
}
