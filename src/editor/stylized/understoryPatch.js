import { mix, positionWorld, varying, vec3, vec4 } from 'three/tsl';
import { canonicalFromRender } from '../weather/wind/worldWindState.js';
import { MEADOW_GRASS_DEFAULTS } from './meadow/meadowGrassConfig.js';
import { meadowPatchColors } from './meadow/meadowColorNodes.js';
import { worldNoiseField } from './worldNoise.js';
import { WORLD_NOISE_LAYERS } from './worldNoiseLayout.js';

/** Share of the grass's dry tone a shrub or floor plant takes: leaves hold out longer than blades. */
const UNDERSTORY_DRY_SHARE = 0.6;

/**
 * The meadow's own patch field, on a plant: where the grass round it is warm,
 * cool or dry, so is the plant. Without it the understory kept one colour
 * across patches the grass moved through, and read as laid on top.
 *
 * Per vertex (two taps of the world noise), carried as varyings: the field
 * turns over metres, far slower than a leaf.
 *
 * @param {object} color vec3 plant albedo
 * @param {object} config `stylizedSurface`
 */
export function meadowPatchOnPlant(color, config) {
  const appearance = { ...MEADOW_GRASS_DEFAULTS.appearance, ...config?.grass?.meadow?.appearance };
  const patch = meadowPatchColors(canonicalFromRender(positionWorld.xz), appearance, {
    noiseField: worldNoiseField(WORLD_NOISE_LAYERS.macro),
  });
  const appearancePatch = varying(vec4(patch.tint, patch.dry), 'understoryPatch');
  return mix(color.mul(appearancePatch.rgb), vec3(patch.dryColor).mul(1.05), appearancePatch.a.mul(UNDERSTORY_DRY_SHARE));
}
