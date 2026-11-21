import { LIMITS, TAU } from './OceanFftConstants.js';
import { assertFftSize, assertInRange, mirrorIndex, signedIndex } from './OceanSpectrum.js';

/**
 * CPU reference for the FFT sea's time evolution and inverse transform: the
 * oracle Phase I.2's GPU output is compared against. Reference only — never
 * called by rendering; the DFT is a direct O(N⁴) sum for 8²/16² grids.
 *
 * Convention (all arrays interleaved [re, im], index = q·N + p):
 *   field(x) = Σ_k h(k,t)·exp(+i k·x)               (synthesize2d, no 1/N²)
 *   h(k,t)   = h0(k)·exp(−iωt) + conj(h0(−k))·exp(+iωt)
 * so a mode travels toward +k, i.e. downwind. Ponlai's exp(+iωt) with the
 * same +i inverse travels against k; the time sign here is deliberately flipped.
 */

/** Water time as a fraction of the repeat period, τ ∈ [0, 1), in double precision. */
export function repeatFraction(timeSeconds, periodSeconds) {
  assertInRange(timeSeconds, 'timeSeconds', LIMITS.timeSeconds);
  const wrapped = timeSeconds % periodSeconds;
  return (wrapped < 0 ? wrapped + periodSeconds : wrapped) / periodSeconds;
}

/**
 * h(k,t) at absolute time t into `out` (interleaved), from the quantised
 * frequency table (createWaveFrequencies). Phase is 2π·fract(cycles·τ): what the
 * GPU computes from τ, with no accumulated drift; seeks in any order repeat.
 */
export function evolveSpectrum(h0, { cycles, periodSeconds }, size, timeSeconds, out = new Float64Array(2 * size * size)) {
  const tau = repeatFraction(timeSeconds, periodSeconds);
  for (let i = 0; i < size * size; i++) {
    const m = mirrorIndex(i, size);
    const turns = cycles[i] * tau;
    const phase = TAU * (turns - Math.floor(turns));
    const c = Math.cos(phase), s = Math.sin(phase);
    const aRe = h0[2 * i], aIm = h0[2 * i + 1], bRe = h0[2 * m], bIm = h0[2 * m + 1];
    // (a)(c − is) + conj(b)(c + is), with ω(k) = ω(−k)
    out[2 * i] = aRe * c + aIm * s + bRe * c + bIm * s;
    out[2 * i + 1] = aIm * c - aRe * s - bIm * c + bRe * s;
  }
  return out;
}

/** Spectral slope ∂/∂x or ∂/∂z: i·k_axis·h, interleaved. axis 0 = x, 1 = z. */
export function spectralDerivative(spectrum, size, tileSizeMeters, axis, out = new Float64Array(2 * size * size)) {
  const deltaK = TAU / tileSizeMeters;
  for (let q = 0; q < size; q++) {
    for (let p = 0; p < size; p++) {
      const i = q * size + p;
      const k = signedIndex(axis === 0 ? p : q, size) * deltaK;
      const re = spectrum[2 * i], im = spectrum[2 * i + 1];
      out[2 * i] = -k * im;
      out[2 * i + 1] = k * re;
    }
  }
  return out;
}

/**
 * Both slopes in one complex spectrum, C = i·kx·h − kz·h, whose synthesis is
 * sx + i·sz: one IFFT per cascade instead of two (I.0 Decision B).
 */
export function packedSlopeSpectrum(spectrum, size, tileSizeMeters, out = new Float64Array(2 * size * size)) {
  const deltaK = TAU / tileSizeMeters;
  for (let q = 0; q < size; q++) {
    const kz = signedIndex(q, size) * deltaK;
    for (let p = 0; p < size; p++) {
      const kx = signedIndex(p, size) * deltaK;
      const i = q * size + p, re = spectrum[2 * i], im = spectrum[2 * i + 1];
      out[2 * i] = -kx * im - kz * re;
      out[2 * i + 1] = kx * re - kz * im;
    }
  }
  return out;
}

function directTransform(spectrum, n, sign, scale) {
  assertFftSize(n);
  if (spectrum.length !== 2 * n * n) throw new RangeError('ocean fft: complex array length must be 2·N².');
  const out = new Float64Array(2 * n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      let sumRe = 0, sumIm = 0;
      for (let q = 0; q < n; q++) {
        for (let p = 0; p < n; p++) {
          // Integer phase mod n keeps the angle exact for large indices.
          const angle = sign * TAU * (((p * x + q * z) % n) / n);
          const c = Math.cos(angle), s = Math.sin(angle), i = 2 * (q * n + p);
          sumRe += spectrum[i] * c - spectrum[i + 1] * s;
          sumIm += spectrum[i] * s + spectrum[i + 1] * c;
        }
      }
      out[2 * (z * n + x)] = sumRe * scale;
      out[2 * (z * n + x) + 1] = sumIm * scale;
    }
  }
  return out;
}

/** Σ_k H[k]·e^{+ik·x}: the GPU inverse FFT's expected output (no normalisation). */
export function synthesize2d(spectrum, n) {
  return directTransform(spectrum, n, 1, 1);
}

/** Standard inverse DFT with 1/N² applied once. */
export function inverseDft2d(spectrum, n) {
  return directTransform(spectrum, n, 1, 1 / (n * n));
}

export function forwardDft2d(field, n) {
  return directTransform(field, n, -1, 1);
}

/** Field value at an arbitrary point (metres) by direct summation, for derivative checks. */
export function sampleField(spectrum, n, tileSizeMeters, x, z) {
  const deltaK = TAU / tileSizeMeters;
  let sum = 0;
  for (let q = 0; q < n; q++) {
    const kz = signedIndex(q, n) * deltaK;
    for (let p = 0; p < n; p++) {
      const angle = signedIndex(p, n) * deltaK * x + kz * z;
      const i = 2 * (q * n + p);
      sum += spectrum[i] * Math.cos(angle) - spectrum[i + 1] * Math.sin(angle);
    }
  }
  return sum;
}
