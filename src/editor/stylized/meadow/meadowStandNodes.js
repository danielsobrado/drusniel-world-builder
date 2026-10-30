import { fract, mix, smoothstep, vec2, vec3 } from 'three/tsl';
import { meadowNoise } from './meadowNoise.js';

/** Tallest a stand's seed stems reach over its profile: page bounds must allow for it. */
export const MEADOW_STAND_MAX_HEIGHT = 1.46;

/**
 * Which grasses share a field. A real sward is several species in drifts, not one
 * plant at varied height: a tall warm rye, a low blue-green fescue, dark low
 * clover-like cover, and among the rye a few seed stems standing clear and straw
 * at the tip. Noise over canonical metres, per stem in the vertex stage; it only
 * reshapes and tints existing stems, so population, LOD prefixes and the far bake
 * (the tones average to about 1) are untouched.
 */
export function meadowStandNodes(canonical, rank) {
  const drift = meadowNoise(canonical.div(6.5).add(vec2(13.1, 57.3)));
  const cover = meadowNoise(canonical.div(2.7).add(vec2(91.7, 23.9)));
  const rye = smoothstep(0.42, 0.3, drift);
  const fescue = smoothstep(0.58, 0.7, drift);
  const clover = smoothstep(0.66, 0.76, cover).mul(rye.oneMinus());
  const seedStem = smoothstep(0.93, 0.95, fract(rank.mul(0.754877))).mul(rye);
  const height = mix(mix(mix(1, 1.12, rye), 0.82, fescue), 0.62, clover).mul(mix(1, 1.3, seedStem));
  const rootTone = mix(mix(mix(vec3(1), vec3(1.06, 1.03, 0.9), rye), vec3(0.88, 0.98, 1.02), fescue), vec3(0.74, 0.86, 0.76), clover);
  const tipTone = mix(mix(mix(vec3(1), vec3(1.12, 1.04, 0.8), rye), vec3(0.84, 0.97, 1.06), fescue), vec3(0.66, 0.82, 0.68), clover);
  return { height, rootTone, tipTone, seedStem };
}
