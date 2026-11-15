import { abs, clamp, dot, mix, reflect, smoothstep } from 'three/tsl';
import { locationLight, viewDirection } from '../LocationShading.js';

/**
 * The mirror of wet, hard ice: Schlick's Fresnel on the detail normal, so the
 * sky shows in the ice at grazing angles and moves across each scallop as the
 * view does.
 *
 * The only environment colours a location has are its two ambients, which a
 * lighting profile keeps low beside the baked sky. `gain` scales them back up to
 * the radiance of what the ice mirrors; under an open sky the dome is brightest
 * at its horizon, where it is seen through the most air.
 *
 * @param {object} options
 * @param {Node} options.normal detail normal, world space
 * @param {number} options.f0 reflectance at normal incidence
 * @param {Node} options.open 1 where the surface is open to the sky
 * @param {{ gain: number, horizon: number }} options.reflection
 * @returns {{ facing: Node, fresnel: Node, mirrored: Node }} facing: cosine of the view to the normal;
 *   fresnel 0..1 share of light turned back at the surface; mirrored rgb, the reflection before roughness and cover
 */
export function iceGloss({ normal, f0, open, reflection }) {
  const facing = clamp(dot(normal, viewDirection), 0, 1);
  const grazing = facing.oneMinus();
  const squared = grazing.mul(grazing);
  const fresnel = squared.mul(squared).mul(grazing).mul(1 - f0).add(f0);
  const direction = reflect(viewDirection.negate(), normal);
  const dome = mix(locationLight.ambientDown, locationLight.ambientUp, smoothstep(-0.3, 0.3, direction.y));
  const nearHorizon = abs(direction.y).oneMinus();
  const horizonBand = nearHorizon.mul(nearHorizon).mul(nearHorizon).mul(nearHorizon);
  const sky = dome.mul(horizonBand.mul(open).mul(reflection.horizon).add(1)).mul(reflection.gain);
  return { facing, fresnel, mirrored: sky.mul(fresnel) };
}
