import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGPUCoordinateSystem } from 'three/webgpu';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { LocationStructureResidency } from '../src/editor/locations/LocationStructureResidency.js';

function fixture(t, overrides = {}) {
  const previous = globalThis.GPUBufferUsage;
  globalThis.GPUBufferUsage = { VERTEX: 32, INDEX: 16, STORAGE: 128, COPY_SRC: 4, COPY_DST: 8 };
  t.after(() => { if (previous === undefined) delete globalThis.GPUBufferUsage; else globalThis.GPUBufferUsage = previous; });
  const scene = new Scene(), resident = new Set(), data = new Map(), attributes = new Set();
  const writes = [], buffers = [];
  const backend = {
    isWebGPUBackend: true,
    get(attribute) { if (!data.has(attribute)) data.set(attribute, {}); return data.get(attribute); },
    getBufferAttribute(attribute) { return attribute; },
    device: {
      createBuffer({ size }) {
        const buffer = { bytes: new Uint8Array(size), destroyed: false, destroy() { this.destroyed = true; } };
        buffers.push(buffer);
        return buffer;
      },
      queue: { writeBuffer(buffer, offset, source, start, count) {
        writes.push(count);
        buffer.bytes.set(source.subarray(start, start + count), offset);
      } },
    },
  };
  const manager = {
    has: attribute => attributes.has(attribute),
    update(attribute) { assert.ok(backend.get(attribute).buffer); attributes.add(attribute); },
  };
  const geometries = {
    has: geometry => resident.has(geometry),
    initGeometry(geometry) {
      assert.ok(!resident.has(geometry));
      resident.add(geometry);
      const dispose = () => {
        for (const attribute of [...Object.values(geometry.attributes), geometry.index].filter(Boolean)) {
          backend.get(attribute).buffer?.destroy();
          data.delete(attribute);
          attributes.delete(attribute);
        }
        resident.delete(geometry);
        geometry.removeEventListener('dispose', dispose);
      };
      geometry.addEventListener('dispose', dispose);
    },
  };
  function section(x, z) {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(3072);
    positions[0] = 1;
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.position.set(x, 0, z);
    mesh.userData.locationStructure = true;
    scene.add(mesh);
    return mesh;
  }
  const camera = new PerspectiveCamera(70, 1, 0.1, 500);
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.updateProjectionMatrix();
  const renderer = { coordinateSystem: WebGPUCoordinateSystem, reversedDepthBuffer: camera.reversedDepth,
    backend, _attributes: manager, _geometries: geometries };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, prefetchEnabled: true,
    prefetchSliceBytes: 4096, prefetchMaxAllocationsPerFrame: 1, prefetchMaxMs: Infinity, ...overrides };
  const near = section(0, 70), front = section(0, -70), far = section(0, 200);
  const streaming = new LocationStructureResidency(scene, renderer, settings);
  t.after(() => { streaming.dispose(); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); });
  return { streaming, camera, near, front, far, resident, backend, writes, buffers, section, geometries };
}

test('prefetch is separately opt-in and validates aligned upload settings', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.prefetchEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationStructurePrefetch=1').locationStructureBudget.prefetchEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { prefetchSliceBytes: 4097 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { prefetchEnabled: 'true' } }), TypeError);
});

test('offscreen sections stage across frames and register disposal before adoption', t => {
  const { streaming, camera, near, front, far, resident, backend, writes, buffers } = fixture(t);
  for (let frame = 0; frame < 8 && !resident.has(near.geometry); frame++) {
    const before = writes.length, allocations = buffers.length;
    streaming.update(camera, frame * 16);
    assert.ok(writes.slice(before).reduce((a, b) => a + b, 0) <= 4096);
    assert.ok(buffers.length - allocations <= 1);
    if (!resident.has(near.geometry)) assert.equal(backend.get(near.geometry.attributes.position).buffer, undefined);
  }
  assert.ok(resident.has(near.geometry));
  assert.ok(!resident.has(front.geometry));
  assert.ok(!resident.has(far.geometry));
  assert.equal(near.visible, true);
  assert.equal(streaming.prefetch.uploads.detachedBytes, 0);
  assert.deepEqual(backend.get(near.geometry.attributes.position).buffer.bytes,
    new Uint8Array(near.geometry.attributes.position.array.buffer));
  near.geometry.dispose();
  assert.ok(buffers.every(buffer => buffer.destroyed));
  assert.ok(!resident.has(near.geometry));
});

test('a camera turn cancels incomplete detached work without hiding a wall', t => {
  const { streaming, camera, near, resident, backend, buffers } = fixture(t);
  streaming.update(camera, 0);
  assert.equal(buffers.length, 1);
  camera.rotation.y = Math.PI;
  streaming.update(camera, 16);
  assert.ok(buffers[0].destroyed);
  assert.equal(near.visible, true);
  assert.ok(!resident.has(near.geometry));
  assert.equal(backend.get(near.geometry.attributes.position).buffer, undefined);
  assert.equal(streaming.prefetch.uploads.detachedBytes, 0);
});

test('prediction extends protection for bounded movement and resets after a teleport', t => {
  const { streaming, camera, near, geometries, resident } = fixture(t);
  geometries.initGeometry(near.geometry);
  near.position.z = 120;
  streaming.update(camera, 0);
  camera.position.z = 20;
  streaming.update(camera, 250);
  assert.equal(streaming.prefetch.predicted.z, 48);
  assert.equal(streaming.entries.find(entry => entry.mesh === near).lastProtected, 250);
  camera.position.z = 1000;
  streaming.update(camera, 500);
  assert.equal(streaming.prefetch.predicted.z, 1000);
  assert.ok(resident.has(near.geometry));
  streaming.update(camera, 5500);
  assert.ok(!resident.has(near.geometry));
});

test('capacity fallback does not adopt partial geometry or repeatedly allocate', t => {
  const { streaming, camera, near, resident, buffers } = fixture(t, { prefetchMaxDetachedBytes: 4096 });
  streaming.update(camera, 0);
  streaming.update(camera, 250);
  assert.equal(buffers.length, 0);
  assert.ok(!resident.has(near.geometry));
  assert.equal(near.visible, true);
  assert.equal(streaming.prefetch.uploads.detachedBytes, 0);
});
