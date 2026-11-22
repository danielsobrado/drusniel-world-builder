import { bool, clamp, float, max, oneMinus, positionWorld, smoothstep, vec4 } from 'three/tsl';

import { sandFieldConfig } from '../weather/storm/snowField/sandFieldConfig.js';
import { stormFieldSample, stormSandCoverAt } from '../weather/storm/snowField/snowFieldState.js';

/**
 * The desert sand field's shared fetch for a terrain material, or null when the
 * sand is off or no biome lies on sand (then the material compiles as before).
 * @param {{ sand?: readonly number[] }} [arid] biome-looks `arid` tile lists
 */
export function stormSandFieldSample(arid) {
  return sandFieldConfig().enabled && arid?.sand?.length ? stormFieldSample(positionWorld.xz) : null;
}

/**
 * The material weights with a sandstorm's windblown sand laid over them
 * (docs/plans/desert-sand-field-2026-11-22.md): on desert ground only, it fills
 * the bare-ground family as `dirt = max(baked, cover × settles × open)`, and the
 * other families give way in proportion, so the desert's own sand dressing
 * (AridSubstrateNodes) and roughness apply unchanged. The sand field puts it in
 * lee hollows, at the foot of slopes and outcrops and in streaks along the wind.
 *
 * Desert is a table row, not a tile-id branch: the tiles biome-looks lists as
 * `arid: sand`, matched as the arid dressing matches them.
 *
 * @param {Node} weights normalized vec4 grass, dirt, rock, snow
 * @param {object} samples the bake samples (terrainShape, canopyWater, macroTint)
 * @param {Node} tileId the (ecotone-nudged) biome tile id
 * @param {{ sand?: readonly number[] }} [arid] biome-looks `arid` tile lists
 * @param {object} [field] `stormSandFieldSample(arid)`; null returns `weights` itself
 */
export function withStormSand(weights, samples, tileId, arid, field) {
  if (!field) return weights;
  const desert = arid.sand.map((id) => tileId.equal(id)).reduce((a, b) => a.or(b), bool(false)).select(float(1), float(0));
  // Sand slides off past its angle of repose (~34°: terrainShape.r is the gradient).
  const settles = oneMinus(smoothstep(0.5, 0.75, samples.terrainShape.r));
  // Open water takes none.
  const open = oneMinus(samples.canopyWater.g);
  // Broken by the macro tint, so a thin cover creeps in patchily rather than fading up.
  const lateness = clamp(samples.macroTint.g.mul(0.8).sub(0.2), 0, 1).mul(0.5);
  const sandCover = smoothstep(lateness, lateness.add(0.4), stormSandCoverAt(positionWorld.xz, field));
  const sand = max(weights.g, sandCover.mul(settles).mul(open).mul(desert));
  const rest = oneMinus(sand).div(max(oneMinus(weights.g), 1e-4));
  return vec4(weights.r.mul(rest), sand, weights.b.mul(rest), weights.a.mul(rest));
}
