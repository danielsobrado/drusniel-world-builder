import {
  Fn, If, abs, cameraViewMatrix, clamp, float, floor, fract, int, ivec2, length, max, min, mix, normalize,
  positionWorld, smoothstep, textureLoad, vec2, vec3, vec4,
} from 'three/tsl';
import {
  SNOW_DEFORM_TEXELS,
  SNOW_DEFORM_TEXEL_METRES,
  SNOW_DEFORM_WINDOW_METRES,
  gpuSnowDeformTexture,
  gpuSnowDeformUniforms,
} from './GpuSnowDeformSim.js';
import { noise2 } from '../SnowNoiseNodes.js';

/** Sampler-free toroidal bilinear load from `gpuSnowDeformTexture` (consumes 0 WebGPU samplers!). */
function sampleDeformBilinear(uv) {
  const n = int(SNOW_DEFORM_TEXELS);
  const f = fract(uv).mul(float(SNOW_DEFORM_TEXELS)).sub(0.5);
  const base = floor(f);
  const w = fract(f);
  const load = (dx, dz) => textureLoad(
    gpuSnowDeformTexture,
    ivec2(int(base.x).add(dx + SNOW_DEFORM_TEXELS).mod(n), int(base.y).add(dz + SNOW_DEFORM_TEXELS).mod(n)),
  );
  return mix(mix(load(0, 0), load(1, 0), w.x), mix(load(0, 1), load(1, 1), w.x), w.y);
}

/**
 * TSL terrain reader for `GpuSnowDeformSim` (Snowflow MIT):
 *  - Computes toroidal UV exact at Azgaar planet scale from whole-metre chunk origin.
 *  - Widens central-difference step with `footprintMin` so carved trails stay sharp at grazing angles.
 *  - Applies raised loose-berm blue-white shading with granular chunk breakup, compressed trench
 *    darkening, refrozen glossy ice patches, and feeds depression AO into SnowLightingModel.
 */
export function createGpuSnowDeformNodes({ terrainUv, chunkWorldSize, chunkCenter, snow }) {
  const local = vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize);
  // Canonical XZ modulo 32 m (power of two → exact in float32 at planet scale!).
  const modXZ = chunkCenter.mod(SNOW_DEFORM_WINDOW_METRES).add(local);
  const dUV = fract(modXZ.div(SNOW_DEFORM_WINDOW_METRES));

  // Narrow pixel footprint axis (Snowflow): fragment-only, kept separate from vertexOffset.
  const relRender = abs(positionWorld.xz.sub(gpuSnowDeformUniforms.centerRender));
  const edge = max(relRender.x, relRender.y).div(SNOW_DEFORM_WINDOW_METRES * 0.5);
  const dWeight = smoothstep(0.78, 0.98, edge).oneMinus().mul(gpuSnowDeformUniforms.active).mul(snow).toVar('snowDeformW');

  const state = Fn(() => {
    const out = vec4(0).toVar();
    If(dWeight.greaterThan(0.002), () => {
      out.assign(sampleDeformBilinear(dUV).mul(dWeight));
    });
    return out;
  })().toVar('snowDeformState');

  const slope = Fn(() => {
    const out = vec2(0).toVar();
    const footprintMin = max(min(length(local.dFdx()), length(local.dFdy())), float(1e-4)).toVar();
    If(dWeight.greaterThan(0.002).and(footprintMin.greaterThan(0)), () => {
      const stepM = max(float(SNOW_DEFORM_TEXEL_METRES * 2), footprintMin.mul(1.4));
      const eUV = stepM.div(SNOW_DEFORM_WINDOW_METRES);
      const dxA = sampleDeformBilinear(dUV.add(vec2(eUV, 0)));
      const dxB = sampleDeformBilinear(dUV.sub(vec2(eUV, 0)));
      const dzA = sampleDeformBilinear(dUV.add(vec2(0, eUV)));
      const dzB = sampleDeformBilinear(dUV.sub(vec2(0, eUV)));
      const sx = dxA.g.sub(dxA.r).sub(dxB.g.sub(dxB.r));
      const sz = dzA.g.sub(dzA.r).sub(dzB.g.sub(dzB.r));
      out.assign(vec2(sx, sz).div(stepM.mul(2)).mul(dWeight));
    });
    return out;
  })().toVar('snowDeformSlope');

  const dep = state.r;
  const berm = state.g;
  const comp = clamp(state.b, 0, 1);
  const ice = clamp(state.a, 0, 1);

  return {
    /** Depression cavity factor (0.55..1.0) folded into SnowLightingModel's blue caveTint AO. */
    cavity: float(1).sub(clamp(dep.mul(2.1), 0, 1).mul(0.42)),
    /** Raised berm crest factor for thin-edge SSS highlight. */
    crest: clamp(berm.mul(5.0), 0, 1),
    applyColor(base) {
      let c = mix(base, base.mul(vec3(0.68, 0.74, 0.86)), comp.mul(0.82));
      c = mix(c, vec3(0.42, 0.58, 0.74), ice.mul(0.75));
      // Freshly displaced berm snow: slightly brighter AND bluer with chunky granular breakup!
      const loose = clamp(berm.mul(5.0), 0, 1);
      const chunk = noise2(modXZ.mul(34.0)).mul(0.5).add(0.5);
      const bermColor = vec3(0.895, 0.920, 0.965).mul(float(1).sub(loose.mul(0.10).mul(chunk)));
      return mix(c, bermColor, loose.mul(0.55));
    },
    applyRoughness(base) {
      let r = mix(base, float(0.36), comp);
      r = mix(r, float(0.08), ice);
      return mix(r, float(0.82), clamp(berm.mul(5.0), 0, 1).mul(0.65));
    },
    applyNormal(baseViewNormal) {
      const viewSlope = cameraViewMatrix.mul(vec4(slope.x.negate(), 0, slope.y.negate(), 0)).xyz;
      return normalize(baseViewNormal.add(viewSlope));
    },
  };
}

/** Vertex-stage-only displacement (berm - dep) using textureLoad only (no fragment derivatives). */
export function gpuSnowDeformVertexDisplacement({ terrainUv, chunkWorldSize, chunkCenter }) {
  const local = vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize);
  const modXZ = chunkCenter.mod(SNOW_DEFORM_WINDOW_METRES).add(local);
  const dUV = fract(modXZ.div(SNOW_DEFORM_WINDOW_METRES));
  return Fn(() => {
    const dz = float(0).toVar();
    If(gpuSnowDeformUniforms.active.greaterThan(0.5), () => {
      const rel = abs(positionWorld.xz.sub(gpuSnowDeformUniforms.centerRender));
      const edge = max(rel.x, rel.y).div(SNOW_DEFORM_WINDOW_METRES * 0.5);
      const w = smoothstep(0.75, 0.96, edge).oneMinus();
      If(w.greaterThan(0.002), () => {
        const s = sampleDeformBilinear(dUV);
        dz.assign(s.g.sub(s.r).mul(w).mul(0.85));
      });
    });
    return dz;
  })();
}
