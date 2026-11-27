import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Mesh, InstancedMesh, InstancedBufferGeometry, InstancedBufferAttribute, StorageInstancedBufferAttribute, BufferGeometry, BufferAttribute, MeshBasicMaterial, Sphere, Vector3 } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { collectLocationSceneryAttributes } from '../src/editor/locations/LocationSceneryResidency.js';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture(t) {
  const root = new Group(), material = new MeshBasicMaterial(), resident = new Set(), restored = [];
  const geometry = () => {
    const value = new BufferGeometry();
    value.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    value.setAttribute('instanceDither', new InstancedBufferAttribute(new Float32Array(6), 3));
    return value;
  };
  const scatter = (x, count = 2) => {
    const mesh = new InstancedMesh(geometry(), material, 2);
    mesh.instanceMatrix = new StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
    mesh.count = count;
    mesh.boundingSphere = new Sphere(new Vector3(x, 0, 0), 5);
    root.add(mesh);
    resident.add(mesh.instanceMatrix);
    for (const attr of Object.values(mesh.geometry.attributes)) resident.add(attr);
    return mesh;
  };
  const near = scatter(10), far = scatter(200), empty = scatter(0, 0), pending = scatter(300);
  const cpuGeometry = new InstancedBufferGeometry();
  cpuGeometry.setAttribute('instanceTransform', new InstancedBufferAttribute(new Float32Array(8), 4));
  const cpu = { mesh: new Mesh(cpuGeometry, material), geometry: cpuGeometry, records: [{ x: 1400, z: 1000, radius: 4 }] };
  root.add(cpu.mesh);
  const cpuAttribute = cpuGeometry.getAttribute('instanceTransform');
  resident.add(cpuAttribute);
  const surface = { terrainView: { slots: [], drawPreparation: { pending: new Set([pending]) } }, waterSlots: [],
    treeView: { root, instanceAnchor: { x: 1000, z: 1000 }, renderers: [[near], [far], [empty], [pending]],
      impostorBatches: [{ mode: 'cpu', batch: cpu }] } };
  const renderer = { backend: { isWebGPUBackend: true, getBufferAttribute: a => a }, _textures: new Set(), initTexture() {},
    _attributes: { has: a => resident.has(a), delete: a => resident.delete(a), update(a, type) { restored.push([a, type]); resident.add(a); } } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfaceSceneryReclamationEnabled: true,
    surfaceSceneryProtectMeters: 64, surfaceIdleMs: 10, surfaceSampleMs: 10, surfaceEvictionsPerSample: 16,
    surfaceRestoreBytesPerFrame: 256, surfaceMaxEvictedBytes: 4096 };
  const anchor = { x: 1000, z: 1000 };
  const controller = new LocationSurfaceResidency(surface, renderer, settings, async () => {});
  t.after(() => { controller.dispose(); root.traverse(o => o.geometry?.dispose()); material.dispose(); });
  return { near, far, empty, pending, cpu, cpuAttribute, surface, renderer, settings, anchor, controller, resident, restored };
}

test('canonical pool bounds, empty pools, pending draws and CPU impostors', t => {
  const { near, far, empty, pending, cpuAttribute, surface, renderer, settings, anchor } = fixture(t);
  const entries = collectLocationSceneryAttributes(surface, renderer, anchor, settings);
  const find = a => entries.find(e => e.resource === a);
  assert.equal(find(near.instanceMatrix).protected, true);
  assert.equal(find(far.instanceMatrix).protected, false);
  assert.equal(find(empty.instanceMatrix).distance, Infinity);
  assert.equal(find(pending.instanceMatrix).protected, true);
  assert.equal(find(cpuAttribute).protected, false);
  assert.equal(find(far.instanceMatrix).attributeType, AttributeType.STORAGE);
  assert.equal(find(far.geometry.getAttribute('instanceDither')).attributeType, AttributeType.VERTEX);
  assert.equal(find(far.geometry.getAttribute('position')), undefined);
});

test('restoration recreates matching storage and vertex attributes without touching CPU data', async t => {
  const { far, near, cpuAttribute, anchor, controller, resident, restored } = fixture(t);
  const matrix = far.instanceMatrix, original = matrix.array.slice();
  controller.begin(anchor, 0);
  controller.update(10);
  assert.equal(resident.has(matrix), false);
  assert.equal(resident.has(cpuAttribute), false);
  assert.equal(resident.has(near.instanceMatrix), true);
  assert.deepEqual(matrix.array, original);
  await controller.restore();
  assert.ok(restored.some(([a, type]) => a === matrix && type === AttributeType.STORAGE));
  assert.ok(restored.some(([a, type]) => a === cpuAttribute && type === AttributeType.VERTEX));
  assert.deepEqual(matrix.array, original);
});

test('staged publications and unknown bounds protect pool allocations', t => {
  const { surface, far, renderer, settings, anchor } = fixture(t);
  far.boundingSphere = null;
  const collect = () => collectLocationSceneryAttributes(surface, renderer, anchor, settings);
  assert.equal(collect().find(e => e.resource === far.instanceMatrix).protected, true);
  surface.treeView.stagedRebuild = {};
  assert.ok(collect().every(e => e.protected));
});

test('GPU impostor records are not mistaken for CPU authoritative data', t => {
  const { surface, cpu, cpuAttribute, renderer, settings, anchor } = fixture(t);
  surface.treeView.impostorBatches = [{ mode: 'gpu', batch: cpu }];
  assert.ok(!collectLocationSceneryAttributes(surface, renderer, anchor, settings).some(e => e.resource === cpuAttribute));
  surface.treeView.impostorBatches[0].auxiliary = cpu;
  assert.ok(collectLocationSceneryAttributes(surface, renderer, anchor, settings).some(e => e.resource === cpuAttribute));
});

test('scenery reclamation is opt-in and validates its radius', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceSceneryReclamationEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceSceneryReclamation=1').locationStructureBudget.surfaceSceneryReclamationEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceSceneryProtectMeters: -1 } }), RangeError);
});
