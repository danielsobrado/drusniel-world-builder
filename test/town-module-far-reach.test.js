import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three/webgpu';
import { TownModuleInstances, seedColour } from '../src/editor/towns/TownModuleInstances.js';

function props(xs, farReach) {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const values = new Float32Array(xs.flatMap((x) => [x, 0, 0, 0]));
  const instances = new TownModuleInstances({
    module: 'Barrel', values, seeds: null, farReach,
    near: { opaque: geometry, glass: [] }, far: { opaque: geometry, glass: [] },
    createMesh: (g, kind, count) => new InstancedMesh(g, material, count),
  });
  return instances;
}

test('a split town draws a prop near, then far, then not at all', () => {
  const instances = props([0, 200, 1000], 320);
  instances.split(0, 0, 130);
  assert.equal(instances.nearSlots.count, 1);
  assert.equal(instances.farSlots.count, 1);
  assert.equal(instances.farMeshes[0].count, 1);
  // Walking up to the far prop brings it in and the first one back to the far kit.
  instances.split(800, 0, 130);
  assert.deepEqual([...instances.farSlots.placementAt.subarray(0, instances.farSlots.count)], [2]);
  assert.equal(instances.nearSlots.count, 0);
  instances.split(1000, 0, 130);
  assert.equal(instances.nearSlots.count, 1);
  assert.equal(instances.farSlots.count, 0);
});

test('a module with no far reach keeps every placement drawn', () => {
  const instances = props([0, 200, 1000], Infinity);
  instances.split(0, 0, 130);
  instances.split(1000, 0, 130);
  assert.equal(instances.nearSlots.count + instances.farSlots.count, 3);
});

test('the far kit casts no shadow: it starts past the sun shadow range', () => {
  const instances = props([0], Infinity);
  assert.equal(instances.nearMeshes[0].castShadow, false); // createMesh here leaves it to TownMesh
  instances.nearMeshes[0].castShadow = true;
  assert.equal(instances.farMeshes[0].castShadow, false);
});

test('a ground-floor seed keeps its building tone and marks the half step', () => {
  for (const roll of [0, 0.13, 0.5, 0.99]) {
    const upper = seedColour(roll), ground = seedColour(roll + 1);
    for (const i of [1, 2]) assert.ok(Math.abs(upper[i] - ground[i]) < 1e-6);
    const decode = (x) => (x - 0.9) * 80 + 0.1;
    assert.equal(Math.floor(decode(upper[0])), Math.floor(decode(ground[0])));
    assert.ok(decode(upper[0]) % 1 < 0.3);
    assert.ok(decode(ground[0]) % 1 >= 0.3);
  }
});
