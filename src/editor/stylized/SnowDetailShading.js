import {
  Fn, If, cameraPosition, cameraViewMatrix, cameraWorldMatrix, color, cross, dot, float, length, max, mix, normalize,
  positionWorld, select, smoothstep, vec2, vec3, vec4,
} from 'three/tsl';
import { acquireSnowTextures } from '../assets/godsEnd/snowTextures.js';
import { acquireSnowDetailMaps } from '../assets/godsEnd/snowDetailMaps.js';
import { repeatMipTextureLoad } from './RepeatMipTextureLoad.js';
import { createSnowReliefNodes } from './SnowReliefShading.js';
import { resolveSnowSurfaceConfig } from './SnowSurfaceConfig.js';
import { createSnowSurfaceState, snowSurfacePoint } from './SnowSurfaceState.js';
import { stormSnowFallUniform } from '../weather/storm/stormGroundUniforms.js';

/** Extra cavity depth at full snowfall, as a multiple of the configured strength. */
const STORM_CAVITY_GAIN = 3;
/** Close-range Parallax Occlusion Mapping (POM) distance fade, metres. */
const POM_NEAR_METRES = 12;
const POM_FAR_METRES = 24;
/** POM displacement amplitude in 8 m texture-space repeats (~12 cm subtle drift relief, zero marbling). */
const POM_HEIGHT_SCALE = 0.015;

/** Snowflow (MIT) Reoriented Normal Mapping: preserves base tilt while folding detail normals. */
function blendNormalRNM(base, detail) {
  const t = base.add(vec3(0, 0, 1));
  const u = detail.mul(vec3(-1, -1, 1));
  return normalize(t.mul(dot(t, u)).sub(u.mul(t.z)));
}

function unpackGrainNormal(rg) {
  const xy = rg.mul(2).sub(1);
  return vec3(xy, max(float(0), float(1).sub(dot(xy, xy))).sqrt());
}

/**
 * Upgraded Snow Detail Shading:
 *  - Snow007C macro detail + Snowflow (MIT) 3-scale spherical-cap grain RNM
 *    (7.5 / 1.7 / 0.31 repeats/m) with steep triplanar projection.
 *  - 4-step close-range Parallax Occlusion Mapping (POM, < 26 m) over packed
 *    sastrugi + pillow + spherical-grain heights (zero new terrain samplers).
 *  - Exposes `cavity` (0..1) and `crest` (0..1) for SnowLightingModel's
 *    radiance-level blue-shifted cave AO and thickness-inverted SSS.
 */
export function createSnowDetailNodes({
  terrainUv,
  chunkWorldSize,
  chunkCenter,
  snow,
  material,
  groundHeight = float(0),
  pathMask = float(0),
  baseNormal = null,
  reliefEnabled = false,
  settings = resolveSnowSurfaceConfig(),
  sun = null,
}) {
  const maps = acquireSnowTextures();
  if (!maps) return null;
  const packMaps = acquireSnowDetailMaps();
  const dispose = () => {
    maps.release();
    packMaps?.release();
    material.removeEventListener('dispose', dispose);
  };
  material.addEventListener('dispose', dispose);

  const local = vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize);
  const point = chunkCenter.mod(8).add(local).mul(0.125);
  const driftPoint = chunkCenter.mod(32).add(local).mul(1 / 32);
  const dx = point.dFdx().toVar('snowDetailDx');
  const dy = point.dFdy().toVar('snowDetailDy');
  const driftDx = driftPoint.dFdx().toVar('snowDriftDx');
  const driftDy = driftPoint.dFdy().toVar('snowDriftDy');
  const footprint = max(length(local.dFdx()), length(local.dFdy())).toVar('snowFootprint');

  const amount = snow.mul(maps.ready).clamp(0, 1);
  const packReady = packMaps ? snow.mul(packMaps.ready).clamp(0, 1) : float(0);
  const worldBase = baseNormal ? normalize(cameraWorldMatrix.mul(vec4(baseNormal, 0)).xyz).toVar() : vec3(0, 1, 0);
  const state = createSnowSurfaceState({
    point: snowSurfacePoint(local, chunkCenter),
    snow,
    pathMask,
    worldNormal: worldBase,
    settings,
  });
  const relief = reliefEnabled ? createSnowReliefNodes({
    local, chunkCenter, snow, pathMask, worldNormal: worldBase, settings, state, sun,
  }) : null;

  const planar = smoothstep(0.45, 0.8, worldBase.y);
  const broadFade = smoothstep(0.1, 0.7, max(length(dx), length(dy)).mul(8)).oneMinus();
  const camDist = positionWorld.distance(cameraPosition);
  const pomFade = smoothstep(POM_NEAR_METRES, POM_FAR_METRES, camDist).oneMinus().mul(planar);
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  // Tangent-space view ray projected onto XZ (clamped against grazing stretch) for 4-step POM march.
  const pomRay = vec2(viewDir.x, viewDir.z).div(max(viewDir.y.abs(), float(0.45))).mul(POM_HEIGHT_SCALE);

  // Combined 4-step POM + Snow007C detail + spherical-grain cavity + pillow crest height.
  // Returns vec4(albedoMul.rgb, roughnessOffset) plus sets cavity/crest via second Fn.
  const pomState = Fn(() => {
    // xy = displaced uv offset (in point space), z = cavity (0..1), w = pillow crest (0..1)
    const out = vec4(0, 0, 1, 0.5).toVar();
    If(packReady.greaterThan(0.002).and(pomFade.greaterThanEqual(0)).and(driftDx.x.equal(driftDx.x)).and(driftDy.x.equal(driftDy.x)), () => {
      const offset = vec2(0).toVar();
      const heightSample = float(0.5).toVar();
      if (packMaps) {
        If(pomFade.greaterThan(0.01), () => {
          // 4-step parallax height march through wind-carved sastrugi + soft pillows.
          const stepVec = pomRay.mul(pomFade.mul(0.25));
          for (let step = 0; step < 4; step += 1) {
            const pDrift = driftPoint.sub(offset.mul(0.25));
            const s = repeatMipTextureLoad(packMaps.drift, pDrift, driftDx, driftDy);
            const h = s.r.mul(0.72).add(s.g.mul(0.28));
            const layerDepth = float(1 - (step + 0.5) * 0.25);
            offset.addAssign(stepVec.mul(layerDepth.sub(h).max(0)));
            heightSample.assign(h);
          }
        });
        const finalDrift = repeatMipTextureLoad(packMaps.drift, driftPoint.sub(offset.mul(0.25)), driftDx, driftDy);
        const hNow = finalDrift.r.mul(0.72).add(finalDrift.g.mul(0.28));
        heightSample.assign(hNow);
        // 2-tap sun-direction height self-shadow (subtle sculptural relief even at noon).
        let selfShadow = float(1);
        if (sun) {
          const sunDirXZ = normalize(vec2(sun.x, sun.z).add(vec2(1e-4, 0)));
          const rise = max(sun.y, float(0.18));
          const step1 = repeatMipTextureLoad(packMaps.drift, driftPoint.add(sunDirXZ.mul(0.025)), driftDx, driftDy);
          const step2 = repeatMipTextureLoad(packMaps.drift, driftPoint.add(sunDirXZ.mul(0.065)), driftDx, driftDy);
          const h1 = step1.r.mul(0.72).add(step1.g.mul(0.28));
          const h2 = step2.r.mul(0.72).add(step2.g.mul(0.28));
          const occ = max(h1.sub(hNow).sub(rise.mul(0.10)), h2.sub(hNow).sub(rise.mul(0.24))).clamp(0, 1);
          selfShadow = float(1).sub(occ.mul(0.46));
        }
        // Spherical-grain crevice cavity at mid scale (14 * 1/8 = 1.75 repeats/m, exact integer multiple for seamless chunk edges).
        const grainMidUv = point.sub(offset).mul(14);
        const grainSample = repeatMipTextureLoad(packMaps.grain, grainMidUv, dx.mul(14), dy.mul(14));
        const grainCav = mix(float(1), grainSample.b, smoothstep(0.02, 0.30, footprint).oneMinus().mul(0.32));
        const pillowAO = mix(float(0.86), float(1.0), smoothstep(0.18, 0.82, hNow));
        const cavity = grainCav.mul(pillowAO).mul(selfShadow).clamp(0.66, 1.0);
        out.assign(vec4(offset.x, offset.y, cavity, smoothstep(0.45, 0.85, hNow)));
      }
    });
    return out;
  })().toVar('snowPomState');

  const pomPoint = point.sub(pomState.xy);
  const detail = Fn(() => {
    const result = vec4(1, 1, 1, 0).toVar();
    If(amount.greaterThan(0.002).and(broadFade.greaterThanEqual(0)).and(planar.greaterThanEqual(0)), () => {
      const pigment = repeatMipTextureLoad(maps.color, pomPoint, dx, dy).rgb.div(vec3(0.629, 0.737, 0.849)).clamp(0.78, 1.22);
      const packed = repeatMipTextureLoad(maps.packed, pomPoint, dx, dy);
      const hollow = packed.b.sub(0.274).mul(2.5).add(1).clamp(0.3, 1.2);
      const cavityStrength = stormSnowFallUniform.mul(settings.cavityStrength * STORM_CAVITY_GAIN).add(settings.cavityStrength);
      const cavity = mix(float(1), packed.r.div(0.944).mul(hollow),
        state.detailScale.mul(cavityStrength).mul(planar).mul(broadFade));
      const tint = mix(vec3(1), vec3(0.55, 0.72, 1), cavity.oneMinus().max(0).mul(0.75));
      result.assign(vec4(
        mix(vec3(1), pigment, state.detailScale.mul(settings.cavityStrength).mul(planar).mul(broadFade)).mul(cavity).mul(tint),
        packed.g.sub(0.714).mul(0.3).mul(state.detailScale).mul(broadFade),
      ));
    });
    return result;
  })();

  const weights = worldBase.abs().pow(4);
  const blend = weights.div(weights.x.add(weights.y).add(weights.z).max(0.001));
  const steep = smoothstep(0.2, 0.55, worldBase.y.oneMinus()).toVar();
  const point3 = vec3(pomPoint.x, groundHeight.mul(0.125), pomPoint.y);
  const xyDx = point3.xy.dFdx().toVar();
  const xyDy = point3.xy.dFdy().toVar();
  const zyDx = point3.zy.dFdx().toVar();
  const zyDy = point3.zy.dFdy().toVar();

  // Combine Snow007C macro slope + Snowflow 3-scale RNM spherical-cap grain normals!
  const slope = Fn(() => {
    const result = vec3(0).toVar();
    If(amount.greaterThan(0.002).and(steep.greaterThanEqual(0)).and(dx.x.equal(dx.x)).and(dy.x.equal(dy.x))
      .and(xyDx.x.equal(xyDx.x)).and(xyDy.x.equal(xyDy.x)).and(zyDx.x.equal(zyDx.x)).and(zyDy.x.equal(zyDy.x)), () => {
      let combined = vec2(0);
      for (const [frequency, strength] of (reliefEnabled ? [[4, 1.6], [1, 0.75]] : [[1, 1.6]])) {
        const sample = repeatMipTextureLoad(maps.normal, pomPoint.mul(frequency), dx.mul(frequency), dy.mul(frequency));
        const normal = sample.xyz.mul(2).sub(1);
        const fade = smoothstep(0.35, 0.9, max(length(dx), length(dy)).mul(frequency)).oneMinus();
        combined = combined.add(normal.xy.div(normal.z.max(0.15)).mul(strength).mul(fade));
      }
      const offset = vec3(combined.x, 0, combined.y).toVar();
      if (reliefEnabled && baseNormal) {
        const normalSlope = (p, ddx, ddy) => {
          const n = repeatMipTextureLoad(maps.normal, p.mul(4), ddx.mul(4), ddy.mul(4)).xyz.mul(2).sub(1);
          return n.xy.div(n.z.max(0.15)).mul(1.6);
        };
        If(steep.greaterThan(0.01), () => {
          const xy = normalSlope(point3.xy, xyDx, xyDy);
          const zy = normalSlope(point3.zy, zyDx, zyDy);
          const triplanar = offset.mul(blend.y).add(vec3(xy.x, xy.y, 0).mul(blend.z))
            .add(vec3(0, zy.y, zy.x).mul(blend.x));
          offset.assign(mix(offset, triplanar, steep));
        });
      }
      // Snowflow 3-scale RNM spherical-cap crystal grain (7.5, 1.7, 0.31 repeats/m)
      // + drift pillow micro-slope for crisp tactile snow modeling at all distances.
      if (packMaps) {
        If(packReady.greaterThan(0.002), () => {
          const acc = vec3(0, 0, 1).toVar();
          // point is 1/8 m^-1, so multiplying by 8*scale gives exact Snowflow repeats/m.
          const f0 = smoothstep(0.004, 0.025, footprint).oneMinus();
          If(f0.greaterThan(0.002), () => {
            const d0 = unpackGrainNormal(repeatMipTextureLoad(packMaps.grain, pomPoint.mul(60), dx.mul(60), dy.mul(60)).xy);
            acc.assign(blendNormalRNM(acc, mix(vec3(0, 0, 1), d0, f0)));
          });
          const f1 = smoothstep(0.02, 0.14, footprint).oneMinus();
          If(f1.greaterThan(0.002), () => {
            const d1 = unpackGrainNormal(repeatMipTextureLoad(packMaps.grain, pomPoint.mul(14), dx.mul(14), dy.mul(14)).xy);
            acc.assign(blendNormalRNM(acc, mix(vec3(0, 0, 1), d1, f1.mul(0.85))));
          });
          const f2 = smoothstep(0.12, 0.85, footprint).oneMinus();
          If(f2.greaterThan(0.002), () => {
            const d2 = unpackGrainNormal(repeatMipTextureLoad(packMaps.grain, pomPoint.mul(3), dx.mul(3), dy.mul(3)).xy);
            acc.assign(blendNormalRNM(acc, mix(vec3(0, 0, 1), d2, f2.mul(0.65))));
          });
          const upAxis = select(worldBase.y.abs().greaterThan(0.99), vec3(1, 0, 0), vec3(0, 1, 0));
          const tangent = normalize(cross(upAxis, worldBase));
          const bitangent = cross(worldBase, tangent);
          const grainStrength = mix(float(0.46), float(0.18), state.compressed).mul(packReady);
          offset.addAssign(tangent.mul(acc.x).add(bitangent.mul(acc.y)).mul(grainStrength));
        });
      }
      result.assign(offset.sub(worldBase.mul(offset.dot(worldBase))).mul(state.detailScale).mul(settings.fineNormal));
    });
    return result;
  })();

  // Combine pillow/grain cavity AO with snow weight so snowless ground stays strictly 1.0.
  const snowCavity = mix(float(1), pomState.z, packReady.mul(planar).mul(state.compressed.mul(0.35).oneMinus()));

  return {
    shade: relief?.shade ?? vec3(0),
    cavity: snowCavity,
    crest: pomState.w.mul(packReady),
    color(base) {
      const value = base.mul(mix(vec3(1), detail.rgb, amount));
      return mix(relief ? relief.color(value) : value, color(settings.pathColor), state.compressed.mul(snow));
    },
    roughness(base) {
      const value = mix(base, float(settings.baseRoughness), snow).add(detail.a.mul(amount));
      return mix(relief ? relief.roughness(value) : value, float(settings.compactedRoughness), state.compressed.mul(snow)).clamp(0, 1);
    },
    normal(base) {
      const offset = cameraViewMatrix.mul(vec4(slope, 0)).xyz;
      const value = normalize(base.add(offset.mul(amount)));
      return relief ? relief.normal(value) : value;
    },
  };
}
