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
