import { dot, mix, vec3 } from 'three/tsl';

/** Reflectance correction for painted bark; real lighting still owns shade. */
export function resolveBarkGrade(source) {
  if (!source || source.enabled === false) return null;
  const settings = { contrast: .65, pivot: .18, saturation: .88, strength: .55, ...source };
  for (const key of ['contrast', 'pivot', 'saturation', 'strength']) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1) {
      throw new RangeError(`trees.barkGrade.${key} must be in [0, 1].`);
    }
  }
  return settings;
}

export function gradeBark(sample, settings) {
  if (!settings) return sample;
  const luminance = dot(sample, vec3(.2126, .7152, .0722));
  const pigment = mix(vec3(luminance), sample, settings.saturation);
  return mix(sample, pigment.mul(settings.contrast)
    .add(vec3(settings.pivot * (1 - settings.contrast))), settings.strength);
}

/** Linear-light reference for GPU swatches and art controls. */
export function gradeBarkRgb(sample, settings) {
  if (!settings) return [...sample];
  const luminance = sample[0] * .2126 + sample[1] * .7152 + sample[2] * .0722;
  return sample.map(value => {
    const pigment = luminance + (value - luminance) * settings.saturation;
    return value + (pigment * settings.contrast + settings.pivot * (1 - settings.contrast) - value) * settings.strength;
  });
}
