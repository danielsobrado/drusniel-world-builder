import { color, float, mix, smoothstep, vec2, vec3 } from 'three/tsl';
import { meadowNoise } from './meadowNoise.js';

/** grass-test's cool/warm pigment and broad dry patches, in canonical metres. */
export function meadowPatchColors(canonical, appearance, {
  patchScale = appearance.patchScale,
  patchCool = vec3(...appearance.patchCool),
  patchWarm = vec3(...appearance.patchWarm),
  noiseField = null,
} = {}) {
  if (noiseField) return patchColorsFromNoise(canonical, appearance, patchCool, patchWarm, noiseField);
  const patch = meadowNoise(canonical.mul(patchScale)).mul(0.65)
    .add(meadowNoise(canonical.mul(float(patchScale).mul(2.7)).add(19.3)).mul(0.35));
  const tint = mix(patchCool, patchWarm, smoothstep(0.15, 0.85, patch));
  const dry = appearance.dryStrength > 0
    ? smoothstep(appearance.dryStart, appearance.dryEnd,
      meadowNoise(canonical.mul(appearance.dryPatchScale).add(53.7))).mul(appearance.dryStrength)
    : float(0);
  return { tint, dry, dryColor: color(appearance.dryColor) };
}

/** Metres one repeat of the macro noise spans here: B gives ~16 m patches, G ~37 m dry runs, R the field-wide drift. */
export const MEADOW_PATCH_METERS = 224;
/** The texture is packed wider than the gradient noise it replaces (std 0.2 against 0.14). */
const NOISE_CONTRAST = 0.7;
/** How far a whole field drifts in value over a couple of hundred metres. */
const FIELD_DRIFT = 0.07;

/**
 * The same patches from the macro layer of the world noise: two taps, turned and
 * rescaled against each other so the repeat never shows, in place of three
 * gradient noises per blade vertex and per terrain pixel. The blades, the far
 * cards, the terrain under them and the understory all read this, so a dry
 * patch is dry in every layer.
 */
function patchColorsFromNoise(canonical, appearance, patchCool, patchWarm, noiseField) {
  const a = noiseField(canonical.div(MEADOW_PATCH_METERS));
  const b = noiseField(vec2(canonical.y.negate(), canonical.x).div(MEADOW_PATCH_METERS * 1.618).add(0.31));
  const field = a.mul(0.62).add(b.mul(0.38)).sub(0.5).mul(NOISE_CONTRAST).add(0.5);
  const tint = mix(patchCool, patchWarm, smoothstep(0.15, 0.85, field.b))
    .mul(field.r.sub(0.5).mul(FIELD_DRIFT * 2 / NOISE_CONTRAST).add(1));
  const dry = appearance.dryStrength > 0
    ? smoothstep(appearance.dryStart, appearance.dryEnd, field.g).mul(appearance.dryStrength)
    : float(0);
  return { tint, dry, dryColor: color(appearance.dryColor) };
}
