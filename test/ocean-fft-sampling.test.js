import assert from 'node:assert/strict';
import test from 'node:test';

import { CASCADE_CANDIDATES, OFFSHORE_FFT_WIND } from '../src/editor/water/fft/OceanFftConstants.js';
import { OceanFftController } from '../src/editor/water/fft/OceanFftController.js';
import { cascadeUv, cascadeUvOrigin, positiveMod, writeCascadeUvOrigins } from '../src/editor/water/fft/OceanFftCoordinates.js';
import { footprintLod, interpolateLevel, unresolvedSlopeVariance } from '../src/editor/water/fft/OceanFftFiltering.js';
import { buildCascadeSpectra } from '../src/editor/water/fft/OceanFftGpuLayout.js';
import { OCEAN_FFT_PROFILES, resolveOceanFftProfile } from '../src/editor/water/fft/OceanFftQuality.js';
import { OceanFftBinding, sampleOceanFftSlope } from '../src/editor/water/fft/OceanFftSampling.js';
import { expectedVariance } from '../src/editor/water/fft/OceanSpectrum.js';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { Vector4 } from 'three/webgpu';
import { uniform, vec2 } from 'three/tsl';
import { WINDY } from './helpers/oceanFftFixtures.js';

// PR I phase I.3: canonical-world FFT sampling, filtering and tier policy (pure parts).
// The GPU sampling itself is verified headed by scripts/run-ocean-fft-qa.mjs.

const TILES = CASCADE_CANDIDATES.map((c) => c.tileSizeMeters);
const CHUNK = 128;
const f32 = Math.fround;
/** What the shader computes: f32 origin + f32(local / L), wrapped by the repeat sampler. */
const shaderUv = (origin, local, tile) => { const u = f32(f32(origin) + f32(local / tile)); return u - Math.floor(u); };
const wrapDistance = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

test('positiveMod: [0, period) for signed, huge and boundary values; rejects bad input', () => {
  assert.equal(positiveMod(5, 3), 2);
  assert.equal(positiveMod(-1, 3), 2);
  assert.equal(positiveMod(-3, 3), 0);
  for (const value of [-1e-17, -Number.MIN_VALUE, -4_234_567.891, 4_234_567.891, 1e12, -1e12]) {
    for (const period of TILES) {
      const r = positiveMod(value, period);
      assert.ok(r >= 0 && r < period, `${value} mod ${period} = ${r}`);
    }
  }
  for (const [value, period] of [[Number.NaN, 1], [Infinity, 1], [1, 0], [1, -2], [1, Infinity]]) {
    assert.throws(() => positiveMod(value, period), RangeError);
  }
});

test('chunk origins are the world phase: uv ≡ worldX / L (mod 1) for any centre', () => {
  for (const tile of TILES) {
    for (const centre of [0, 64, -64, 4_200_064, -4_200_064, -4_234_496, 1_000_000.5]) {
      const [u] = cascadeUvOrigin(centre, 0, tile);
      for (const local of [-64, -17.25, 0, 33.5, 64]) {
        const expected = positiveMod(centre + local, tile) / tile;
        assert.ok(wrapDistance(u + local / tile, expected) < 1e-9, `${tile} ${centre} ${local}`);
      }
    }
  }
});

test('adjacent chunks agree on their shared edge to f32 rounding, even at −4.2 million metres', () => {
  let worst = 0;
  for (const tile of TILES) {
    for (let i = 0; i < 400; i++) {
      const centre = -4_234_496 + i * CHUNK + (i % 7) * 1e-3;
      const [left] = cascadeUvOrigin(centre, 0, tile), [right] = cascadeUvOrigin(centre + CHUNK, 0, tile);
      worst = Math.max(worst, wrapDistance(shaderUv(left, CHUNK / 2, tile), shaderUv(right, -CHUNK / 2, tile)));
    }
  }
  // f32 ulp of uv < 8 is 2⁻²¹ ≈ 4.8e-7: a few micrometres on a 57 m tile.
  assert.ok(worst < 1e-6, `seam ${worst}`);
});

test('shader UVs match the exact world phase anywhere: render origin and rebases never enter', () => {
  // The shader sees only the chunk's canonical origin and chunk-local metres (|local| ≤ 64);
  // a floating-origin rebase moves the camera, not either term.
  let worst = 0;
  for (const tile of TILES) {
    for (let i = 0; i < 2000; i++) {
      const world = -4_234_567.891 + i * 61.37;
      const centre = Math.round(world / CHUNK) * CHUNK;
      const [u] = cascadeUvOrigin(centre, 0, tile);
      worst = Math.max(worst, wrapDistance(shaderUv(u, world - centre, tile), positiveMod(world, tile) / tile));
    }
  }
  assert.ok(worst < 1e-6, `phase error ${worst}`);
  const out = writeCascadeUvOrigins(-4_200_123.375, 77.5, TILES, [0, 0, 0, 0]);
  assert.deepEqual(out.slice(0, 2), cascadeUvOrigin(-4_200_123.375, 77.5, TILES[0]));
  assert.deepEqual(cascadeUv([0.25, 0.5], 57.3, -15.45, 57.3), [1.25, 0.5 - 15.45 / 57.3]);
});

test('the two cascade periods are not commensurate, so the summed pattern never repeats on a short tile', () => {
  for (const ratio of [TILES[0] / TILES[1]]) {
    for (let q = 1; q <= 8; q++) {
      const p = Math.round(ratio * q);
      assert.ok(Math.abs(ratio - p / q) > 0.005, `${ratio} ≈ ${p}/${q}`);
    }
  }
  // Short-wave limits for 128² (I.3): ≥ 4 texels per shortest band wavelength, ≥ 7 periods of the longest.
  CASCADE_CANDIDATES.forEach(({ tileSizeMeters, kMin, kMax }) => {
    assert.ok((2 * Math.PI / kMax) / (tileSizeMeters / 128) >= 4);
    assert.ok(tileSizeMeters / (2 * Math.PI / kMin) >= 7);
  });
});

test('unresolved slope variance grows with the mip level and ends at the cascade total', () => {
  const spectra = buildCascadeSpectra({ size: 128, seed: 1234, params: WINDY });
  for (const spectrum of spectra) {
    const table = unresolvedSlopeVariance({ size: 128, deltaK: spectrum.deltaK, power: spectrum.power });
    assert.equal(table.length, 8);
    assert.equal(table[0], 0);
    for (let l = 1; l < 8; l++) assert.ok(table[l] >= table[l - 1]);
    const total = expectedVariance({ size: 128, deltaK: spectrum.deltaK, power: spectrum.power }).slope;
    assert.ok(Math.abs(table[7] - total) <= 1e-12 * total);
    assert.ok(table[3] > 0 && table[3] < total);
  }
  assert.equal(footprintLod(0.1, 0.45, 7), 0);
  assert.equal(footprintLod(0.9, 0.45, 7), 1);
  assert.equal(footprintLod(1e6, 0.45, 7), 7);
  assert.equal(interpolateLevel([0, 2, 4], 1.5), 3);
  assert.equal(interpolateLevel([0, 2, 4], 9), 4);
});

test('tier policy: off unless requested, off on low/medium and unsupported backends, 128²×2 on high/ultra', () => {
  assert.equal(resolveOceanFftProfile({ qualityTier: 'high' }).enabled, false);
  for (const tier of ['low', 'medium']) assert.equal(resolveOceanFftProfile({ qualityTier: tier, requested: true }).enabled, false);
  assert.equal(resolveOceanFftProfile({ qualityTier: 'bogus', requested: true }).enabled, false);
  assert.match(resolveOceanFftProfile({ qualityTier: 'ultra', requested: true, unsupportedReason: 'requires the WebGPU backend' }).reason, /WebGPU/);
  for (const tier of ['high', 'ultra']) {
    const profile = resolveOceanFftProfile({ qualityTier: tier, requested: true });
    assert.deepEqual([profile.enabled, profile.size, profile.tileSizes], [true, 128, TILES]);
  }
  assert.equal(OCEAN_FFT_PROFILES.high.cascades, CASCADE_CANDIDATES);
});

test('controller: null when not requested or unsupported (one warning), never touching the renderer', () => {
  const warnings = [];
  const log = { warn: (message) => warnings.push(message), error() {} };
  const webgl = { backend: { isWebGPUBackend: false } };
  assert.equal(OceanFftController.create({ renderer: webgl, qualityTier: 'high', requested: false, log }), null);
  assert.equal(warnings.length, 0);
  assert.equal(OceanFftController.create({ renderer: webgl, qualityTier: 'high', requested: true, log }), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /WebGPU/);
});

test('offshore wind blows along the primary swell; binding defaults to a zero fallback', () => {
  const [wave] = SEA_SWELL_COMPONENTS;
  assert.ok(Math.abs(Math.cos(OFFSHORE_FFT_WIND.windDirection) - wave.x) < 1e-12);
  assert.ok(Math.abs(Math.sin(OFFSHORE_FFT_WIND.windDirection) - wave.z) < 1e-12);
  const binding = new OceanFftBinding({ size: 128, tileSizes: TILES });
  assert.equal(binding.texture.value, binding.fallback);
  assert.equal(binding.available.value, 0);
  binding.update({ size: 128, tileSizes: TILES, texture: { isTexture: true }, generation: 4 });
  assert.equal(binding.available.value, 1);
  binding.update({ size: 64, tileSizes: TILES, texture: { isTexture: true }, generation: 5 });
  assert.equal(binding.texture.value, binding.fallback, 'a mismatched output is never bound');
  assert.throws(() => new OceanFftBinding({ size: 128, tileSizes: [1, 2, 3] }), RangeError);
  const { slope, unresolved } = sampleOceanFftSlope(binding, { origin: uniform(new Vector4()), localXZ: vec2(3, -4), lod: 2 });
  assert.ok(slope.isNode && unresolved.isNode, 'the sampling graph builds for both cascades');
  binding.dispose();
});
