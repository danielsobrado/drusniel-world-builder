import { clamp, float, mix, smoothstep } from 'three/tsl';
import { sampleOceanFftSlope } from './OceanFftSampling.js';

/**
 * Where the offshore FFT owns the medium band (PR I phase I.4, I.0 Decision F):
 *
 *   B = smoothstep(d0, d1, depth) · smoothstep(s0, s1, shoreDistance)
 *     · clamp(exposure) · clamp(ocean · coverage) · available
 *
 * Geography only: never camera distance, never the sea-level heuristic. Every factor
 * is a C¹ smoothstep or a field value, so the fade has no edge at its thresholds.
 * `available` is 0 until the runtime publishes and after it fails, so the authored
 * medium ripples carry the sea until real FFT output exists.
 */
export function offshoreFftWeight({ waterDepth, shoreDistance, exposure, oceanMask, waterCoverage, available, blend }) {
  return smoothstep(blend.depthStartMeters, blend.depthEndMeters, waterDepth)
    .mul(smoothstep(blend.shoreStartMeters, blend.shoreEndMeters, shoreDistance))
    .mul(clamp(exposure, 0, 1))
    .mul(clamp(oceanMask.mul(waterCoverage), 0, 1))
    .mul(available);
}

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const unit = (x) => Math.min(Math.max(x, 0), 1);

/** CPU twin of offshoreFftWeight (tests and QA). */
export function offshoreFftWeightCpu({ waterDepth, shoreDistance, exposure, oceanMask, waterCoverage, available, blend }) {
  return smooth(blend.depthStartMeters, blend.depthEndMeters, waterDepth)
    * smooth(blend.shoreStartMeters, blend.shoreEndMeters, shoreDistance)
    * unit(exposure) * unit(oceanMask * waterCoverage) * available;
}

/**
 * The sea's short-wave detail with the FFT swapped in for the medium band:
 *
 *   slope    = fine·g + mix(medium·g, fft·k, B)                g = 1 + 1.2·storm, k = slopeStrength
 *   variance = fine   + mix(medium,   unresolved·k², B)        (mean-square slope; roughness takes √)
 *
 * The storm gain stays on the authored bands only: the FFT spectrum carries its own
 * wind energy. Resolved FFT slope goes to the normal, its unresolved variance to the
 * roughness, so filtered energy is counted once.
 */
export function composeOffshoreDetail({ detail, stormGain, fft, weight }) {
  const { binding, origin, localXZ, settings } = fft;
  const sampled = sampleOceanFftSlope(binding, { origin, localXZ });
  const k = float(settings.slopeStrength);
  return {
    slope: detail.fineSlope.mul(stormGain).add(mix(detail.mediumSlope.mul(stormGain), sampled.slope.mul(k), weight)),
    variance: detail.fineVariance.add(mix(detail.mediumVariance, sampled.unresolved.mul(k.mul(k)), weight)),
    weight,
  };
}
