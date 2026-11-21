/**
 * `water.sea.offshoreFft` (PR I phase I.4): the opt-in offshore FFT normal detail.
 * Sizes and cascades per tier stay with OceanFftQuality, their single owner;
 * this holds only what an author tunes: the switch, the gain and the coastal fade.
 *
 * The fade follows geography, not the camera: depth from 7 to 14 m (past the
 * surf-to-swell hand-over) and shore distance from 24 to 40 m (the field is
 * capped near 48 m, so a fade must end below that to ever reach full strength).
 */
export const OFFSHORE_FFT_DEFAULTS = Object.freeze({
  enabled: false,
  slopeStrength: 1,
  blend: Object.freeze({ depthStartMeters: 7, depthEndMeters: 14, shoreStartMeters: 24, shoreEndMeters: 40 }),
});

// config/water-domain.yaml waterDomain.shoreDistanceMeters: the field saturates there.
const SHORE_FIELD_MAX_METERS = 48;
const field = (name) => `stylizedSurface.water.sea.offshoreFft.${name}`;

function finiteIn(value, name, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field(name)} must be within [${minimum}, ${maximum}].`);
  }
}

/** Validated settings with defaults; throws on anything malformed. */
export function resolveOffshoreFft(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('stylizedSurface.water.sea.offshoreFft must be an object.');
  const blend = { ...OFFSHORE_FFT_DEFAULTS.blend, ...(source.blend ?? {}) };
  const result = { ...OFFSHORE_FFT_DEFAULTS, ...source, blend };
  if (typeof result.enabled !== 'boolean') throw new Error(`${field('enabled')} must be a boolean.`);
  finiteIn(result.slopeStrength, 'slopeStrength', 0, 2);
  finiteIn(blend.depthStartMeters, 'blend.depthStartMeters', 0, 100);
  finiteIn(blend.depthEndMeters, 'blend.depthEndMeters', blend.depthStartMeters + 0.5, 200);
  finiteIn(blend.shoreStartMeters, 'blend.shoreStartMeters', 0, SHORE_FIELD_MAX_METERS - 1);
  // Above the field's cap the fade would never complete.
  finiteIn(blend.shoreEndMeters, 'blend.shoreEndMeters', blend.shoreStartMeters + 0.5, SHORE_FIELD_MAX_METERS);
  for (const key of Object.keys(source)) if (!(key in OFFSHORE_FFT_DEFAULTS)) throw new Error(`${field(key)} is not a setting.`);
  for (const key of Object.keys(source.blend ?? {})) if (!(key in OFFSHORE_FFT_DEFAULTS.blend)) throw new Error(`${field(`blend.${key}`)} is not a setting.`);
  return Object.freeze({ ...result, blend: Object.freeze(blend) });
}
