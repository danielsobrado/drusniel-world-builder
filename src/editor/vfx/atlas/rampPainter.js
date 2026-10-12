import { RAMP } from './ParticleAtlasLayout.js';

/**
 * Colour ramps indexed by heat (0 cold → 1 hottest). RGB is linear colour;
 * A is the emission weight the shader multiplies by the particle's HDR
 * emissive, so cold ends neither glow nor bloom.
 *
 * Every element shares the same shape — dark, saturated mid, near-white
 * peak — which is what makes one heat value read as "hot" in any colour.
 */
export const RAMP_KEYS = Object.freeze({
  [RAMP.BLACKBODY]: [
    [0, 0.015, 0.012, 0.01, 0],
    [0.14, 0.22, 0.02, 0.004, 0.03],
    [0.32, 0.75, 0.12, 0.012, 0.2],
    [0.52, 1, 0.36, 0.04, 0.45],
    [0.72, 1, 0.66, 0.2, 0.72],
    [0.88, 1, 0.86, 0.55, 0.9],
    [1, 1, 0.97, 0.88, 1],
  ],
  [RAMP.FROST]: [
    [0, 0.02, 0.04, 0.08, 0],
    [0.4, 0.08, 0.28, 0.7, 0.2],
    [0.7, 0.4, 0.78, 1, 0.55],
    [1, 0.9, 0.97, 1, 1],
  ],
  [RAMP.ACID]: [
    [0, 0.02, 0.035, 0, 0],
    [0.4, 0.16, 0.5, 0.01, 0.22],
    [0.72, 0.5, 1, 0.1, 0.6],
    [1, 0.9, 1, 0.65, 1],
  ],
  [RAMP.ARCANE]: [
    [0, 0.02, 0, 0.05, 0],
    [0.35, 0.3, 0.04, 0.75, 0.25],
    [0.7, 0.6, 0.4, 1, 0.6],
    [1, 0.95, 0.9, 1, 1],
  ],
  [RAMP.NECROTIC]: [
    [0, 0.01, 0, 0.015, 0],
    [0.38, 0.2, 0.02, 0.3, 0.14],
    [0.7, 0.4, 0.85, 0.28, 0.5],
    [1, 0.82, 1, 0.75, 0.9],
  ],
  [RAMP.HOLY]: [
    [0, 0.04, 0.025, 0, 0],
    [0.4, 0.7, 0.42, 0.06, 0.3],
    [0.75, 1, 0.8, 0.36, 0.65],
    [1, 1, 0.98, 0.88, 1],
  ],
  [RAMP.LIGHTNING]: [
    [0, 0, 0.01, 0.05, 0],
    [0.35, 0.12, 0.22, 0.9, 0.25],
    [0.7, 0.48, 0.72, 1, 0.65],
    [1, 0.95, 0.97, 1, 1],
  ],
  [RAMP.MOON]: [
    [0, 0.01, 0.02, 0.04, 0],
    [0.5, 0.36, 0.5, 0.85, 0.35],
    [1, 0.92, 0.96, 1, 1],
  ],
});

/** Linear interpolation through a ramp's keys at `t` ∈ [0, 1]. */
export function evaluateRamp(keys, t, target = [0, 0, 0, 0]) {
  const clamped = Math.min(1, Math.max(0, t));
  let upper = 1;
  while (upper < keys.length - 1 && keys[upper][0] < clamped) upper += 1;
  const a = keys[upper - 1];
  const b = keys[upper];
  const span = Math.max(1e-6, b[0] - a[0]);
  const mix = Math.min(1, Math.max(0, (clamped - a[0]) / span));
  for (let channel = 0; channel < 4; channel += 1) {
    target[channel] = a[channel + 1] + (b[channel + 1] - a[channel + 1]) * mix;
  }
  return target;
}
