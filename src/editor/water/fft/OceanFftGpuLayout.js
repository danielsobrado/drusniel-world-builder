import { CASCADE_CANDIDATES, LIMITS, TAU, WAVE_REPEAT_PERIOD_SECONDS } from './OceanFftConstants.js';
import { repeatFraction } from './OceanFourierReference.js';
import { createGaussianModes, createInitialSpectrum, packInitialSpectrum } from './OceanGaussianModes.js';
import { assertFftSize, assertInRange, createModePowerTable, createWaveFrequencies } from './OceanSpectrum.js';

/**
 * CPU side of the GPU FFT (PR I phase I.2): validated topology, the Float32
 * upload layout and its byte accounting. No GPU objects; Node-testable.
 *
 * Every cascade is a contiguous block of M = N² modes, so one kernel serves all
 * cascades: global index g = c·M + q·N + p (row-major as in I.1, q = kz index,
 * p = kx index).
 *
 *   h0      array<vec4<f32>>  C·M  (h0(k).re, h0(k).im, conj h0(−k).re, conj h0(−k).im)
 *   cycles  array<f32>        C·M  integer cycles per repeat period (exact in f32 below 2²⁴; read as u32)
 *   ping    array<vec2<f32>>  C·M  evolved spectrum, then the final IFFT result
 *   pong    array<vec2<f32>>  C·M  IFFT scratch
 *
 * Float64 → Float32 contract: h0 is rounded once on upload (relative 6e-8);
 * cycles must be integers ≤ 2²⁴ so they convert exactly.
 */

export const OCEAN_FFT_MAX_CASCADES = 4;
const MAX_EXACT_F32_INTEGER = 2 ** 24;

/**
 * Water time reaches the GPU as an integer tick of the repeat period, τ = tick/2²²
 * (122 µs at T = 512 s). The kernel takes (cycles·tick) mod 2²² in wrapping u32
 * arithmetic — exact, because 2²² divides 2³² — so the phase carries no f32
 * product error at any time or cycle count. f32 `fract(cycles·τ)` would err by up
 * to ~3e-5 cycle (2e-4 rad) at 128², far above the FFT's own rounding.
 */
export const OCEAN_FFT_TIME_TICKS = 2 ** 22;

/** Tick of absolute water time, computed in double precision; equal times give equal ticks. */
export function waterTimeTick(timeSeconds, periodSeconds = WAVE_REPEAT_PERIOD_SECONDS) {
  return Math.round(repeatFraction(timeSeconds, periodSeconds) * OCEAN_FFT_TIME_TICKS) % OCEAN_FFT_TIME_TICKS;
}

/** The water time a tick represents within the first period: the time the CPU oracle must use. */
export const tickTimeSeconds = (tick, periodSeconds = WAVE_REPEAT_PERIOD_SECONDS) => tick * periodSeconds / OCEAN_FFT_TIME_TICKS;

/** Validated { size, tileSizes } with derived counts. */
export function resolveFftTopology({ size, tileSizes }) {
  assertFftSize(size);
  if (!Array.isArray(tileSizes) || tileSizes.length < 1 || tileSizes.length > OCEAN_FFT_MAX_CASCADES) {
    throw new RangeError(`ocean fft: tileSizes must list 1–${OCEAN_FFT_MAX_CASCADES} cascades.`);
  }
  tileSizes.forEach((tile, c) => assertInRange(tile, `tileSizes[${c}]`, LIMITS.tileSizeMeters));
  const modes = size * size;
  return Object.freeze({
    size, modes, cascades: tileSizes.length, total: modes * tileSizes.length,
    log2Size: Math.log2(size), tileSizes: Object.freeze([...tileSizes]),
    deltaK: Object.freeze(tileSizes.map((tile) => TAU / tile)),
  });
}

/** Texel count of an N² texture's full mip chain. */
export function mipChainTexels(size) {
  let texels = 0;
  for (let level = size; level >= 1; level >>= 1) texels += level * level;
  return texels;
}

/** Exact bytes of every GPU allocation the runtime makes for a topology. */
export function oceanFftByteBudget({ size, cascades, total }) {
  const h0 = total * 16, cycles = total * 4, ping = total * 8, pong = total * 8;
  const output = mipChainTexels(size) * cascades * 4; // RG16F
  return Object.freeze({ h0, cycles, ping, pong, output, total: h0 + cycles + ping + pong + output });
}

/**
 * The runtime's per-cascade spectrum: I.1's power table, seeded Gaussians, h0 and
 * quantised frequencies. cascadeIndex feeds the seed hash, so cascades are independent.
 */
export function buildCascadeSpectra({ size, seed, params, cascades = CASCADE_CANDIDATES, highPass, depthMeters }) {
  return cascades.map(({ tileSizeMeters, kMin, kMax }, cascadeIndex) => {
    const table = createModePowerTable({ size, tileSizeMeters, band: { kMin, kMax }, params, highPass });
    const h0 = createInitialSpectrum(createGaussianModes({ seed, size, cascadeIndex }), table);
    const { cycles } = createWaveFrequencies(size, tileSizeMeters, { depthMeters: depthMeters ?? params.depthMeters });
    return { tileSizeMeters, h0, cycles, power: table.power, deltaK: table.deltaK };
  });
}

/**
 * Concatenate cascade spectra into the upload arrays. Throws, uploading nothing,
 * on a size mismatch, non-finite h0 or non-integer / out-of-range cycles.
 */
export function packCascadeSpectra(spectra, topology, target = null) {
  const { size, modes, cascades, total } = topology;
  if (!Array.isArray(spectra) || spectra.length !== cascades) {
    throw new RangeError(`ocean fft: expected ${cascades} cascade spectra, got ${spectra?.length}.`);
  }
  spectra.forEach((spectrum, c) => {
    if (spectrum.tileSizeMeters !== topology.tileSizes[c]) {
      throw new RangeError(`ocean fft: cascade ${c} tile ${spectrum.tileSizeMeters} m does not match ${topology.tileSizes[c]} m.`);
    }
    if (spectrum.h0?.length !== 2 * modes || spectrum.cycles?.length !== modes) {
      throw new RangeError(`ocean fft: cascade ${c} tables must hold ${modes} modes.`);
    }
    for (let i = 0; i < modes; i++) {
      const turns = spectrum.cycles[i];
      if (!Number.isInteger(turns) || turns < 0 || turns > MAX_EXACT_F32_INTEGER) {
        throw new RangeError(`ocean fft: cascade ${c} cycles[${i}] must be an integer in [0, 2²⁴], got ${turns}.`);
      }
      if (!Number.isFinite(spectrum.h0[2 * i]) || !Number.isFinite(spectrum.h0[2 * i + 1])) {
        throw new RangeError(`ocean fft: cascade ${c} h0[${i}] is not finite.`);
      }
    }
  });
  // Validate every cascade before writing any, so a rejected spectrum leaves the target untouched.
  const h0 = target?.h0 ?? new Float32Array(4 * total);
  const cycles = target?.cycles ?? new Float32Array(total);
  spectra.forEach((spectrum, c) => {
    h0.set(packInitialSpectrum(spectrum.h0, size), 4 * c * modes);
    cycles.set(spectrum.cycles, c * modes);
  });
  return { h0, cycles };
}
