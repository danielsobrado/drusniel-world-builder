import assert from 'node:assert/strict';
import test from 'node:test';
import { DensityGrid } from '../src/editor/locations/gen/DensityGrid.js';
import { bakeLighting, bakeLightingSteps, SHADE_SIZE } from '../src/editor/locations/gen/LightBake.js';
import { createBounceField, createBounceFieldSteps, gatherBounceLight, gatherBounceLightSteps } from '../src/editor/locations/gen/IndirectBounce.js';
import { smoothAttribute, smoothAttributeSteps } from '../src/editor/locations/gen/SurfaceNets.js';
import { runLocationSteps } from '../src/editor/locations/gen/LocationWorkSteps.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture() {
  const grid = new DensityGrid({ min: { x: -6, y: -6, z: -6 }, max: { x: 6, y: 6, z: 6 }, voxel: 0.5 });
  grid.data.fill(4);
  const positions = new Float32Array(120), normals = new Float32Array(120);
  for (let i = 0; i < 40; i++) {
    positions.set([i % 2 ? -2 : 2, (i % 5) * 0.4, Math.floor(i / 5) * 0.3], i * 3);
    normals[i * 3] = i % 2 ? 1 : -1;
  }
  return { grid, positions, normals, lights: [{ x: 0, y: 1, z: 1, color: [2, 1, 0.7], range: 8 }],
    absorption: { rock: [3, 3, 3], ice: [0.6, 0.2, 0.1] },
    iceAt: v => (v % 3) / 2, mediumAt: (x, y, z) => Math.abs(x + y + z) % 1 };
}

async function sliced(iterator) {
  let tick = 0;
  return runLocationSteps(iterator, 1, { clock: () => ++tick, pause: async () => {} });
}

test('direct lighting preserves vertex jitter and all baked attributes across yields', async () => {
  const options = fixture();
  const expected = bakeLighting(options);
  assert.ok(expected.light.some(value => value > 0));
  assert.deepEqual(await sliced(bakeLightingSteps(options)), expected);
});

test('global bounce field and accumulation order survive slicing', async () => {
  const options = fixture();
  const direct = bakeLighting(options);
  const fieldOptions = { ...options, directLight: direct.light };
  const expected = createBounceField(fieldOptions);
  const actual = await sliced(createBounceFieldSteps(fieldOptions));
  assert.ok(expected.surfels.length > 0);
  assert.deepEqual(actual.surfels, expected.surfels);
  assert.deepEqual(actual.bins, expected.bins);
  const target = () => ({ positions: options.positions, normals: options.normals,
    light: direct.light.slice(), dir: direct.dir.slice(), shade: direct.shade.slice(), shadeSize: SHADE_SIZE });
  const a = target(), b = target();
  gatherBounceLight(expected, a);
  await sliced(gatherBounceLightSteps(actual, b));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.light, direct.light);
});

test('attribute smoothing preserves global accumulation and repeated passes', async () => {
  const indices = new Uint32Array([0, 1, 2, 2, 1, 3]);
  const a = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), b = a.slice();
  smoothAttribute(indices, a, 2, 3);
  await sliced(smoothAttributeSteps(indices, b, 2, 3));
  assert.deepEqual(a, b);
});

test('cancellation closes suspended work and never returns a partial result', async () => {
  const controller = new AbortController();
  let closed = false, tick = 0;
  function* work() {
    try { yield; return 1; } finally { closed = true; }
  }
  await assert.rejects(runLocationSteps(work(), 1, {
    signal: controller.signal, clock: () => ++tick, pause: async () => controller.abort(),
  }), { name: 'AbortError' });
  assert.equal(closed, true);
});

test('lighting is independently opt-in and validates its time target', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.lightingEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationIncrementalLighting=1').locationStructureBudget.lightingEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { lightingSliceMs: 0 } }), RangeError);
});
