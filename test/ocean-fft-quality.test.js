import assert from 'node:assert/strict';
import test from 'node:test';

import { CASCADE_CANDIDATES, OFFSHORE_FFT_WIND } from '../src/editor/water/fft/OceanFftConstants.js';
import { OceanFftController } from '../src/editor/water/fft/OceanFftController.js';
import { OCEAN_FFT_PROFILES, resolveOceanFftProfile } from '../src/editor/water/fft/OceanFftQuality.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { fakeGpu, fakeRenderer } from './helpers/oceanFftFixtures.js';

// PR I phase I.3: tier policy, capability fallback and the per-view controller lifecycle.

const TILES = CASCADE_CANDIDATES.map((c) => c.tileSizeMeters);
const quiet = () => { const warnings = []; return { warnings, log: { warn: (m) => warnings.push(m), error() {} } }; };

test('tier policy: low and medium off, high and ultra 128²×2, only when requested', () => {
  for (const tier of ['low', 'medium', 'high', 'ultra']) {
    assert.equal(resolveOceanFftProfile({ qualityTier: tier }).enabled, false, `${tier} off unless requested`);
  }
  for (const tier of ['low', 'medium']) {
    assert.match(resolveOceanFftProfile({ qualityTier: tier, requested: true }).reason, new RegExp(tier));
  }
  for (const tier of ['high', 'ultra']) {
    const profile = resolveOceanFftProfile({ qualityTier: tier, requested: true });
    assert.deepEqual([profile.enabled, profile.size, profile.tileSizes], [true, 128, TILES]);
  }
  assert.equal(resolveOceanFftProfile({ qualityTier: 'bogus', requested: true }).enabled, false);
  assert.equal(OCEAN_FFT_PROFILES.high.cascades, CASCADE_CANDIDATES);
  assert.ok(Object.values(OCEAN_FFT_PROFILES).every((p) => !p || p.size <= 128), 'no 256² profile ships');
});

test('capability fallback reports the reason and keeps the original sea', () => {
  for (const reason of ['requires the WebGPU backend', 'renderer is not initialised', 'renderer has no compute']) {
    const profile = resolveOceanFftProfile({ qualityTier: 'ultra', requested: true, unsupportedReason: reason });
    assert.deepEqual([profile.enabled, profile.reason, profile.size], [false, reason, 0]);
  }
  const { warnings, log } = quiet();
  assert.equal(OceanFftController.create({ renderer: fakeRenderer({ webgpu: false }).renderer, qualityTier: 'high', requested: true, log }), null);
  assert.equal(OceanFftController.create({ renderer: { backend: { isWebGPUBackend: true } }, qualityTier: 'high', requested: true, log }), null);
  assert.equal(OceanFftController.create({ renderer: { backend: { isWebGPUBackend: true, device: {} } }, qualityTier: 'high', requested: true, log }), null);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /WebGPU/);
});

test('feature off: no controller and no renderer access on any tier', () => {
  const renderer = new Proxy({}, { get: () => { throw new Error('renderer touched'); } });
  const { warnings, log } = quiet();
  for (const tier of ['low', 'medium', 'high', 'ultra']) {
    assert.equal(OceanFftController.create({ renderer, qualityTier: tier, requested: false, log }), null);
  }
  assert.equal(warnings.length, 0);
  assert.equal(resolveRenderEnhancements({}, '').oceanFft, false, 'default off');
  assert.equal(resolveRenderEnhancements({}, '?oceanFft=1').oceanFft, true);
});

test('repeated tier rebuilds: one runtime per renderer, nothing left live after dispose', async () => {
  const { renderer } = fakeRenderer();
  const gpu = fakeGpu();
  const { log } = quiet();
  for (const tier of ['high', 'medium', 'ultra', 'low', 'high']) {
    const controller = OceanFftController.create({ renderer, qualityTier: tier, requested: true, log, gpu });
    if (tier === 'low' || tier === 'medium') { assert.equal(controller, null); continue; }
    // A second controller on the same renderer is refused while the first lives.
    assert.throws(() => OceanFftController.create({ renderer, qualityTier: tier, requested: true, log, gpu }), /already owns/);
    controller.prepare(12.5);
    await controller.runtime.settled();
    controller.prepare(12.5); // the next frame binds what the last one published
    assert.equal(controller.runtime.state, 'active');
    assert.equal(controller.binding.available.value, 1, 'published output is bound');
    assert.ok(gpu.live.size > 0);
    controller.dispose();
    assert.equal(controller.binding.available.value, 0, 'never exposes a disposed texture');
    assert.equal(gpu.live.size, 0, `${tier}: no leaked resources`);
  }
});

test('device loss: the binding falls back to zero; the original sea stays', async () => {
  const fake = fakeRenderer();
  const gpu = fakeGpu();
  const controller = OceanFftController.create({ renderer: fake.renderer, qualityTier: 'high', requested: true, log: quiet().log, gpu });
  controller.prepare(1);
  await controller.runtime.settled();
  controller.prepare(1);
  assert.equal(controller.binding.available.value, 1);
  fake.loseDevice({ reason: 'unknown', message: 'test' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.prepare(2);
  assert.equal(controller.binding.available.value, 0);
  assert.equal(controller.binding.texture.value, controller.binding.fallback);
  controller.dispose();
});

test('offshore wind default blows along the primary swell', () => {
  const [wave] = SEA_SWELL_COMPONENTS;
  assert.ok(Math.abs(Math.cos(OFFSHORE_FFT_WIND.windDirection) - wave.x) < 1e-12);
  assert.ok(Math.abs(Math.sin(OFFSHORE_FFT_WIND.windDirection) - wave.z) < 1e-12);
});
