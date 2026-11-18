const DEFAULTS = Object.freeze({
  enabled: false,
  activationDistanceMeters: 64,
  fullEffectDistanceMeters: 32,
  contactReachMeters: 1.5,
  exposedHeightThresholdMeters: 0.1,
  maximumCandidates: 64,
  maximumActiveSites: 24,
  minimumImpactIntensity: 0.22,
  minimumIntervalSeconds: 0.65,
  referenceWaveHeightMeters: 1.4,
  foam: Object.freeze({
    strength: 0.85,
    widthMeters: 0.4,
    decaySeconds: 2.2,
    wakeStrength: 0.35,
  }),
  wetness: Object.freeze({
    decaySeconds: 18,
    runoffSeconds: 3.5,
    darkeningStrength: 0.28,
    freshRoughness: 0.25,
    normalWetReachMeters: 0.55,
    strongWetReachMeters: 1.5,
  }),
  spray: Object.freeze({
    enabled: true,
    minimumIntensity: 0.22,
    highMaxDroplets: 512,
    ultraMaxDroplets: 1536,
    highMaxMist: 64,
    ultraMaxMist: 160,
    mistLifetimeMin: 0.8,
    mistLifetimeMax: 2.4,
    verticalSpeedMin: 1.5,
    verticalSpeedMax: 4.5,
    horizontalSpeedMin: 0.4,
    horizontalSpeedMax: 2.2,
    minLifetimeSeconds: 0.35,
    maxLifetimeSeconds: 1.1,
  }),
  field: Object.freeze({
    resolution: 256,
    spanMeters: 64,
    updateHz: 15,
    scrollMeters: 8,
    boundaryFadeMeters: 4,
  }),
  quality: Object.freeze({ low: false, medium: true, high: true, ultra: true }),
});

function bounded(value, name, low, high) {
  if (!Number.isFinite(value) || value < low || value > high) {
    throw new Error('water.coast.rockImpact.' + name + ' must be within [' + low + ', ' + high + '].');
  }
}

export function resolveCoastalRockImpactConfig(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('water.coast.rockImpact must be an object.');
  }
  const result = {
    ...DEFAULTS, ...source,
    foam: { ...DEFAULTS.foam, ...source.foam },
    wetness: { ...DEFAULTS.wetness, ...source.wetness },
    spray: { ...DEFAULTS.spray, ...source.spray },
    field: { ...DEFAULTS.field, ...source.field },
    quality: { ...DEFAULTS.quality, ...source.quality },
  };
  for (const [name, value] of [['enabled', result.enabled], ['spray.enabled', result.spray.enabled]]) {
    if (typeof value !== 'boolean') throw new Error('water.coast.rockImpact.' + name + ' must be a boolean.');
  }
  for (const [name, value] of Object.entries(result.quality)) {
    if (!['low', 'medium', 'high', 'ultra'].includes(name) || typeof value !== 'boolean') {
      throw new Error('water.coast.rockImpact.quality.' + name + ' must be a supported boolean tier.');
    }
  }
  const scalar = {
    activationDistanceMeters: [8, 256], fullEffectDistanceMeters: [4, 128],
    contactReachMeters: [0, 10], exposedHeightThresholdMeters: [0, 2],
    maximumCandidates: [1, 512], maximumActiveSites: [1, 64],
    minimumImpactIntensity: [0, 1], minimumIntervalSeconds: [0.1, 10],
    referenceWaveHeightMeters: [0.1, 10],
  };
  const ranges = {
    foam: { strength: [0, 2], widthMeters: [0.05, 2], decaySeconds: [0.1, 30], wakeStrength: [0, 2] },
    wetness: { decaySeconds: [1, 120], runoffSeconds: [0.1, 30], darkeningStrength: [0, 0.8],
      freshRoughness: [0.05, 1], normalWetReachMeters: [0.05, 4], strongWetReachMeters: [0.1, 8] },
    spray: { minimumIntensity: [0, 1], highMaxDroplets: [0, 2048], ultraMaxDroplets: [0, 4096],
      highMaxMist: [0, 256], ultraMaxMist: [0, 512],
      mistLifetimeMin: [0.1, 5], mistLifetimeMax: [0.2, 6],
      verticalSpeedMin: [0, 10], verticalSpeedMax: [0, 15],
      horizontalSpeedMin: [0, 10], horizontalSpeedMax: [0, 15],
      minLifetimeSeconds: [0.1, 5], maxLifetimeSeconds: [0.1, 10] },
    field: { resolution: [256, 256], spanMeters: [16, 256],
      updateHz: [1, 60], scrollMeters: [1, 64], boundaryFadeMeters: [0.5, 16] },
  };
  for (const [name, [a, b]] of Object.entries(scalar)) bounded(result[name], name, a, b);
  for (const [section, names] of Object.entries(ranges)) {
    for (const [name, [a, b]] of Object.entries(names)) bounded(result[section][name], section + '.' + name, a, b);
  }
  for (const name of ['maximumCandidates', 'maximumActiveSites']) {
    if (!Number.isInteger(result[name])) throw new Error('water.coast.rockImpact.' + name + ' must be an integer.');
  }
  for (const name of ['highMaxDroplets', 'ultraMaxDroplets', 'highMaxMist', 'ultraMaxMist']) {
    if (!Number.isInteger(result.spray[name])) throw new Error('water.coast.rockImpact.spray.' + name + ' must be an integer.');
  }
  if (!Number.isInteger(result.field.resolution) || (result.field.resolution & (result.field.resolution - 1))) {
    throw new Error('water.coast.rockImpact.field.resolution must be a power of two.');
  }
  if (result.maximumActiveSites > result.maximumCandidates
    || result.fullEffectDistanceMeters > result.activationDistanceMeters
    || result.wetness.strongWetReachMeters < result.wetness.normalWetReachMeters
    || result.spray.verticalSpeedMax < result.spray.verticalSpeedMin
    || result.spray.horizontalSpeedMax < result.spray.horizontalSpeedMin
    || result.spray.maxLifetimeSeconds < result.spray.minLifetimeSeconds
    || result.spray.mistLifetimeMax < result.spray.mistLifetimeMin
    || result.field.boundaryFadeMeters * 2 >= result.field.spanMeters
    || result.field.scrollMeters > result.field.spanMeters / 4
    || !Number.isInteger(result.field.scrollMeters / (result.field.spanMeters / result.field.resolution))) {
    throw new Error('water.coast.rockImpact settings have invalid ordered ranges or field alignment.');
  }
  return result;
}

export function coastalRockImpactEnabled(settings, tier) {
  return settings.enabled && Boolean(settings.quality[tier ?? 'high']);
}
