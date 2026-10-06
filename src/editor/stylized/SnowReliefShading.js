import { Fn, If, atan, cameraViewMatrix, float, length, max, normalize, smoothstep, vec3, vec4 } from 'three/tsl';
import { snowFineRelief } from './SnowNoiseNodes.js';
import { worldWindUniforms } from '../weather/wind/worldWindState.js';
import { resolveSnowSurfaceConfig } from './SnowSurfaceConfig.js';
import { createSnowSurfaceState, snowSurfacePoint } from './SnowSurfaceState.js';

/** Analytic slopes only: neither terrain height nor collision changes. */
export function createSnowReliefNodes({ local, chunkCenter, snow, pathMask, worldNormal = vec3(0, 1, 0),
  settings = resolveSnowSurfaceConfig(), state = null }) {
  // Fade to the shared texture at repeat boundaries; no discontinuity at a rebase or chunk edge.
  const p = snowSurfacePoint(local, chunkCenter);
  const footprint = max(length(local.dFdx()), length(local.dFdy())).toVar();
  const edge = p.x.min(p.y).min(float(1024).sub(p.x)).min(float(1024).sub(p.y));
  const boundary = smoothstep(0, 8, edge);
  const surface = state ?? createSnowSurfaceState({ point: p, snow, pathMask, worldNormal, settings });
  const wind = atan(worldWindUniforms.prevailing.y, worldWindUniforms.prevailing.x);
  const relief = Fn(() => {
    const value = vec3(0).toVar();
    If(snow.greaterThan(0.002).and(footprint.greaterThan(0)).and(surface.exposure.greaterThanEqual(0)), () => {
      value.assign(snowFineRelief(p, wind, surface.exposure, footprint,
        vec3(1, 0.7, 1).mul(surface.flatness).mul(surface.reliefScale)).mul(boundary));
    });
    return value;
  })();
  return {
    color(base) {
      return base.mul(float(1).add(relief.x.div(0.06).clamp(-1, 1).mul(settings.toneContrast).mul(snow)));
    },
    roughness(base) {
      // Wind-packed crests are smoother than the loose snow in their troughs.
      return base.sub(relief.x.div(0.06).clamp(-1, 1).mul(0.06).mul(snow));
    },
    normal(base) {
      const slope = cameraViewMatrix.mul(vec4(relief.y.negate(), 0, relief.z.negate(), 0)).xyz;
      return normalize(base.add(slope.mul(snow)));
    },
  };
}
