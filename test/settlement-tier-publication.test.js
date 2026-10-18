import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three/webgpu';
import { SettlementTierPublication } from '../src/editor/world/settlements/view/SettlementTierPublication.js';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';

test('settlement tier growth keeps the complete old tier until every replacement draw is warm', () => {
  const scene = new Scene(), root = new Group(); scene.add(root);
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), disposed = [];
  const tier = count => ({ meshes: Array.from({ length: count }, () => new Mesh(geometry, material)) });
  const dispose = meshes => { for (const mesh of meshes) { disposed.push(mesh); mesh.removeFromParent(); mesh.dispose(); } };
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => {} });
  const publications = new SettlementTierPublication(root, () => preparation, dispose);
  const old = tier(2), replacement = tier(2), larger = tier(2);
  root.add(...old.meshes);
  try {
    assert.equal(publications.stage(replacement, old), true);
    assert.ok(old.meshes.every(mesh => mesh.parent === root && mesh.visible));
    preparation.flush({}); publications.advance(2);
    assert.equal(publications.pending.size, 1);
    assert.equal(disposed.length, 0);
    // A second growth cancels the unexposed generation and retains the same old tier.
    publications.stage(larger, replacement);
    assert.ok(replacement.meshes.every(mesh => disposed.includes(mesh)));
    assert.ok(old.meshes.every(mesh => mesh.parent === root));
    while (preparation.pending.size) preparation.flush({});
    publications.advance(2);
    assert.equal(publications.pending.size, 0);
    assert.ok(larger.meshes.every(mesh => mesh.parent === root && mesh.visible));
    assert.ok(old.meshes.every(mesh => disposed.includes(mesh)));
    publications.release(larger);
    assert.equal(root.children.length, 0);
    assert.equal(new Set(disposed).size, disposed.length, 'each owned mesh is disposed once');
  } finally { preparation.dispose(); geometry.dispose(); material.dispose(); }
});

test('cancelling initial settlement publication releases its stage exactly once', () => {
  const scene = new Scene(), root = new Group(); scene.add(root);
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material);
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => assert.fail('cancelled draw') });
  let releases = 0;
  const publications = new SettlementTierPublication(root, () => preparation,
    meshes => { releases += meshes.length; for (const mesh of meshes) mesh.removeFromParent(); });
  const tier = { meshes: [mesh] };
  try {
    publications.stage(tier); publications.release(tier); preparation.flush({});
    assert.equal(publications.pending.size, 0);
    assert.equal(root.children.length, 0);
    assert.equal(releases, 1);
  } finally { preparation.dispose(); geometry.dispose(); material.dispose(); }
});
