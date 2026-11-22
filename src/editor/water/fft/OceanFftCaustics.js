import { abs, clamp, exp2, float, int, log2, max, min, smoothstep, vec2, vec4 } from 'three/tsl';

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
 * depth proportional to their length, so past a reference depth the texel grows: ∝ depth
 * on the shelf, then ∝ √depth once it meets the deep law, which keeps lever × filtered
 * curvature bounded so the net never folds into noise. The GPU fixture calibrates it:
 * the mean excess stays near the caustic web's from 3 m to 20 m. No second FFT, no extra
 * pass, no readback: three taps per cascade of the texture the water already binds.
 * Only the excess light max(I − 1, 0) is added, like the caustic web it replaces.
 */

/** Finest caustic detail in metres, held to CAUSTIC_REFERENCE_DEPTH. */
export const CAUSTIC_TEXEL_METERS = 0.25;
export const CAUSTIC_REFERENCE_DEPTH = 3;
/** Deep law: texel = CAUSTIC_DEEP_TEXEL_METERS · (depth / reference)^CAUSTIC_DEPTH_EXPONENT; it meets the linear one at 12 m. */
export const CAUSTIC_DEEP_TEXEL_METERS = 0.5;
export const CAUSTIC_DEPTH_EXPONENT = 0.5;
/** Brightest focus, in multiples of the flat-sea irradiance: bounds 1/|det J| at a focal line. */
export const CAUSTIC_FOCUS_CAP = 6;

/** Caustic texel (metres) at bed depth `depth`: min(linear, deep law) past the reference. Pure. */
export function causticTexel(depth) {
  const ratio = Math.max(depth, CAUSTIC_REFERENCE_DEPTH) / CAUSTIC_REFERENCE_DEPTH;
  return Math.min(CAUSTIC_TEXEL_METERS * ratio, CAUSTIC_DEEP_TEXEL_METERS * ratio ** CAUSTIC_DEPTH_EXPONENT);
}

/**
 * Each cascade's mip level for the finest texel: log2(CAUSTIC_TEXEL_METERS / its texel), unclamped
 * and fractional (a cascade coarser than the texel sits below 0; the shader clamps after the
 * depth lift, so every cascade follows the texel law exactly once it can). Pure.
 */
export function causticLevels({ size, tileSizes }, texelMeters = CAUSTIC_TEXEL_METERS) {
  return tileSizes.map((tile) => Math.log2(texelMeters / (tile / size)));
}

/** Mip level a cascade samples at bed depth `depth`, from its causticLevels entry. CPU twin of the shader. Pure. */
export function causticDepthLevel(baseLevel, depth, maxLevel) {
  return Math.min(Math.max(baseLevel + Math.log2(causticTexel(depth) / CAUSTIC_TEXEL_METERS), 0), maxLevel);
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
 * The caustic share at the camera: ocean water only, no shore-distance or exposure
 * factor. Caustics keep their own geography (a bed-depth band, fftCausticWeight)
 * rather than the I.4 offshore one, whose 14 m floor lies past where this world's
 * shelf drops to beds too deep to show any caustic. Pure.
 */
export function causticCameraWeight({ oceanMask, waterCoverage, available }) {
  return Math.min(Math.max(oceanMask * waterCoverage, 0), 1) * available;
}

/**
 * Shader excess irradiance at `offset` metres (canonical axes) from the point whose
 * cascade UV origins are `origin` (vec4: u0, v0, u1, v1), for bed depth `depth`.
 * `binding` is an OceanFftBinding (its texture and `available`); `levels` from causticLevels.
 * `depthScaled: false` holds the base levels at every depth (QA parity).
 */
export function fftCausticExcess({ binding, levels, origin, offset, depth, refractiveIndex, slopeStrength = 1, cap = CAUSTIC_FOCUS_CAP, depthScaled = true }) {
  // log2(causticTexel(depth) / CAUSTIC_TEXEL_METERS): the linear law, or the deep law past where they meet.
  const octaves = log2(depth.max(CAUSTIC_REFERENCE_DEPTH).div(CAUSTIC_REFERENCE_DEPTH));
  const lift = depthScaled
    ? min(octaves, octaves.mul(CAUSTIC_DEPTH_EXPONENT).add(Math.log2(CAUSTIC_DEEP_TEXEL_METERS / CAUSTIC_TEXEL_METERS))) : float(0);
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

/** Per-pixel FFT share: the caustic depth band (`band`: the caustics settings) times the camera weight (uniform). */
export function fftCausticWeight({ depth, cameraWeight, band }) {
  return smoothstep(band.depthStartMeters, band.depthEndMeters, depth).mul(cameraWeight);
}
