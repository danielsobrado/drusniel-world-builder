import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three/webgpu';
import { stagedDrawPublication, WAIT_FOR_DRAW_PREPARATION } from '../src/render/preparation/StagedDrawPublication.js';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';

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
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => assert.fail('cancelled draw rendered') });
  const job = stagedDrawPublication(scene, [mesh], preparation);
  try {
    job.next(); job.return(); preparation.flush({});
    assert.equal(scene.children.length, 0);
    assert.equal(mesh.parent, null);
    assert.equal(preparation.pending.size, 0);
  } finally { preparation.dispose(); geometry.dispose(); material.dispose(); }
});
