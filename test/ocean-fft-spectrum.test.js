import assert from 'node:assert/strict';
import test from 'node:test';

import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { SEA_DETAIL_DEFAULTS, seaDetailLayers } from '../src/editor/water/SeaDetailPolicy.js';
import {
  CASCADE_CANDIDATES, DEFAULT_HIGH_PASS, GRAVITY, TAU,
} from '../src/editor/water/fft/OceanFftConstants.js';
import {
  angularFrequency, angularFrequencyDerivative, carrierVariance, cascadeBandWeight, coxMunkSlopeVariance,
  createModePowerTable, directionalSpread, expectedVariance, highPassWeight, jonswap, mirrorIndex,
  resolveOceanSpectrumParams, signedIndex, spectrumDensity, tmaCorrection, waveNumberFromWavelength,
  wavelengthFromWaveNumber,
} from '../src/editor/water/fft/OceanSpectrum.js';
import { CALM, FULL_BAND, WINDY } from './helpers/oceanFftFixtures.js';

const cascadeVariance = (params, highPass) => CASCADE_CANDIDATES.map((band) => expectedVariance(createModePowerTable({
  size: 64, tileSizeMeters: band.tileSizeMeters, band, params, highPass,
})));

test('wave-number indexing and wavelength conversion', () => {
  assert.deepEqual([0, 1, 7, 8, 9, 15].map((i) => signedIndex(i, 16)), [0, 1, 7, -8, -7, -1]);
  assert.equal(mirrorIndex(0, 8), 0);
  assert.equal(mirrorIndex(1, 8), 7);
  assert.equal(mirrorIndex(8 + 3, 8), 7 * 8 + 5);
  for (let i = 0; i < 64; i++) assert.equal(mirrorIndex(mirrorIndex(i, 8), 8), i);
  assert.equal(waveNumberFromWavelength(7.5), TAU / 7.5);
  assert.ok(Math.abs(wavelengthFromWaveNumber(waveNumberFromWavelength(3.3)) - 3.3) < 1e-15);
});

test('dispersion meets deep and shallow limits, Jacobian matches a central difference', () => {
  const k = 0.5;
  assert.equal(angularFrequency(k), Math.sqrt(GRAVITY * k));
  assert.ok(Math.abs(angularFrequency(k, 1000) - Math.sqrt(GRAVITY * k)) < 1e-12);
  const shallow = 0.01;
  assert.ok(Math.abs(angularFrequency(k, shallow) / (k * Math.sqrt(GRAVITY * shallow)) - 1) < 1e-4);
  assert.equal(angularFrequency(0, 10), 0);
  assert.equal(angularFrequencyDerivative(0, 10), 0);
  for (const depth of [0.5, 4, Infinity]) {
    const h = 1e-6;
    const numeric = (angularFrequency(k + h, depth) - angularFrequency(k - h, depth)) / (2 * h);
    assert.ok(Math.abs(angularFrequencyDerivative(k, depth) - numeric) < 1e-6, `depth ${depth}`);
  }
  // Deep-water group velocity is half the phase velocity.
  assert.ok(Math.abs(angularFrequencyDerivative(k) - angularFrequency(k) / (2 * k)) < 1e-12);
});

test('JONSWAP peaks at ω_p with γ enhancement; TMA attenuates shallow water only', () => {
  const { omegaPeak, gamma, alpha } = WINDY;
  const pm = (omega) => (alpha * GRAVITY ** 2 / omega ** 5) * Math.exp(-1.25 * (omegaPeak / omega) ** 4);
  assert.ok(Math.abs(jonswap(omegaPeak, WINDY) / pm(omegaPeak) - gamma) < 1e-12);
  assert.ok(jonswap(omegaPeak, WINDY) > jonswap(omegaPeak * 0.9, WINDY));
  assert.ok(jonswap(omegaPeak, WINDY) > jonswap(omegaPeak * 1.1, WINDY));
  assert.equal(jonswap(0, WINDY), 0);
  assert.equal(jonswap(1, CALM), 0);
  assert.equal(tmaCorrection(5, Infinity), 1);
  assert.equal(tmaCorrection(0, 5), 0);
  const wh1 = Math.sqrt(GRAVITY / 4); // ω_h = 1 at d = 4 m
  assert.ok(Math.abs(tmaCorrection(wh1, 4) - 0.5) < 1e-12);
  assert.equal(tmaCorrection(2 * wh1, 4), 1);
});

test('directional spread integrates to one and peaks downwind', () => {
  for (const ratio of [0.3, 0.8, 1, 1.4, 3]) {
    const steps = 4000;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += directionalSpread(-Math.PI + (i + 0.5) * TAU / steps, ratio) * TAU / steps;
    assert.ok(Math.abs(sum - 1) < 1e-6, `ratio ${ratio}: ${sum}`);
    assert.ok(directionalSpread(0, ratio) > directionalSpread(0.5, ratio));
  }
  // Rotating the wind rotates the energy centroid with it.
  for (const heading of [0, Math.PI / 2, -2.4]) {
    const params = resolveOceanSpectrumParams({ windSpeed: 10, windDirection: heading, fetchMeters: 50_000 });
    const table = createModePowerTable({ size: 32, tileSizeMeters: 12, band: FULL_BAND, params });
    let cx = 0, cz = 0;
    table.power.forEach((power, i) => {
      cx += power * signedIndex(i % 32, 32);
      cz += power * signedIndex(Math.floor(i / 32), 32);
    });
    const error = Math.atan2(Math.sin(Math.atan2(cz, cx) - heading), Math.cos(Math.atan2(cz, cx) - heading));
    assert.ok(Math.abs(error) < 0.05, `heading ${heading}: centroid off by ${error}`);
  }
});

test('spectrum density is finite and non-negative everywhere on a wide lattice', () => {
  for (const params of [WINDY, resolveOceanSpectrumParams({ windSpeed: 60, windDirection: 1, fetchMeters: 1e8, depthMeters: 0.05 })]) {
    for (let iz = -40; iz <= 40; iz += 3) {
      for (let ix = -40; ix <= 40; ix += 3) {
        const value = spectrumDensity(ix * 0.7, iz * 0.7, params);
        assert.ok(Number.isFinite(value) && value >= 0, `${ix},${iz}: ${value}`);
      }
    }
  }
});

test('high-pass: zero at and beyond the carriers, smooth and bounded in the knee', () => {
  for (const wave of SEA_SWELL_COMPONENTS) {
    assert.equal(highPassWeight(wave.waveNumber), 0);
    assert.equal(spectrumDensity(wave.waveNumber, 0, WINDY), 0);
  }
  const k0 = TAU / DEFAULT_HIGH_PASS.cutoffWavelength, k1 = TAU / DEFAULT_HIGH_PASS.fullWavelength;
  assert.equal(highPassWeight(k0), 0);
  assert.equal(highPassWeight(k1), 1);
  let previous = 0;
  for (let i = 1; i <= 100; i++) {
    const w = highPassWeight(k0 + (k1 - k0) * i / 100);
    assert.ok(w >= previous && w <= 1 && w - previous < 0.02, `step ${i}`);
    previous = w;
  }
  // Parameterised cut-off moves the knee; an inverted knee is rejected.
  assert.equal(highPassWeight(TAU / 4, { cutoffWavelength: 4, fullWavelength: 3 }), 0);
  assert.throws(() => highPassWeight(1, { cutoffWavelength: 3, fullWavelength: 4 }), /fullWavelength/);
  const table = createModePowerTable({ size: 64, tileSizeMeters: 48, band: FULL_BAND, params: WINDY });
  table.power.forEach((power, i) => {
    const k = Math.hypot(signedIndex(i % 64, 64), signedIndex(Math.floor(i / 64), 64)) * table.deltaK;
    if (k <= k0) assert.equal(power, 0);
  });
});

test('DC and Nyquist lines carry no power', () => {
  const n = 16;
  const table = createModePowerTable({ size: n, tileSizeMeters: 6, band: FULL_BAND, params: WINDY });
  table.power.forEach((power, i) => {
    const p = i % n, q = Math.floor(i / n);
    if (i === 0 || p === n / 2 || q === n / 2) assert.equal(power, 0);
  });
  assert.ok(expectedVariance(table).height > 0);
});

test('cascade bands are disjoint, contiguous, below Nyquist; variance adds without overlap', () => {
  CASCADE_CANDIDATES.forEach((band, i) => {
    assert.ok(band.kMin < band.kMax);
    assert.ok(band.kMax < Math.PI * 64 / band.tileSizeMeters, 'band reaches past N=64 Nyquist');
    if (i > 0) assert.equal(band.kMin, CASCADE_CANDIDATES[i - 1].kMax);
  });
  const lo = CASCADE_CANDIDATES[0].kMin, hi = CASCADE_CANDIDATES.at(-1).kMax;
  for (const k of [0, lo * 0.999, lo, CASCADE_CANDIDATES[0].kMax, (lo + hi) / 2, hi * 0.999, hi, hi * 2]) {
    const owners = CASCADE_CANDIDATES.reduce((sum, band) => sum + cascadeBandWeight(k, band), 0);
    assert.equal(owners, k >= lo && k < hi ? 1 : 0, `k=${k}`);
  }
  // On one shared lattice, the two masked tables partition the union exactly.
  const shared = { size: 64, tileSizeMeters: 12, params: WINDY };
  const union = expectedVariance(createModePowerTable({ ...shared, band: { kMin: lo, kMax: hi } }));
  const parts = CASCADE_CANDIDATES.map((band) => expectedVariance(createModePowerTable({ ...shared, band })));
  assert.ok(Math.abs(parts[0].height + parts[1].height - union.height) <= 1e-15 * union.height);
  assert.ok(Math.abs(parts[0].slope + parts[1].slope - union.slope) <= 1e-12 * union.slope);
});

test('expected variance converges as the lattice refines (normalisation is per Δk², not per N)', () => {
  const band = { kMin: 0, kMax: TAU / 1 };
  const coarse = expectedVariance(createModePowerTable({ size: 32, tileSizeMeters: 12, band, params: WINDY }));
  const fine = expectedVariance(createModePowerTable({ size: 64, tileSizeMeters: 24, band, params: WINDY }));
  const finer = expectedVariance(createModePowerTable({ size: 128, tileSizeMeters: 48, band, params: WINDY }));
  assert.ok(Math.abs(fine.height / finer.height - 1) < Math.abs(coarse.height / finer.height - 1) + 1e-3);
  assert.ok(Math.abs(fine.height / finer.height - 1) < 0.05, `${fine.height} vs ${finer.height}`);
  assert.ok(Math.abs(fine.slope / finer.slope - 1) < 0.05, `${fine.slope} vs ${finer.slope}`);
});

test('variance grows smoothly and monotonically with wind; extremes stay finite', () => {
  let previous = 0;
  for (let u = 1; u <= 30; u += 0.5) {
    const params = resolveOceanSpectrumParams({ windSpeed: u, windDirection: 0, fetchMeters: 50_000 });
    const slope = cascadeVariance(params).reduce((sum, v) => sum + v.slope, 0);
    const nudged = cascadeVariance(resolveOceanSpectrumParams({ ...params, windSpeed: u + 1e-3 }))
      .reduce((sum, v) => sum + v.slope, 0);
    assert.ok(slope > previous, `u=${u}`);
    assert.ok(Math.abs(nudged / slope - 1) < 1e-3, `u=${u} jumps`);
    previous = slope;
  }
  for (const source of [
    { windSpeed: 60, windDirection: 0, fetchMeters: 1e8 },
    { windSpeed: 25, windDirection: -9.9e5, fetchMeters: 1 },
    { windSpeed: 12, windDirection: 1, fetchMeters: 2e4, depthMeters: 1e-3 },
    { windSpeed: 12, windDirection: 1, fetchMeters: 2e4, depthMeters: 1e5 },
  ]) {
    const v = cascadeVariance(resolveOceanSpectrumParams(source));
    v.forEach((part) => assert.ok(Number.isFinite(part.height) && Number.isFinite(part.slope) && part.slope >= 0));
  }
});

test('zero wind policy: exactly zero spectrum', () => {
  assert.equal(CALM.calm, true);
  assert.equal(spectrumDensity(3, 1, CALM), 0);
  cascadeVariance(CALM).forEach((v) => assert.deepEqual(v, { height: 0, slope: 0 }));
});

test('invalid physical inputs fail with the parameter name', () => {
  const ok = { windSpeed: 5, windDirection: 0, fetchMeters: 10 };
  for (const [field, value] of [
    ['windSpeed', -1], ['windSpeed', NaN], ['windSpeed', 61], ['windDirection', Infinity],
    ['fetchMeters', 0], ['fetchMeters', '10'], ['depthMeters', 0], ['depthMeters', -Infinity], ['gamma', 0.5],
  ]) {
    assert.throws(() => resolveOceanSpectrumParams({ ...ok, [field]: value }), new RegExp(field), `${field}=${value}`);
  }
  assert.throws(() => resolveOceanSpectrumParams(), /windSpeed/);
  assert.throws(() => createModePowerTable({ size: 12, tileSizeMeters: 6, band: FULL_BAND, params: WINDY }), /power of two/);
  assert.throws(() => createModePowerTable({ size: 16, tileSizeMeters: 0, band: FULL_BAND, params: WINDY }), /tileSizeMeters/);
});

test('energy accounting: carriers vs FFT residual vs existing detail', () => {
  const carriers = carrierVariance(SEA_SWELL_COMPONENTS, 0.9);
  assert.ok(carriers.height > 0 && carriers.slope > 0);
  const residualSlope = cascadeVariance(WINDY).reduce((sum, v) => sum + v.slope, 0);
  // Band-limited residual stays below the whole-spectrum Cox–Munk prior at the same wind.
  assert.ok(residualSlope > 0 && residualSlope < coxMunkSlopeVariance(10), `residual ${residualSlope}`);
  // The whole medium group (index 0: ~2 m, index 1: ~0.95 m ripples) lies inside the FFT band, so I.4
  // replaces it; fine detail (index 2, ~0.35 m) lies above the band top and stays (I.0 Decision A).
  const lo = CASCADE_CANDIDATES[0].kMin, hi = CASCADE_CANDIDATES.at(-1).kMax;
  const rippleK = (layer) => TAU * Math.hypot(...layer.basis[0]) * 4;
  const layers = seaDetailLayers(SEA_DETAIL_DEFAULTS);
  for (const layer of layers.filter((l) => l.index < 2)) assert.ok(rippleK(layer) > lo && rippleK(layer) < hi, layer.name);
  for (const layer of layers.filter((l) => l.index === 2)) assert.ok(rippleK(layer) >= hi, layer.name);
});
