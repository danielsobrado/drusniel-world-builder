import { abs, clamp, dot, float, mix, pow, reflect, smoothstep, vec3 } from 'three/tsl';
import { locationLight, viewDirection } from '../LocationShading.js';
import { ICE_F0, schlickFresnel } from './IceBrdf.js';

/**
 * Multi-lobe glacial environment reflection: Schlick's Fresnel on the detail
 * normal mirroring a structured cave/sky dome (deep cavern floor bounce, bright
 * overhead crevasse/sky slit, horizon band under open sky, and directional
 * sky-bounce lobes) — paired with selective SSR when post-processing is active.
 *
 * @param {object} options
 * @param {Node} options.normal detail normal, world space
 * @param {number} [options.f0] reflectance at normal incidence
 * @param {Node} options.open 1 where the surface is open to the sky
 * @param {{ gain: number, horizon: number }} options.reflection
 * @param {Node} [options.bakedLight] local baked irradiance to tint cavern reflection
 * @returns {{ facing: Node, fresnel: Node, mirrored: Node, reflectionDir: Node }}
 */
export function iceGloss({ normal, f0 = ICE_F0, open, reflection, bakedLight = null }) {
  const facing = clamp(dot(normal, viewDirection), 0, 1);
  const fresnel = schlickFresnel(facing, f0);
  const direction = reflect(viewDirection.negate(), normal);

  // Structured glacial cave dome: cool sapphire zenith slit, bright cyan horizon, deep indigo cavern floor.
  const upMask = smoothstep(-0.28, 0.36, direction.y);
  const dome = mix(locationLight.ambientDown.mul(0.85), locationLight.ambientUp.mul(1.22), upMask);

  // Overhead crevasse / skylight ribbon: sharp zenith highlight on wet ice floors and upward ledges.
  const zenithSlit = pow(clamp(direction.y, 0, 1), 5.0).mul(mix(float(0.65), float(1.15), open));
  const slitTint = mix(vec3(0.45, 0.80, 1.0), vec3(0.86, 0.95, 1.0), open);

  // Horizon scatter band under open sky (glacier front / cave mouth).
  const nearHorizon = abs(direction.y).oneMinus();
  const horizonBand = nearHorizon.mul(nearHorizon).mul(nearHorizon).mul(nearHorizon);

  // Modulate cavern reflection subtly by local baked irradiance so dark vaults reflect darker indigo
  // and sunlit/lantern-lit chambers reflect richer highlights.
  const localBoost = bakedLight
    ? clamp(dot(bakedLight, vec3(0.25, 0.5, 0.25)).mul(0.35).add(0.75), 0.65, 1.85)
    : float(1);

  const env = dome
    .mul(horizonBand.mul(open).mul(reflection.horizon).add(1))
    .add(locationLight.ambientUp.mul(slitTint).mul(zenithSlit).mul(1.35))
    .mul(reflection.gain)
    .mul(localBoost);

  return { facing, fresnel, mirrored: env.mul(fresnel), reflectionDir: direction };
}
