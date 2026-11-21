import { assertFftSize, signedIndex } from './OceanSpectrum.js';

/**
 * Footprint filtering terms of the FFT slope texture (PR I phase I.3). Pure.
 *
 * A pixel whose footprint F (metres) spans 2^l texels samples mip l, which
 * cannot show modes beyond that level's Nyquist. Their slope variance is not
 * lost energy but sub-pixel roughness: I.4 adds it to the microfacet roughness
 * (isotropic Beckmann α² += σ²) so the far sea keeps its spread of glints
 * instead of turning into a too-smooth silver horizon that shimmers as F changes.
 *
 * Model: a separable box mip at level l keeps |p|, |q| < N/2^(l+1) (index units);
 * every other mode's P·|k|² counts as unresolved. It is a spectral cut, an
 * approximation of the box filter's gradual attenuation; exact LEAN second-moment
 * mips are deferred (they double the output texture).
 */

/** Mip levels of an N² texture, 0 … log2 N. */
export const mipLevelCount = (size) => Math.log2(size) + 1;

/**
 * Unresolved mean-square slope E[sx² + sz²] per mip level, Float64Array(log2N + 1).
 * Entry 0 is 0 (only Nyquist lines, whose power is zero); the last is the cascade's total.
 */
export function unresolvedSlopeVariance({ size, deltaK, power }) {
  assertFftSize(size);
  const levels = mipLevelCount(size);
  const table = new Float64Array(levels);
  for (let q = 0; q < size; q++) {
    const sq = signedIndex(q, size), kz = sq * deltaK;
    for (let p = 0; p < size; p++) {
      const value = power[q * size + p];
      if (value === 0) continue;
      const sp = signedIndex(p, size), kx = sp * deltaK;
      const reach = Math.max(Math.abs(sp), Math.abs(sq));
      // Mode is unresolved from the first level whose kept half-width N/2^(l+1) ≤ reach.
      const first = Math.max(0, Math.ceil(Math.log2(size / (2 * reach))));
      for (let l = first; l < levels; l++) table[l] += value * (kx * kx + kz * kz);
    }
  }
  return table;
}

/** Continuous footprint LOD: log2(F / texel), clamped to the chain. CPU twin of the shader. */
export function footprintLod(footprintMeters, texelMeters, maxLevel) {
  if (!(footprintMeters > texelMeters)) return 0;
  return Math.min(Math.log2(footprintMeters / texelMeters), maxLevel);
}

/** Table value at a fractional LOD, linearly interpolated. CPU twin of the shader. */
export function interpolateLevel(table, lod) {
  const low = Math.min(Math.floor(lod), table.length - 1), high = Math.min(low + 1, table.length - 1);
  return table[low] + (table[high] - table[low]) * (lod - low);
}
