import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three/webgpu';
import { stagedDrawPublication, WAIT_FOR_DRAW_PREPARATION } from '../src/render/preparation/StagedDrawPublication.js';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

test('one incompatible draw leaves subsequent shader preparation active', () => {
  const scene = new Scene();
  const geometry = new BoxGeometry();
  const bad = new Mesh(geometry, new MeshBasicMaterial());
  const good = new Mesh(geometry, new MeshBasicMaterial());
  scene.add(bad, good);
  let goodPrepared = false;
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 2 }, render: () => {
      if (bad.visible) throw new Error('Unsupported draw');
      goodPrepared ||= good.visible;
    } });
  try {
    preparation.register(scene);
    preparation.flush({});
    assert.equal(preparation.isMaterialReady(good, good.material), false);
    preparation.flush({});
    preparation.flush({});
    assert.ok(goodPrepared);
    assert.ok(preparation.isMaterialReady(bad, bad.material), 'failed draw can publish on demand');
    assert.ok(preparation.isMaterialReady(good, good.material));
    assert.equal(preparation.requestMaterial(bad, bad.material), false);
    assert.equal(preparation.settings.enabled, true);
  } finally {
    preparation.dispose();
    geometry.dispose();
    bad.material.dispose();
    good.material.dispose();
  }
});

test('new publication remains hidden until all gameplay draws are prepared', () => {
  const scene = new Scene(), root = new Group();
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const meshes = [new Mesh(geometry, material), new Mesh(geometry, material)];
  for (const mesh of meshes) { mesh.userData.skipWarmup = true; root.add(mesh); }
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => {} });
  const job = stagedDrawPublication(scene, [root], preparation);
  try {
    assert.equal(job.next().value, WAIT_FOR_DRAW_PREPARATION);
    assert.equal(scene.children[0].visible, false);
    preparation.flush({});
    assert.equal(job.next().value, WAIT_FOR_DRAW_PREPARATION);
    preparation.flush({});
    assert.equal(job.next().done, true);
    assert.equal(root.parent, null);
    assert.equal(scene.children.length, 0);
    assert.ok(meshes.every(mesh => preparation.isMaterialReady(mesh, material)));
    assert.ok(meshes.every(mesh => mesh.userData.skipWarmup), 'explicit ownership preserves bootstrap flags');
    scene.add(root);
    assert.equal(root.visible, true);
  } finally { job.return(); preparation.dispose(); geometry.dispose(); material.dispose(); }
});

test('cancelling a hidden publication detaches roots and discards pending draws', () => {
  const scene = new Scene(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    diagnostics: true,
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => assert.fail('cancelled draw rendered') });
  const job = stagedDrawPublication(scene, [mesh], preparation);
  try {
    const cancellations = PerfCounters.get('streamedDrawJobsCancelled');
    job.next(); job.return();
    assert.equal(scene.children.length, 0);
    assert.equal(mesh.parent, null);
    assert.equal(preparation.pending.size, 0);
    assert.equal(PerfCounters.get('streamedDrawJobsCancelled'), cancellations + 1);
    preparation.flush({});
  } finally { preparation.dispose(); geometry.dispose(); material.dispose(); }
});
