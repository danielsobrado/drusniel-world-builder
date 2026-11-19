import { exp, float, oneMinus, smoothstep, sqrt } from 'three/tsl';
import { createSeaRefractionCarrier } from '../water/SeaRefractionMath.js';

/** Vertex-stage refraction correction using existing water depth and coast distance. */
export function createSeaRefractionPhaseNode({
  waterDepth, shoreDistance, wave, referenceWaveNumber, directional, settings,
}) {
  if (!settings.enabled) return float(0);
  const carrier = createSeaRefractionCarrier(wave, referenceWaveNumber, directional);
  const depth = waterDepth.max(settings.minimumDepthMeters);
  const exponent = exp(depth.mul(-2 * carrier.deepWaveNumber));
  const tanh = oneMinus(exponent).div(exponent.add(1)).max(1e-6);
  const waveNumber = sqrt(float(carrier.referenceTanh).div(tanh))
    .mul(carrier.referenceWaveNumber)
    .clamp(carrier.deepWaveNumber, carrier.referenceWaveNumber * settings.maximumWaveNumberRatio);
  const normalWaveNumber = sqrt(waveNumber.mul(waveNumber)
    .sub(carrier.tangentWaveNumber * carrier.tangentWaveNumber).max(1e-6));
  const distance = shoreDistance.max(0);
  const phaseDistance = distance.div(distance.div(settings.maximumPhaseDistanceMeters).add(1));
  const weight = oneMinus(smoothstep(settings.fadeStartMeters, settings.fadeEndMeters, depth))
    .mul(settings.strength);
  return normalWaveNumber.sub(carrier.normalReferenceWaveNumber)
    .mul(phaseDistance).mul(weight);
}
