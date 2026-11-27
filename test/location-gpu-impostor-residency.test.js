import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageBufferAttribute, IndirectStorageBufferAttribute } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { collectLocationGpuImpostorAttributes } from '../src/editor/locations/LocationGpuImpostorResidency.js';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { GpuTreeImpostorBatch } from '../src/editor/stylized/impostor/GpuTreeImpostorBatch.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture() {
  const restored = [], resident = new Set();
  const renderer = { backend: { isWebGPUBackend: true, getBufferAttribute: a => a },
    compute() {}, _textures: new Set(), initTexture() {},
    _attributes: { has: a => resident.has(a), delete: a => resident.delete(a),
      update(a, type) { restored.push([a, type]); resident.add(a); } } };
  const make = x => {
    const batch = { renderer, recordCount: 2, surfaceBounds: { minX: x - 5, maxX: x + 5, minZ: -5, maxZ: 5 },
      mesh: { parent: {}, visible: true }, invalidateSurfaceCull: GpuTreeImpostorBatch.prototype.invalidateSurfaceCull,
      transformBuffer: new StorageBufferAttribute(new Float32Array(8).fill(3), 4),
      parameterBuffer: new StorageBufferAttribute(new Float32Array(8), 4),
      appearanceBuffer: new StorageBufferAttribute(new Float32Array(8), 4),
      visibleBuffer: new StorageBufferAttribute(new Uint32Array(2), 1),
      planeBuffer: new StorageBufferAttribute(new Float32Array(24), 4),
      drawBuffer: new IndirectStorageBufferAttribute(new Uint32Array([6, 0, 0, 0, 0]), 5) };
    for (const value of Object.values(batch)) if (value?.isStorageBufferAttribute) resident.add(value);
    return batch;
  };
  const near = make(20), far = make(200), busy = make(300);
  busy.computePending = {};
  const surface = { terrainView: { slots: [] }, waterSlots: [],
    treeView: { impostorBatches: [near, far, busy].map(batch => ({ mode: 'gpu', batch })) } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfaceGpuImpostorReclamationEnabled: true,
    surfaceIdleMs: 10, surfaceSampleMs: 10, surfaceEvictionsPerSample: 16,
    surfaceRestoreBytesPerFrame: 256, surfaceMaxEvictedBytes: 1024 };
  const anchor = { x: 0, z: 0 };
  const controller = new LocationSurfaceResidency(surface, renderer, settings, async () => {});
  return { near, far, busy, surface, renderer, settings, anchor, controller, resident, restored };
}

test('known GPU buffers are restored with correct types but remain hidden until regenerated', async () => {
  const { near, far, busy, anchor, controller, resident, restored } = fixture();
  const original = far.transformBuffer.array.slice();
  controller.begin(anchor, 0);
  controller.update(10);
  assert.equal(controller.evicted.size, 6);
  assert.equal(far.surfaceCullInvalid, true);
  assert.equal(far.mesh.visible, false);
  assert.ok(resident.has(near.drawBuffer) && resident.has(busy.drawBuffer));
  assert.equal(resident.has(far.visibleBuffer), false);
  await controller.restore();
  assert.equal(restored.length, 6);
  assert.ok(restored.some(([a, type]) => a === far.drawBuffer && type === AttributeType.INDIRECT));
  assert.ok(restored.some(([a, type]) => a === far.visibleBuffer && type === AttributeType.STORAGE));
  assert.deepEqual(far.transformBuffer.array, original);
  assert.equal(far.mesh.visible, false);
  assert.equal(far.surfaceCullInvalid, true);
});

test('unknown bounds, staged publications and pending compute are protected', () => {
  const { far, surface, renderer, settings, anchor } = fixture();
  far.surfaceBounds = null;
  const collect = () => collectLocationGpuImpostorAttributes(surface, renderer, anchor, settings);
  assert.ok(collect().every(entry => entry.protected));
  far.recordCount = 0;
  assert.ok(collect().some(entry => !entry.protected));
  surface.treeView.stagedRebuild = {};
  assert.ok(collect().every(entry => entry.protected));
});

test('regeneration resets and culls immediately before revealing a live draw', () => {
  const { far } = fixture();
  const calls = [], camera = {}, origin = {};
  far.invalidateSurfaceCull();
  far.viewChanged = (c, o) => { assert.equal(c, camera); assert.equal(o, origin); calls.push('view'); };
  far.updatePlanes = c => { assert.equal(c, camera); calls.push('planes'); };
  far.computeReset = {};
  far.computeCull = {};
  far.cullPass = [far.computeReset, far.computeCull];
  far.submitComputes = (nodes, queue) => {
    assert.equal(queue, null);
    assert.equal(nodes, far.cullPass);
    assert.equal(far.mesh.visible, false);
    calls.push('compute');
    return true;
  };
  assert.equal(GpuTreeImpostorBatch.prototype.regenerateSurfaceCull.call(far, camera, origin), true);
  assert.deepEqual(calls, ['view', 'planes', 'compute']);
  assert.equal(far.computeCull.dispatchSize, far.recordCount);
  assert.equal(far.surfaceCullInvalid, false);
  assert.equal(far.mesh.visible, true);
});

test('empty batches reset only, failed regeneration never reveals invalid data', () => {
  const { far } = fixture();
  far.invalidateSurfaceCull();
  far.recordCount = 0;
  far.viewChanged = () => {};
  far.computeReset = {};
  far.updatePlanes = () => assert.fail('empty draw must not cull');
  far.submitComputes = nodes => { assert.equal(nodes, far.computeReset); return false; };
  const regenerate = () => GpuTreeImpostorBatch.prototype.regenerateSurfaceCull.call(far, {}, {});
  assert.equal(regenerate(), false);
  assert.equal(far.surfaceCullInvalid, true);
  assert.equal(far.mesh.visible, false);
  far.submitComputes = () => true;
  assert.equal(regenerate(), true);
  assert.equal(far.surfaceCullInvalid, false);
  assert.equal(far.mesh.visible, false);
});

test('GPU impostor reclamation is independently opt-in', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceGpuImpostorReclamationEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceGpuImpostorReclamation=1').locationStructureBudget.surfaceGpuImpostorReclamationEnabled, true);
});
