import { Fn, If, atan, cameraViewMatrix, float, length, max, normalize, smoothstep, vec3, vec4 } from 'three/tsl';
import { snowFineRelief } from './SnowNoiseNodes.js';
import { worldWindUniforms } from '../weather/wind/worldWindState.js';

/** Analytic slopes only: neither terrain height nor collision changes. */
export function createSnowReliefNodes({ local, chunkCenter, snow, pathMask }) {
  // Fade to the shared texture at repeat boundaries; no discontinuity at a rebase or chunk edge.
  const p = chunkCenter.mod(1024).add(local).mod(1024).toVar();
  const footprint = max(length(local.dFdx()), length(local.dFdy())).toVar();
  const edge = p.x.min(p.y).min(float(1024).sub(p.x)).min(float(1024).sub(p.y));
  const boundary = smoothstep(0, 8, edge);
  const unpressed = float(1).sub(pathMask.clamp(0, 1));
  const wind = atan(worldWindUniforms.prevailing.y, worldWindUniforms.prevailing.x);
  const relief = Fn(() => {
    const value = vec3(0).toVar();
    If(snow.greaterThan(0.002), () => value.assign(snowFineRelief(p, wind, float(0.55), footprint,
      vec3(0.7, 0.8, 0.65)).mul(boundary).mul(unpressed)));
    return value;
  })();
  return {
    color(base) { return base.mul(float(1).add(relief.x.mul(0.7).clamp(-0.06, 0.06).mul(snow))); },
    roughness(base) { return base.sub(pathMask.mul(snow).mul(0.12)).clamp(0.45, 1); },
    normal(base) {
      const slope = cameraViewMatrix.mul(vec4(relief.y.negate(), 0, relief.z.negate(), 0)).xyz;
      return normalize(base.add(slope.mul(snow)));
    },
  };
}
