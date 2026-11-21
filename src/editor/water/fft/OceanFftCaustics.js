import { abs, clamp, exp2, float, int, log2, max, smoothstep, vec2, vec4 } from 'three/tsl';
import { offshoreFftWeightCpu } from './OceanFftBlendNodes.js';

/**
 * Underwater caustics from the offshore FFT (the PR I [P9] follow-on). The FFT's slope
 * field s = ∇h bends sunlight; at bed depth D a refracted ray lands displaced by
 *
 *   δ = a·s,   a = (1 − 1/η)·D                     (small-slope Snell, η = refractive index)
 *
 * so a patch of surface maps onto the bed through J = I + a·∂s/∂x, and the bed receives
 *
 *   I = 1 / |det J|                                (energy conserved: 1 on a flat sea)
 *
 * The slope Jacobian ∂s/∂x comes from forward differences of the FFT output itself, at a
 * mip chosen by bed depth, never by the camera (a bounded resolution). Waves focus at a
 * depth proportional to their length, so the texel grows with depth past a reference:
 * lever × filtered curvature stays bounded and the net does not fold into noise, and
 * caustic cells widen with depth as real ones do. No second FFT, no extra pass, no
 * readback: three taps per cascade of the texture the water already binds.
 * Only the excess light max(I − 1, 0) is added, like the caustic web it replaces.
 */

/** Finest caustic detail in metres: each cascade samples the mip whose texel is nearest this. */
export const CAUSTIC_TEXEL_METERS = 0.5;
/** Bed depth (metres) to which that detail holds; deeper, the texel grows as (depth / it)^CAUSTIC_DEPTH_EXPONENT. */
export const CAUSTIC_REFERENCE_DEPTH = 3;
export const CAUSTIC_DEPTH_EXPONENT = 0.5;
/** Brightest focus, in multiples of the flat-sea irradiance: bounds 1/|det J| at a focal line. */
export const CAUSTIC_FOCUS_CAP = 6;

/** Mip level each cascade samples (bounded resolution). Pure. */
export function causticLevels({ size, tileSizes, levels }, texelMeters = CAUSTIC_TEXEL_METERS) {
  return tileSizes.map((tile) => Math.min(Math.max(Math.round(Math.log2(texelMeters / (tile / size))), 0), levels - 1));
}

/** Mip level a cascade samples at bed depth `depth`, from its base level. CPU twin of the shader. Pure. */
export function causticDepthLevel(baseLevel, depth, maxLevel) {
  return Math.min(Math.max(baseLevel + CAUSTIC_DEPTH_EXPONENT * Math.log2(Math.max(depth, CAUSTIC_REFERENCE_DEPTH) / CAUSTIC_REFERENCE_DEPTH), 0), maxLevel);
}

/** Horizontal landing offset per unit slope at bed depth `depth` (metres). Pure. */
export function refractionLever(refractiveIndex, depth) {
  return (1 - 1 / refractiveIndex) * Math.max(depth, 0);
}

/**
 * Excess irradiance max(1/|det(I + a·G)| − 1, 0), capped, for the slope Jacobian
 * G = { xx: ∂sx/∂x, zx: ∂sz/∂x, xz: ∂sx/∂z, zz: ∂sz/∂z }. CPU twin of the shader. Pure.
 */
export function causticExcessCpu(gradient, lever, cap = CAUSTIC_FOCUS_CAP) {
  const { xx, zx, xz, zz } = gradient;
  const det = (1 + lever * xx) * (1 + lever * zz) - lever * lever * xz * zx;
  return Math.min(Math.max(1 / Math.max(Math.abs(det), 1 / cap) - 1, 0), cap - 1);
}

/**
 * The I.4 offshore weight without its depth factor, at the camera: shore distance,
 * exposure, ocean mask, coverage and availability. The shader multiplies in the depth
 * smoothstep per pixel from the bed depth it reconstructs, so the product is the I.4
 * weight with per-pixel depth. Pure.
 */
export function offshoreCausticCameraWeight({ shoreDistance, exposure, oceanMask, waterCoverage, available, blend }) {
  return offshoreFftWeightCpu({ waterDepth: blend.depthEndMeters, shoreDistance, exposure, oceanMask, waterCoverage, available, blend });
}

/**
 * Shader excess irradiance at `offset` metres (canonical axes) from the point whose
 * cascade UV origins are `origin` (vec4: u0, v0, u1, v1), for bed depth `depth`.
 * `binding` is an OceanFftBinding (its texture and `available`); `levels` from causticLevels.
 * `depthScaled: false` holds the base levels at every depth (QA parity).
 */
export function fftCausticExcess({ binding, levels, origin, offset, depth, refractiveIndex, slopeStrength = 1, cap = CAUSTIC_FOCUS_CAP, depthScaled = true }) {
  const lift = depthScaled ? log2(depth.max(CAUSTIC_REFERENCE_DEPTH).div(CAUSTIC_REFERENCE_DEPTH)).mul(CAUSTIC_DEPTH_EXPONENT) : float(0);
  // ∂sx/∂x, ∂sz/∂x, ∂sx/∂z, ∂sz/∂z summed over cascades
  let gradient = vec4(0);
  binding.tileSizes.forEach((tile, c) => {
    const level = lift.add(levels[c]).clamp(0, binding.levels - 1);
    const step = exp2(level).mul(tile / binding.size);
    const shift = step.div(tile);
    const uv = (c === 0 ? origin.xy : origin.zw).add(offset.div(tile));
    const tap = (delta) => binding.texture.sample(uv.add(delta)).depth(int(c)).level(level).xy;
    const centre = tap(vec2(0));
    gradient = gradient.add(vec4(tap(vec2(shift, 0)).sub(centre), tap(vec2(0, shift)).sub(centre)).div(step));
  });
  const a = depth.max(0).mul((1 - 1 / refractiveIndex) * slopeStrength);
  const det = gradient.x.mul(a).add(1).mul(gradient.w.mul(a).add(1)).sub(a.mul(a).mul(gradient.z).mul(gradient.y));
  return clamp(float(1).div(max(abs(det), 1 / cap)).sub(1), 0, cap - 1).mul(binding.available);
}

/** Per-pixel FFT share: the I.4 depth smoothstep times the camera weight (uniform). */
export function fftCausticWeight({ depth, cameraWeight, blend }) {
  return smoothstep(blend.depthStartMeters, blend.depthEndMeters, depth).mul(cameraWeight);
}
