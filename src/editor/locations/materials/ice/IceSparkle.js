import {
  clamp, dot, float, fwidth, length, max, normalize, pow, smoothstep, texture, vec2, vec3,
} from 'three/tsl';
import { viewDirection } from '../LocationShading.js';

/**
 * View-dependent anti-aliased micro-facet crystalline sparkle / glint BRDF.
 *
 * Uses two offset taps of the CC0 packed `grainy` micro-crystal seed (`packMap.b`)
 * modulated by the view half-vector so tiny discrete ice & hoarfrost facets flash
 * cleanly as the camera moves, while `fwidth(point)` smoothly attenuates glints at
 * grazing / distant footprints to prevent sub-pixel shimmer.
 */
export function iceSparkle({
  point,
  normal,
  packMap,
  lightDir,
  near,
  scale = 11.5,
  threshold = 0.76,
  strength = 1.0,
}) {
  if (!packMap || strength <= 0) return float(0);

  const halfVec = normalize(lightDir.add(viewDirection));
  const facing = clamp(dot(normal, halfVec), 0, 1);
  // Anti-alias against pixel footprint so crystals never crawl into noisy static.
  const footprint = length(fwidth(point));
  const aaFade = smoothstep(0.085, 0.012, footprint).mul(near);

  // View-shifted triplanar-like projection onto the two dominant axes avoids UV seams.
  const shift = viewDirection.mul(0.24).add(halfVec.mul(0.18));
  const pA = point.mul(scale).add(shift.mul(scale * 0.45));
  const pB = point.mul(scale * 1.63).sub(shift.mul(scale * 0.62)).add(vec3(3.17, 7.41, 1.93));

  const uvA = vec2(pA.x.add(pA.y.mul(0.73)), pA.z.sub(pA.y.mul(0.61)));
  const uvB = vec2(pB.z.add(pB.x.mul(0.57)), pB.y.add(pB.x.mul(0.81)));

  const sA = texture(packMap, uvA).b;
  const sB = texture(packMap, uvB).b;
  // Product of two uncorrelated micro-crystal grains produces crisp pinpoint glints.
  const glint = smoothstep(threshold, 0.985, sA.mul(sB).add(sA.mul(0.32)).div(1.32));
  const lobe = pow(max(facing, 0.05), 3.0).mul(0.75).add(0.25);

  return glint.mul(lobe).mul(aaFade).mul(strength);
}
