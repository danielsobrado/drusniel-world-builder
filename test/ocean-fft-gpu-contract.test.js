import assert from 'node:assert/strict';
import test from 'node:test';

import { CASCADE_CANDIDATES, WAVE_REPEAT_PERIOD_SECONDS } from '../src/editor/water/fft/OceanFftConstants.js';
import { createOceanFftKernels } from '../src/editor/water/fft/OceanFftGpuKernels.js';
import {
  buildCascadeSpectra, mipChainTexels, OCEAN_FFT_TIME_TICKS, oceanFftByteBudget, packCascadeSpectra,
  resolveFftTopology, tickTimeSeconds, waterTimeTick,
} from '../src/editor/water/fft/OceanFftGpuLayout.js';
import { OceanFftGpuResources } from '../src/editor/water/fft/OceanFftGpuResources.js';
import { evolveSpectrum, synthesize2d } from '../src/editor/water/fft/OceanFourierReference.js';
import { mirrorIndex } from '../src/editor/water/fft/OceanSpectrum.js';
import { compareField, expectedAt, fieldSpectrum, parsevalRms, sampleIndices } from '../scripts/ocean-fft-qa/oracle.js';
import { WINDY } from './helpers/oceanFftFixtures.js';

// PR I phase I.2: CPU side of the GPU FFT. The GPU itself is verified headed by
// scripts/run-ocean-fft-qa.mjs; these pin the layout, time and oracle contracts it relies on.

const candidate = () => resolveFftTopology({ size: 128, tileSizes: CASCADE_CANDIDATES.map((c) => c.tileSizeMeters) });

test('topology validates size and cascade count and derives Δk per cascade', () => {
  const topology = candidate();
  assert.equal(topology.total, 2 * 128 * 128);
  assert.equal(topology.log2Size, 7);
  assert.deepEqual(topology.deltaK, [2 * Math.PI / 57.3, 2 * Math.PI / 15.45]);
  assert.throws(() => resolveFftTopology({ size: 96, tileSizes: [48] }));
  assert.throws(() => resolveFftTopology({ size: 64, tileSizes: [] }));
  assert.throws(() => resolveFftTopology({ size: 64, tileSizes: [1, 2, 3, 4, 5] }));
  assert.throws(() => resolveFftTopology({ size: 64, tileSizes: [Number.NaN] }));
});

test('byte budget is exact: 128²×2 slope-only stays near the I.0 estimate of 1.2 MiB', () => {
  assert.equal(mipChainTexels(4), 16 + 4 + 1);
  const bytes = oceanFftByteBudget(candidate());
  assert.deepEqual(bytes, { h0: 524_288, cycles: 131_072, ping: 262_144, pong: 262_144, output: 174_760, total: 1_354_408 });
  const resources = new OceanFftGpuResources(candidate());
  const allocated = [resources.h0, resources.cycles, resources.ping, resources.pong].reduce((sum, a) => sum + a.array.byteLength, 0);
  assert.equal(allocated, bytes.total - bytes.output);
  assert.equal(resources.output.texture.image.depth, 2);
  resources.dispose();
});

test('upload packs h0 with its conjugate mirror and rejects bad tables without writing', () => {
  const topology = candidate();
  const spectra = buildCascadeSpectra({ size: 128, seed: 1234, params: WINDY });
  const { h0, cycles } = packCascadeSpectra(spectra, topology);
  const modes = 128 * 128, i = 5 * 128 + 9, m = mirrorIndex(i, 128);
  assert.equal(h0[4 * (modes + i)], Math.fround(spectra[1].h0[2 * i]));
  assert.equal(h0[4 * (modes + i) + 3], Math.fround(-spectra[1].h0[2 * m + 1]));
  assert.equal(cycles[modes + i], spectra[1].cycles[i]);

  const target = { h0: new Float32Array(h0.length).fill(7), cycles: new Float32Array(cycles.length).fill(7) };
  const broken = spectra.map((s) => ({ ...s, cycles: Float64Array.from(s.cycles) }));
  broken[1].cycles[3] = 0.5;
  assert.throws(() => packCascadeSpectra(broken, topology, target), /cycles/);
  assert.ok(target.h0.every((v) => v === 7) && target.cycles.every((v) => v === 7), 'a rejected upload writes nothing');
  assert.throws(() => packCascadeSpectra(spectra.slice(0, 1), topology), /expected 2/);
  assert.throws(() => packCascadeSpectra([{ ...spectra[0], tileSizeMeters: 50 }, spectra[1]], topology), /tile/);
});

test('time tick: u32 (cycles·tick) mod 2²² equals the double-precision phase of the tick time', () => {
  const spectra = buildCascadeSpectra({ size: 128, seed: 1234, params: WINDY });
  for (const time of [0, 3.7, 127.6, 86_400 * 365 + 0.25, 999_999_999.5, -42.1]) {
    const tick = waterTimeTick(time);
    assert.ok(Number.isInteger(tick) && tick >= 0 && tick < OCEAN_FFT_TIME_TICKS);
    assert.ok(Math.abs(tickTimeSeconds(tick) - (((time % 512) + 512) % 512)) <= 512 / OCEAN_FFT_TIME_TICKS, `${time}`);
    for (const cycles of spectra[1].cycles.subarray(0, 4096)) {
      const gpu = (Math.imul(cycles, tick) >>> 0) & (OCEAN_FFT_TIME_TICKS - 1);
      const turns = cycles * tick / OCEAN_FFT_TIME_TICKS;
      assert.equal(gpu / OCEAN_FFT_TIME_TICKS, turns - Math.floor(turns));
    }
  }
  assert.equal(waterTimeTick(123.4), waterTimeTick(123.4 + WAVE_REPEAT_PERIOD_SECONDS * 1e6));
  assert.throws(() => waterTimeTick(Number.NaN));
});

test('oracle: point synthesis, Parseval RMS and error statistics agree with synthesize2d', () => {
  const [spectrum] = buildCascadeSpectra({ size: 16, seed: 3, params: WINDY, cascades: [{ tileSizeMeters: 6, kMin: 0, kMax: Infinity }] });
  for (const field of ['height', 'slope']) {
    const evolved = fieldSpectrum(spectrum, 16, waterTimeTick(126), field);
    const full = synthesize2d(evolved, 16);
    const indices = sampleIndices(16, 40);
    const stats = compareField(full, expectedAt(evolved, 16, indices), { indices });
    assert.ok(stats.maxError < 1e-12, `${field} ${stats.maxError}`);
    let sum = 0;
    for (let i = 0; i < full.length; i += 2) sum += full[i] ** 2 + full[i + 1] ** 2;
    assert.ok(Math.abs(Math.sqrt(sum / 256) - parsevalRms(evolved)) < 1e-12);
  }
  const height = fieldSpectrum(spectrum, 16, 0, 'height');
  assert.deepEqual(height, evolveSpectrum(spectrum.h0, { cycles: spectrum.cycles, periodSeconds: 512 }, 16, 0));
});

test('kernels build once per topology: evolve + 2·log2N stages, one output pass per cascade', () => {
  const resources = new OceanFftGpuResources(candidate());
  const kernels = createOceanFftKernels(resources);
  assert.equal(kernels.dispatchCount, 1 + 2 * 7);
  assert.equal(kernels.rows.length, 7);
  assert.equal(kernels.columns.length, 7);
  assert.equal(kernels.outputQuads.length, 2);
  kernels.dispose();
  resources.dispose();
});
