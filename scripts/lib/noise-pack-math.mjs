/** Mean and spread every packed noise channel is stretched to, in 0..1. */
export const NOISE_TARGET_MEAN = 0.5;
export const NOISE_TARGET_STD = 0.2;

/**
 * Rescales a noise so every channel has the same mean and contrast: the library's
 * Perlin fields use barely a third of the range, and a shader threshold tuned on
 * one would mean something else on the next. Clamped to 0..1.
 *
 * @param {Float32Array} values 0..1
 * @returns {Float32Array}
 */
export function stretchToTarget(values, mean = NOISE_TARGET_MEAN, std = NOISE_TARGET_STD) {
  let sum = 0;
  for (const value of values) sum += value;
  const sourceMean = sum / values.length;
  let variance = 0;
  for (const value of values) variance += (value - sourceMean) ** 2;
  const sourceStd = Math.sqrt(variance / values.length) || 1;
  return Float32Array.from(values, (value) => Math.min(1, Math.max(0, mean + (value - sourceMean) * (std / sourceStd))));
}
