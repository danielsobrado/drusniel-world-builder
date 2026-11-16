import { int, mix, smoothstep, texture, vec2 } from 'three/tsl';
import { acquireWorldNoise } from '../worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../worldNoiseLayout.js';

/** Cloud-noise cells one repeat of the texture spans; divides the 512-cell cloud wrap. */
const DETAIL_CELLS = 2;
/** Swing of the edge detail; the two procedural octaves it replaces summed to 0.1875. */
const DETAIL_SWING = 0.26;
const DETAIL_MEAN = 0.09375;

/**
 * The ragged half of the cloud field, from the world-noise sky layer: turbulent
 * erosion (B) for cumulus looks, stretched wisps (G) for broken ones, by the
 * look's `cloudDetail`. Not the billow cells (R): their creases drew every
 * cloud as a tiled mosaic (2026-11-15 capture). Two taps, turned against each
 * other, at scales that both divide the 512-cell cloud wrap. Centred on the old octaves' mean, so before
 * the texture arrives a cloud is its smooth mass, not a hole.
 */
export function cloudEdgeDetail(cloudUv, cloudDetail) {
  const noise = acquireWorldNoise().texture;
  const sky = int(WORLD_NOISE_LAYERS.sky);
  const a = texture(noise, cloudUv.div(DETAIL_CELLS)).depth(sky);
  const b = texture(noise, vec2(cloudUv.y.negate(), cloudUv.x).div(DETAIL_CELLS * 4).add(vec2(0.37, 0.61))).depth(sky);
  const wisp = smoothstep(0.7, 1.4, cloudDetail);
  const eroder = mix(a.b, a.g, wisp).mul(0.6).add(mix(b.b, b.g, wisp).mul(0.4));
  return eroder.sub(0.5).mul(DETAIL_SWING).add(DETAIL_MEAN);
}
