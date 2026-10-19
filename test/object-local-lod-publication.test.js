import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Matrix4, MeshBasicNodeMaterial, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { ObjectLodController } from '../src/editor/ObjectLodController.js';
import { createInstancedRenderers, disposeInstancedRenderers, writeInstances } from '../src/editor/stylized/lod/StylizedLodRuntime.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

function fixture(t) {
  let records = new Map(Array.from({ length: 256 }, (_, id) => {
    const z = [-20, -80, -300][id % 3];
    return [id, { object: { id }, matrix: new Matrix4().makeTranslation(id / 100, 3, z),
      worldPosition: new Vector3(id / 100, 3, z), worldHeight: 6 }];
  }));
  const controller = new ObjectLodController({ transitionMs: 1 });
  const camera = new PerspectiveCamera(60, 1, .1, 1000); camera.position.y = 3;
  const plan = (timestamp, force = false, selectedObjectId = null) => controller.plan({
    placements: [...records.values()], camera, viewportHeight: 1000, timestamp, force, selectedObjectId });
  controller.updatePlacements(records); plan(0); plan(2, true);
  const geometry = new BoxGeometry(), material = new MeshBasicNodeMaterial(), root = new Group();
  const meshes = Object.fromEntries(['near', 'coarse', 'shell'].map(band => [band,
    createInstancedRenderers({ root, partsByPrototype: [[{ geometry, material }]], capacity: 256, name: band })[0]]));
  t.after(() => { for (const group of Object.values(meshes)) disposeInstancedRenderers(root, [group]); geometry.dispose(); material.dispose(); });
  const initial = plan(100);
  for (const band of Object.keys(meshes)) writeInstances([meshes[band]], [initial.buckets[band]]);
  for (const group of Object.values(meshes)) for (const mesh of group) {
    mesh.instanceMatrix.clearUpdateRanges(); mesh.geometry.getAttribute('instanceDither').clearUpdateRanges();
  }
  return { get records() { return records; }, controller, camera, plan, initial, meshes,
    publish(next) { records = next; controller.updatePlacements(next); } };
}

test('one edit in 256 objects classifies and writes one row without touching other bands', t => {
  const f = fixture(t), old = f.records.get(1), next = new Map(f.records);
  next.set(1, { ...old, matrix: old.matrix.clone().setPosition(1.5, 3, -80), worldPosition: new Vector3(1.5, 3, -80) });
  PerfCounters.reset(); f.publish(next);
  const plan = f.plan(120);
  assert.equal(PerfCounters.get('objectLodPlacementsEvaluated'), 1);
  assert.equal(plan.signatures.near, f.initial.signatures.near);
  assert.equal(plan.signatures.shell, f.initial.signatures.shell);
  assert.equal(plan.changedRows.coarse.length, 1);
  const mesh = f.meshes.coarse[0], oldBounds = mesh.boundingSphere.clone();
  writeInstances([f.meshes.coarse], [plan.buckets.coarse], null, [plan.changedRows.coarse]);
  assert.equal(PerfCounters.get('stylizedInstanceRowsCompared'), 1);
  assert.equal(mesh.instanceMatrix.updateRanges.reduce((sum, r) => sum + r.count, 0), 16);
  assert.equal(mesh.geometry.getAttribute('instanceDither').updateRanges.length, 0);
  assert.ok(mesh.boundingSphere.containsPoint(new Vector3(1.5, 3, -80)));
  assert.ok(mesh.boundingSphere.radius >= oldBounds.radius);
});

test('removal swaps only a tail row, selection remains local, and camera movement still reclassifies all', t => {
  const f = fixture(t), next = new Map(f.records); next.delete(1);
  const previousCount = f.initial.buckets.coarse.length;
  PerfCounters.reset(); f.publish(next);
  let plan = f.plan(120);
  assert.equal(plan.buckets.coarse.length, previousCount - 1);
  assert.equal(plan.changedRows.coarse.length, 1);
  assert.ok(!plan.buckets.coarse.some(row => row.objectId === 1));
  assert.equal(PerfCounters.get('objectLodPlacementsEvaluated'), 0);
  plan = f.plan(160, false, 2); f.plan(162, false, 2);
  assert.equal(PerfCounters.get('objectLodPlacementsEvaluated'), 1);
  f.camera.position.x = 20; PerfCounters.reset();
  f.plan(200);
  assert.equal(PerfCounters.get('objectLodPlacementsEvaluated'), 255);
});
