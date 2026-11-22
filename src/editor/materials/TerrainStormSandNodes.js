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
 * How much windblown sand a sandstorm has drifted onto this point, 0..1
 * (docs/plans/desert-sand-field-2026-11-22.md): on desert ground only, where the
 * sand field puts it (lee hollows, the foot of slopes and outcrops, streaks along
 * the wind), and never on faces past sand's angle of repose or on open water.
 *
 * Desert is a table row, not a tile-id branch: the tiles biome-looks lists as
 * `arid: sand`, matched as the arid dressing matches them.
 *
 * @param {object} samples the bake samples (terrainShape, canopyWater, macroTint)
 * @param {Node} tileId the (ecotone-nudged) biome tile id
 * @param {{ sand: readonly number[] }} arid biome-looks `arid` tile lists
 * @param {object} field `stormSandFieldSample(arid)`
 */
export function stormSandDrift(samples, tileId, arid, field) {
  const desert = arid.sand.map((id) => tileId.equal(id)).reduce((a, b) => a.or(b), bool(false)).select(float(1), float(0));
  // Sand slides off past its angle of repose (~34°: terrainShape.r is the gradient).
  const settles = oneMinus(smoothstep(0.5, 0.75, samples.terrainShape.r));
  const open = oneMinus(samples.canopyWater.g);
  // Broken by the macro tint, so a thin cover creeps in patchily rather than fading up.
  const lateness = clamp(samples.macroTint.g.mul(0.8).sub(0.2), 0, 1).mul(0.5);
  const cover = smoothstep(lateness, lateness.add(0.4), stormSandCoverAt(positionWorld.xz, field));
  return cover.mul(settles).mul(open).mul(desert);
}

/**
 * The material weights with the drifted sand laid over them, as storm snow lays
 * its own: the bare-ground family (the desert's sand) takes
 * `max(baked, drift)` and the others give way in proportion, so drifts bury the
 * stone, scrub and litter between them. At no drift the weights pass through.
 * @param {Node} weights normalized vec4 grass, dirt, rock, snow
 * @param {Node|null} drift `stormSandDrift`; null returns `weights` itself
 */
export function withStormSand(weights, drift) {
  if (!drift) return weights;
  const sand = max(weights.g, drift);
  const rest = oneMinus(sand).div(max(oneMinus(weights.g), 1e-4));
  return vec4(weights.r.mul(rest), sand, weights.b.mul(rest), weights.a.mul(rest));
}

/**
 * Fresh windblown sand is finer and paler than the erg's wind-sorted lag, so a
 * drift lifts the ground's colour by `paleness`; on an erg that is already all
 * bare ground, that is what shows the drifts.
 * @param {Node} color
 * @param {Node|null} drift `stormSandDrift`; null returns `color` itself
 */
export function withFreshSandColor(color, drift) {
  return drift ? color.mul(drift.mul(sandFieldConfig().paleness).add(1)) : color;
}
