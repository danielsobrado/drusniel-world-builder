import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three/webgpu';

import { TOWN_LOD_DEFAULTS, townSplits } from '../../src/editor/towns/TownLod.js';
import { TownModuleInstances } from '../../src/editor/towns/TownModuleInstances.js';
import { PerfCounters } from '../../src/editor/performance/qa/PerfCounters.js';

const material = new MeshBasicMaterial();
const geometry = { opaque: new BoxGeometry(), glass: [] };
// A row of 50 placements 10 m apart along x.
const values = new Float32Array(Array.from({ length: 50 }, (_, i) => [i * 10, 0, 0, 0]).flat());

function instances(far = geometry) {
  return new TownModuleInstances({ module: 'Wall', values, seeds: null, near: geometry, far,
    createMesh: (g, kind, count) => new InstancedMesh(g, material, count) });
}

test('only population-sized towns draw split', () => {
  assert.equal(townSplits(120), false);
  assert.equal(townSplits(TOWN_LOD_DEFAULTS.splitTownRadius + 1), true);
});

test('a split town draws the near kit round the viewer and the far kit for the rest', () => {
  const module = instances();
  module.split(0, 0, 95);
  const [nearMesh] = module.nearMeshes;
  const [farMesh] = module.farMeshes;
  assert.equal(nearMesh.count, 10);
  assert.equal(farMesh.count, 40);
  assert.ok(nearMesh.visible && farMesh.visible);
  const drawnX = (mesh) => Array.from({ length: mesh.count }, (_, k) => mesh.instanceMatrix.array[k * 16 + 12]);
  assert.deepEqual(drawnX(nearMesh).sort((a, b) => a - b), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.ok(drawnX(farMesh).every((x) => x >= 100));
  // Walking to the far end swaps them: each placement drawn by exactly one set.
  module.split(490, 0, 95);
  assert.equal(nearMesh.count, 10);
  assert.ok(drawnX(nearMesh).every((x) => x >= 400));
  assert.equal(farMesh.count, 40);
  const all = [...drawnX(nearMesh), ...drawnX(farMesh)].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 50 }, (_, i) => i * 10));
});

test('a small step re-picks only the slots that changed', () => {
  const module = instances();
  module.split(0, 0, 95);
  const before = Float32Array.from(module.farMeshes[0].instanceMatrix.array);
  module.split(10, 0, 95);      // placement 10 joins the near set, placement 0 stays
  const after = module.farMeshes[0].instanceMatrix.array;
  let changed = 0;
  for (let k = 0; k < 50; k += 1) if (before[k * 16 + 12] !== after[k * 16 + 12]) changed += 1;
  assert.ok(changed <= 2, `far set rewrote ${changed} slots`);
});

test('a module the far kit does not lighten stays whole and near', () => {
  const module = instances(null);
  module.split(0, 0, 95);
  assert.equal(module.nearMeshes[0].count, 50);
  assert.equal(module.farMeshes.length, 0);
});

test('large-town preparation yields and later small steps classify only local placements', () => {
  const packed = new Float32Array(10000 * 4);
  for (let i = 0; i < 10000; i++) packed[i * 4] = i * 10;
  const module = new TownModuleInstances({ module: 'Wall', values: packed, seeds: null, near: geometry, far: geometry,
    createMesh: (g, kind, count) => new InstancedMesh(g, material, count) });
  const job = module.splitJob(0, 0, 130);
  let turns = 0;
  while (!job.next().done) { turns++; assert.equal(module.nearMeshes[0].count + module.farMeshes[0].count, 20000); }
  assert.ok(turns > 100);
  assert.equal(module.nearMeshes[0].count + module.farMeshes[0].count, 10000);
  PerfCounters.reset(); module.split(8, 0, 130);
  assert.ok(PerfCounters.get('townLodPlacementsEvaluated') < 30);
  assert.equal(module.nearMeshes[0].count + module.farMeshes[0].count, 10000);
  for (const mesh of module.meshes) mesh.dispose();
});

test('a building on the ring keeps its kit while the viewer moves back and forth', () => {
  const module = instances();
  module.split(0, 0, 95);
  const nearCount = () => module.nearMeshes[0].count;
  assert.equal(nearCount(), 10);
  module.split(-8, 0, 95);      // placement at x=90 is now 98 m away: inside the band, stays near
  assert.equal(nearCount(), 10);
  module.split(0, 0, 95);
  assert.equal(nearCount(), 10);
  module.split(-40, 0, 95);     // well past the band it does swap
  assert.ok(nearCount() < 10);
});
