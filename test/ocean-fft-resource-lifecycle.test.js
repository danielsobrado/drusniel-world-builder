import assert from 'node:assert/strict';
import test from 'node:test';

import { OCEAN_FFT_FIELD } from '../src/editor/water/fft/OceanFftGpuKernels.js';
import { buildCascadeSpectra } from '../src/editor/water/fft/OceanFftGpuLayout.js';
import { OCEAN_FFT_STATE as S, OceanFftRuntime } from '../src/editor/water/fft/OceanFftRuntime.js';
import { fakeGpu, fakeRenderer, WINDY } from './helpers/oceanFftFixtures.js';

// PR I phase I.2 runtime lifecycle with a fake renderer and fake GPU objects:
// states, zero work when off or unchanged, publish-only-complete, failure and disposal.
// The real GPU path is exercised by scripts/run-ocean-fft-qa.mjs.

const CONFIG = Object.freeze({ size: 8, tileSizes: [48] });
const spectra = (seed = 1) => buildCascadeSpectra({ size: 8, seed, params: WINDY, cascades: [{ tileSizeMeters: 48, kMin: 0, kMax: Infinity }] });
const silent = { error() {} };

async function activeRuntime(options = {}) {
  const fake = fakeRenderer(options);
  const gpu = fakeGpu();
  const runtime = new OceanFftRuntime(fake.renderer, { gpu, log: silent });
  assert.equal(runtime.configure({ ...CONFIG, spectra: spectra() }), true);
  return { ...fake, gpu, runtime };
}

test('off and unsupported runtimes issue no GPU work and publish nothing', () => {
  const off = fakeRenderer();
  const disabled = new OceanFftRuntime(off.renderer, { enabled: false, gpu: fakeGpu(), log: silent });
  assert.equal(disabled.state, S.DISABLED);
  assert.equal(disabled.configure({ ...CONFIG, spectra: spectra() }), false);
  assert.equal(disabled.prepare(1), false);
  assert.equal(off.renderer.computes + off.renderer.renders, 0);

  const webgl = fakeRenderer({ webgpu: false });
  const fallback = new OceanFftRuntime(webgl.renderer, { gpu: fakeGpu(), log: silent });
  assert.equal(fallback.state, S.UNSUPPORTED);
  assert.match(fallback.reason, /WebGPU/);
  assert.equal(fallback.configure({ ...CONFIG, spectra: spectra() }), false);
  assert.equal(fallback.prepare(1), false);
  assert.equal(fallback.output, null);
});

test('one runtime per renderer until it is disposed', () => {
  const { renderer } = fakeRenderer();
  const first = new OceanFftRuntime(renderer, { gpu: fakeGpu(), log: silent });
  assert.throws(() => new OceanFftRuntime(renderer, { gpu: fakeGpu(), log: silent }), /already owns/);
  first.dispose();
  assert.doesNotThrow(() => new OceanFftRuntime(renderer, { gpu: fakeGpu(), log: silent }).dispose());
});

test('first dispatch publishes only after a clean validation scope, then every transform publishes', async () => {
  const { runtime, renderer } = await activeRuntime();
  assert.equal(runtime.state, S.READY);
  assert.equal(runtime.prepare(10), true);
  assert.equal(runtime.output, null, 'nothing is published while the first dispatch is validated');
  assert.equal(runtime.prepare(11), false, 'no work is queued behind the warm-up');
  assert.equal(await runtime.settled(), S.ACTIVE);
  assert.equal(runtime.output.timeSeconds, 10);
  assert.equal(runtime.prepare(12), true);
  assert.equal(runtime.output.timeSeconds, 12);
  assert.equal(renderer.computes, 2);
  assert.equal(renderer.renders, 2);
  assert.equal(renderer.target, null, 'the previous render target is restored');
});

test('unchanged time, spectrum and field skip; seeks, new spectra and field changes dispatch', async () => {
  const { runtime, renderer } = await activeRuntime();
  runtime.prepare(5);
  await runtime.settled();
  assert.equal(runtime.prepare(5), false);
  assert.equal(runtime.prepare(5 + 512), false, 'one repeat period later is the same tick');
  assert.equal(runtime.prepare(4), true, 'seek backward');
  runtime.setSpectrum(spectra(2));
  assert.equal(runtime.prepare(4), true, 'new spectrum revision');
  runtime.setField(OCEAN_FFT_FIELD.HEIGHT);
  assert.equal(runtime.prepare(4), true, 'field change');
  assert.equal(renderer.computes, 4);
  assert.equal(runtime.counters.skipped, 2);
  assert.throws(() => runtime.setField(7), RangeError);
});

test('an invalid spectrum throws and leaves the previous one live', async () => {
  const { runtime } = await activeRuntime();
  runtime.prepare(1);
  await runtime.settled();
  const revision = runtime.spectrumRevision;
  const broken = spectra(3);
  broken[0].h0[4] = Number.NaN;
  assert.throws(() => runtime.setSpectrum(broken), /not finite/);
  assert.equal(runtime.spectrumRevision, revision);
  assert.equal(runtime.state, S.ACTIVE);
  assert.ok(runtime.output);
});

test('a validation error on the first dispatch fails the runtime and releases its GPU objects', async () => {
  const { runtime, gpu } = await activeRuntime({ scopeError: { message: 'bad shader' } });
  runtime.prepare(1);
  assert.equal(await runtime.settled(), S.FAILED);
  assert.match(runtime.reason, /bad shader/);
  assert.equal(runtime.output, null);
  assert.equal(gpu.live.size, 0);
  assert.equal(runtime.prepare(2), false);
});

test('device loss and a replaced device fail safely; reconfigure recovers', async () => {
  const lost = await activeRuntime();
  lost.runtime.prepare(1);
  await lost.runtime.settled();
  lost.loseDevice({ reason: 'destroyed', message: 'gone' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lost.runtime.state, S.FAILED);
  assert.equal(lost.runtime.output, null);
  assert.equal(lost.gpu.live.size, 0);

  const swapped = await activeRuntime();
  swapped.runtime.prepare(1);
  await swapped.runtime.settled();
  swapped.renderer.backend.device = { ...swapped.device };
  assert.equal(swapped.runtime.prepare(2), false);
  assert.equal(swapped.runtime.state, S.FAILED);
  assert.match(swapped.runtime.reason, /device changed/);
  assert.equal(swapped.runtime.configure({ ...CONFIG, spectra: spectra() }), true);
  swapped.runtime.prepare(3);
  assert.equal(await swapped.runtime.settled(), S.ACTIVE);
});

test('reconfigure and dispose release every allocation; a late warm-up cannot publish', async () => {
  const { runtime, gpu } = await activeRuntime();
  runtime.prepare(1);
  const pending = runtime.warming;
  assert.equal(runtime.configure({ size: 16, tileSizes: [48, 12], spectra: [
    ...buildCascadeSpectra({ size: 16, seed: 1, params: WINDY, cascades: [{ tileSizeMeters: 48, kMin: 0, kMax: Infinity }, { tileSizeMeters: 12, kMin: 0, kMax: Infinity }] }),
  ] }), true);
  await pending;
  assert.equal(runtime.state, S.READY, 'the old configuration\'s warm-up is ignored');
  assert.equal(gpu.live.size, 2, 'only the new resources and kernels are live');
  for (let i = 0; i < 20; i++) runtime.configure({ ...CONFIG, spectra: spectra(i) });
  assert.equal(gpu.live.size, 2);
  runtime.dispose();
  assert.equal(gpu.live.size, 0);
  assert.equal(runtime.state, S.DISPOSED);
  assert.equal(runtime.prepare(1), false);
  assert.equal(runtime.configure({ ...CONFIG, spectra: spectra() }), false);
});

test('suspension releases active FFT resources and reconfiguration regenerates at absolute time', async () => {
  const { runtime, gpu } = await activeRuntime();
  runtime.prepare(10);
  assert.equal(runtime.suspend(), false, 'validation must settle first');
  await runtime.settled();
  assert.equal(runtime.suspend(), true);
  assert.equal(runtime.state, S.SUSPENDED);
  assert.equal(runtime.output, null);
  assert.equal(gpu.live.size, 0);
  assert.equal(runtime.prepare(20), false);
  assert.equal(runtime.configure({ ...CONFIG, spectra: spectra() }), true);
  runtime.prepare(20);
  assert.equal(await runtime.settled(), S.ACTIVE);
  assert.equal(runtime.output.timeSeconds, 20);
  runtime.dispose();
  assert.equal(gpu.live.size, 0);
});
