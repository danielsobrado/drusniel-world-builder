import { OCEAN_FFT_FIELD } from '../../src/editor/water/fft/OceanFftGpuKernels.js';
import { buildCascadeSpectra } from '../../src/editor/water/fft/OceanFftGpuLayout.js';
import { CASCADE_CANDIDATES } from '../../src/editor/water/fft/OceanFftConstants.js';
import { mirrorIndex, resolveOceanSpectrumParams } from '../../src/editor/water/fft/OceanSpectrum.js';
import {
  compareField, expectedAt, expectedField, fieldSpectrum, parsevalRms, randomSpectrum, sampleIndices,
  singleModeSpectrum,
} from './oracle.js';
import { readOutputLayer, readResult } from './instrument.js';

/**
 * GPU-vs-CPU correctness cases for the ocean FFT (PR I phase I.2).
 * Tolerances (documented in the I.2 report):
 *   f32 result    |gpu − cpu| ≤ 1e-5·max|cpu| + 1e-7 (I.1 proposal: log2N·2⁻²⁴ FFT rounding + f32 h0)
 *   RG16F output  |half − f32| ≤ 2⁻¹⁰·|f32| + 2⁻²⁴: one half ulp. WebGPU does not require
 *                 round-to-nearest for f32→f16 attachment writes; the RTX 4080 was measured at
 *                 exactly one ulp (round toward zero), so half an ulp would be the wrong bound.
 */
export const F32_TOLERANCE = Object.freeze({ relative: 1e-5, absolute: 1e-7 });
export const HALF_TOLERANCE = Object.freeze({ relative: 2 ** -10, absolute: 2 ** -24 });
const passF32 = (s) => s.finite && s.maxError <= F32_TOLERANCE.relative * s.maxExpected + F32_TOLERANCE.absolute;

const WINDY = resolveOceanSpectrumParams({ windSpeed: 10, windDirection: 0, fetchMeters: 50_000 });
const I1_FIXTURE = [{ tileSizeMeters: 6, kMin: 0, kMax: Infinity }];
export const TIMES = [0, 1, 3.7, 11.2, 123.4, 126, 127.6, 86_400 * 365 + 0.25, 999_999_999.5];
const SHORT_TIMES = [0, 127.3];

const field = (name) => (name === 'height' ? OCEAN_FFT_FIELD.HEIGHT : OCEAN_FFT_FIELD.SLOPE);
export const realSpectra = (size, seed = 1234, cascades = CASCADE_CANDIDATES, params = WINDY) =>
  buildCascadeSpectra({ size, seed, params, cascades });

async function transform(ctx, time) {
  ctx.runtime.prepare(time);
  await ctx.runtime.settled();
  if (ctx.runtime.state !== 'active') throw new Error(`runtime ${ctx.runtime.state}: ${ctx.runtime.reason}`);
  return ctx.runtime.output;
}

function configure(ctx, size, spectra, fieldName) {
  ctx.runtime.setField(field(fieldName));
  if (!ctx.runtime.configure({ size, tileSizes: spectra.map((s) => s.tileSizeMeters), spectra })) {
    throw new Error(`configure failed: ${ctx.runtime.reason}`);
  }
}

function halfAgainstF32(layer, data, offset) {
  let worst = 0, maxError = 0, towardZero = 0, inexact = 0;
  for (let i = 0; i < layer.length; i++) {
    const exact = data[offset + i], error = Math.abs(layer[i] - exact);
    maxError = Math.max(maxError, error);
    worst = Math.max(worst, error - (HALF_TOLERANCE.relative * Math.abs(exact) + HALF_TOLERANCE.absolute));
    if (error > 0) { inexact++; if (Math.abs(layer[i]) < Math.abs(exact)) towardZero++; }
  }
  return { maxError, towardZeroShare: inexact ? towardZero / inexact : null, pass: worst <= 0 };
}

function gridStats(data, offset, modes) {
  let sum = 0, imag = 0, finite = true;
  for (let i = 0; i < modes; i++) {
    const re = data[offset + 2 * i], im = data[offset + 2 * i + 1];
    if (!Number.isFinite(re) || !Number.isFinite(im)) finite = false;
    sum += re * re + im * im;
    imag = Math.max(imag, Math.abs(im));
  }
  return { finite, rms: Math.sqrt(sum / modes), maxImag: imag };
}

/** Compare every cascade of the current output against the oracle. */
async function checkOutput(ctx, { name, size, spectra, fieldName, sampled, real, out }) {
  const data = await readResult(ctx.renderer, ctx.runtime);
  const modes = size * size, results = [];
  for (let c = 0; c < spectra.length; c++) {
    const spectrum = fieldSpectrum(spectra[c], size, out.tick, fieldName);
    const indices = sampled ? sampleIndices(size) : null;
    const expected = indices ? expectedAt(spectrum, size, indices) : expectedField(spectrum, size);
    const f32 = compareField(data, expected, { indices, offset: 2 * c * modes });
    const layer = await readOutputLayer(ctx.renderer, ctx.runtime, c);
    const half = halfAgainstF32(layer, data, 2 * c * modes);
    const halfVsOracle = compareField(layer, expected, { indices });
    const grid = gridStats(data, 2 * c * modes, modes);
    const expectedRms = parsevalRms(spectrum);
    const rmsRelative = expectedRms > 0 ? Math.abs(grid.rms - expectedRms) / expectedRms : grid.rms;
    // Hermitian height spectra synthesise a real field: the imaginary part is FFT rounding only.
    const residualOk = !(real && fieldName === 'height') || grid.maxImag <= F32_TOLERANCE.relative * f32.maxExpected + F32_TOLERANCE.absolute;
    results.push({
      name, size, cascade: c, field: fieldName, time: out.timeSeconds, tick: out.tick, sampled: !!sampled,
      f32, half: { ...half, vsOracle: halfVsOracle }, grid: { ...grid, expectedRms, rmsRelative },
      pass: passF32(f32) && half.pass && grid.finite && residualOk && rmsRelative <= 1e-5,
    });
  }
  return { results, data };
}

async function sweep(ctx, { name, size, spectra, fields = ['height', 'slope'], times, sampled = false, real = true }) {
  const results = [];
  for (const fieldName of fields) {
    configure(ctx, size, spectra, fieldName);
    for (const time of times) {
      const out = await transform(ctx, time);
      results.push(...(await checkOutput(ctx, { name, size, spectra, fieldName, sampled, real, out })).results);
    }
  }
  return results;
}

export async function smallGridCases(ctx) {
  const results = [];
  for (const size of [8, 16]) {
    const tile = 16;
    const dc = singleModeSpectrum(size, tile, 0, 0, { amplitude: 0.75, cycles: 0 });
    const multi = singleModeSpectrum(size, tile, 1, 0);
    for (const [p, q, re, im, cycles] of [[2, 3, 0.1, -0.2, 7], [-3, 1, -0.05, 0.3, 11], [1, -2, 0.2, 0.15, 3]]) {
      const i = ((q + size) % size) * size + ((p + size) % size);
      // ω(k) = ω(−k), as dispersion gives: otherwise the field is not real.
      multi.h0[2 * i] = re; multi.h0[2 * i + 1] = im; multi.cycles[i] = multi.cycles[mirrorIndex(i, size)] = cycles;
    }
    const cases = [
      ['zero-mode', [dc]], ['single +x', [singleModeSpectrum(size, tile, 1, 0)]],
      ['single +z', [singleModeSpectrum(size, tile, 0, 1)]], ['multi-mode', [multi]],
      ['seeded I.1 fixture', realSpectra(size, 1234, I1_FIXTURE)],
    ];
    for (const [name, spectra] of cases) results.push(...await sweep(ctx, { name, size, spectra, times: SHORT_TIMES }));
    // Arbitrary complex input on every bin (DC and Nyquist included): checks the transform itself.
    const random = [randomSpectrum(size, tile, 99 + size)];
    results.push(...await sweep(ctx, { name: 'random complex', size, spectra: random, times: SHORT_TIMES, real: false }));
  }
  return results;
}

/** I.1's tabulated CPU height values (handoff table, t = 0, exact tick). */
export async function i1TableCase(ctx) {
  const table = { 8: [6.072421e-2, 1.170354174e-1, 1.365827639e-1], 16: [6.149258e-2, 1.130934058e-1, 1.542683992e-1] };
  const rows = [];
  for (const size of [8, 16]) {
    configure(ctx, size, realSpectra(size, 1234, I1_FIXTURE), 'height');
    await transform(ctx, 0);
    const data = await readResult(ctx.renderer, ctx.runtime);
    let sum = 0;
    for (let i = 0; i < size * size; i++) sum += data[2 * i] ** 2;
    const actual = [Math.sqrt(sum / (size * size)), data[0], data[2]];
    const relative = actual.map((value, j) => Math.abs(value - table[size][j]) / Math.abs(table[size][j]));
    rows.push({ size, expected: table[size], actual, relative, pass: relative.every((r) => r < 1e-5) });
  }
  return rows;
}

/** A crest of +x / +z single modes must move downwind (toward +k) as time advances. */
export async function directionCase(ctx) {
  const size = 16, rows = [];
  for (const [axis, p, q] of [['x', 1, 0], ['z', 0, 1]]) {
    configure(ctx, size, [singleModeSpectrum(size, 16, p, q)], 'height');
    const crest = async (time) => {
      await transform(ctx, time);
      const data = await readResult(ctx.renderer, ctx.runtime);
      let best = -Infinity, at = -1;
      for (let j = 0; j < size; j++) {
        const value = data[2 * (axis === 'x' ? j : j * size)];
        if (value > best) { best = value; at = j; }
      }
      return at;
    };
    // cycles = 1: τ = 0 puts the crest at 0; τ = 1/4 (t = 128 s) at +N/4 if it travels toward +k, N·3/4 if upwind.
    const start = await crest(0), quarter = await crest(128);
    rows.push({ axis, crestAtT0: start, crestAtQuarterPeriod: quarter, expected: size / 4, pass: start === 0 && quarter === size / 4 });
  }
  return rows;
}

export async function proof64Cases(ctx) {
  const results = [];
  results.push(...await sweep(ctx, { name: '64² cascade 0', size: 64, spectra: realSpectra(64, 1234, [CASCADE_CANDIDATES[0]]), times: TIMES }));
  results.push(...await sweep(ctx, { name: '64² I.1 fixture (6 m, full band)', size: 64, spectra: realSpectra(64, 1234, I1_FIXTURE), times: [0, 123.4, 127.6] }));
  return results;
}

export async function candidate128Cases(ctx) {
  const spectra = realSpectra(128);
  return sweep(ctx, { name: '128² × 2 candidate', size: 128, spectra, times: [0, 123.4, 127.6, 999_999_999.5], sampled: true });
}

/** Seek backward, repeated time and period aliasing must reproduce bit-identical output. */
export async function timeContractCases(ctx) {
  const { runtime } = ctx;
  configure(ctx, 64, realSpectra(64, 1234, [CASCADE_CANDIDATES[0]]), 'slope');
  await transform(ctx, 123.4);
  const first = await readResult(ctx.renderer, runtime);
  await transform(ctx, 127.6);
  await transform(ctx, 123.4);
  const sought = await readResult(ctx.renderer, runtime);
  const before = runtime.counters.transforms;
  const repeated = runtime.prepare(123.4);
  const aliased = runtime.prepare(123.4 + 512 * 1e6);
  const after = runtime.counters.transforms;
  const aliasData = await readResult(ctx.renderer, runtime);
  return {
    seekBackBitIdentical: first.every((v, i) => Object.is(v, sought[i])),
    repeatedTimeDispatched: repeated,
    aliasedTimeDispatched: aliased,
    aliasedBitIdentical: first.every((v, i) => Object.is(v, aliasData[i])),
    transformsDuringRepeat: after - before,
    pass: first.every((v, i) => Object.is(v, sought[i])) && !repeated && after - before === (aliased ? 1 : 0)
      && first.every((v, i) => Object.is(v, aliasData[i])),
  };
}

/** Zeroing cascade 1 must leave cascade 0 bit-identical and cascade 1 exactly zero. */
export async function cascadeIsolationCase(ctx) {
  const spectra = realSpectra(128);
  configure(ctx, 128, spectra, 'slope');
  await transform(ctx, 126);
  const both = await readResult(ctx.renderer, ctx.runtime);
  const silent = [spectra[0], { ...spectra[1], h0: new Float64Array(spectra[1].h0.length) }];
  ctx.runtime.setSpectrum(silent);
  await transform(ctx, 126);
  const one = await readResult(ctx.renderer, ctx.runtime);
  const modes = 128 * 128;
  const layer0Same = one.subarray(0, 2 * modes).every((v, i) => Object.is(v, both[i]));
  const layer1Zero = one.subarray(2 * modes).every((v) => v === 0);
  return { layer0BitIdentical: layer0Same, layer1ExactlyZero: layer1Zero, pass: layer0Same && layer1Zero };
}

/** A new spectrum uploads into the same buffers: no pipelines, shaders or buffers created. */
export async function spectrumRebuildCase(ctx) {
  const { stats } = ctx;
  configure(ctx, 128, realSpectra(128, 1234), 'slope');
  await transform(ctx, 10);
  const before = { compute: stats.computePipelines, render: stats.renderPipelines, shaders: stats.shaderModules, buffers: stats.liveBuffers.size };
  const stormy = resolveOceanSpectrumParams({ windSpeed: 18, windDirection: 1.1, fetchMeters: 200_000 });
  const spectra = realSpectra(128, 777, CASCADE_CANDIDATES, stormy);
  const started = performance.now();
  ctx.runtime.setSpectrum(spectra);
  const uploadMs = performance.now() - started;
  const out = await transform(ctx, 10);
  const created = {
    computePipelines: stats.computePipelines - before.compute, renderPipelines: stats.renderPipelines - before.render,
    shaderModules: stats.shaderModules - before.shaders, buffers: stats.liveBuffers.size - before.buffers,
  };
  const { results } = await checkOutput(ctx, { name: 'spectrum rebuild (U=18, seed 777)', size: 128, spectra, fieldName: 'slope', sampled: true, real: true, out });
  return { created, uploadMs, results, pass: Object.values(created).every((n) => n === 0) && results.every((r) => r.pass) };
}
