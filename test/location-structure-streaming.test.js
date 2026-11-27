import assert from 'node:assert/strict';
import test from 'node:test';
import { splitByCells, splitByColumns } from '../src/editor/locations/gen/SurfaceNets.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { LocationStructureResidency } from '../src/editor/locations/LocationStructureResidency.js';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGPUCoordinateSystem } from 'three/webgpu';

test('3D sections separate vertical levels without losing triangle or baked vertex data', () => {
  const positions = new Float32Array([-1,0,0, 1,0,0, 0,0,1, -1,30,0, 1,30,0, 0,30,1]);
  const mask = new Float32Array([1,2,3,4,5,6]);
  const mesh = { indices: new Uint32Array([0,1,2,3,4,5]), attributes: { position: { array: positions, size: 3 }, mask: { array: mask, size: 1 } } };
  const chunks = splitByCells(mesh, 28);
  assert.equal(splitByColumns(mesh, 28).length, 1);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.flatMap(c => [...c.attributes.mask.array]), [...mask]);
  assert.deepEqual(chunks.flatMap(c => [...c.attributes.position.array]), [...positions]);
  assert.equal(chunks.reduce((sum,c) => sum + c.indices.length,0), 6);
});

test('location structure configuration is opt-in and protects at least a cell', () => {
  assert.equal(resolveRenderEnhancements().locationStructureStreaming, false);
  assert.equal(resolveRenderEnhancements({}, '?locationStructureStreaming=1').locationStructureStreaming, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { protectMeters: 16 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { evictionsPerSample: 1.5 } }), RangeError);
});

test('cold offscreen buffers retire without hiding meshes or deleting CPU geometry', () => {
  const scene = new Scene(), resident = new Set(), retired = [];
  function section(z) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0,0,z, 1,0,z, 0,1,z],3));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, new MeshBasicMaterial());
    mesh.userData.locationStructure = true;
    g.addEventListener('dispose', () => { resident.delete(g); retired.push(z); });
    resident.add(g); scene.add(mesh);
    return mesh;
  }
  const front = section(-100), near = section(10), back = section(100), other = section(110);
  const camera = new PerspectiveCamera(70, 1, 0.1, 500);
  camera.coordinateSystem = WebGPUCoordinateSystem; camera.updateProjectionMatrix();
  const renderer = { coordinateSystem: WebGPUCoordinateSystem, reversedDepthBuffer: camera.reversedDepth,
    backend: { isWebGPUBackend: true }, _geometries: resident };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, evictionsPerSample: 1 };
  const streaming = new LocationStructureResidency(scene, renderer, settings);
  streaming.update(camera, 0);
  streaming.update(camera, 5000);
  assert.deepEqual(retired, [100]);
  assert.equal(back.visible, true);
  assert.equal(back.geometry.attributes.position.count, 3);
  assert.equal(resident.has(front.geometry), true);
  assert.equal(resident.has(near.geometry), true);
  camera.rotation.y = Math.PI;
  streaming.update(camera, 5250);
  assert.equal(resident.has(other.geometry), true);
  streaming.dispose();
  scene.traverse(o => o.material?.dispose());
});
