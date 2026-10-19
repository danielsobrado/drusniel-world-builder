import { float, fwidth, mix, smoothstep, vec2 } from 'three/tsl';
import { periodicFbm2, periodicNoise } from '../stylized/PeriodicNoiseNodes.js';

/** Short fallen-growth marks, separated by quiet patches. Integer lattice
 * transforms preserve chunk/rebase continuity; pixel filtering removes the
 * unresolved direction rather than letting it become parallel distant rows.
 * Reuses existing pattern uniforms, with fewer noise octaves than the old cover.
 */
export function terrainGrassCover({ transitionPatterns, localXZ }) {
  if (!transitionPatterns) return { strand: float(.3), variation: float(.5) };
  const p = transitionPatterns.latticePoint('broad', localXZ).toVar();
  const patch = periodicFbm2(p).toVar();
  const a = vec2(p.x.mul(8).add(p.y.mul(3)), p.y.mul(2).sub(p.x));
  const b = vec2(p.y.mul(7).sub(p.x.mul(2)), p.x.mul(2).add(p.y));
  const footprint = fwidth(a).max(fwidth(b));
  const resolved = smoothstep(.2, .8, footprint.x.max(footprint.y)).oneMinus();
  const marks = mix(periodicNoise(a), periodicNoise(b), smoothstep(.35, .65, patch));
  const interrupted = smoothstep(.5, .78, marks).mul(smoothstep(.26, .58, patch));
  return { strand: mix(.3, interrupted, resolved), variation: patch };
}
