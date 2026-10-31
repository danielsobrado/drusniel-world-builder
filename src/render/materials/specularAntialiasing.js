import { float } from 'three/tsl';

/** Widen glossy lobes as sampled normal detail varies within a pixel.
 * Feed a sampled normal (before normalMap/bump derivatives), so this never
 * differentiates a derivative. Three already handles geometric-normal variance.
 */
export function filterSpecularRoughness(roughness, detailNormal) {
  const dx = detailNormal.dFdx(), dy = detailNormal.dFdy();
  const variance = dx.dot(dx).add(dy.dot(dy)).mul(0.15).min(0.12);
  // GGX alpha is perceptual roughness squared; add variance in alpha squared.
  return float(roughness).clamp().pow(4).add(variance).min(1).pow(0.25);
}
