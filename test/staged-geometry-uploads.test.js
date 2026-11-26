import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { StagedGeometryUploads } from '../src/render/preparation/StagedGeometryUploads.js';

function fixture(t) {
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
  const stage = new StagedGeometryUploads({ backend, _attributes: manager });
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
