import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { installEmptyDrawSkip, isEmptyInstancedDraw } from '../src/render/skipEmptyDraws.js';

test('empty-draw filtering preserves populated, regular and GPU-indirect geometry', () => {
  const geometry = new THREE.InstancedBufferGeometry();
  const mesh = new THREE.Mesh(geometry);
  geometry.instanceCount = 0;
  assert.equal(isEmptyInstancedDraw(mesh, geometry), true);
  geometry.instanceCount = 3;
  assert.equal(isEmptyInstancedDraw(mesh, geometry), false);
  const instances = new THREE.InstancedMesh(new THREE.PlaneGeometry(), undefined, 2);
  instances.count = 0;
  assert.equal(isEmptyInstancedDraw(instances, instances.geometry), true);
  instances.count = 1;
  assert.equal(isEmptyInstancedDraw(instances, instances.geometry), false);
  geometry.instanceCount = 0;
  geometry.indirect = new THREE.IndirectStorageBufferAttribute(new Uint32Array([6, 0, 0, 0, 0]), 5);
  assert.equal(isEmptyInstancedDraw(mesh, geometry), false, 'a GPU-written count can be nonzero after compute');
  assert.equal(isEmptyInstancedDraw(new THREE.Mesh(new THREE.PlaneGeometry()), undefined), false);
  geometry.dispose(); instances.geometry.dispose();
});

test('renderer skips empty preparation, permits warmup, and restores after its last owner', () => {
  const calls = [];
  const renderer = { renderObject(...args) { calls.push({ receiver: this, args }); return 42; } };
  const original = renderer.renderObject;
  const first = installEmptyDrawSkip(renderer), second = installEmptyDrawSkip(renderer);
  const object = { isInstancedMesh: true, count: 0 };
  assert.equal(renderer.renderObject(object, 'scene', 'camera', {}, 'material'), undefined);
  assert.equal(calls.length, 0);
  object.count = 1; // DrawPreparation and SceneWarmup temporarily promote empties.
  assert.equal(renderer.renderObject(object, 'scene', 'camera', {}, 'material'), 42);
  assert.equal(calls[0].receiver, renderer);
  assert.deepEqual(calls[0].args.slice(1), ['scene', 'camera', {}, 'material']);
  first.dispose(); first.dispose();
  assert.notEqual(renderer.renderObject, original);
  second.dispose();
  assert.equal(renderer.renderObject, original);
});

test('disposal preserves a newer renderer hook and recovery can reinstall', () => {
  const renderer = { renderObject() {} };
  const previous = installEmptyDrawSkip(renderer);
  const replacement = () => 7;
  renderer.renderObject = replacement;
  previous.dispose();
  assert.equal(renderer.renderObject, replacement);
  const recovered = installEmptyDrawSkip(renderer);
  assert.equal(renderer.renderObject({}, null, null, {}), 7);
  recovered.dispose();
  assert.equal(renderer.renderObject, replacement);
});
