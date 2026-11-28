import { float, min, mix, normalize } from 'three/tsl';

import { surfaceWetnessUniform } from '../../weather/surfaceWetness.js';
import { surfaceCoatings } from './SurfaceCoatingConfig.js';

/**
 * The wet coat: what rain does to any surface's PBR channels. Where it lies (the
 * wetness the surface takes, its crevices, run streaks, ledges, waterline) stays
 * each surface's own mask, as with snow and moss. Terrain, towns, bark, deadwood
 * and rock waterlines all soak through here, so a wet stone, wall and trunk in one
 * shower darken and glint by one rule instead of five.
 *
 * - Albedo darkens by the surface's porosity (`darkening`), never below
 *   `albedoFloor` of itself: stacked soaks took bog peat and wet sand to black.
 * - Roughness only falls, toward the film's (`roughness`), so an already glossy
 *   surface keeps its sheen.
 * - The water film fills fine relief: with `flatNormal`, the shaded normal leans
 *   toward it by `flatten` × wet.
 *
 * @param {{ color, roughness, normal? }} base
 * @param {object} wet
 * @param {Node} wet.amount 0..1 how wet the surface is here (its own mask)
 * @param {number|Node} wet.darkening share of albedo a full soak takes
 * @param {number|Node} [wet.roughness] the film's roughness; leave it out where a later
 *   pass lays the film (bark: `TreeWetSurface`), and only the albedo soaks here
 * @param {Node} [wet.soak] extra albedo loss on top (standing water), still floored
 * @param {Node} [wet.flatNormal] the normal the film levels relief toward
 */
export function wetCoat(base, { amount, darkening, roughness = null, soak = null, flatNormal = null }, settings = surfaceCoatings()) {
  const { wet } = settings;
  if (!wet.enabled) return base;
  const w = float(amount).clamp(0, 1);
  let loss = w.mul(darkening);
  if (soak) loss = loss.add(soak);
  const out = {
    ...base,
    color: base.color.mul(float(1).sub(loss).max(wet.albedoFloor)),
  };
  if (roughness !== null && base.roughness) out.roughness = min(base.roughness, mix(base.roughness, float(roughness), w));
  if (base.normal && flatNormal && wet.flatten > 0) {
    out.normal = normalize(mix(base.normal, flatNormal, w.mul(wet.flatten)));
  }
  return out;
}

/**
 * Rain reaching an object here: the world's wetness, less what the canopy over it
 * catches, by the same share the terrain under that canopy is sheltered (the WSC
 * canopy is the terrain's own). A trunk in a closed wood stays as dry as its floor.
 *
 * @param {Node} canopy 0..1 canopy over the object (e.g. its contact's `canopy`)
 */
export function rainOnObject(canopy, settings = surfaceCoatings()) {
  return surfaceWetnessUniform.mul(float(1).sub(float(canopy).clamp(0, 1).mul(settings.wet.canopyShelter)));
}
