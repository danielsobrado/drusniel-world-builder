import assert from 'node:assert/strict';
import test from 'node:test';

import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { SEA_DETAIL_DEFAULTS, seaDetailLayers } from '../src/editor/water/SeaDetailPolicy.js';
import {
  CASCADE_CANDIDATES, GRAVITY, HIGH_PASS_K0, HIGH_PASS_K1, TAU,
} from '../src/editor/water/fft/OceanFftConstants.js';
import {
  carrierVariance, coxMunkSlopeVariance, createModeTable, directionalSpread, dispersion,
  evolveModes, expectedVariance, highPass, inBand, resolveOceanSpectrumParams, spectrumDensity,
  tmaCorrection,
} from '../src/editor/water/fft/OceanSpectrum.js';
import { forwardDft2d, inverseDft2d, synthesize2d } from '../src/editor/water/fft/OceanFourierReference.js';

const WINDY = resolveOceanSpectrumParams({ windSpeed: 10, windDirection: 0, fetchMeters: 50_000 });
const FULL_BAND = Object.freeze({ kMin: 0, kMax: Infinity });
// 6 m tile at N=16: every non-DC mode lies in the high-pass band, so the grid is dense with energy.
const SMALL = Object.freeze({ seed: 7, size: 16, tileSizeMeters: 6, band: FULL_BAND, params: WINDY });

const mirrorOf = (index, n) => ((n - Math.floor(index / n)) % n) * n + ((n - (index % n)) % n);
const maxAbs = (array) => array.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const sumSquares = (re, im) => re.reduce((sum, value, i) => sum + value * value + im[i] * im[i], 0);

test('DC and Nyquist modes carry no energy', () => {
  const table = createModeTable(SMALL);
  const n = table.size;
  for (let i = 0; i < n * n; i++) {
    const p = i % n, q = Math.floor(i / n);
    if (i === 0 || p === n / 2 || q === n / 2) {
      assert.equal(table.h0Re[i], 0);
      assert.equal(table.h0Im[i], 0);
    }
  }
  assert.ok(expectedVariance(table).height > 0);
});

test('evolved spectrum is Hermitian and synthesises a real field', () => {
  const table = createModeTable(SMALL);
  const n = table.size;
  const modes = evolveModes(table, 3.7);
  for (let i = 0; i < n * n; i++) {
    const m = mirrorOf(i, n);
    assert.ok(Math.abs(modes.heightRe[i] - modes.heightRe[m]) < 1e-15);
    assert.ok(Math.abs(modes.heightIm[i] + modes.heightIm[m]) < 1e-15);
  }
  for (const [re, im] of [['heightRe', 'heightIm'], ['slopeXRe', 'slopeXIm'], ['slopeZRe', 'slopeZIm']]) {
    const field = synthesize2d(modes[re], modes[im], n);
    assert.ok(maxAbs(field.im) <= 1e-12 * maxAbs(field.re), `${re} has an imaginary residual`);
  }
});

test('forward then inverse DFT is the identity with 1/N² applied once', () => {
  for (const n of [8, 16]) {
    const re = Float64Array.from({ length: n * n }, (_, i) => Math.sin(i * 1.7) + 0.3);
    const im = Float64Array.from({ length: n * n }, (_, i) => Math.cos(i * 0.9));
    const spectrum = forwardDft2d(re, im, n);
    const back = inverseDft2d(spectrum.re, spectrum.im, n);
    for (let i = 0; i < n * n; i++) {
      assert.ok(Math.abs(back.re[i] - re[i]) < 1e-12 && Math.abs(back.im[i] - im[i]) < 1e-12);
    }
  }
});

test('Parseval: spatial mean square equals summed mode power', () => {
  for (const size of [8, 16]) {
    const table = createModeTable({ ...SMALL, size });
    const modes = evolveModes(table, 11.2);
    const field = synthesize2d(modes.heightRe, modes.heightIm, size);
    const spatial = sumSquares(field.re, field.im) / (size * size);
    const spectral = sumSquares(modes.heightRe, modes.heightIm);
    assert.ok(Math.abs(spatial - spectral) <= 1e-12 * spectral);
  }
});

test('measured variance over seeds matches expected spectral integral, independent of seed scale', () => {
  const table0 = createModeTable({ ...SMALL, size: 16 });
  const expected = expectedVariance(table0);
  let height = 0, slope = 0;
  const seeds = 24;
  for (let seed = 1; seed <= seeds; seed++) {
    const modes = evolveModes(createModeTable({ ...SMALL, seed }), 5);
    height += sumSquares(modes.heightRe, modes.heightIm) / seeds;
    slope += (sumSquares(modes.slopeXRe, modes.slopeXIm) + sumSquares(modes.slopeZRe, modes.slopeZIm)) / seeds;
  }
  assert.ok(Math.abs(height / expected.height - 1) < 0.2, `height ratio ${height / expected.height}`);
  assert.ok(Math.abs(slope / expected.slope - 1) < 0.2, `slope ratio ${slope / expected.slope}`);
});

test('a single +x mode travels east (+x), not upwind', () => {
  const calm = resolveOceanSpectrumParams({ windSpeed: 0, windDirection: 0, fetchMeters: 1000 });
  const n = 16, tileSizeMeters = 32;
  const table = createModeTable({ seed: 1, size: n, tileSizeMeters, band: FULL_BAND, params: calm });
  table.h0Re[1] = 0.5; // p=1, q=0: kx = +Δk
  const k = TAU / tileSizeMeters;
  const omega = dispersion(k).omega;
  for (const t of [0, 1, 10]) {
    const modes = evolveModes(table, t);
    const field = synthesize2d(modes.heightRe, modes.heightIm, n);
    // Eastward travel is cos(kx − ωt); the upwind sign would give cos(kx + ωt).
    for (let x = 0; x < n; x++) {
      const position = x * tileSizeMeters / n;
      assert.ok(Math.abs(field.re[x] - Math.cos(k * position - omega * t)) < 1e-12, `t=${t} x=${x}`);
    }
  }
  // Downwind energy dominates for wind toward +x.
  const windy = createModeTable({ ...SMALL, size: 16 });
  let east = 0, west = 0;
  windy.power.forEach((power, i) => { if (windy.kx[i] > 0) east += power; else if (windy.kx[i] < 0) west += power; });
  assert.ok(east > 5 * west);
});

test('time is absolute: seeks in any order give identical fields', () => {
  const table = createModeTable(SMALL);
  const times = [123.4, 124.6, 126.0, 127.6];
  const first = times.map((t) => evolveModes(table, t));
  const reversed = [...times].reverse().map((t) => evolveModes(table, t)).reverse();
  first.forEach((modes, i) => assert.deepEqual(modes.heightRe, reversed[i].heightRe));
  const late = evolveModes(table, 3.6e6);
  assert.ok(late.heightRe.every(Number.isFinite));
});

test('no FFT energy at or beyond the analytic carriers', () => {
  for (const wave of SEA_SWELL_COMPONENTS) {
    assert.equal(highPass(wave.waveNumber), 0);
    assert.equal(spectrumDensity(wave.waveNumber, 0, WINDY), 0);
  }
  assert.equal(highPass(HIGH_PASS_K0), 0);
  assert.equal(highPass(HIGH_PASS_K1), 1);
  const cascade = CASCADE_CANDIDATES[0];
  const table = createModeTable({ seed: 3, size: 64, tileSizeMeters: cascade.tileSizeMeters, band: cascade, params: WINDY });
  table.power.forEach((power, i) => {
    if (Math.hypot(table.kx[i], table.kz[i]) <= HIGH_PASS_K0) assert.equal(power, 0);
  });
});

test('cascade bands are disjoint, contiguous and below their Nyquist', () => {
  CASCADE_CANDIDATES.forEach((band, i) => {
    assert.ok(band.kMin < band.kMax);
    assert.ok(band.kMax < Math.PI * 64 / band.tileSizeMeters, 'band reaches past N=64 Nyquist');
    if (i > 0) assert.equal(band.kMin, CASCADE_CANDIDATES[i - 1].kMax);
  });
  const lo = CASCADE_CANDIDATES[0].kMin, hi = CASCADE_CANDIDATES.at(-1).kMax;
  for (const k of [0, lo * 0.999, lo, CASCADE_CANDIDATES[0].kMax, (lo + hi) / 2, hi * 0.999, hi, hi * 2]) {
    const owners = CASCADE_CANDIDATES.filter((band) => inBand(k, band)).length;
    assert.equal(owners, k >= lo && k < hi ? 1 : 0, `k=${k}`);
  }
  // Total expected variance is the sum of disjoint cascade contributions, each finite.
  const parts = CASCADE_CANDIDATES.map((band, cascadeIndex) => expectedVariance(createModeTable({
    seed: 1, size: 64, tileSizeMeters: band.tileSizeMeters, band, params: WINDY, cascadeIndex,
  })));
  parts.forEach((part) => assert.ok(part.height > 0 && Number.isFinite(part.slope)));
});

test('finite-depth dispersion meets its deep and shallow limits', () => {
  const k = 0.5;
  assert.ok(Math.abs(dispersion(k, 1000).omega - Math.sqrt(GRAVITY * k)) < 1e-12);
  assert.equal(dispersion(k, Infinity).omega, Math.sqrt(GRAVITY * k));
  const d = 0.01;
  assert.ok(Math.abs(dispersion(k, d).omega / (k * Math.sqrt(GRAVITY * d)) - 1) < 1e-4);
  assert.deepEqual(dispersion(0, 10), { omega: 0, dOmegaDk: 0 });
  // dω/dk matches a central difference at finite depth.
  const h = 1e-6, depth = 4;
  const numeric = (dispersion(k + h, depth).omega - dispersion(k - h, depth).omega) / (2 * h);
  assert.ok(Math.abs(dispersion(k, depth).dOmegaDk - numeric) < 1e-6);
  assert.equal(tmaCorrection(0, 5), 0);
  assert.equal(tmaCorrection(10, Infinity), 1);
});

test('directional spread integrates to one', () => {
  for (const ratio of [0.3, 0.8, 1, 1.4, 3]) {
    const steps = 4000;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += directionalSpread(-Math.PI + (i + 0.5) * TAU / steps, ratio) * TAU / steps;
    assert.ok(Math.abs(sum - 1) < 1e-6, `ratio ${ratio}: ${sum}`);
  }
});

test('edge cases stay finite or fail with a clear message', () => {
  const calm = createModeTable({ ...SMALL, params: resolveOceanSpectrumParams({ windSpeed: 0, windDirection: 0, fetchMeters: 10 }) });
  assert.equal(expectedVariance(calm).height, 0);
  const cases = [
    { windSpeed: 60, windDirection: 0, fetchMeters: 1e8 },
    { windSpeed: 25, windDirection: -9.9e5, fetchMeters: 1 },
    { windSpeed: 12, windDirection: 1, fetchMeters: 2e4, depthMeters: 0.05 },
  ];
  for (const source of cases) {
    const table = createModeTable({ ...SMALL, params: resolveOceanSpectrumParams(source) });
    const v = expectedVariance(table);
    assert.ok(Number.isFinite(v.height) && Number.isFinite(v.slope), JSON.stringify(source));
    assert.ok(evolveModes(table, 1e5).slopeXRe.every(Number.isFinite));
  }
  assert.throws(() => resolveOceanSpectrumParams({ windSpeed: 5, windDirection: 0, fetchMeters: 0 }), /fetchMeters/);
  assert.throws(() => resolveOceanSpectrumParams({ windSpeed: -1, windDirection: 0, fetchMeters: 10 }), /windSpeed/);
  assert.throws(() => resolveOceanSpectrumParams({ windSpeed: 5, windDirection: NaN, fetchMeters: 10 }), /windDirection/);
  assert.throws(() => resolveOceanSpectrumParams({ windSpeed: 5, windDirection: 0, fetchMeters: 10, depthMeters: 0 }), /depthMeters/);
  assert.throws(() => createModeTable({ ...SMALL, size: 12 }), /power of two/);
  assert.throws(() => createModeTable({ ...SMALL, seed: 1.5 }), /seed/);
  assert.throws(() => evolveModes(createModeTable(SMALL), Infinity), /timeSeconds/);
});

test('seeding is exact for equal inputs, including signed large seeds, and differs across seeds', () => {
  const seed = -4_226_432_278_528;
  const a = createModeTable({ ...SMALL, seed });
  const b = createModeTable({ ...SMALL, seed });
  assert.deepEqual(a.h0Re, b.h0Re);
  assert.deepEqual(a.h0Im, b.h0Im);
  const c = createModeTable({ ...SMALL, seed: seed + 1 });
  assert.notDeepEqual(a.h0Re, c.h0Re);
  assert.deepEqual(a.power, c.power);
  // A mode keeps its Gaussian pair when N grows: phases are keyed by signed index, not scan order.
  const big = createModeTable({ ...SMALL, seed, size: 32, tileSizeMeters: 6 });
  const n = SMALL.size;
  assert.equal(big.h0Re[1 * 32 + 1] / Math.sqrt(big.power[33]), a.h0Re[1 * n + 1] / Math.sqrt(a.power[n + 1]));
});

test('slope modes are the derivative of the height field', () => {
  const table = createModeTable({ ...SMALL, size: 8 });
  const n = table.size, dx = table.tileSizeMeters / n;
  const modes = evolveModes(table, 2.5);
  const heightAt = (x, z) => {
    let sum = 0;
    for (let i = 0; i < n * n; i++) {
      const a = table.kx[i] * x + table.kz[i] * z;
      sum += modes.heightRe[i] * Math.cos(a) - modes.heightIm[i] * Math.sin(a);
    }
    return sum;
  };
  const slopeX = synthesize2d(modes.slopeXRe, modes.slopeXIm, n).re;
  const slopeZ = synthesize2d(modes.slopeZRe, modes.slopeZIm, n).re;
  const h = 1e-5;
  for (const [ix, iz] of [[0, 0], [3, 5], [7, 2]]) {
    const x = ix * dx, z = iz * dx;
    const fx = (heightAt(x + h, z) - heightAt(x - h, z)) / (2 * h);
    const fz = (heightAt(x, z + h) - heightAt(x, z - h)) / (2 * h);
    assert.ok(Math.abs(fx - slopeX[iz * n + ix]) < 1e-6);
    assert.ok(Math.abs(fz - slopeZ[iz * n + ix]) < 1e-6);
  }
});

test('energy accounting: carriers vs FFT residual vs existing detail', () => {
  const carriers = carrierVariance(SEA_SWELL_COMPONENTS, 0.9);
  assert.ok(carriers.height > 0 && carriers.slope > 0);
  const residualSlope = CASCADE_CANDIDATES.reduce((sum, band, cascadeIndex) => sum + expectedVariance(createModeTable({
    seed: 1, size: 64, tileSizeMeters: band.tileSizeMeters, band, params: WINDY, cascadeIndex,
  })).slope, 0);
  // Band-limited residual is bounded by the whole-spectrum Cox–Munk prior at the same wind.
  assert.ok(residualSlope > 0 && residualSlope < coxMunkSlopeVariance(10), `residual ${residualSlope}`);
  // Replacement strategy: medium detail (~0.95 m ripples) lies inside the FFT band, so FFT replaces it;
  // fine detail (~0.35 m) lies above the band and stays. If either moves, revisit the I.4 blend.
  const lo = CASCADE_CANDIDATES[0].kMin, hi = CASCADE_CANDIDATES.at(-1).kMax;
  const rippleK = (layer) => TAU * Math.hypot(...layer.basis[0]) * 4;
  const layers = seaDetailLayers(SEA_DETAIL_DEFAULTS);
  for (const layer of layers.filter((l) => l.index === 1)) assert.ok(rippleK(layer) > lo && rippleK(layer) < hi, layer.name);
  for (const layer of layers.filter((l) => l.index === 2)) assert.ok(rippleK(layer) >= hi, layer.name);
});
