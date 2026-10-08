import { color, float, mix, smoothstep, vec3 } from 'three/tsl';
import { meadowNoise } from './meadowNoise.js';

/** grass-test's cool/warm pigment and broad dry patches, in canonical metres. */
export function meadowPatchColors(canonical, appearance, {
  patchScale = appearance.patchScale,
  patchCool = vec3(...appearance.patchCool),
  patchWarm = vec3(...appearance.patchWarm),
} = {}) {
  const patch = meadowNoise(canonical.mul(patchScale)).mul(0.65)
    .add(meadowNoise(canonical.mul(float(patchScale).mul(2.7)).add(19.3)).mul(0.35));
  const tint = mix(patchCool, patchWarm, smoothstep(0.15, 0.85, patch));
  const dry = appearance.dryStrength > 0
    ? smoothstep(appearance.dryStart, appearance.dryEnd,
      meadowNoise(canonical.mul(appearance.dryPatchScale).add(53.7))).mul(appearance.dryStrength)
    : float(0);
  return { tint, dry, dryColor: color(appearance.dryColor) };
}
