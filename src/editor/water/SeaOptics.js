/** Ocean optical coefficients are defined per metre in linear light. */
export const DEFAULT_SEA_OPTICS = Object.freeze({
  enabled: true,
  model: 'spectralSingleScatter',
  sunny: Object.freeze({ lagoon: '#4fd3cf', shallow: '#259eac', deep: '#073c58' }),
  storm: Object.freeze({ lagoon: '#2f8a80', shallow: '#176662', deep: '#032d48' }),
  absorptionCoefficients: Object.freeze([0.896, 0.182, 0.14]),
  scatteringCoefficients: Object.freeze([0.025, 0.045, 0.07]),
  scattering: Object.freeze({
    ambientStrength: 0.65, sunlightStrength: 0.35,
    anisotropy: 0.35, stormTurbidityMultiplier: 1.8,
  }),
  opticalDistance: Object.freeze({
    maximumMeters: 43, refractiveIndex: 1.333, minimumCosine: 0.15,
  }),
  seabed: Object.freeze({ visibilityStrength: 1 }),
  quality: Object.freeze({
    medium: 'absorption', high: 'singleScatter', ultra: 'directionalSingleScatter',
  }),
  absorptionDensity: 0.22,
  lagoonStart: 0.18, lagoonEnd: 2.5, deepStart: 0.71, deepEnd: 8.6,
  maximumOpticalDistance: 43,
  fresnelStrength: 0.85,
});

const OPTICAL_MODELS = new Set(['legacy', 'spectralSingleScatter']);
const SCATTER_MODES = new Set(['absorption', 'singleScatter', 'directionalSingleScatter']);

function assertObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`sea.optics.${path} must be an object.`);
  }
}

function assertRange(value, path, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`sea.optics.${path} must be within [${minimum}, ${maximum}].`);
  }
}

function assertCoefficients(values, path) {
  if (!Array.isArray(values) || values.length !== 3) {
    throw new RangeError(`sea.optics.${path} requires three RGB coefficients.`);
  }
  values.forEach((value, index) => assertRange(value, `${path}[${index}]`, 0, 4));
}

export function resolveSeaOptics(source = {}) {
  assertObject(source, 'root');
  const value = { ...DEFAULT_SEA_OPTICS, ...source };
  if (typeof value.enabled !== 'boolean') throw new TypeError('sea.optics.enabled must be boolean.');
  if (!OPTICAL_MODELS.has(value.model)) throw new RangeError('sea.optics.model is unsupported.');
  for (const palette of ['sunny', 'storm']) {
    assertObject(source[palette] ?? {}, palette);
    value[palette] = { ...DEFAULT_SEA_OPTICS[palette], ...source[palette] };
    for (const [name, color] of Object.entries(value[palette])) {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
        throw new TypeError(`sea.optics.${palette}.${name} must be a six-digit hex color.`);
      }
    }
  }
  assertCoefficients(value.absorptionCoefficients, 'absorptionCoefficients');
  assertCoefficients(value.scatteringCoefficients, 'scatteringCoefficients');
  value.absorptionCoefficients = Object.freeze([...value.absorptionCoefficients]);
  value.scatteringCoefficients = Object.freeze([...value.scatteringCoefficients]);
  for (const key of ['scattering', 'opticalDistance', 'seabed', 'quality']) {
    assertObject(source[key] ?? {}, key);
    value[key] = { ...DEFAULT_SEA_OPTICS[key], ...source[key] };
  }
  for (const [key, maximum] of [
    ['ambientStrength', 2], ['sunlightStrength', 2], ['anisotropy', 0.9],
    ['stormTurbidityMultiplier', 5],
  ]) assertRange(value.scattering[key], `scattering.${key}`, key === 'stormTurbidityMultiplier' ? 1 : 0, maximum);
  assertRange(value.opticalDistance.maximumMeters, 'opticalDistance.maximumMeters', 0.1, 200);
  assertRange(value.opticalDistance.refractiveIndex, 'opticalDistance.refractiveIndex', 1, 2);
  assertRange(value.opticalDistance.minimumCosine, 'opticalDistance.minimumCosine', 0.05, 1);
  assertRange(value.seabed.visibilityStrength, 'seabed.visibilityStrength', 0, 1);
  for (const tier of ['medium', 'high', 'ultra']) {
    if (!SCATTER_MODES.has(value.quality[tier])) throw new RangeError(`sea.optics.quality.${tier} is unsupported.`);
  }
  for (const [name, maximum] of [
    ['absorptionDensity', 4], ['lagoonStart', 100], ['lagoonEnd', 100],
    ['deepStart', 100], ['deepEnd', 100], ['maximumOpticalDistance', 200],
    ['fresnelStrength', 1],
  ]) assertRange(value[name], name, 0, maximum);
  if (value.lagoonEnd <= value.lagoonStart || value.deepEnd <= value.deepStart || value.maximumOpticalDistance <= 0) {
    throw new RangeError('sea.optics depth ramps must increase and maximumOpticalDistance must be positive.');
  }
  return value;
}

export function seaOpticsMode(settings, tier = 'high') {
  if (!settings.enabled || settings.model !== 'spectralSingleScatter' || tier === 'low') return 'legacy';
  return settings.quality[tier] ?? settings.quality.high;
}
