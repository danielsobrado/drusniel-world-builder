import {
  clamp, dot, float, max, mix, pow, smoothstep, texture, time, vec3,
} from 'three/tsl';
import { triplanarWeights } from '../LocationShading.js';

/**
 * Animated refracted glacial ice caustics (triplanar-projected, interference web).
 *
 * Samples the inverted Voronoi + vein caustic filament web (`packMap.g`) across two
 * counter-drifting scales using triplanar projection so walls and pillars never stretch,
 * with delicate R/G/B chromatic offset. Weighted strictly to lit bare glacial ice so
 * snow drifts and dark shadow recesses stay crisp and clean.
 */
function sampleTriplanarCaustic(packMap, p, weights) {
  return texture(packMap, p.zy).g.mul(weights.x)
    .add(texture(packMap, p.xz).g.mul(weights.y))
    .add(texture(packMap, p.xy).g.mul(weights.z));
}

export function iceCaustics({
  point,
  normal,
  packMap,
  bakedLight,
  bakedDirection,
  occlusion,
  bare,
  near,
  strength = 0.26,
}) {
  if (!packMap || strength <= 0) return vec3(0);

  const weights = triplanarWeights(normal, 4);
  const t = time.mul(0.038);
  const pA = point.mul(0.19).add(vec3(t.mul(0.75), t.mul(-0.35), t.mul(0.55)));
  const pB = point.mul(0.29).add(vec3(t.mul(-0.52).add(0.41), t.mul(0.28).add(0.17), t.mul(0.64).add(0.29)));

  // Delicate spectral dispersion along the caustic web ridges.
  const disp = vec3(0.0055, -0.003, -0.0045);
  const webAt = (off) => {
    const a = sampleTriplanarCaustic(packMap, pA.add(off), weights);
    const b = sampleTriplanarCaustic(packMap, pB.sub(off), weights);
    // Optical interference: intersecting ridges flare into crisp luminous filaments.
    const inter = a.mul(b).mul(1.45).add(a.mul(0.22));
    return pow(smoothstep(0.42, 0.88, inter), 2.3);
  };

  const filament = vec3(webAt(disp), webAt(vec3(0)), webAt(disp.negate()));

  // Strongest on surfaces catching directional crevasse/mouth skylight (especially floors & angled faces).
  const dirLen = clamp(dot(bakedDirection, bakedDirection).sqrt(), 0, 1);
  const lightDir = bakedDirection.div(max(dirLen, 1e-3));
  const align = clamp(dot(normal, lightDir).mul(0.7).add(0.3), 0, 1);
  const upBias = smoothstep(-0.3, 0.7, normal.y).mul(0.6).add(0.4);

  const coolLight = clamp(bakedLight.b.mul(0.72).add(bakedLight.g.mul(0.28)), 0, 2.0);
  const lightGate = pow(smoothstep(0.06, 1.35, coolLight), 1.35).mul(coolLight);
  const mask = lightGate.mul(align).mul(upBias)
    .mul(mix(float(0.35), float(1), occlusion))
    .mul(bare.mul(bare))
    .mul(near);

  return filament.mul(vec3(0.48, 0.90, 1.15)).mul(mask).mul(strength);
}
