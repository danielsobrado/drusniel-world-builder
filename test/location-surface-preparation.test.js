import assert from 'node:assert/strict';
import test from 'node:test';
import { DensityGrid } from '../src/editor/locations/gen/DensityGrid.js';
import { extractSurface } from '../src/editor/locations/gen/SurfaceNets.js';
import { extractSurfaceCooperatively, prepareLocationSurface } from '../src/editor/locations/gen/LocationSurfacePreparation.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

const settings = resolveRenderEnhancements().locationStructureBudget;

function fixture() {
  const grid = new DensityGrid({ min: { x: -5, y: -4, z: -9 }, max: { x: 5, y: 4, z: 9 }, voxel: 0.5 });
  for (let z = 1; z < grid.nz - 1; z++) {
    for (let y = 1; y < grid.ny - 1; y++) {
      for (let x = 1; x < grid.nx - 1; x++) {
        grid.data[x + y * grid.sy + z * grid.sz] = 3 - Math.hypot(x - 10 + Math.sin(z), y - 8);
      }
    }
  }
  return grid;
}

function workerFixture({ fail = false, invalid = false } = {}) {
  const handlers = new Map();
  return {
    terminated: false,
    addEventListener(type, callback) { handlers.set(type, callback); },
    postMessage(input, transfer) {
      assert.deepEqual(transfer, [input.data.buffer]);
      const copy = structuredClone(input, { transfer });
      assert.equal(input.data.byteLength, 0);
      if (fail) handlers.get('error')({ message: 'test failure', preventDefault() {} });
      else if (invalid) handlers.get('message')({ data: { surface: {} } });
      else {
        const grid = Object.assign(Object.create(DensityGrid.prototype), copy);
        const surface = extractSurface(grid);
        handlers.get('message')({ data: { surface } });
      }
    },
    terminate() { this.terminated = true; },
  };
}

test('cooperative surface extraction is deterministic across slice boundaries', async () => {
  const grid = fixture(), expected = extractSurface(grid);
  let tick = 0, yields = 0;
  const actual = await extractSurfaceCooperatively(grid, 4, {
    clock: () => ++tick,
    pause: async () => { yields++; },
  });
  assert.ok(yields > 1);
  assert.ok(expected.indices.length > 0);
  assert.deepEqual(actual, expected);
});

test('rolling slabs preserve a closed multi-slice surface without unpaired edges', () => {
  const grid = fixture();
  // Seal the end slices, including their neighboring interior samples.
  for (const z of [1, grid.nz - 2]) grid.data.fill(-grid.cap, z * grid.sz, (z + 1) * grid.sz);
  const { indices, positions } = extractSurface(grid);
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const a = indices[i + c], b = indices[i + (c + 1) % 3];
      assert.ok(a < positions.length / 3 && b < positions.length / 3);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok(edges.size > 0);
  assert.ok([...edges.values()].every(count => count === 2));
});

test('worker transfers only a density copy and returns identical geometry', async () => {
  const grid = fixture(), original = grid.data.slice(), worker = workerFixture();
  const actual = await prepareLocationSurface(grid, settings, { workerFactory: () => worker });
  assert.deepEqual(actual, extractSurface(grid));
  assert.deepEqual(grid.data, original);
  assert.equal(worker.terminated, true);
});

test('worker errors and malformed responses fall back and release the worker', async () => {
  const grid = fixture(), expected = extractSurface(grid);
  for (const options of [{ fail: true }, { invalid: true }]) {
    const worker = workerFixture(options);
    const result = await prepareLocationSurface(grid, settings, { workerFactory: () => worker });
    assert.deepEqual(result, expected);
    assert.equal(worker.terminated, true);
  }
});

test('copy budget and explicit disable avoid creating a worker', async () => {
  const grid = fixture();
  const workerFactory = () => assert.fail('worker must not start');
  for (const override of [{ generationMaxCopyBytes: 0 }, { generationWorker: false }]) {
    assert.deepEqual(await prepareLocationSurface(grid, { ...settings, ...override }, { workerFactory }), extractSurface(grid));
  }
});

test('worker timeout falls back and terminates a stalled worker', async () => {
  const grid = fixture();
  const worker = { terminated: false, addEventListener() {}, postMessage() {}, terminate() { this.terminated = true; } };
  const result = await prepareLocationSurface(grid, { ...settings, generationWorkerTimeoutMs: 1 }, { workerFactory: () => worker });
  assert.deepEqual(result, extractSurface(grid));
  assert.equal(worker.terminated, true);
});

test('incremental generation is opt-in and validates budgets', () => {
  assert.equal(settings.generationEnabled, false);
  const options = resolveRenderEnhancements({}, '?locationIncrementalGeneration=1&locationGenerationWorker=0').locationStructureBudget;
  assert.equal(options.generationEnabled, true);
  assert.equal(options.generationWorker, false);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { generationMaxCopyBytes: 1.5 } }), RangeError);
});

test('aborted cooperative extraction rejects before publishing a surface', async () => {
  const grid = fixture(), controller = new AbortController();
  let tick = 0;
  await assert.rejects(extractSurfaceCooperatively(grid, 1, {
    signal: controller.signal, clock: () => ++tick,
    pause: async () => controller.abort(),
  }), { name: 'AbortError' });
});

test('abort during worker execution terminates it without cooperative fallback', async () => {
  const grid = fixture(), controller = new AbortController();
  let terminated = 0, posted;
  const ready = new Promise(resolve => { posted = resolve; });
  const worker = { addEventListener() {}, postMessage() { posted(); }, terminate() { terminated++; } };
  const pending = prepareLocationSurface(grid, settings, { signal: controller.signal, workerFactory: () => worker });
  await ready;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(terminated, 1);
});

test('already aborted preparation never starts a worker', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(prepareLocationSurface(fixture(), settings, {
    signal: controller.signal, workerFactory: () => assert.fail('worker must not start'),
  }), { name: 'AbortError' });
});
