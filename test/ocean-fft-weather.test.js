import assert from 'node:assert/strict';
import test from 'node:test';

import { CASCADE_CANDIDATES, OFFSHORE_FFT_SEED, OFFSHORE_FFT_WIND } from '../src/editor/water/fft/OceanFftConstants.js';
import { OFFSHORE_FFT_DEFAULTS, resolveOffshoreFft } from '../src/editor/water/fft/OceanFftConfig.js';
import { OceanFftController } from '../src/editor/water/fft/OceanFftController.js';
import { buildCascadeSpectra } from '../src/editor/water/fft/OceanFftGpuLayout.js';
import { resolveOceanFftProfile } from '../src/editor/water/fft/OceanFftQuality.js';
import { OceanFftSpectrumState, SPECTRUM_STEP_SECONDS } from '../src/editor/water/fft/OceanFftSpectrumState.js';
import { expectedVariance, resolveOceanSpectrumParams } from '../src/editor/water/fft/OceanSpectrum.js';
import { FFT_WIND_DEADBAND, resolveFftWind, windChanged } from '../src/editor/water/fft/OceanFftWeather.js';
import { fakeGpu, fakeRenderer } from './helpers/oceanFftFixtures.js';

// PR I phase I.5: the offshore FFT follows the world's resolved wind.

const SETTINGS = OFFSHORE_FFT_DEFAULTS.weather;
const SIZE = 32; // the state machine is size-agnostic; 32² keeps these tests fast
const CASCADES = CASCADE_CANDIDATES;
const weather = (intensity, directionDegrees = 0) => ({ enabled: true, intensity, directionDegrees });
const wind = (w) => resolveFftWind(w, SETTINGS);
const state = (initial = wind(null), transitionSeconds = 2) => new OceanFftSpectrumState({
  size: SIZE, cascades: CASCADES, seed: OFFSHORE_FFT_SEED, fetchMeters: OFFSHORE_FFT_WIND.fetchMeters, transitionSeconds, wind: initial,
});
const reference = (w) => buildCascadeSpectra({ size: SIZE, seed: OFFSHORE_FFT_SEED, cascades: CASCADES,
  params: resolveOceanSpectrumParams({ ...w, fetchMeters: OFFSHORE_FFT_WIND.fetchMeters }) });
const slopeVariance = (spectra) => spectra.reduce((sum, s) => sum + expectedVariance({ size: SIZE, deltaK: s.deltaK, power: s.power }).slope, 0);
/** Drive `s` toward `w` at 60 fps until settled; returns every uploaded spectrum. */
function run(s, w, seconds = 4) {
  const uploads = [];
  for (let t = 0; t < seconds; t += 1 / 60) { const out = s.update(1 / 60, w); if (out) uploads.push(out); }
  return uploads;
}

test('wind: weather off is the reference breeze; intensity scales the reference speed; storm capped', () => {
  for (const off of [null, { enabled: false, intensity: 2, directionDegrees: 90 }, weather(Number.NaN)]) {
    assert.deepEqual(wind(off), { windSpeed: 10, windDirection: OFFSHORE_FFT_WIND.windDirection });
  }
  assert.equal(wind(weather(1)).windSpeed, 10);
  assert.equal(wind(weather(0.45)).windSpeed, 4.5, 'still air');
  assert.equal(wind(weather(2.4)).windSpeed, 24, 'full storm: 2.4× the breeze, not a second gain');
  assert.equal(wind(weather(9)).windSpeed, 24);
  assert.ok(Math.abs(wind(weather(1, 450)).windDirection - Math.PI / 2) < 1e-12, 'heading normalised');
  assert.ok(Math.abs(Math.abs(wind(weather(1, -180)).windDirection) - Math.PI) < 1e-12);
  assert.equal(resolveOffshoreFft({ weather: { referenceWindSpeed: 6 } }).weather.referenceWindSpeed, 6);
  for (const bad of [{ weather: { referenceWindSpeed: 0 } }, { weather: { transitionSeconds: 0 } }, { weather: { gust: 1 } }]) {
    assert.throws(() => resolveOffshoreFft(bad), /offshoreFft\.weather/);
  }
});

test('deadband: small drifts do not rebuild; a meaningful speed or heading change does', () => {
  const base = { windSpeed: 10, windDirection: 3.1 };
  assert.equal(windChanged(base, { windSpeed: 10.4, windDirection: 3.1 + 0.04 }), false);
  assert.equal(windChanged(base, { windSpeed: 10 + FFT_WIND_DEADBAND.speed + 0.01, windDirection: 3.1 }), true);
  assert.equal(windChanged(base, { windSpeed: 10, windDirection: 3.1 + 0.06 }), true);
  // Across ±π: 3.1 rad and −3.15 rad are 0.033 rad apart, not 6.25.
  assert.equal(windChanged(base, { windSpeed: 10, windDirection: -3.15 }), false);
});

test('fixed wind is exactly the reference spectrum: deterministic and identical to I.4', () => {
  const s = state();
  const expected = reference(wind(null));
  s.current.forEach((cascade, c) => {
    assert.deepEqual(cascade.h0, expected[c].h0);
    assert.deepEqual(cascade.power, expected[c].power);
    assert.deepEqual(cascade.cycles, expected[c].cycles);
  });
  assert.equal(s.update(1 / 60, wind(null)), null, 'nothing to upload while the wind holds');
  assert.equal(s.update(1 / 60, { ...wind(null), windSpeed: 10.3 }), null, 'inside the deadband');
});

test('speed change: one cascade built per update, then a bounded, monotonic, exact transition', () => {
  const s = state();
  const target = wind(weather(2.4));
  assert.equal(s.update(1 / 60, target), null, 'first cascade only');
  assert.equal(s.pending.spectra.length, 1);
  const uploads = run(s, target);
  const variances = [slopeVariance(reference(wind(null))), ...uploads.map(slopeVariance)];
  for (let i = 1; i < variances.length; i++) assert.ok(variances[i] >= variances[i - 1] - 1e-15, 'monotonic');
  const total = variances.at(-1) - variances[0];
  const largest = Math.max(...variances.slice(1).map((v, i) => v - variances[i]));
  // 2 s at 0.25 s per step: ≤ 1/8 of the change per upload, ~8 uploads, no step function.
  assert.ok(largest <= total / 7, `step ${largest} of ${total}`);
  assert.ok(uploads.length >= 8 && uploads.length <= 10, `${uploads.length} uploads`);
  const exact = reference(target);
  uploads.at(-1).forEach((cascade, c) => assert.deepEqual(cascade.h0, exact[c].h0, 'ends exactly on the target'));
  assert.equal(s.transitioning, false);
});

test('direction change: phases fixed, no calm dip mid-turn, every mode continuous', () => {
  const start = wind(weather(1, 0)), end = wind(weather(1, 120));
  const s = state(start);
  const before = s.current;
  const uploads = run(s, end);
  const endpoints = [slopeVariance(before), slopeVariance(reference(end))];
  for (const spectra of uploads) {
    const v = slopeVariance(spectra);
    assert.ok(v >= Math.min(...endpoints) * 0.999, `no dip: ${v} vs ${endpoints}`);
  }
  // Each mode's h0 stays on its seeded Gaussian's line: amplitude changes, phase never.
  let worst = 0;
  for (const spectra of uploads) {
    spectra.forEach((cascade, c) => {
      for (let i = 0; i < cascade.power.length; i++) {
        const [re, im] = [cascade.h0[2 * i], cascade.h0[2 * i + 1]], [r0, i0] = [before[c].h0[2 * i], before[c].h0[2 * i + 1]];
        if (r0 === 0 && i0 === 0) continue;
        worst = Math.max(worst, Math.abs(re * i0 - im * r0) / Math.max(Math.hypot(re, im) * Math.hypot(r0, i0), 1e-30));
      }
    });
  }
  assert.ok(worst < 1e-9, `phase drift ${worst}`);
});

test('retarget mid-transition continues from what is on screen; settle jumps exactly', () => {
  const s = state();
  const windy = wind(weather(2)), calm = wind(weather(0.45, 200));
  s.update(1 / 60, windy);
  s.update(1 / 60, windy);
  for (let i = 0; i < 40; i++) s.update(1 / 60, windy);
  const shown = slopeVariance(s.current);
  const next = run(s, calm, 0.6)[0];
  assert.ok(Math.abs(slopeVariance(next) - shown) <= Math.abs(slopeVariance(reference(calm)) - shown) / 7, 'continuous on retarget');
  const settled = s.settle(calm);
  settled.forEach((cascade, c) => assert.deepEqual(cascade.h0, reference(calm)[c].h0));
  assert.equal(s.settle(calm), null, 'already there');
});

test('controller: first weather snaps, later changes upload through setSpectrum only, uploads are guarded', async () => {
  const { renderer } = fakeRenderer();
  const gpu = fakeGpu();
  const profile = resolveOceanFftProfile({ qualityTier: 'high', requested: true });
  const controller = new OceanFftController(renderer, { ...profile, size: SIZE }, { log: { error() {}, warn() {} }, gpu });
  const resources = controller.runtime.resources;
  const generation = controller.runtime.configGeneration;
  controller.setWeather(weather(2.4, 45));
  assert.equal(resources.uploads, 2, 'configure + one snap upload');
  assert.equal(controller.spectrum.wind.windSpeed, 24);
  let now = 1000;
  controller.setWeather(weather(0.45, 45));
  for (let i = 0; i < 200; i++) controller.prepare(5, (now += 1000 / 60));
  assert.ok(resources.uploads > 2 && resources.uploads <= 2 + 10, `${resources.uploads} uploads`);
  assert.equal(controller.runtime.configGeneration, generation, 'never reconfigures for weather');
  assert.equal(controller.spectrum.wind.windSpeed, 4.5);
  const table = Float64Array.from(controller.binding.unresolved.array);
  controller.settleWeather();
  assert.deepEqual(Float64Array.from(controller.binding.unresolved.array), table, 'roughness table already on the shown spectrum');
  controller.runtime.releaseGpu();
  controller.setWeather(weather(2.4));
  assert.doesNotThrow(() => { for (let i = 0; i < 20; i++) controller.prepare(6, (now += 1000 / 60)); }, 'no upload without resources');
  controller.dispose();
});

test('determinism: the same weather sequence and clock give the same spectra', () => {
  const sequence = [weather(1, 10), weather(1.6, 30), weather(2.4, 80), weather(0.6, 300)];
  const play = () => {
    const s = state();
    for (const w of sequence) run(s, wind(w), 1.3);
    return s.current;
  };
  const [a, b] = [play(), play()];
  a.forEach((cascade, c) => assert.deepEqual(cascade.h0, b[c].h0));
  assert.ok(SPECTRUM_STEP_SECONDS > 0);
});
