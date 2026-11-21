import { TAU, WAVE_REPEAT_PERIOD_SECONDS } from '../../src/editor/water/fft/OceanFftConstants.js';
import { evolveSpectrum, packedSlopeSpectrum, synthesize2d } from '../../src/editor/water/fft/OceanFourierReference.js';
import { mirrorIndex } from '../../src/editor/water/fft/OceanSpectrum.js';
import { tickTimeSeconds } from '../../src/editor/water/fft/OceanFftGpuLayout.js';

/**
 * CPU oracle and error statistics for the PR I phase I.2 GPU FFT QA. Pure; the
 * expected values always come from Phase I.1's OceanFourierReference, evaluated
 * at the tick time the GPU actually ran (OceanFftGpuLayout.waterTimeTick).
 */

/** The complex spectrum the GPU transforms for one cascade: h(k,t), or the packed slopes. */
export function fieldSpectrum({ h0, cycles, tileSizeMeters }, size, tick, field) {
  const evolved = evolveSpectrum(h0, { cycles, periodSeconds: WAVE_REPEAT_PERIOD_SECONDS }, size, tickTimeSeconds(tick));
  return field === 'height' ? evolved : packedSlopeSpectrum(evolved, size, tileSizeMeters);
}

/** Full expected output (interleaved complex, row z, column x). O(N⁴): N ≤ 64. */
export const expectedField = (spectrum, size) => synthesize2d(spectrum, size);

/** Expected output at selected flat texel indices z·N + x, by direct summation. */
export function expectedAt(spectrum, size, indices) {
  const out = new Float64Array(2 * indices.length);
  indices.forEach((index, j) => {
    const x = index % size, z = (index - x) / size;
    let re = 0, im = 0;
    for (let q = 0; q < size; q++) {
      for (let p = 0; p < size; p++) {
        const angle = TAU * (((p * x + q * z) % size) / size);
        const c = Math.cos(angle), s = Math.sin(angle), i = 2 * (q * size + p);
        re += spectrum[i] * c - spectrum[i + 1] * s;
        im += spectrum[i] * s + spectrum[i + 1] * c;
      }
    }
    out[2 * j] = re;
    out[2 * j + 1] = im;
  });
  return out;
}

/** RMS of the synthesised field over the grid by Parseval (this convention has no 1/N²). */
export function parsevalRms(spectrum) {
  let sum = 0;
  for (const value of spectrum) sum += value * value;
  return Math.sqrt(sum);
}

/**
 * Error statistics of `actual` (interleaved, full grid) against `expected`
 * (interleaved, at `indices` or the full grid). `component` 'complex' compares
 * both parts; 'real' only the real part (imaginary reported as residual).
 */
export function compareField(actual, expected, { indices = null, offset = 0 } = {}) {
  const count = expected.length / 2;
  let maxError = 0, sumError = 0, maxExpected = 0, sumExpected = 0, finite = true;
  for (let j = 0; j < count; j++) {
    const at = offset + 2 * (indices ? indices[j] : j);
    for (let part = 0; part < 2; part++) {
      const a = actual[at + part], e = expected[2 * j + part];
      if (!Number.isFinite(a)) finite = false;
      const error = Math.abs(a - e);
      maxError = Math.max(maxError, error);
      sumError += error * error;
      maxExpected = Math.max(maxExpected, Math.abs(e));
      sumExpected += e * e;
    }
  }
  return {
    samples: count, finite, maxError, rmsError: Math.sqrt(sumError / (2 * count)),
    maxExpected, rmsExpected: Math.sqrt(sumExpected / (2 * count)),
    relativeMaxError: maxExpected > 0 ? maxError / maxExpected : maxError,
  };
}

/** Deterministic texel subset: corners, edges, diagonals and a coprime stride walk. */
export function sampleIndices(size, count = 256) {
  const set = new Set([0, size - 1, size * (size - 1), size * size - 1]);
  for (let i = 0; i < size; i += Math.max(1, size >> 3)) {
    set.add(i * size + i);
    set.add(i * size);
    set.add(i);
  }
  for (let k = 0; set.size < Math.min(count, size * size); k++) set.add((k * 7919 + 13) % (size * size));
  return [...set].sort((a, b) => a - b);
}

/** Synthetic single travelling mode at signed indices (sp, sq): field = 2a·cos(k·x − ωt). */
export function singleModeSpectrum(size, tileSizeMeters, sp, sq, { amplitude = 0.5, cycles = 1 } = {}) {
  const h0 = new Float64Array(2 * size * size);
  const cycleTable = new Float64Array(size * size);
  const index = ((sq + size) % size) * size + ((sp + size) % size);
  h0[2 * index] = amplitude;
  cycleTable.fill(cycles);
  return { tileSizeMeters, h0, cycles: cycleTable };
}

/** Seeded complex values on every mode (DC and Nyquist included unless `hermitianSafe`). */
export function randomSpectrum(size, tileSizeMeters, seed, { hermitianSafe = false, maxCycles = 683 } = {}) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
  const h0 = new Float64Array(2 * size * size), cycles = new Float64Array(size * size);
  const half = size / 2;
  for (let i = 0; i < size * size; i++) {
    const p = i % size, q = (i - p) / size;
    if (hermitianSafe && (i === 0 || p === half || q === half)) continue;
    h0[2 * i] = (next() - 0.5) * 0.2;
    h0[2 * i + 1] = (next() - 0.5) * 0.2;
  }
  // ω(k) = ω(−k): share cycles with the mirror so the evolution stays a real-field model.
  for (let i = 0; i < size * size; i++) {
    const m = mirrorIndex(i, size);
    if (m >= i) cycles[i] = cycles[m] = Math.floor(next() * maxCycles);
  }
  return { tileSizeMeters, h0, cycles };
}
