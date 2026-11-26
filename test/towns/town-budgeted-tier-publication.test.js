import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three/webgpu';
import { TownModuleInstances } from '../../src/editor/towns/TownModuleInstances.js';
import { WAIT_FOR_TOWN_PUBLICATION } from '../../src/editor/towns/TownInstancePublication.js';

test('resident split changes maintain complete unique coverage across upload waits', t => {
  const material = new MeshBasicMaterial(), geometry = new BoxGeometry();
  const kit = { opaque: geometry, glass: [] };
  const values = new Float32Array(Array.from({ length: 50 }, (_, i) => [i * 10, 0, 0, 0]).flat());
  const module = new TownModuleInstances({ module: 'Wall', values, seeds: null, near: kit, far: kit,
    createMesh: (g, _kind, count) => new InstancedMesh(g, material, count) });
  t.after(() => { for (const mesh of module.meshes) mesh.dispose(); geometry.dispose(); material.dispose(); });
  module.split(0, 0, 95);
  let admitted = false;
  const job = module.splitJob(490, 0, 95, { canPublish: () => admitted });
  const drawn = () => module.meshes.flatMap(mesh =>
    Array.from({ length: mesh.count }, (_, index) => mesh.instanceMatrix.array[index * 16 + 12])).sort((a, b) => a - b);
  const expected = Array.from({ length: 50 }, (_, i) => i * 10);
  let blocked = false;
  for (let turn = 0; turn < 1000; turn++) {
    const step = job.next();
    assert.deepEqual(drawn(), expected);
    if (step.value === WAIT_FOR_TOWN_PUBLICATION) { blocked = true; admitted = true; }
    if (step.done) { assert.ok(blocked); assert.equal(module.nearMeshes[0].count, 10); return; }
  }
  assert.fail('tier transition did not finish');
});
