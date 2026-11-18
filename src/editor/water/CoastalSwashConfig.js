export const COASTAL_SWASH_DEFAULTS = Object.freeze({
  enabled: true,
  fixedHz: 30,
  maxStepsPerFrame: 2,
  texelMeters: 0.25,
  inputTexelMeters: 1,
  highResolution: 256,
  ultraResolution: 512,
  scrollMeters: 8,
  boundaryFadeMeters: 4,
  activationDistanceMeters: 48,
  minSlope: 0.05,
  maxUprushSpeed: 1.3,
  maxBackwashSpeed: 0.9,
  lateralSpeed: 0.08,
  foamInjection: 0.85,
  foamDeposition: 0.35,
  foamWetSeconds: 3.5,
  foamWaterSeconds: 4.5,
  foamDrySeconds: 1.8,
  strandedSeconds: 6.5,
  filmSeconds: 3.2,
  wetSeconds: 18,
  washOff: 0.65,
  strandedOpacity: 0.45,
});

const RANGES = Object.freeze({
  fixedHz: [10, 60], maxStepsPerFrame: [1, 4],
  texelMeters: [0.125, 1], inputTexelMeters: [0.5, 4],
  scrollMeters: [1, 32], boundaryFadeMeters: [0.5, 12],
  activationDistanceMeters: [8, 128], minSlope: [0.01, 0.5],
  maxUprushSpeed: [0.05, 4], maxBackwashSpeed: [0.05, 4],
  lateralSpeed: [0, 0.3], foamInjection: [0, 4],
  foamDeposition: [0, 1], foamWetSeconds: [0.1, 60],
  foamWaterSeconds: [0.1, 60], foamDrySeconds: [0.1, 60],
  strandedSeconds: [0.1, 120], filmSeconds: [0.1, 60],
  wetSeconds: [1, 300], washOff: [0, 3],
  strandedOpacity: [0, 1],
});

export function resolveCoastalSwashConfig(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('water.coast.persistent must be an object.');
  }
  const config = { ...COASTAL_SWASH_DEFAULTS, ...source };
  if (typeof config.enabled !== 'boolean') throw new Error('water.coast.persistent.enabled must be boolean.');
  for (const [name, [min, max]] of Object.entries(RANGES)) {
    if (!Number.isFinite(config[name]) || config[name] < min || config[name] > max) {
      throw new Error(`water.coast.persistent.${name} must be in [${min}, ${max}].`);
    }
  }
  for (const name of ['highResolution', 'ultraResolution']) {
    const size = config[name];
    if (!Number.isInteger(size) || size < 128 || size > 1024 || (size & (size - 1))) {
      throw new Error(`water.coast.persistent.${name} must be a power of two from 128 to 1024.`);
    }
  }
  if (config.highResolution > config.ultraResolution) throw new Error('Persistent swash highResolution must not exceed ultraResolution.');
  for (const resolution of [config.highResolution, config.ultraResolution]) {
    const window = resolution * config.texelMeters;
    if (window % config.inputTexelMeters !== 0 || config.scrollMeters % config.inputTexelMeters !== 0
      || config.scrollMeters % config.texelMeters !== 0 || config.scrollMeters >= window / 2
      || config.boundaryFadeMeters * 2 >= window) {
      throw new Error('Persistent swash window, input, scroll and fade settings must align.');
    }
  }
  if (!Number.isInteger(config.fixedHz) || !Number.isInteger(config.maxStepsPerFrame)) {
    throw new Error('Persistent swash step settings must be integers.');
  }
  return config;
}

export function coastalSwashResolution(config, qualityTier) {
  if (!config.enabled || !['high', 'ultra'].includes(qualityTier)) return 0;
  return qualityTier === 'ultra' ? config.ultraResolution : config.highResolution;
}
