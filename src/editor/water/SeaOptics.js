/** Clear coastal sea response, in metres (grass-test uses 2.8 units per metre). */
export const DEFAULT_SEA_OPTICS = Object.freeze({
  sunny: Object.freeze({ lagoon: '#4fd3cf', shallow: '#259eac', deep: '#073c58' }),
  storm: Object.freeze({ lagoon: '#2f8a80', shallow: '#176662', deep: '#032d48' }),
  absorptionCoefficients: Object.freeze([0.896, 0.182, 0.14]),
  absorptionDensity: 0.22,
  lagoonStart: 0.18, lagoonEnd: 2.5, deepStart: 0.71, deepEnd: 8.6,
  maximumOpticalDistance: 43,
  fresnelStrength: 0.85,
});

export function resolveSeaOptics(source = {}) {
  const value = { ...DEFAULT_SEA_OPTICS, ...source };
  for (const palette of ['sunny', 'storm']) {
    value[palette] = { ...DEFAULT_SEA_OPTICS[palette], ...source[palette] };
    for (const [name, color] of Object.entries(value[palette])) {
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new TypeError(`sea.optics.${palette}.${name} must be a six-digit hex color.`);
    }
  }
  if (!Array.isArray(value.absorptionCoefficients) || value.absorptionCoefficients.length !== 3
      || value.absorptionCoefficients.some(v => !Number.isFinite(v) || v < 0 || v > 4)) {
    throw new RangeError('sea.optics.absorptionCoefficients requires three coefficients within [0, 4].');
  }
  for (const [name, maximum] of [['absorptionDensity', 4], ['lagoonStart', 100], ['lagoonEnd', 100],
    ['deepStart', 100], ['deepEnd', 100], ['maximumOpticalDistance', 200], ['fresnelStrength', 1]]) {
    if (!Number.isFinite(value[name]) || value[name] < 0 || value[name] > maximum) {
      throw new RangeError(`sea.optics.${name} must be within [0, ${maximum}].`);
    }
  }
  if (value.lagoonEnd <= value.lagoonStart || value.deepEnd <= value.deepStart || value.maximumOpticalDistance <= 0) {
    throw new RangeError('sea.optics depth ramps must increase and maximumOpticalDistance must be positive.');
  }
  return value;
}
