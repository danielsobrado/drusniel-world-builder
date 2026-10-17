import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { writeInstances } from '../src/editor/stylized/lod/StylizedLodRuntime.js';
import { withDrawPreparation } from '../src/render/preparation/DrawPreparation.js';

function createMesh() {
  const geometry = new THREE.BufferGeometry();
  for (const name of ['instanceDither', 'instanceLeafTint', 'instanceMorphology']) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(6), 3));
  }
  return {
    geometry,
    instanceMatrix: new THREE.InstancedBufferAttribute(new Float32Array(32), 16),
    count: 0,
    computeBoundingSphere() {},
  };
}

function instance() {
  return {
    matrix: new THREE.Matrix4(),
    fade: 0.3,
    ditherDirection: -1,
    seed: 0.17,
    colorVariation: 0.83,
    leafTint: [0.1, 0.7, 0.9],
    morphology: [0.7, 1.1, 0.9],
  };
}

test('repeated LOD writes leave unchanged float32 appearance buffers clean', () => {
  const mesh = createMesh();
  const record = instance();
  writeInstances([[mesh]], [[record]]);
  const attributes = [mesh.instanceMatrix, ...Object.values(mesh.geometry.attributes)];
  const versions = attributes.map((attribute) => attribute.version);
  for (const attribute of attributes) attribute.clearUpdateRanges();
  writeInstances([[mesh]], [[record]]);
  assert.deepEqual(attributes.map((attribute) => attribute.version), versions);
  assert.ok(attributes.every((attribute) => attribute.updateRanges.length === 0));
});

test('a changed LOD fade uploads only dither data for the affected instance', () => {
  const mesh = createMesh();
  const first = instance();
  const second = { ...instance(), matrix: new THREE.Matrix4().makeTranslation(1, 0, 0) };
  writeInstances([[mesh]], [[first, second]]);
  const attributes = [mesh.instanceMatrix, ...Object.values(mesh.geometry.attributes)];
  const versions = attributes.map((attribute) => attribute.version);
  for (const attribute of attributes) attribute.clearUpdateRanges();
  second.fade = 0.4;
  writeInstances([[mesh]], [[first, second]]);
  const dither = mesh.geometry.getAttribute('instanceDither');
  assert.deepEqual(dither.updateRanges, [{ start: 3, count: 3 }]);
  attributes.forEach((attribute, index) => {
    assert.equal(attribute.version, versions[index] + (attribute === dither ? 1 : 0));
  });
});

test('empty prototype pools stay absent from rendering and can still prewarm and repopulate', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  mesh.geometry.setAttribute('instanceDither', new THREE.InstancedBufferAttribute(new Float32Array(6), 3));
  scene.add(mesh);
  writeInstances([[mesh]], [[]]);
  assert.equal(mesh.visible, false);
  withDrawPreparation(scene, [mesh], () => { assert.equal(mesh.visible, true); assert.equal(mesh.count, 1); });
  assert.equal(mesh.visible, false); assert.equal(mesh.count, 0);
  writeInstances([[mesh]], [[instance()]]);
  assert.equal(mesh.visible, true); assert.equal(mesh.count, 1);
  writeInstances([[mesh]], [[]]);
  assert.equal(mesh.visible, false);
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
});
