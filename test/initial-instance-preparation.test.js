import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';
import { trackInitialInstanceMesh, registerInitialInstanceDraw, cancelInitialInstanceDraw } from '../src/render/preparation/InitialInstancePreparation.js';

const budget = resolveRenderEnhancements().initialInstanceUploadBudget;
function fixture({ enabled = true, supported = true, optIn = true } = {}) {
  const objects = [];
  const scene = { traverse: visit => objects.forEach(visit) };
  const data = new Map();
  const backend = { isWebGPUBackend: supported, device: {}, get(attribute) {
    if (!data.has(attribute)) data.set(attribute, {});
    return data.get(attribute);
  } };
  const renderer = { backend, _attributes: { update() {}, has: () => false } };
  const preparation = new StreamedDrawPreparation({ scene, renderer, settings: { enabled, meshesPerFrame: 1 },
    initialInstanceBudget: optIn ? budget : null });
  function mesh({ resident = false, direct = true, count = 0 } = {}) {
    const m = { isMesh: true, isInstancedMesh: true, userData: {}, parent: scene, count, visible: count > 0,
      material: {}, geometry: { attributes: {} }, instanceMatrix: { isStorageInstancedBufferAttribute: direct, array: new Float32Array(16) },
      traverse(visit) { visit(this); } };
    if (resident) backend.get(m.instanceMatrix).buffer = {};
    objects.push(m);
    trackInitialInstanceMesh(m, renderer);
    return m;
  }
  return { preparation, mesh, scene, renderer };
}

test('unused storage pools stay dormant until their first published instances', () => {
  const { preparation, mesh } = fixture();
  const dormant = mesh(), warmed = mesh({ resident: true, count: 1 });
  preparation.markInitialScene();
  assert.equal(preparation.isMaterialReady(dormant, dormant.material), false);
  assert.equal(preparation.pending.size, 0);
  assert.equal(preparation.isMaterialReady(warmed, warmed.material), true);
  preparation.discover(dormant);
  assert.equal(preparation.pending.size, 0);
  dormant.count = 1; dormant.visible = true;
  registerInitialInstanceDraw(dormant);
  registerInitialInstanceDraw(dormant);
  assert.equal(preparation.pending.size, 1);
  preparation.hidePending();
  assert.equal(dormant.visible, false);
  assert.equal(warmed.visible, true);
  preparation.revealPending();
  assert.equal(dormant.visible, true);
  preparation.markPrepared(dormant, dormant.material);
  preparation.cancel(dormant);
  registerInitialInstanceDraw(dormant);
  assert.equal(preparation.pending.size, 0);
  preparation.dispose();
});

test('new active pools are enqueued at startup and cancellation removes pending ownership', () => {
  const { preparation, mesh } = fixture();
  const active = mesh({ count: 1 });
  preparation.markInitialScene();
  assert.equal(preparation.pending.has(active), true);
  preparation.hidePending();
  cancelInitialInstanceDraw(active);
  assert.equal(preparation.pending.size, 0);
  assert.equal(active.visible, true);
  registerInitialInstanceDraw(active);
  assert.equal(preparation.pending.size, 0);
  preparation.dispose();
});

test('a pool becoming empty cancels its first-use job but not an explicit material request', () => {
  const { preparation, mesh } = fixture();
  const active = mesh({ count: 1 });
  registerInitialInstanceDraw(active);
  assert.equal(preparation.pending.size, 1);
  active.count = 0;
  registerInitialInstanceDraw(active);
  assert.equal(preparation.pending.size, 0);
  assert.equal(active.visible, false);
  active.count = 1;
  registerInitialInstanceDraw(active);
  preparation.requestMaterial(active, {});
  active.count = 0;
  registerInitialInstanceDraw(active);
  assert.equal(preparation.pending.size, 1);
  preparation.dispose();
});

test('disabled, WebGL and opt-out paths do not introduce first-use registration', () => {
  for (const options of [{ enabled: false }, { supported: false }, { optIn: false }]) {
    const { preparation, mesh } = fixture(options);
    const active = mesh({ count: 1 });
    preparation.markInitialScene();
    registerInitialInstanceDraw(active);
    assert.equal(preparation.pending.size, 0);
    assert.equal(preparation.isMaterialReady(active, active.material), true);
    preparation.dispose();
  }
});

test('the binding is removed on disposal and does not affect other renderers', () => {
  const a = fixture(), b = fixture();
  const one = a.mesh({ count: 1 }), two = b.mesh({ count: 1 });
  a.preparation.dispose();
  registerInitialInstanceDraw(one);
  registerInitialInstanceDraw(two);
  assert.equal(a.preparation.pending.size, 0);
  assert.equal(b.preparation.pending.size, 1);
  b.preparation.dispose();
});

test('first-use settings are independently opt-in and enforce aligned bounded values', () => {
  const value = resolveRenderEnhancements({}, '?initialInstanceUploadSlicing=1');
  assert.equal(value.initialInstanceUploadSlicing, true);
  assert.equal(value.slicedInstancePublication, false);
  assert.equal(resolveRenderEnhancements().initialInstanceUploadSlicing, false);
  assert.throws(() => resolveRenderEnhancements({ initialInstanceUploadBudget: { sliceBytes: 4097 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ initialInstanceUploadBudget: { maxAllocationsPerFrame: 0 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ initialInstanceUploadBudget: { maxDetachedBytes: 4096 } }), RangeError);
});
