import assert from 'node:assert/strict';
import test from 'node:test';

import { CASCADE_CANDIDATES } from '../src/editor/water/fft/OceanFftConstants.js';
import { footprintLod, interpolateLevel, unresolvedSlopeVariance } from '../src/editor/water/fft/OceanFftFiltering.js';
import { buildCascadeSpectra } from '../src/editor/water/fft/OceanFftGpuLayout.js';
import { OceanFftBinding, sampleOceanFftSlope } from '../src/editor/water/fft/OceanFftSampling.js';
import { expectedVariance } from '../src/editor/water/fft/OceanSpectrum.js';
import { Vector4 } from 'three/webgpu';
import { uniform, vec2 } from 'three/tsl';
import { CALM, WINDY } from './helpers/oceanFftFixtures.js';

// PR I phase I.3: unresolved slope variance of the mipped FFT slopes (OceanFftFiltering)
// and the TSL sampling graph. The GPU values are checked headed by scripts/run-ocean-fft-qa.mjs.

const TILES = CASCADE_CANDIDATES.map((c) => c.tileSizeMeters);
const tableOf = (size, spectrum) => unresolvedSlopeVariance({ size, deltaK: spectrum.deltaK, power: spectrum.power });

test('unresolved variance: 0 at full resolution, monotonic, ends at the cascade total, never negative', () => {
  for (const spectrum of buildCascadeSpectra({ size: 128, seed: 1234, params: WINDY })) {
    const table = tableOf(128, spectrum);
    const total = expectedVariance({ size: 128, deltaK: spectrum.deltaK, power: spectrum.power }).slope;
    assert.equal(table.length, 8);
    assert.equal(table[0], 0);
    for (let l = 1; l < 8; l++) assert.ok(table[l] >= table[l - 1], 'resolved detail only decreases with the footprint');
    assert.ok(table.every((value) => Number.isFinite(value) && value >= 0));
    assert.ok(Math.abs(table[7] - total) <= 1e-12 * total, 'bounded by, and reaching, the total');
    assert.ok(table[3] > 0 && table[3] < total);
    // Resolved = total − unresolved: most of the slope is resolved at mip 1 (a fine footprint).
    assert.ok(total - table[1] > 0.5 * total);
  }
});

test('a calm sea (zero spectrum) has zero unresolved variance at every level', () => {
  for (const spectrum of buildCascadeSpectra({ size: 64, seed: 3, params: CALM })) {
    assert.ok(tableOf(64, spectrum).every((value) => value === 0));
  }
});

test('equivalent physical bands at 64² and 128² agree at the same physical texel', () => {
  // Mip l at 128² and mip l−1 at 64² both resolve texels of L·2^l/128 metres.
  const fine = buildCascadeSpectra({ size: 128, seed: 9, params: WINDY });
  const coarse = buildCascadeSpectra({ size: 64, seed: 9, params: WINDY });
  fine.forEach((spectrum, c) => {
    const a = tableOf(128, spectrum), b = tableOf(64, coarse[c]);
    const total = a[a.length - 1];
    for (let l = 2; l < a.length; l++) assert.ok(Math.abs(a[l] - b[l - 1]) <= 0.12 * total, `cascade ${c} level ${l}`);
  });
});

test('footprint LOD and level interpolation are continuous and clamped', () => {
  assert.equal(footprintLod(0.1, 0.45, 7), 0);
  assert.equal(footprintLod(0.9, 0.45, 7), 1);
  assert.equal(footprintLod(1e6, 0.45, 7), 7);
  assert.equal(footprintLod(Number.NaN, 0.45, 7), 0);
  const table = tableOf(128, buildCascadeSpectra({ size: 128, seed: 1234, params: WINDY })[0]);
  for (let l = 1; l < 7; l++) {
    const below = interpolateLevel(table, l - 1e-9), at = interpolateLevel(table, l), above = interpolateLevel(table, l + 1e-9);
    assert.ok(Math.abs(below - at) < 1e-6 * table[7] && Math.abs(above - at) < 1e-6 * table[7], `continuous at mip ${l}`);
  }
  assert.equal(interpolateLevel([0, 2, 4], 1.5), 3);
  assert.equal(interpolateLevel([0, 2, 4], 9), 4);
});

test('binding: zero fallback until a matching output, then the shared texture; graph builds for both cascades', () => {
  const binding = new OceanFftBinding({ size: 128, tileSizes: TILES });
  assert.equal(binding.texture.value, binding.fallback);
  assert.equal(binding.available.value, 0);
  binding.setSpectra(buildCascadeSpectra({ size: 128, seed: 1234, params: WINDY }));
  assert.equal(binding.unresolved.array.length, 2 * 8);
  assert.ok(binding.unresolved.array.every((value) => Number.isFinite(value) && value >= 0));
  binding.update({ size: 128, tileSizes: TILES, texture: { isTexture: true }, generation: 4 });
  assert.equal(binding.available.value, 1);
  assert.equal(binding.generation, 4);
  binding.update({ size: 64, tileSizes: TILES, texture: { isTexture: true }, generation: 5 });
  assert.equal(binding.texture.value, binding.fallback, 'a mismatched output is never bound');
  binding.update(null);
  assert.equal(binding.available.value, 0, 'a failed or disposed runtime falls back');
  assert.throws(() => new OceanFftBinding({ size: 128, tileSizes: [1, 2, 3] }), RangeError);
  const { slope, unresolved } = sampleOceanFftSlope(binding, { origin: uniform(new Vector4()), localXZ: vec2(3, -4), lod: 2 });
  assert.ok(slope.isNode && unresolved.isNode);
  binding.dispose();
});
