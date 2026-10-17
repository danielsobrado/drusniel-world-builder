import { mix, smoothstep } from 'three/tsl';

/** A short ballistic puff, followed by a quiet interval before the next burst. */
export function resolveParticleBurst(value, path) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must describe a particle burst.`);
  }
  const limits = { lifetime: [0.1, 20], expansion: [1, 4], activeShare: [0.1, 1] };
  return Object.fromEntries(Object.entries(limits).map(([key, [min, max]]) => {
    const number = value[key];
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(`${path}.${key} must be within [${min}, ${max}].`);
    }
    return [key, number];
  }));
}

export function particleBurstNodes(clock, seed, speed, peak, settings) {
  const cycle = clock.mul(mix(0.85, 1.15, speed).div(settings.lifetime)).add(seed).fract();
  const age = cycle.div(settings.activeShare).clamp(0, 1);
  return {
    // Unlike a rising smoke column, droplets fall back towards the surface.
    height: age.mul(age.oneMinus()).mul(4).mul(peak),
    fade: smoothstep(0, 0.08, age).mul(smoothstep(0.2, 1, age).oneMinus().pow(2)),
    scale: mix(0.35, settings.expansion, age),
    erosion: age.mul(0.7),
  };
}
