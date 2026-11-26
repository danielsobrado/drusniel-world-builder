import assert from 'node:assert/strict';
import test from 'node:test';
import { createCameraChunkDistance } from '../src/editor/stylized/lod/chunkLodDistance.js';
import { buildChunkLodPlan } from '../src/editor/stylized/lod/StylizedLodRuntime.js';

function planAt({ x, z, origin = { x: 0, z: 0 }, distanceFromCamera = true }) {
  const camera = { position: { x, y: 10, z }, fov: 68 };
  return buildChunkLodPlan({
    focus: { chunkX: 0, chunkZ: 0 }, radius: 6, chunkWorldSize: 128,
    camera, floatingOrigin: { getState: () => origin },
    viewportHeight: 720, objectHeight: 16,
    thresholds: { nearPixels: 32, proxyPixels: 8, impostorPixels: 2, clusterPixels: 0 },
    radii: {
      meshRadius: 1, proxyRadius: 1, impostorRadius: 5, clusterRadius: 5,
      forceNearWithinMeshRadius: true,
    },
    transitionStates: new Map(), timestamp: 0, transitionMs: 320,
    distanceForChunk: distanceFromCamera ? createCameraChunkDistance(camera, origin, 128) : null,
  });
}

function band(plan, x, z) {
  return plan.entries.find((entry) => entry.chunkX === x && entry.chunkZ === z).band;
}

test('trees beside an offset editor camera keep full geometry outside the editing focus ring', () => {
  const plan = planAt({ x: 150, z: 150 });
  assert.equal(band(plan, 1, -2), 'near');
  assert.equal(band(plan, 0, -2), 'near');
  assert.equal(band(plan, -2, 2), 'impostor');
});

test('close chunk edges retain detail while the streaming focus catches up', () => {
  const plan = planAt({ x: 129, z: -64 });
  assert.equal(band(plan, 2, 0), 'near');
  assert.equal(band(plan, -2, 0), 'impostor');
});

test('camera chunk distance is invariant under floating-origin rebasing', () => {
  const original = planAt({ x: 150, z: 150 });
  const rebased = planAt({ x: 150 - 4096, z: 150 + 4096, origin: { x: 4096, z: -4096 } });
  assert.deepEqual(rebased.entries.map((entry) => entry.band), original.entries.map((entry) => entry.band));
});

test('camera-based near windows fit the existing radius-plus-one buffer allocation', () => {
  for (const x of [-128, -1, 0, 127, 128, 150]) {
    for (const z of [-128, -1, 0, 127, 128, 150]) {
      const plan = planAt({ x, z });
      assert.ok(plan.entries.filter((entry) => entry.band === 'near').length <= 25);
    }
  }
});

test('other layers keep the existing focus-based radius policy by default', () => {
  const plan = planAt({ x: 150, z: 150, distanceFromCamera: false });
  assert.equal(band(plan, 1, -2), 'impostor');
  assert.equal(band(plan, 0, 0), 'near');
});

test('regional pressure demotes distant detail but preserves the protected ring', () => {
  const options = {
    focus: { chunkX: 0, chunkZ: 0 }, radius: 3, chunkWorldSize: 128,
    camera: { position: { x: 64, y: 8, z: -64 }, fov: 68 },
    floatingOrigin: { getState: () => ({ x: 0, z: 0 }) },
    viewportHeight: 720, objectHeight: 16,
    thresholds: { nearPixels: 32, proxyPixels: 8, impostorPixels: 2, clusterPixels: 0 },
    radii: { meshRadius: 3, proxyRadius: 4, impostorRadius: 5, clusterRadius: 5 },
    timestamp: 0, transitionMs: 320,
  };
  const baseline = buildChunkLodPlan({ ...options, transitionStates: new Map() });
  const pressured = buildChunkLodPlan({ ...options, transitionStates: new Map(),
    regionalLodFactor: 0.5, protectedChunkRadius: 1 });
  assert.equal(band(baseline, 1, 1), 'near');
  assert.equal(band(pressured, 1, 1), 'near');
  assert.equal(band(baseline, 2, 0), 'near');
  assert.equal(band(pressured, 2, 0), 'proxy');
});

test('spatial pressure is applied only to the selected unprotected chunk', () => {
  const options = {
    focus: { chunkX: 0, chunkZ: 0 }, radius: 3, chunkWorldSize: 128,
    camera: { position: { x: 64, y: 8, z: -64 }, fov: 68 },
    floatingOrigin: { getState: () => ({ x: 0, z: 0 }) },
    viewportHeight: 720, objectHeight: 16,
    thresholds: { nearPixels: 32, proxyPixels: 8, impostorPixels: 2, clusterPixels: 0 },
    radii: { meshRadius: 3, proxyRadius: 4, impostorRadius: 5, clusterRadius: 5 },
    timestamp: 0, transitionMs: 320, transitionStates: new Map(),
    protectedChunkRadius: 1,
    regionalSpatialBudget: { factorForKey: key => key === '2:0' || key === '1:0' ? 0.5 : 1 },
  };
  const plan = buildChunkLodPlan(options);
  assert.equal(band(plan, 1, 0), 'near');
  assert.equal(band(plan, 2, 0), 'proxy');
  assert.equal(band(plan, -2, 0), 'near');
});

test('geometry cost planning retains the unpressured band independently of selected LOD', () => {
  const options = {
    focus: { chunkX: 0, chunkZ: 0 }, radius: 3, chunkWorldSize: 128,
    camera: { position: { x: 64, y: 8, z: -64 }, fov: 68 },
    floatingOrigin: { getState: () => ({ x: 0, z: 0 }) },
    viewportHeight: 720, objectHeight: 16,
    thresholds: { nearPixels: 32, proxyPixels: 8, impostorPixels: 2, clusterPixels: 0 },
    radii: { meshRadius: 3, proxyRadius: 4, impostorRadius: 5, clusterRadius: 5 },
    timestamp: 0, transitionMs: 320, protectedChunkRadius: 1,
  };
  const plain = buildChunkLodPlan({ ...options, transitionStates: new Map() });
  const plan = buildChunkLodPlan({ ...options, transitionStates: new Map(),
    regionalSpatialBudget: { geometryCosts: true, factorForKey: key => key === '2:0' ? 0.5 : 1 } });
  const entry = plan.entries.find(item => item.chunkX === 2 && item.chunkZ === 0);
  assert.equal(plain.entries.find(item => item.chunkX === 2 && item.chunkZ === 0).baselineBand, undefined);
  assert.equal(entry.baselineBand, 'near');
  assert.equal(entry.band, 'proxy');
  assert.equal(band(plan, -2, 0), 'near');
});
