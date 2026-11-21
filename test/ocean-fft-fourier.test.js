import assert from 'node:assert/strict';
import test from 'node:test';

import { CARRIER_PHASE_SPEED_SCALE, TAU, WAVE_REPEAT_PERIOD_SECONDS } from '../src/editor/water/fft/OceanFftConstants.js';
import {
  evolveSpectrum, forwardDft2d, inverseDft2d, packedSlopeSpectrum, sampleField, spectralDerivative,
  synthesize2d,
} from '../src/editor/water/fft/OceanFourierReference.js';
import { packInitialSpectrum } from '../src/editor/water/fft/OceanGaussianModes.js';
import { angularFrequency, createWaveFrequencies, mirrorIndex } from '../src/editor/water/fft/OceanSpectrum.js';
import { buildCascade, CALM, imagPart, maxAbs, realPart, sumSquares } from './helpers/oceanFftFixtures.js';

const EPS = 1e-12;
const complex = (n) => new Float64Array(2 * n * n);

test('constant signal: DC only synthesises a flat field', () => {
  const n = 8, spectrum = complex(n);
  spectrum[0] = 2.5;
  const field = synthesize2d(spectrum, n);
  realPart(field).forEach((v) => assert.ok(Math.abs(v - 2.5) < EPS));
  assert.ok(maxAbs(imagPart(field)) < EPS);
  realPart(inverseDft2d(spectrum, n)).forEach((v) => assert.ok(Math.abs(v - 2.5 / 64) < EPS));
});

test('single and combined Hermitian modes synthesise the expected cosines', () => {
  const n = 16, spectrum = complex(n);
  const set = (p, q, re, im) => {
    const i = q * n + p, m = mirrorIndex(i, n);
    spectrum[2 * i] = re; spectrum[2 * i + 1] = im;
    spectrum[2 * m] = re; spectrum[2 * m + 1] = -im;
  };
  set(1, 0, 0.5, 0); // cos(2π x/N)
  let field = synthesize2d(spectrum, n);
  for (let x = 0; x < n; x++) assert.ok(Math.abs(field[2 * x] - Math.cos(TAU * x / n)) < EPS);
  set(2, 3, 0, -0.25); // + 0.5·sin(2π(2x + 3z)/N)
  field = synthesize2d(spectrum, n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const expected = Math.cos(TAU * x / n) + 0.5 * Math.sin(TAU * (2 * x + 3 * z) / n);
      assert.ok(Math.abs(field[2 * (z * n + x)] - expected) < EPS, `${x},${z}`);
    }
  }
  assert.ok(maxAbs(imagPart(field)) < EPS);
});

test('forward then inverse DFT is the identity with 1/N² applied once', () => {
  for (const n of [8, 16]) {
    const field = Float64Array.from({ length: 2 * n * n }, (_, i) => Math.sin(i * 1.7) + 0.3 * Math.cos(i * 0.4));
    const back = inverseDft2d(forwardDft2d(field, n), n);
    back.forEach((v, i) => assert.ok(Math.abs(v - field[i]) < EPS));
  }
});

test('evolved seeded spectra are Hermitian; height and slopes synthesise real fields', () => {
  for (const size of [8, 16]) {
    const c = buildCascade({ size });
    const h = evolveSpectrum(c.h0, c.frequencies, size, 3.7);
    for (let i = 0; i < size * size; i++) {
      const m = mirrorIndex(i, size);
      assert.ok(Math.abs(h[2 * i] - h[2 * m]) < 1e-15 && Math.abs(h[2 * i + 1] + h[2 * m + 1]) < 1e-15);
    }
    for (const spectrum of [h, spectralDerivative(h, size, c.tileSizeMeters, 0), spectralDerivative(h, size, c.tileSizeMeters, 1)]) {
      const field = synthesize2d(spectrum, size);
      assert.ok(maxAbs(imagPart(field)) <= 1e-12 * maxAbs(realPart(field)));
    }
  }
});

test('Parseval: spatial mean square equals summed mode power', () => {
  for (const size of [8, 16]) {
    const c = buildCascade({ size });
    const h = evolveSpectrum(c.h0, c.frequencies, size, 11.2);
    const field = synthesize2d(h, size);
    const spatial = sumSquares(field) / (size * size);
    const spectral = sumSquares(h);
    assert.ok(Math.abs(spatial - spectral) <= 1e-12 * spectral);
  }
});

test('seed-averaged realised variance matches ΣP·Δk² (amplitude normalisation)', () => {
  const expectedHeight = buildCascade().power.reduce((s, v) => s + v, 0);
  let height = 0;
  const seeds = 32;
  for (let seed = 1; seed <= seeds; seed++) {
    const c = buildCascade({ seed });
    height += sumSquares(evolveSpectrum(c.h0, c.frequencies, c.size, 5)) / seeds;
  }
  assert.ok(Math.abs(height / expectedHeight - 1) < 0.15, `ratio ${height / expectedHeight}`);
});

test('a single +x mode travels east (downwind), not upwind', () => {
  const n = 16, tileSizeMeters = 32;
  const c = buildCascade({ size: n, tileSizeMeters, params: CALM });
  c.h0[2] = 0.5; // p=1, q=0: kx = +Δk
  const k = TAU / tileSizeMeters, omega = c.frequencies.omega[1];
  assert.ok(omega > 0);
  for (const t of [0, 1, 10]) {
    const field = synthesize2d(evolveSpectrum(c.h0, c.frequencies, n, t), n);
    for (let x = 0; x < n; x++) {
      // Eastward is cos(kx − ωt); the upwind sign would give cos(kx + ωt).
      assert.ok(Math.abs(field[2 * x] - Math.cos(k * x * tileSizeMeters / n - omega * t)) < EPS, `t=${t} x=${x}`);
    }
  }
});

test('spectral slopes equal the finite-difference derivative of the height', () => {
  const c = buildCascade({ size: 8 });
  const n = c.size, dx = c.tileSizeMeters / n;
  const h = evolveSpectrum(c.h0, c.frequencies, n, 2.5);
  const slopeX = synthesize2d(spectralDerivative(h, n, c.tileSizeMeters, 0), n);
  const slopeZ = synthesize2d(spectralDerivative(h, n, c.tileSizeMeters, 1), n);
  const step = 1e-5;
  for (const [ix, iz] of [[0, 0], [3, 5], [7, 2]]) {
    const x = ix * dx, z = iz * dx, i = 2 * (iz * n + ix);
    const fx = (sampleField(h, n, c.tileSizeMeters, x + step, z) - sampleField(h, n, c.tileSizeMeters, x - step, z)) / (2 * step);
    const fz = (sampleField(h, n, c.tileSizeMeters, x, z + step) - sampleField(h, n, c.tileSizeMeters, x, z - step)) / (2 * step);
    assert.ok(Math.abs(fx - slopeX[i]) < 1e-6 && Math.abs(fz - slopeZ[i]) < 1e-6);
  }
});

test('frequency table: whole cycles per period, carrier phase speed, DC zero', () => {
  assert.ok(Math.abs(CARRIER_PHASE_SPEED_SCALE - 0.55) < 1e-12, 'derived from SeaSwell');
  const f = createWaveFrequencies(16, 6, { depthMeters: 3 });
  assert.equal(f.periodSeconds, WAVE_REPEAT_PERIOD_SECONDS);
  assert.equal(f.cycles[0], 0);
  for (let i = 1; i < 256; i++) {
    assert.ok(Number.isInteger(f.cycles[i]));
    const p = i % 16 < 8 ? i % 16 : i % 16 - 16, q = i >> 4 < 8 ? i >> 4 : (i >> 4) - 16;
    const target = angularFrequency(Math.hypot(p, q) * TAU / 6, 3) * CARRIER_PHASE_SPEED_SCALE;
    assert.ok(Math.abs(f.omega[i] - target) <= Math.PI / f.periodSeconds + 1e-12, `mode ${i}`);
  }
  const physical = createWaveFrequencies(8, 6, { phaseSpeedScale: 1, periodSeconds: 600 });
  assert.equal(physical.cycles[1], Math.round(angularFrequency(TAU / 6) * 600 / TAU));
  const h0 = complex(8);
  assert.ok(evolveSpectrum(h0, physical, 8, 1e6).every((v) => v === 0));
  assert.throws(() => evolveSpectrum(h0, physical, 8, NaN), /timeSeconds/);
  assert.throws(() => createWaveFrequencies(8, 6, { periodSeconds: 0 }), /periodSeconds/);
  assert.throws(() => synthesize2d(new Float64Array(10), 8), /2·N²/);
});

test('evolution repeats exactly every period, including negative and hour-long clocks', () => {
  const c = buildCascade();
  const T = c.frequencies.periodSeconds;
  for (const t of [0, 123.4, 127.3, 3600.25, -40.5]) {
    const a = evolveSpectrum(c.h0, c.frequencies, c.size, t);
    const b = evolveSpectrum(c.h0, c.frequencies, c.size, t + 7 * T);
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `t=${t}`));
  }
});

test('packed slope spectrum synthesises sx + i·sz in one transform', () => {
  const c = buildCascade();
  const h = evolveSpectrum(c.h0, c.frequencies, c.size, 4.2);
  const packed = synthesize2d(packedSlopeSpectrum(h, c.size, c.tileSizeMeters), c.size);
  const sx = synthesize2d(spectralDerivative(h, c.size, c.tileSizeMeters, 0), c.size);
  const sz = synthesize2d(spectralDerivative(h, c.size, c.tileSizeMeters, 1), c.size);
  const scale = Math.max(maxAbs(realPart(sx)), maxAbs(realPart(sz)));
  for (let i = 0; i < c.size * c.size; i++) {
    assert.ok(Math.abs(packed[2 * i] - sx[2 * i]) < 1e-12 * scale);
    assert.ok(Math.abs(packed[2 * i + 1] - sz[2 * i]) < 1e-12 * scale);
  }
});

test('GPU vec4 layout holds h0(k) and conj(h0(−k)) per mode', () => {
  const c = buildCascade({ size: 8 });
  const packed = packInitialSpectrum(c.h0, 8);
  assert.equal(packed.length, 4 * 64);
  for (let i = 0; i < 64; i++) {
    const m = mirrorIndex(i, 8);
    assert.equal(packed[4 * i], Math.fround(c.h0[2 * i]));
    assert.equal(packed[4 * i + 1], Math.fround(c.h0[2 * i + 1]));
    assert.equal(packed[4 * i + 2], Math.fround(c.h0[2 * m]));
    assert.equal(packed[4 * i + 3], Math.fround(-c.h0[2 * m + 1]));
  }
});
