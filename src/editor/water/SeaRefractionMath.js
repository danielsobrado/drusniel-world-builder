export const SEA_REFRACTION_DEFAULTS = Object.freeze({
  enabled: false,
  strength: 0.85,
  minimumDepthMeters: 0.4,
  maximumWaveNumberRatio: 2.2,
  fadeStartMeters: 0.5,
  fadeEndMeters: 6,
  maximumPhaseDistanceMeters: 40,
});

const EPSILON = 1e-6;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(start, end, value) {
  const amount = clamp((value - start) / (end - start), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

/** Shared carrier constants for the CPU waves and the TSL vertex shader. */
export function createSeaRefractionCarrier(wave, referenceWaveNumber, directional) {
  const tangentWaveNumber = wave.waveNumber * directional.obliquity;
  return Object.freeze({
    deepWaveNumber: wave.waveNumber,
    referenceWaveNumber,
    referenceTanh: Math.tanh(wave.waveNumber * directional.referenceDepthMeters),
    tangentWaveNumber,
    normalReferenceWaveNumber: Math.sqrt(Math.max(
      referenceWaveNumber * referenceWaveNumber - tangentWaveNumber * tangentWaveNumber, EPSILON)),
  });
}

/** Bounded Eckart dispersion approximation and Snell-law normal wave number. */
export function sampleSeaRefraction(depth, shoreDistance, carrier, refraction) {
  const depthMeters = Math.max(
    refraction.minimumDepthMeters,
    Number.isFinite(depth) ? depth : 0,
  );
  const exponent = Math.exp(-2 * carrier.deepWaveNumber * depthMeters);
  const tanh = Math.max((1 - exponent) / (1 + exponent), EPSILON);
  const localWaveNumber = clamp(
    carrier.referenceWaveNumber * Math.sqrt(carrier.referenceTanh / tanh),
    carrier.deepWaveNumber,
    carrier.referenceWaveNumber * refraction.maximumWaveNumberRatio,
  );
  const normalWaveNumber = Math.sqrt(Math.max(
    localWaveNumber * localWaveNumber - carrier.tangentWaveNumber * carrier.tangentWaveNumber, EPSILON,
  ));
  const refractedSine = clamp(carrier.tangentWaveNumber / localWaveNumber, 0, 1);
  const reach = refraction.maximumPhaseDistanceMeters;
  const distance = Math.max(0, Number.isFinite(shoreDistance) ? shoreDistance : 0);
  const phaseDistance = distance / (1 + distance / reach);
  const strength = refraction.enabled
    ? refraction.strength * (1 - smoothstep(refraction.fadeStartMeters, refraction.fadeEndMeters, depthMeters))
    : 0;
  return {
    localWaveNumber,
    normalWaveNumber,
    refractedSine,
    phaseShift: phaseDistance === 0 || strength === 0 ? 0
      : (normalWaveNumber - carrier.normalReferenceWaveNumber) * phaseDistance * strength,
  };
}

/** Signed phase correction; no canonical coordinates enter this calculation. */
export function seaRefractionPhaseShift(depth, shoreDistance, wave, index, settings) {
  if (!settings.refraction.enabled) return 0;
  const carrier = settings.directional.refractionCarriers[index];
  return sampleSeaRefraction(depth, shoreDistance, carrier, settings.refraction).phaseShift;
}

