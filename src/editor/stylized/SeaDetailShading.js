import { float, mix, texture, vec2 } from 'three/tsl';
import { acquireSeaDetailTexture } from '../assets/godsEnd/seaDetailCache.js';
import { SEA_DETAIL_SLOPE_RANGE, SEA_DETAIL_MOMENT_SCALE } from '../assets/godsEnd/seaDetail.js';
import { resolveSeaDetail } from '../water/SeaDetailPolicy.js';
import { createSeaRippleNodes } from './SeaRippleShading.js';

/** Packed donor slopes, filtered with their second moment to suppress distant shimmer. */
export function createSeaDetailNodes({ patternXZ, time, choppiness, strength,
  patterns, localXZ, phases, amplitude, settings: source }) {
  const settings = resolveSeaDetail(source);
  const lease = acquireSeaDetailTexture(choppiness);
  if (settings.enabled && patterns && phases) {
    return { ...createSeaRippleNodes({ map: lease.texture, patterns, localXZ, phases,
      amplitude, time, strength, settings }), release: lease.release, map: lease.texture };
  }
  // Both frequencies close over the existing 320 m river-detail origin period.
  const a = texture(lease.texture, patternXZ.mul(0.125).add(vec2(time.mul(0.027), time.mul(-0.018))));
  const b = texture(lease.texture, patternXZ.mul(0.25).add(vec2(time.mul(-0.021), time.mul(0.014))));
  const slopes = [a, b].map((sample) => {
    const slope = sample.rg.mul(2).sub(1).mul(SEA_DETAIL_SLOPE_RANGE);
    const variance = sample.a.mul(SEA_DETAIL_MOMENT_SCALE).sub(slope.dot(slope)).max(0);
    return slope.div(variance.mul(4).add(1));
  });
  return {
    slope: mix(slopes[0], slopes[1], 0.35).mul(0.14).mul(strength),
    variance: float(0),
    release: lease.release,
    map: lease.texture,
  };
}
