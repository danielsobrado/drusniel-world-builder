import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, StorageInstancedBufferAttribute, StorageBufferAttribute, IndirectStorageBufferAttribute } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { StagedGeometryUploads, stagedGeometryAttributes } from '../src/render/preparation/StagedGeometryUploads.js';
import { trackInitialComputeDraw, cancelInitialInstanceDraw } from '../src/render/preparation/InitialInstancePreparation.js';
import { DrawUploadEstimate } from '../src/render/preparation/DrawUploadEstimate.js';

function fixture(t, settings = null) {
  const previous = globalThis.GPUBufferUsage;
  globalThis.GPUBufferUsage = { VERTEX: 32, INDEX: 16, STORAGE: 128, COPY_SRC: 4, COPY_DST: 8 };
  t.after(() => { if (previous === undefined) delete globalThis.GPUBufferUsage; else globalThis.GPUBufferUsage = previous; });
  const backendData = new Map(), managerData = new Map(), writes = [], buffers = [];
  const backend = { isWebGPUBackend: true,
    get(attribute) { if (!backendData.has(attribute)) backendData.set(attribute, {}); return backendData.get(attribute); },
    device: {
      createBuffer({ size, usage }) {
        const buffer = { bytes: new Uint8Array(size), usage, destroyed: false, destroy() { this.destroyed = true; } };
        buffers.push(buffer); return buffer;
      },
      queue: { writeBuffer(buffer, offset, data, start = 0, count = data.length - start) {
        writes.push(count); buffer.bytes.set(data.subarray(start, start + count), offset);
      } },
    },
  };
  const manager = { has: attribute => managerData.has(attribute),
    update(attribute, type) { assert.ok(backend.get(attribute).buffer); managerData.set(attribute, type); } };
  const stage = new StagedGeometryUploads({ backend, _attributes: manager }, settings);
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(90000).fill(0.25), 3);
  const index = new BufferAttribute(new Uint16Array(150001).fill(17), 1);
  geometry.setAttribute('position', positions); geometry.setIndex(index);
  const material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material);
  t.after(() => { stage.dispose(); geometry.dispose(); material.dispose(); });
  return { stage, backend, managerData, writes, buffers, mesh, positions, index };
}

test('staged buffers respect slices, keep the backend unpublished, and pad odd indices', t => {
  const { stage, backend, managerData, writes, mesh, positions, index } = fixture(t);
  const limit = 64 * 1024;
  let ready = false, turns = 0;
  while (!ready) {
    const start = writes.length;
    ({ ready } = stage.advance(mesh, limit, () => false));
    assert.ok(writes.slice(start).reduce((a, b) => a + b, 0) <= limit);
    assert.equal(backend.get(positions).buffer, undefined);
    assert.equal(backend.get(index).buffer, undefined);
    assert.ok(++turns < 30);
  }
  stage.adopt(mesh);
  assert.equal(managerData.get(positions), AttributeType.VERTEX);
  assert.equal(managerData.get(index), AttributeType.INDEX);
  assert.deepEqual(backend.get(positions).buffer.bytes, new Uint8Array(positions.array.buffer));
  const indexedBytes = backend.get(index).buffer.bytes;
  assert.deepEqual(indexedBytes.subarray(0, index.array.byteLength), new Uint8Array(index.array.buffer));
  assert.equal(indexedBytes.length, index.array.byteLength + 2);
  assert.equal(indexedBytes.at(-1), 0);
  assert.ok(backend.get(index).buffer.usage & GPUBufferUsage.INDEX);
});

test('source edits restart partial uploads and cancellation frees detached buffers', t => {
  const { stage, backend, buffers, mesh, positions } = fixture(t);
  stage.advance(mesh, 64 * 1024, () => false);
  positions.array[0] = 2; positions.needsUpdate = true;
  stage.advance(mesh, 64 * 1024, () => false);
  assert.equal(buffers[0].destroyed, true);
  stage.cancel(mesh);
  assert.ok(buffers.every(buffer => buffer.destroyed));
  assert.equal(backend.get(positions).buffer, undefined);
});

test('normal Three publication wins over a detached staged copy', t => {
  const { stage, backend, buffers, mesh, positions } = fixture(t);
  stage.advance(mesh, 64 * 1024, () => false);
  const live = { destroy: () => assert.fail('live buffer must not be destroyed') };
  backend.get(positions).buffer = live;
  stage.advance(mesh, 64 * 1024, () => false);
  assert.equal(buffers[0].destroyed, true);
  assert.equal(backend.get(positions).buffer, live);
});

const firstUseSettings = { maxDetachedBytes: 2 * 1024 * 1024, maxAllocationsPerFrame: 2, maxRestarts: 3 };

function directMesh() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('instanceDither', new InstancedBufferAttribute(new Float32Array(24).fill(0.5), 3));
  geometry.setAttribute('instanceSurface', new InstancedBufferAttribute(new Float32Array(24).fill(0.25), 3));
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 8);
  mesh.instanceMatrix = new StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
  return mesh;
}

test('direct instance buffers below the old threshold stage together while small static geometry remains normal', t => {
  const { stage, backend, writes, managerData } = fixture(t, firstUseSettings);
  const mesh = directMesh();
  t.after(() => { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); });
  const entries = stagedGeometryAttributes(mesh, true);
  assert.equal(stagedGeometryAttributes(mesh).length, 0);
  assert.equal(entries.length, 3);
  assert.equal(entries.find(entry => entry.attribute === mesh.instanceMatrix).type, AttributeType.STORAGE);
  let ready = false, turns = 0;
  while (!ready) {
    stage.beginFrame();
    const start = writes.length;
    ({ ready } = stage.advance(mesh, 64, () => false));
    assert.ok(writes.slice(start).reduce((a, b) => a + b, 0) <= 64);
    assert.equal(backend.get(mesh.instanceMatrix).buffer, undefined);
    assert.ok(++turns < 30);
  }
  stage.adopt(mesh);
  assert.equal(stage.detachedBytes, 0);
  assert.equal(managerData.get(mesh.instanceMatrix), AttributeType.STORAGE);
  assert.equal(backend.get(mesh.geometry.attributes.instanceDither).buffer.bytes.length, 96);
  assert.deepEqual(backend.get(mesh.instanceMatrix).buffer.bytes, new Uint8Array(mesh.instanceMatrix.array.buffer));
});

test('ordinary instance matrices and small static attributes are not treated as direct storage', t => {
  const { stage } = fixture(t, firstUseSettings);
  const mesh = directMesh();
  const ordinary = new InstancedMesh(mesh.geometry, mesh.material, 8);
  t.after(() => { mesh.dispose(); ordinary.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); });
  assert.equal(stage.entries(ordinary).length, 0);
  assert.equal(stage.needsInitialInstanceUpload(ordinary), false);
});

test('allocation limit is shared across advances in a frame and reset explicitly', t => {
  const { stage, buffers } = fixture(t, { ...firstUseSettings, maxAllocationsPerFrame: 1 });
  const mesh = directMesh();
  t.after(() => { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); });
  assert.equal(stage.advance(mesh, 4096, () => false).ready, false);
  assert.equal(buffers.length, 1);
  assert.equal(stage.advance(mesh, 4096, () => false).ready, false);
  assert.equal(buffers.length, 1);
  stage.beginFrame();
  assert.equal(stage.advance(mesh, 4096, () => false).ready, false);
  stage.beginFrame();
  assert.equal(stage.advance(mesh, 4096, () => false).ready, true);
  stage.adopt(mesh);
  assert.equal(buffers.length, 3);
});

test('same-size mutations reuse detached allocations and refresh all bytes', t => {
  const { stage, backend, buffers } = fixture(t, firstUseSettings);
  const mesh = directMesh();
  t.after(() => { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); });
  const attr = mesh.geometry.attributes.instanceDither;
  stage.advance(mesh, 32, () => false);
  attr.array = new Float32Array(attr.array.length).fill(0.75);
  attr.needsUpdate = true;
  stage.beginFrame();
  stage.advance(mesh, 32, () => false);
  assert.equal(buffers.length, 1);
  assert.equal(buffers[0].destroyed, false);
  for (let i = 0; i < 20; i++) {
    stage.beginFrame();
    if (stage.advance(mesh, 64, () => false).ready) break;
  }
  stage.adopt(mesh);
  assert.deepEqual(backend.get(attr).buffer.bytes, new Uint8Array(attr.array.buffer));
});

test('memory or mutation limits release partial staging and allow conventional first draw', t => {
  for (const settings of [{ ...firstUseSettings, maxDetachedBytes: 128 }, { ...firstUseSettings, maxRestarts: 0 }]) {
    const { stage, backend, buffers } = fixture(t, settings);
    const mesh = directMesh();
    t.after(() => { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); });
    const attr = mesh.geometry.attributes.instanceDither;
    stage.advance(mesh, 32, () => false);
    if (!settings.maxRestarts) attr.needsUpdate = true;
    stage.beginFrame();
    const result = stage.advance(mesh, 4096, () => false);
    assert.equal(result.ready, true);
    assert.equal(result.attributes.length, 0);
    assert.equal(stage.detachedBytes, 0);
    assert.ok(buffers.every(buffer => buffer.destroyed));
    assert.equal(backend.get(attr).buffer, undefined);
    assert.equal(stage.advance(mesh, 4096, () => false).bytes, 0);
    stage.adopt(mesh);
  }
});

test('geometry replacement releases obsolete detached jobs', t => {
  const { stage, buffers } = fixture(t, firstUseSettings);
  const mesh = directMesh();
  t.after(() => { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); });
  stage.advance(mesh, 32, () => false);
  mesh.geometry.deleteAttribute('instanceDither');
  stage.beginFrame();
  stage.advance(mesh, 32, () => false);
  assert.equal(buffers[0].destroyed, true);
  stage.cancel(mesh);
  assert.equal(stage.detachedBytes, 0);
  assert.ok(buffers.every(buffer => buffer.destroyed));
});

test('explicit compute storage shares the geometry slice and excludes indirect ownership', t => {
  const { stage, backend, managerData, writes } = fixture(t, firstUseSettings);
  const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  const records = new StorageBufferAttribute(new Float32Array(64).fill(1), 4);
  const visible = new StorageBufferAttribute(new Uint32Array(16), 1);
  const indirect = new IndirectStorageBufferAttribute(new Uint32Array([6, 0, 0, 0, 0]), 5);
  let dormant = true;
  trackInitialComputeDraw(mesh, stage.renderer, {
    storageAttributes: [records, visible, indirect],
    allAttributes: [records, visible, indirect],
    isDormant: () => dormant,
  });
  t.after(() => { cancelInitialInstanceDraw(mesh); mesh.geometry.dispose(); mesh.material.dispose(); });
  assert.deepEqual(stage.entries(mesh).map(entry => entry.attribute), [records, visible]);
  const estimate = new DrawUploadEstimate();
  assert.equal(estimate.estimate(mesh, new Set(), [records, visible]).bytes, indirect.array.byteLength);
  let ready = false;
  for (let i = 0; i < 20 && !ready; i++) {
    stage.beginFrame();
    const start = writes.length;
    ({ ready } = stage.advance(mesh, 64, () => false));
    assert.ok(writes.slice(start).reduce((a, b) => a + b, 0) <= 64);
    assert.equal(backend.get(records).buffer, undefined);
  }
  assert.ok(ready);
  stage.adopt(mesh);
  assert.equal(managerData.get(records), AttributeType.STORAGE);
  assert.equal(managerData.get(visible), AttributeType.STORAGE);
  assert.equal(managerData.has(indirect), false);
  assert.deepEqual(backend.get(records).buffer.bytes, new Uint8Array(records.array.buffer));
  dormant = false;
  assert.equal(stage.entries(mesh).length, 0);
});
