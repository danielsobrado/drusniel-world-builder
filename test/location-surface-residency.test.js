import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTexture, RenderTarget } from 'three/webgpu';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture(overrides = {}, pause = async () => {}) {
  const resident = new Set(), restored = [];
  const texture = () => {
    const value = new DataTexture(new Uint8Array(16), 2, 2);
    resident.add(value);
    value.addEventListener('dispose', () => resident.delete(value));
    return value;
  };
  const slot = x => ({ descriptor: { centerWorldX: x, centerWorldZ: 0 }, mesh: {}, tileTexture: texture() });
  const near = slot(100), far = slot(600), farther = slot(1200), loading = slot(1800);
  loading.loading = true;
  const water = { terrainSlot: farther, mesh: {}, waterFieldTexture: texture() };
  const surface = { terrainView: { chunkWorldSize: 200, slots: [near, far, farther, loading], drawPreparation: { pending: new Set() } }, waterSlots: [water] };
  const renderer = { backend: { isWebGPUBackend: true }, _textures: resident, initTexture(value) { restored.push(value); resident.add(value); } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfaceIdleMs: 10, surfaceSampleMs: 10,
    surfaceProtectMeters: 100, surfaceEvictionsPerSample: 2, surfaceMaxEvictedBytes: 64,
    surfaceRestoreBytesPerFrame: 16, surfaceRestoresPerFrame: 1, ...overrides };
  const controller = new LocationSurfaceResidency(surface, renderer, settings, pause);
  return { controller, renderer, surface, resident, restored, near, far, farther, loading, water };
}

test('reclaim only after idle delay, bounded by sample and return-anchor protection', () => {
  const { controller, resident, near, far, farther, loading, water } = fixture();
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(9);
  assert.equal(resident.size, 5);
  controller.update(10);
  assert.equal(controller.evictedBytes, 32);
  assert.equal(resident.has(farther.tileTexture), false);
  assert.equal(resident.has(water.waterFieldTexture), false);
  assert.equal(resident.has(near.tileTexture), true);
  assert.equal(resident.has(loading.tileTexture), true);
  assert.equal(resident.has(far.tileTexture), true);
  controller.update(20);
  assert.equal(controller.evictedBytes, 48);
  assert.equal(resident.has(far.tileTexture), false);
  assert.equal(far.tileTexture.image.data.byteLength, 16);
});

test('restore near first with bounded upload batches, and stop reclaiming', async () => {
  let pauses = 0;
  const { controller, resident, restored, far } = fixture({}, async () => { pauses++; });
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  controller.update(20);
  await controller.restore();
  assert.equal(pauses, 2);
  assert.equal(restored[0], far.tileTexture);
  assert.equal(resident.size, 5);
  assert.equal(controller.evictedBytes, 0);
  controller.update(100);
  assert.equal(resident.size, 5);
});

test('shared protected, pending, GPU-generated and oversized resources are excluded', () => {
  const { controller, resident, surface, near, far, farther, water } = fixture();
  far.heightTexture = near.tileTexture;
  surface.terrainView.drawPreparation.pending.add(far.mesh);
  water.waterFieldTexture.generateMipmaps = true;
  const target = new RenderTarget(2, 2);
  farther.forestFloorTexture = target.texture;
  resident.add(target.texture);
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evicted.size, 1);
  assert.equal(resident.has(near.tileTexture), true);
  assert.equal(resident.has(far.tileTexture), true);
  assert.equal(resident.has(water.waterFieldTexture), true);
  assert.equal(resident.has(target.texture), true);
  target.dispose();
});

test('total eviction cap and linked entry preserve existing suspension', () => {
  const { controller } = fixture({ surfaceMaxEvictedBytes: 16 });
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  controller.begin({ x: 1200, z: 0 }, 11);
  controller.update(20);
  assert.equal(controller.evictedBytes, 16);
  assert.deepEqual(controller.anchor, { x: 0, z: 0 });
});

test('disposed restoration never uploads another batch', async () => {
  const abort = new AbortController();
  const { controller, restored } = fixture({}, async () => { abort.abort(); controller.dispose(); });
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  await assert.rejects(controller.restore(abort.signal), { name: 'AbortError' });
  assert.equal(restored.length, 1);
  assert.equal(controller.phase, 'disposed');
  assert.equal(controller.evictedBytes, 0);
});

test('restore errors fail open and do not retry during gameplay', async () => {
  const { controller, renderer } = fixture();
  renderer.initTexture = () => { throw new Error('test failure'); };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  await controller.restore();
  assert.equal(controller.phase, 'idle');
  assert.equal(controller.evictedBytes, 0);
});

test('surface reclamation is separately opt-in and budget validated', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceReclamationEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceReclamation=1').locationStructureBudget.surfaceReclamationEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceRestoresPerFrame: 1.5 } }), RangeError);
});

test('adaptive pressure stops at recovery threshold and preserves anchor protection', () => {
  const mib = 1024 * 1024;
  const { controller, renderer, resident, near, far, farther, water } = fixture({
    surfaceAdaptiveReclamationEnabled: true, surfaceAdaptiveHighMiB: 128,
    surfaceAdaptiveLowMiB: 96, surfaceAdaptiveMaxMiB: 128, surfaceMaxEvictedBytes: 0
  });
  renderer.info = { memory: { total: 128 * mib }, memoryMap: new Map() };
  for (const texture of [far.tileTexture, farther.tileTexture, water.waterFieldTexture]) {
    renderer.info.memoryMap.set(texture, 32 * mib);
    texture.addEventListener('dispose', () => { renderer.info.memory.total -= 32 * mib; });
  }
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evicted.size, 1);
  assert.equal(controller.memoryPolicy.evictedCharge, 32 * mib);
  assert.equal(resident.has(near.tileTexture), true);
  assert.equal(resident.has(farther.tileTexture), false);
  controller.update(20);
  assert.equal(controller.evicted.size, 1);
  renderer.info.memory.total = 112 * mib;
  controller.update(30);
  assert.equal(controller.evicted.size, 1);
  renderer.info.memory.total = 128 * mib;
  controller.update(40);
  assert.equal(controller.evicted.size, 2);
});

test('adaptive mode below pressure retains resources and missing accounting falls back', () => {
  const { controller, renderer } = fixture({ surfaceAdaptiveReclamationEnabled: true });
  renderer.info = { memory: { total: 1 } };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evicted.size, 0);
  delete renderer.info;
  controller.update(20);
  assert.equal(controller.evictedBytes, 32);
});

test('adaptive mode respects the separate allocation cap', () => {
  const mib = 1024 * 1024;
  const { controller, renderer, far, farther, water } = fixture({
    surfaceAdaptiveReclamationEnabled: true, surfaceAdaptiveHighMiB: 128,
    surfaceAdaptiveLowMiB: 96, surfaceAdaptiveMaxMiB: 32
  });
  renderer.info = { memory: { total: 256 * mib }, memoryMap: new Map([
    [far.tileTexture, 32 * mib], [farther.tileTexture, 64 * mib], [water.waterFieldTexture, 32 * mib]
  ]) };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  controller.update(20);
  assert.equal(controller.evicted.size, 1);
  assert.equal(controller.memoryPolicy.evictedCharge, 32 * mib);
});

test('adaptive settings are opt-in and validate recovery thresholds', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceAdaptiveReclamationEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceAdaptiveReclamation=1').locationStructureBudget.surfaceAdaptiveReclamationEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceAdaptiveLowMiB: 4096 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfacePostReclamationEnabled: 'yes' } }), TypeError);
});

function exitFixture(overrides = {}) {
  const f = fixture({ surfaceExitWarmupEnabled: true, surfaceExitWarmupSampleMs: 100,
    surfaceExitWarmupMeters: 12, surfaceExitWarmupMaxBytes: 32, ...overrides });
  f.renderer.info = { memory: { total: 1024 }, memoryMap: new Map() };
  f.location = { site: { links: { linked: { site: 'other' } } },
    exits: [{ id: 'surface', x: 0, y: 0, z: 0 }, { id: 'linked', x: 100, y: 0, z: 0 }] };
  f.controller.begin({ x: 0, z: 0 }, 0);
  f.controller.update(10);
  f.controller.update(20);
  return f;
}

test('surface exit approach restores nearest first, respects sample cadence and pins uploads', async () => {
  const { controller, location, far, restored } = exitFixture();
  controller.update(30, location, { x: 0, y: 0, z: 0 });
  assert.deepEqual(restored, [far.tileTexture]);
  assert.equal(controller.exitWarmup.charge, 16);
  controller.update(40, location, { x: 0, y: 0, z: 0 });
  assert.equal(restored.length, 1);
  controller.update(130, location, { x: 0, y: 0, z: 0 });
  assert.equal(restored.length, 2);
  controller.update(200, location, { x: 40, y: 0, z: 0 });
  assert.equal(controller.evicted.size, 1);
  await controller.restore();
  assert.equal(restored.length, 3);
  assert.equal(controller.exitWarmup.pinned.size, 0);
});

test('linked exits and vertically distant exits do not trigger predictive restoration', () => {
  const { controller, location, restored } = exitFixture();
  controller.update(30, location, { x: 100, y: 0, z: 0 });
  controller.update(40, location, { x: 0, y: 20, z: 0 });
  assert.equal(restored.length, 0);
});

test('predictive restore requires memory headroom and respects its visit cap', () => {
  const { controller, location, renderer, restored } = exitFixture({ surfaceExitWarmupMaxBytes: 16 });
  const feet = { x: 0, y: 0, z: 0 };
  renderer.info.memory.total = 3584 * 1024 * 1024;
  controller.update(30, location, feet);
  assert.equal(restored.length, 0);
  delete renderer.info;
  controller.update(130, location, feet);
  assert.equal(restored.length, 0);
  renderer.info = { memory: { total: 1024 } };
  controller.update(230, location, feet);
  controller.update(330, location, feet);
  assert.equal(restored.length, 1);
});

test('predictive restore failure leaves normal exit fallback available', async () => {
  const { controller, location, renderer, restored } = exitFixture();
  const init = renderer.initTexture;
  renderer.initTexture = () => { throw new Error('test failure'); };
  controller.update(30, location, { x: 0, y: 0, z: 0 });
  assert.equal(controller.exitWarmup.failed, true);
  assert.equal(controller.evicted.size, 3);
  renderer.initTexture = init;
  await controller.restore();
  assert.equal(restored.length, 3);
});

test('predictive exit warmup is opt-in and validates the visit budget', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceExitWarmupEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceExitWarmup=1').locationStructureBudget.surfaceExitWarmupEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceExitWarmupMaxBytes: 1.5 } }), RangeError);
});

test('cancelled legacy restore retains unprocessed resources and the current anchor for retry', async () => {
  const abort = new AbortController();
  const { controller, restored } = fixture({}, async () => abort.abort());
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  controller.update(20);
  await assert.rejects(controller.restore(abort.signal), { name: 'AbortError' });
  assert.equal(controller.phase, 'inside');
  assert.deepEqual(controller.anchor, { x: 0, z: 0 });
  assert.equal(controller.evicted.size, 2);
  assert.equal(restored.length, 1);
  controller.pause = async () => {};
  await controller.restore();
  assert.equal(controller.phase, 'idle');
  assert.equal(restored.length, 3);
});
