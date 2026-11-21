/**
 * Canonical-world coordinates of the offshore FFT (PR I phase I.3). Pure, double precision.
 *
 * A chunk's FFT origin is its canonical centre reduced modulo each cascade's tile
 * on the CPU, as a fraction of the tile in [0, 1). The shader adds chunk-local
 * metres / L to it and samples with repeat wrapping — never a world position in
 * f32, and no fract(), whose jump would break the mip derivatives:
 *
 *   uv_c = origin_c + localXZ / L_c          (|uv| < 1 + 64/L_c, f32-safe)
 *
 * Two chunks sharing an edge then agree to f32 rounding of numbers below ~6, at
 * any world position (−4.2 million metres included), and a floating-origin rebase
 * changes nothing because neither term depends on the render origin.
 * u follows canonical +X and v canonical +Z: the FFT texel row is z (I.2 §9), and
 * WebGPU samples render-target textures without a y flip (verified in I.3 QA).
 */

/** value mod period in [0, period), for any finite value; exact (IEEE fmod) before any f32. */
export function positiveMod(value, period) {
  if (!Number.isFinite(value)) throw new RangeError(`ocean fft: coordinate must be finite, got ${value}.`);
  if (!(period > 0) || !Number.isFinite(period)) throw new RangeError(`ocean fft: period must be a positive finite number, got ${period}.`);
  const r = value % period;
  if (r >= 0) return r + 0; // + 0 turns −0 into 0
  const wrapped = r + period;
  // A tiny negative r can round up to exactly `period`.
  return wrapped < period ? wrapped : 0;
}

/** [u, v] origin of one cascade for a chunk centred at canonical (x, z). */
export function cascadeUvOrigin(centerX, centerZ, tileSizeMeters) {
  return [positiveMod(centerX, tileSizeMeters) / tileSizeMeters, positiveMod(centerZ, tileSizeMeters) / tileSizeMeters];
}

/** Every cascade's origin packed (u0, v0, u1, v1, …) into `out` (a Vector4-like or array). */
export function writeCascadeUvOrigins(centerX, centerZ, tileSizes, out) {
  tileSizes.forEach((tile, c) => {
    const [u, v] = cascadeUvOrigin(centerX, centerZ, tile);
    out[2 * c] = u;
    out[2 * c + 1] = v;
  });
  return out;
}

/** CPU twin of the shader UV (unwrapped; the sampler repeats). */
export function cascadeUv(origin, localX, localZ, tileSizeMeters) {
  return [origin[0] + localX / tileSizeMeters, origin[1] + localZ / tileSizeMeters];
}
