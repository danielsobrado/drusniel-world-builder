import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene, Mesh, PlaneGeometry, MeshBasicMaterial } from 'three/webgpu';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';
import { PerfQaHarness } from '../src/editor/performance/qa/PerfQaHarness.js';

test('a new material prepares in the real pass while its previous publication remains visible', () => {
  const scene = new Scene(), geometry = new PlaneGeometry();
  const original = new MeshBasicMaterial(), replacement = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, original); scene.add(mesh);
  let renders = 0;
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => {
      renders++; assert.equal(mesh.material, replacement);
      assert.equal(mesh.geometry.drawRange.count, 0);
    } });
  preparation.markInitialScene();
  assert.equal(preparation.requestMaterial(mesh, replacement), true);
  preparation.flush(null, () => true); preparation.hidePending();
  assert.equal(renders, 0); assert.equal(mesh.visible, true); assert.equal(mesh.material, original);
  preparation.flush(null);
  assert.equal(renders, 1); assert.equal(mesh.material, original);
  assert.equal(preparation.isMaterialReady(mesh, original), true);
  assert.equal(preparation.isMaterialReady(mesh, replacement), true);
  assert.equal(preparation.requestMaterial(mesh, replacement), false);
  preparation.dispose(); geometry.dispose(); original.dispose(); replacement.dispose();
});

test('the public QA recording state follows phase changes without replacing the API', () => {
  const before = globalThis.window;
  globalThis.window = {};
  try {
    const harness = Object.create(PerfQaHarness.prototype);
    Object.assign(harness, { status: 'running', phaseIndex: 0, plan: { phases: [{ record: false }, { record: true }] } });
    harness.publishApi();
    const api = window.__perfQa;
    assert.equal(api.recording, false);
    harness.phaseIndex = 1; assert.equal(api.recording, true);
    harness.status = 'done'; assert.equal(api.recording, false);
  } finally {
    if (before === undefined) delete globalThis.window; else globalThis.window = before;
  }
});
