import { MIN_UNIFORM, TAU } from './OceanFftConstants.js';
import { assertFftSize, mirrorIndex, signedIndex } from './OceanSpectrum.js';

/**
 * Seeded complex Gaussian modes for the FFT sea. Each mode's pair is a pure
 * function of (seed, cascade, signed kx index, signed kz index): independent of
 * scan order and grid size, with no shared mutable RNG state. Hashing is
 * murmur3's 32-bit finaliser; the two uniforms come from mulberry32 steps, then
 * Box–Muller gives two independent N(0, 1) values (real, imaginary).
 */

const MULBERRY_INCREMENT = 0x6D2B79F5;
const UINT32 = 0x100000000;

function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13;
  h = Math.imul(h, 0xC2B2AE35);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32Output(state) {
  let t = Math.imul(state ^ (state >>> 15), state | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / UINT32;
}

/** Split a signed safe-integer seed into two uint32 words (two's complement, 64-bit). */
export function seedWords(seed) {
  if (!Number.isSafeInteger(seed)) throw new RangeError(`ocean fft: seed must be a safe integer, got ${seed}.`);
  const wide = BigInt.asUintN(64, BigInt(seed));
  return [Number(wide & 0xFFFFFFFFn), Number(wide >> 32n)];
}

/** Hash of one mode's identity; the Gaussian pair's only input. */
export function modeHash(seedLo, seedHi, cascadeIndex, kxIndex, kzIndex) {
  return fmix32(fmix32(fmix32(fmix32(fmix32(seedLo) ^ seedHi) ^ cascadeIndex) ^ kxIndex) ^ kzIndex);
}

/** Write the mode's N(0,1) pair into out[offset], out[offset + 1]. */
export function writeGaussianPair(out, offset, hash) {
  const s1 = (hash + MULBERRY_INCREMENT) >>> 0;
  const s2 = (s1 + MULBERRY_INCREMENT) >>> 0;
  const u1 = Math.max(mulberry32Output(s1), MIN_UNIFORM);
  const u2 = mulberry32Output(s2);
  const radius = Math.sqrt(-2 * Math.log(u1));
  out[offset] = radius * Math.cos(TAU * u2);
  out[offset + 1] = radius * Math.sin(TAU * u2);
}

/** Interleaved [re, im] N(0,1) pairs for every mode of one cascade, Float64Array(2·N²). */
export function createGaussianModes({ seed, size, cascadeIndex = 0 }) {
  assertFftSize(size);
  if (!Number.isInteger(cascadeIndex) || cascadeIndex < 0) {
    throw new RangeError(`ocean fft: cascadeIndex must be a non-negative integer, got ${cascadeIndex}.`);
  }
  const [lo, hi] = seedWords(seed);
  const out = new Float64Array(2 * size * size);
  for (let q = 0; q < size; q++) {
    const sq = signedIndex(q, size);
    for (let p = 0; p < size; p++) {
      writeGaussianPair(out, 2 * (q * size + p), modeHash(lo, hi, cascadeIndex, signedIndex(p, size), sq));
    }
  }
  return out;
}

/**
 * h0(k) = gauss(k)·sqrt(P·Δk²)/2, interleaved. E|h0|² = P·Δk²/2; the
 * conj(h0(−k)) partner in the evolution supplies the other half, so the real
 * field's variance is ΣP·Δk². Zero-power modes (DC, Nyquist, out of band) stay zero.
 */
export function createInitialSpectrum(gaussians, { size, power }) {
  if (gaussians.length !== 2 * size * size || power.length !== size * size) {
    throw new RangeError('ocean fft: gaussian and power tables must match the FFT size.');
  }
  const h0 = new Float64Array(2 * size * size);
  for (let i = 0; i < power.length; i++) {
    if (power[i] === 0) continue;
    const amplitude = Math.sqrt(power[i]) / 2;
    h0[2 * i] = gaussians[2 * i] * amplitude;
    h0[2 * i + 1] = gaussians[2 * i + 1] * amplitude;
  }
  return h0;
}

/**
 * GPU upload layout (I.0 Decision G): Float32Array(4·N²), per mode
 * vec4(h0(k).re, h0(k).im, conj(h0(−k)).re, conj(h0(−k)).im), so the
 * evolution kernel reads one texel per mode.
 */
export function packInitialSpectrum(h0, size) {
  const packed = new Float32Array(4 * size * size);
  for (let i = 0; i < size * size; i++) {
    const m = mirrorIndex(i, size);
    packed[4 * i] = h0[2 * i];
    packed[4 * i + 1] = h0[2 * i + 1];
    packed[4 * i + 2] = h0[2 * m];
    packed[4 * i + 3] = -h0[2 * m + 1];
  }
  return packed;
}
