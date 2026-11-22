/**
 * `water.sea.offshoreFft` (PR I phase I.4): the opt-in offshore FFT normal detail.
 * Sizes and cascades per tier stay with OceanFftQuality, their single owner;
 * this holds only what an author tunes: the switch, the gain, the coastal fade and
 * how the spectrum follows the weather (I.5): the reference breeze's wind speed (the
 * weather's intensity 1, and the sea with weather off) and the transition time.
 *
 * The fade follows geography, not the camera: depth from 7 to 14 m (past the
 * surf-to-swell hand-over) and shore distance from 24 to 40 m (the field is
 * capped near 48 m, so a fade must end below that to ever reach full strength).
 */
export const OFFSHORE_FFT_DEFAULTS = Object.freeze({
  enabled: false,
  slopeStrength: 1,
  blend: Object.freeze({ depthStartMeters: 7, depthEndMeters: 14, shoreStartMeters: 24, shoreEndMeters: 40 }),
  weather: Object.freeze({ referenceWindSpeed: 10, transitionSeconds: 2 }),
  // I.6: wind-driven long swell (48–160 m) as real wave height, CPU and shader alike.
  geometry: Object.freeze({ enabled: false }),
  // [P9] follow-on: underwater caustics from the FFT slopes over ocean beds in their own depth band (OceanFftCaustics).
  caustics: Object.freeze({ enabled: false, strength: 1, depthStartMeters: 2, depthEndMeters: 6 }),
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
  const weather = { ...OFFSHORE_FFT_DEFAULTS.weather, ...(source.weather ?? {}) };
  const geometry = { ...OFFSHORE_FFT_DEFAULTS.geometry, ...(source.geometry ?? {}) };
  const caustics = { ...OFFSHORE_FFT_DEFAULTS.caustics, ...(source.caustics ?? {}) };
  const result = { ...OFFSHORE_FFT_DEFAULTS, ...source, blend, weather, geometry, caustics };
  if (typeof result.enabled !== 'boolean') throw new Error(`${field('enabled')} must be a boolean.`);
  finiteIn(result.slopeStrength, 'slopeStrength', 0, 2);
  finiteIn(blend.depthStartMeters, 'blend.depthStartMeters', 0, 100);
  finiteIn(blend.depthEndMeters, 'blend.depthEndMeters', blend.depthStartMeters + 0.5, 200);
  finiteIn(blend.shoreStartMeters, 'blend.shoreStartMeters', 0, SHORE_FIELD_MAX_METERS - 1);
  // Above the field's cap the fade would never complete.
  finiteIn(blend.shoreEndMeters, 'blend.shoreEndMeters', blend.shoreStartMeters + 0.5, SHORE_FIELD_MAX_METERS);
  // 2.4 × the reference is a full storm (OceanFftWeather); 25 m/s keeps that under the spectrum's 60 m/s limit.
  finiteIn(weather.referenceWindSpeed, 'weather.referenceWindSpeed', 1, 25);
  finiteIn(weather.transitionSeconds, 'weather.transitionSeconds', 0.25, 60);
  if (typeof geometry.enabled !== 'boolean') throw new Error(`${field('geometry.enabled')} must be a boolean.`);
  if (typeof caustics.enabled !== 'boolean') throw new Error(`${field('caustics.enabled')} must be a boolean.`);
  finiteIn(caustics.strength, 'caustics.strength', 0, 4);
  finiteIn(caustics.depthStartMeters, 'caustics.depthStartMeters', 0, 50);
  finiteIn(caustics.depthEndMeters, 'caustics.depthEndMeters', caustics.depthStartMeters + 0.5, 100);
  for (const key of Object.keys(source)) if (!(key in OFFSHORE_FFT_DEFAULTS)) throw new Error(`${field(key)} is not a setting.`);
  for (const group of ['blend', 'weather', 'geometry', 'caustics']) {
    for (const key of Object.keys(source[group] ?? {})) {
      if (!(key in OFFSHORE_FFT_DEFAULTS[group])) throw new Error(`${field(`${group}.${key}`)} is not a setting.`);
    }
  }
  return Object.freeze({ ...result, blend: Object.freeze(blend), weather: Object.freeze(weather), geometry: Object.freeze(geometry), caustics: Object.freeze(caustics) });
}
