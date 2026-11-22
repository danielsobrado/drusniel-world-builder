import {
  clamp, cos, dot, exp, float, max, mix, normalize, pow, sin, smoothstep, vec3,
} from 'three/tsl';
import { viewDirection } from '../LocationShading.js';

/** Physical dielectric Fresnel F0 of water ice (IOR 1.31): ((1.31-1)/(1.31+1))^2 ≈ 0.018. */
export const ICE_IOR = 1.31;
export const ICE_F0 = ((ICE_IOR - 1) / (ICE_IOR + 1)) ** 2;

const PI = Math.PI;
const INV_PI = 1 / PI;

/**
 * Schlick Fresnel reflectance for a dielectric or crystal surface.
 *
 * @param {Node} cosTheta clamp(dot(N, V or H), 0, 1)
 * @param {Node|number} f0
 */
export function schlickFresnel(cosTheta, f0 = ICE_F0) {
  const oneMinus = clamp(cosTheta, 0, 1).oneMinus();
  const sq = oneMinus.mul(oneMinus);
  return float(f0).add(float(1).sub(f0).mul(sq.mul(sq).mul(oneMinus)));
}

/**
 * Energy-conserving Cook-Torrance GGX microfacet specular lobe.
 *
 * @param {Node} normal world-space surface normal (unit)
 * @param {Node} toLight unit vector toward light source
 * @param {Node} roughness perceptual roughness (0.04..1)
 * @param {Node|number} [f0]
 * @returns {Node} scalar specular radiance weight (already multiplied by N·L)
 */
export function ggxSpecular(normal, toLight, roughness, f0 = ICE_F0) {
  const ndl = clamp(dot(normal, toLight), 0, 1);
  const ndv = max(dot(normal, viewDirection), 1e-3);
  const halfVec = normalize(toLight.add(viewDirection));
  const ndh = clamp(dot(normal, halfVec), 0, 1);
  const vdh = clamp(dot(viewDirection, halfVec), 0, 1);

  const r = clamp(roughness, 0.045, 1);
  const a = r.mul(r);
  const a2 = a.mul(a);

  // Trowbridge-Reitz GGX NDF
  const denomD = ndh.mul(ndh).mul(a2.sub(1)).add(1);
  const D = a2.div(max(denomD.mul(denomD).mul(PI), 1e-5));

  // Height-correlated Smith-Schlick GGX visibility term (G / (4 * ndl * ndv))
  const k = r.add(1).mul(r.add(1)).mul(0.125);
  const gv = ndv.div(ndv.mul(float(1).sub(k)).add(k));
  const gl = ndl.div(ndl.mul(float(1).sub(k)).add(k));
  const vis = gv.mul(gl).div(max(ndv.mul(ndl).mul(4), 1e-4));

  const F = schlickFresnel(vdh, f0);
  // Subtle multi-scattering energy compensation for rough frosty surfaces.
  const multiBoost = float(1).add(float(f0).mul(r.mul(0.55)));
  return D.mul(vis).mul(F).mul(ndl).mul(multiBoost).min(18);
}

/**
 * Dual-lobe specular for glacial ice: primary crystalline microfacet GGX lobe
 * plus a crisp wet meltwater clearcoat lobe (`coatRoughness ≈ 0.05`).
 *
 * @param {object} params
 * @param {Node} params.normal
 * @param {Node} params.toLight
 * @param {Node} params.roughness
 * @param {Node} params.clearcoat 0..1 strength of the wet meltwater glaze
 * @param {Node|number} [params.coatRoughness]
 * @param {Node|number} [params.f0]
 */
export function iceDualSpecular({
  normal,
  toLight,
  roughness,
  clearcoat,
  coatRoughness = 0.055,
  f0 = ICE_F0,
}) {
  const baseLobe = ggxSpecular(normal, toLight, roughness, f0);
  const coatLobe = ggxSpecular(normal, toLight, float(coatRoughness), 0.024).mul(clearcoat);
  return baseLobe.add(coatLobe.mul(0.85));
}

/**
 * Restrained thin-film spectral iridescence for grazing crystal facets & frost films.
 * Evaluates a physical cosine interference palette shifted by view angle and local film thickness.
 *
 * @param {Node} ndv clamp(dot(N, V), 0, 1)
 * @param {Node} phase local crystal film thickness variation (0..1)
 * @param {Node|number} strength 0..1
 */
export function iceIridescence(ndv, phase, strength) {
  const grazing = clamp(ndv, 0, 1).oneMinus();
  const angleBand = pow(grazing, 2.2).mul(smoothstep(0.02, 0.25, ndv));
  const shift = grazing.mul(5.2).add(phase.mul(3.4));
  // Cool glacial spectrum: cyan -> ice-violet -> pale turquoise (never neon rainbow).
  const specR = cos(shift.add(0.4)).mul(0.5).add(0.5).mul(0.55).add(0.28);
  const specG = cos(shift.add(2.1)).mul(0.5).add(0.5).mul(0.35).add(0.62);
  const specB = sin(shift.add(1.2)).mul(0.5).add(0.5).mul(0.25).add(0.75);
  return vec3(specR, specG, specB).mul(angleBand).mul(strength);
}

/**
 * Dual-lobe subsurface scattering (forward Henyey-Greenstein backlit glow +
 * wrap-diffuse internal scatter) attenuated by optical thickness through ice.
 *
 * @param {object} params
 * @param {Node} params.normal
 * @param {Node} params.toLight
 * @param {Node} params.thickness metres of solid ice behind the vertex
 * @param {Node} params.scatter 0 clear .. 1 aerated/milky
 * @param {Node} params.absorption per-metre rgb extinction
 */
export function iceSubsurfaceScatter({ normal, toLight, thickness, scatter, absorption }) {
  // Distort light vector slightly along surface normal (Barré-Brisebois & Bouchard backlit SSS).
  const bentLight = normalize(toLight.add(normal.mul(0.45)));
  const backDot = clamp(dot(viewDirection, bentLight.negate()), 0, 1);
  const forwardLobe = pow(backDot, 3.2).mul(0.78);
  const broadLobe = clamp(dot(normal, toLight).mul(0.5).add(0.5), 0, 1).mul(0.28);

  // Thin ice transmits strongly; deep ice keeps a subtle sapphire-turquoise rim scatter.
  const opticalPath = clamp(thickness, 0.08, 4.5).mul(mix(float(0.65), float(1.45), scatter));
  const beer = exp(absorption.mul(opticalPath).negate());
  const thinBoost = exp(thickness.mul(-0.95)).mul(0.75).add(0.25);
  return beer.mul(forwardLobe.add(broadLobe)).mul(thinBoost).mul(INV_PI * 2.4);
}
