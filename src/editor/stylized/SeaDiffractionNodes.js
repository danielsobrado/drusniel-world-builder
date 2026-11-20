import { clamp, float, mix, oneMinus, smoothstep } from 'three/tsl';

/** The factor is one on an exposed coast, zero only at full shelter. */
export function createSeaShelterNode(exposure, shoreDistance) {
  const openExposure = mix(float(0.3), float(1), smoothstep(4, 36, shoreDistance));
  return clamp(exposure.div(openExposure), 0, 1);
}

/** Uses the same baseline exposure and extra path delay as the CPU surf. */
export function createSeaDiffractionPhaseNode({ exposure, shoreDistance, wave, settings }) {
  if (!settings.enabled) return float(0);
  return oneMinus(createSeaShelterNode(exposure, shoreDistance))
    .mul(-wave.waveNumber * settings.phaseLagMeters);
}
