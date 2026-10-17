/** Mean masks measured over 65,536 deterministic samples of the periodic field. */
export const MEADOW_DETAIL_MEAN = Object.freeze({ litter: 0.1585, moss: 0.1729, soil: 0.0897, streaks: 0.1127 });
export const MEADOW_MOSS_TINT = Object.freeze([0.74, 0.9, 0.78]);
export const MEADOW_SOIL_ROOT_SHARE = 0.45;

/** The same substrate mean is used by near shading and the CPU far-color bake. */
export function meadowGroundMean(root, soil, litter, amounts, strength = 1) {
  return root.map((value, channel) => {
    const mix = (a, b, t) => a + (b - a) * t;
    let result = mix(value, litter[channel], MEADOW_DETAIL_MEAN.litter * litter[3]);
    result = mix(result, value * MEADOW_MOSS_TINT[channel], MEADOW_DETAIL_MEAN.moss * amounts[0]);
    result = mix(result, mix(soil[channel], value, MEADOW_SOIL_ROOT_SHARE), MEADOW_DETAIL_MEAN.soil * amounts[1]);
    return mix(value, result, strength);
  });
}
