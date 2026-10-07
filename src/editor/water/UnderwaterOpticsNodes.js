import {
  Fn, If, atan, dot, exp, float, getViewPosition, max, mix, normalize,
  perspectiveDepthToViewZ, reflect, screenUV, sin, smoothstep, time, vec2, vec3, vec4,
} from 'three/tsl';
import { godsEndCausticLattice, godsEndSurfaceRipple } from './GodsEndWaterPatterns.js';

/**
 * Gods' End CinematicPipeline underwater optics, using one existing scene pass.
 * Depth and beauty share the refracted coordinate. No viewport copies or passes
 * run above water; the owning postprocess prewarms once and bypasses at blend 0.
 */
export function createUnderwaterOpticsNodes({ beauty, depthTexture, cameraMatrixWorld, cameraProjectionMatrixInverse, surfaceHeight, blend, state, qualityStrength = 1, clock = time }) {
  const settings = state.settings;
  const coord = screenUV;
  const wobble = vec2(
    sin(coord.y.mul(23).add(clock.mul(1.7))).add(sin(coord.x.mul(9).sub(clock.mul(1.1))).mul(0.6)),
    sin(coord.x.mul(19).add(clock.mul(1.4))).add(sin(coord.y.mul(7).add(clock.mul(0.9))).mul(0.6)),
  );
  const warped = coord.add(wobble.mul(blend.mul(settings.distortion))).clamp(0, 1);
  const lit = beauty.sample(warped).rgb;
  const depth = depthTexture.sample(warped).r;
  const project = direction => {
    const view = state.worldInverse.mul(vec4(direction, 0)).xyz;
    const clip = state.projection.mul(vec4(view, 0));
    const ndc = clip.xy.div(clip.w.max(1e-4));
    // Three's screenUV starts at the top; projection coordinates point up.
    return { uv: vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5)), ahead: clip.w };
  };
  return Fn(() => {
    const result = lit.toVar();
    If(blend.greaterThan(0), () => {
      const viewRay = getViewPosition(warped, float(0.5), cameraProjectionMatrixInverse).normalize().toVar();
      const viewZ = perspectiveDepthToViewZ(depth, state.near, state.far);
      const sceneDistance = viewZ.div(viewRay.z.min(-1e-4)).toVar();
      const ray = cameraMatrixWorld.mul(vec4(viewRay, 0)).xyz.normalize().toVar();
      const toSurface = state.depth.div(ray.y.max(1e-4)).toVar();
      const surface = ray.y.greaterThan(0).and(toSurface.lessThan(sceneDistance));
      const distance = surface.select(toSurface, sceneDistance).min(400).toVar();
      const hit = state.eye.xz.add(ray.xz.mul(toSurface.min(400)));
      const slope = godsEndSurfaceRipple(hit, toSurface.min(400), state.ripplePhases, clock).toVar();
      const surfaceNormal = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
      const steepness = dot(ray, surfaceNormal);
      const inWindow = smoothstep(0.645, 0.685, steepness).toVar();
      const rim = smoothstep(0.615, 0.645, steepness).mul(inWindow.oneMinus());
      const glow = direction => mix(float(0.5), float(1.45), smoothstep(-0.7, 0.8, direction));
      const murk = state.color.mul(glow(ray.y)).toVar();
      const bounceRay = reflect(ray, surfaceNormal).toVar();
      const bounce = project(bounceRay);
      const offFrame = max(bounce.uv.x.sub(0.5).abs(), bounce.uv.y.sub(0.5).abs());
      const bounceFade = smoothstep(0.42, 0.5, offFrame).oneMinus().mul(smoothstep(0, 0.02, bounce.ahead));
      const bounced = beauty.sample(bounce.uv.clamp(0, 1)).rgb
        .mul(exp(vec3(...settings.dimming).mul(state.depth.negate())));
      const mirrorMurk = state.color.mul(glow(bounceRay.y));
      const mirrored = mix(mirrorMurk, mix(mirrorMurk, bounced, settings.surfaceMirror), bounceFade)
        .mul(rim.mul(0.9).add(1));
      const above = beauty.sample(warped.add(slope.mul(settings.surfaceRefraction).mul(inWindow)).clamp(0, 1)).rgb;
      const underside = mix(mirrored, above.mul(vec3(0.8, 0.95, 0.95)), inWindow).toVar();
      const point = state.eye.add(ray.mul(distance)).toVar();
      const pointDepth = surfaceHeight.sub(point.y).max(0).toVar();
      const dimming = exp(vec3(...settings.dimming).mul(pointDepth.negate()));
      const causticReach = exp(pointDepth.mul(-0.12))
        .mul(smoothstep(0, 1, float(45).sub(distance).div(25)))
        .mul(state.sun).mul(surface.select(float(0), float(1)));
      const caustics = godsEndCausticLattice(point.xz.add(state.causticOffset), settings.causticTileMeters, clock)
        .mul(causticReach).mul(settings.causticStrength * qualityStrength);
      const bed = lit.mul(dimming).mul(caustics.add(1));
      const transmittance = exp(vec3(...settings.extinction).mul(distance.negate())).toVar();
      const seen = surface.select(underside, bed);
      const angle = atan(dot(ray, state.beamV), dot(ray, state.beamU));
      const fan = sin(angle.mul(29).add(sin(angle.mul(7).add(clock.mul(0.35))).mul(2.2)).add(clock.mul(0.15)))
        .mul(0.5).add(0.5)
        .mul(sin(angle.mul(13).sub(clock.mul(0.22)).add(1.7)).mul(0.5).add(0.5));
      const alongSun = dot(ray, state.sunDirection);
      const beams = fan.pow(3).mul(mix(float(0.3), float(1), smoothstep(-0.3, 1, alongSun)))
        .mul(smoothstep(0, 0.02, alongSun.oneMinus())).mul(transmittance.g.oneMinus()).mul(state.sun);
      const inWater = mix(murk, seen, transmittance).add(murk.mul(beams).mul(settings.shaftStrength));
      result.assign(mix(lit, inWater, blend));
    });
    return vec4(result, 1);
  })();
}
