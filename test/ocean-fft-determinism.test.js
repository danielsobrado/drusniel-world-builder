import assert from 'node:assert/strict';
import test from 'node:test';

import { evolveSpectrum } from '../src/editor/water/fft/OceanFourierReference.js';
import {
  createGaussianModes, modeHash, seedWords, writeGaussianPair,
} from '../src/editor/water/fft/OceanGaussianModes.js';
import { signedIndex } from '../src/editor/water/fft/OceanSpectrum.js';
import { buildCascade } from './helpers/oceanFftFixtures.js';

const LARGE_SIGNED_SEED = -4_226_432_278_528;

test('same seed gives bit-identical Gaussians, h0 and evolved spectra', () => {
  for (const seed of [7, 1234, LARGE_SIGNED_SEED]) {
    const a = buildCascade({ seed }), b = buildCascade({ seed });
    assert.deepEqual(a.gaussians, b.gaussians);
    assert.deepEqual(a.h0, b.h0);
    assert.deepEqual(evolveSpectrum(a.h0, a.frequencies, a.size, 127.3), evolveSpectrum(b.h0, b.frequencies, b.size, 127.3));
  }
});

test('golden fixture: the first modes of seed 1234 never drift', () => {
  const g = createGaussianModes({ seed: 1234, size: 8 });
  // Locked values: a change here means GPU fixtures and recorded captures are invalid.
  const golden = [g[0], g[1], g[2], g[3], g[126], g[127]].map((v) => Number(v.toFixed(12)));
  assert.deepEqual(golden, GOLDEN_SEED_1234);
});

test('different seeds and cascades change mode patterns but not the power table', () => {
  const a = buildCascade({ seed: LARGE_SIGNED_SEED });
  const b = buildCascade({ seed: LARGE_SIGNED_SEED + 1 });
  const c = buildCascade({ seed: LARGE_SIGNED_SEED, cascadeIndex: 1 });
  assert.notDeepEqual(a.gaussians, b.gaussians);
  assert.notDeepEqual(a.gaussians, c.gaussians);
  assert.deepEqual(a.power, b.power);
  assert.notDeepEqual(seedWords(-1), seedWords(1));
  assert.deepEqual(seedWords(-1), [0xFFFFFFFF, 0xFFFFFFFF]);
  assert.throws(() => seedWords(1.5), /seed/);
  assert.throws(() => seedWords(2 ** 60), /seed/);
});

test('mode pairs are independent of scan order and grid size', () => {
  const [lo, hi] = seedWords(LARGE_SIGNED_SEED);
  const small = createGaussianModes({ seed: LARGE_SIGNED_SEED, size: 8 });
  const large = createGaussianModes({ seed: LARGE_SIGNED_SEED, size: 32 });
  const pair = new Float64Array(2);
  // Visit modes backwards one at a time; each must equal the table entry for the same signed index.
  for (let i = 63; i >= 0; i--) {
    const sp = signedIndex(i % 8, 8), sq = signedIndex(Math.floor(i / 8), 8);
    writeGaussianPair(pair, 0, modeHash(lo, hi, 0, sp, sq));
    assert.equal(pair[0], small[2 * i]);
    if (sp === -4 || sq === -4) continue; // Nyquist of N=8 is an interior index at N=32
    const j = ((sq + 32) % 32) * 32 + ((sp + 32) % 32);
    assert.equal(large[2 * j], small[2 * i]);
    assert.equal(large[2 * j + 1], small[2 * i + 1]);
  }
});

test('Gaussian statistics over fixed seeds: zero mean, unit variance, uncorrelated parts', () => {
  for (const seed of [1, 7, 1234, LARGE_SIGNED_SEED]) {
    const g = createGaussianModes({ seed, size: 64 });
    const count = g.length / 2;
    let mRe = 0, mIm = 0, vRe = 0, vIm = 0, cov = 0;
    for (let i = 0; i < count; i++) {
      mRe += g[2 * i] / count; mIm += g[2 * i + 1] / count;
      vRe += g[2 * i] ** 2 / count; vIm += g[2 * i + 1] ** 2 / count; cov += g[2 * i] * g[2 * i + 1] / count;
    }
    // 4096 samples: standard error ≈ 0.016 for the mean, 0.022 for the variance. Deterministic, so not flaky.
    assert.ok(Math.abs(mRe) < 0.06 && Math.abs(mIm) < 0.06, `seed ${seed} mean`);
    assert.ok(Math.abs(vRe - 1) < 0.08 && Math.abs(vIm - 1) < 0.08, `seed ${seed} variance`);
    assert.ok(Math.abs(cov) < 0.06, `seed ${seed} covariance`);
    assert.ok(g.every(Number.isFinite));
  }
});

test('absolute time: seeks forwards and backwards in any order repeat exactly', () => {
  const c = buildCascade();
  const times = [123.4, 124.6, 126.0, 127.6];
  const forward = times.map((t) => evolveSpectrum(c.h0, c.frequencies, c.size, t));
  const backward = [...times].reverse().map((t) => evolveSpectrum(c.h0, c.frequencies, c.size, t)).reverse();
  forward.forEach((spectrum, i) => assert.deepEqual(spectrum, backward[i]));
  // Reusing an output buffer does not leak state between calls.
  const out = new Float64Array(c.h0.length);
  evolveSpectrum(c.h0, c.frequencies, c.size, 999, out);
  assert.deepEqual(evolveSpectrum(c.h0, c.frequencies, c.size, 126.0, out), forward[2]);
  assert.ok(evolveSpectrum(c.h0, c.frequencies, c.size, 8.64e4).every(Number.isFinite));
  assert.ok(evolveSpectrum(c.h0, c.frequencies, c.size, -3.6e6).every(Number.isFinite));
});

const GOLDEN_SEED_1234 = [-0.230921646853, -0.245678547657, 1.558012244052, -0.247714294551, -0.223804632022, 1.118692397037];
