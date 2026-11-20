import assert from 'node:assert/strict';
import test from 'node:test';

import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { WorkerBackedWorldStore } from '../src/editor/world/WorkerBackedWorldStore.js';
import { createEditedChunkSampling } from '../src/editor/world/EditedChunkSampling.js';
import { createWaterField } from '../src/editor/water/WaterField.js';

const CHUNK_SIZE = 8;

function createStore({ chunkWorker, contentProvider = null }) {
  return new WorkerBackedWorldStore({
    chunkWorker: {
      setBaseTerrain() {},
      dispose() {},
      ...chunkWorker,
    },
    contentProvider,
    chunkSize: CHUNK_SIZE,
    tileSize: 2,
    cacheLimit: 4,
    generator: new ProceduralWorldGenerator(),
  });
}

function createPage(chunkX, chunkZ) {
  return {
    key: `${chunkX}:${chunkZ}`,
    chunkX,
    chunkZ,
    originX: chunkX * CHUNK_SIZE,
    originZ: chunkZ * CHUNK_SIZE,
    tiles: new Uint8Array(CHUNK_SIZE ** 2),
    heights: new Float32Array((CHUNK_SIZE + 1) ** 2),
    tilePixels: new Uint8Array(CHUNK_SIZE ** 2 * 4),
    surfaceMaskPixels: new Uint8Array((CHUNK_SIZE + 1) ** 2 * 4),
    waterFieldPixels: new Uint16Array((CHUNK_SIZE + 1) ** 2 * 4),
    waterFlowPixels: new Uint8Array((CHUNK_SIZE + 1) ** 2 * 4),
    waterAppearancePixels: new Uint8Array((CHUNK_SIZE + 1) ** 2 * 4),
  };
}

function retryableError(message) {
  const error = new Error(message);
  error.retryable = true;
  return error;
}

test('a headland painted beyond the surface mask halo refreshes worker exposure', async () => {
  const diffraction = { enabled: true, latticeStepMeters: 16, rayReachMeters: 80 };
  const ocean = () => ({ kind: 1, coverage: 1, surfaceHeight: 0, bedHeight: -2, shoreDistance: 12 });
  const generator = { sampleTile: () => 0, sampleHeight: () => -2,
    sampleWater: ocean, sampleWaterSurface: ocean, seaLevel: 0 };
  const store = createStore({
    chunkWorker: {
      seaDiffractionConfig: diffraction,
      async request(chunkX, chunkZ, { terrainOverrides }) {
        const page = createPage(chunkX, chunkZ);
        const sampling = createEditedChunkSampling(generator, CHUNK_SIZE, terrainOverrides);
        page.waterAppearancePixels = createWaterField({
          originX: page.originX, originZ: page.originZ, chunkSize: CHUNK_SIZE,
          sampleWater: sampling.sampleWater, sampleOceanSurface: sampling.sampleWaterSurface,
          tileSizeMeters: 2, diffraction,
        }).appearancePixels;
        return page;
      },
    },
  });
  store.generator = generator;
  try {
    const open = await store.requestChunk(0, 0);
    store.paintSquare(35, 0, 16, 4);
    const sheltered = await store.requestChunk(0, 0);
    assert.ok(sheltered.waterAppearancePixels[3] < open.waterAppearancePixels[3]);
    store.paintSquare(35, 0, 16, 0);
    const reopened = await store.requestChunk(0, 0);
    assert.equal(reopened.waterAppearancePixels[3], open.waterAppearancePixels[3]);
  } finally {
    store.dispose();
  }
});

test('synchronous worker failures are returned as rejected chunk promises', async () => {
  const store = createStore({
    chunkWorker: {
      request() { throw new Error('worker unavailable'); },
    },
  });

  try {
    const request = store.requestChunk(0, 0);
    assert.ok(request instanceof Promise);
    await assert.rejects(request, /worker unavailable/);
    assert.equal(store.pendingChunks.size, 0);
  } finally {
    store.dispose();
  }
});

test('transient worker channel failures retry once and populate the cache', async () => {
  let calls = 0;
  const store = createStore({
    chunkWorker: {
      request() {
        calls += 1;
        if (calls === 1) return Promise.reject(retryableError('worker crashed'));
        return Promise.resolve(createPage(0, 0));
      },
    },
  });

  try {
    const page = await store.requestChunk(0, 0);
    assert.equal(calls, 2);
    assert.equal(page.key, '0:0');
    assert.equal(store.cache.get('0:0'), page);
    assert.equal(store.pendingChunks.size, 0);
  } finally {
    store.dispose();
  }
});

test('worker channel retries are bounded to one retry', async () => {
  let calls = 0;
  const store = createStore({
    chunkWorker: {
      request() {
        calls += 1;
        return Promise.reject(retryableError('worker keeps crashing'));
      },
    },
  });

  try {
    await assert.rejects(store.requestChunk(0, 0), /worker keeps crashing/);
    assert.equal(calls, 2);
    assert.equal(store.pendingChunks.size, 0);
    assert.equal(store.cache.size, 0);
  } finally {
    store.dispose();
  }
});

test('synchronous content-provider failures are returned as rejected chunk promises', async () => {
  const store = createStore({
    chunkWorker: {
      request() { return new Promise(() => {}); },
    },
    contentProvider: {
      getChunk() { throw new Error('content unavailable'); },
      dispose() {},
    },
  });

  try {
    const request = store.requestChunk(0, 0);
    assert.ok(request instanceof Promise);
    await assert.rejects(request, /content unavailable/);
    assert.equal(store.pendingChunks.size, 0);
  } finally {
    store.dispose();
  }
});

test('worker pages with mismatched chunk identity never enter the cache', async () => {
  const store = createStore({
    chunkWorker: {
      request() { return Promise.resolve(createPage(1, 0)); },
    },
  });

  try {
    await assert.rejects(store.requestChunk(0, 0), /mismatched page metadata/);
    assert.equal(store.pendingChunks.size, 0);
    assert.equal(store.cache.size, 0);
  } finally {
    store.dispose();
  }
});

test('worker pages with invalid typed-array sizes never enter the cache', async () => {
  const invalidPage = createPage(0, 0);
  invalidPage.heights = new Float32Array(1);
  const store = createStore({
    chunkWorker: {
      request() { return Promise.resolve(invalidPage); },
    },
  });

  try {
    await assert.rejects(store.requestChunk(0, 0), /invalid height data/);
    assert.equal(store.pendingChunks.size, 0);
    assert.equal(store.cache.size, 0);
  } finally {
    store.dispose();
  }
});

test('in-flight chunk completions cannot repopulate a disposed store', async () => {
  let releaseContent;
  const content = new Promise((resolve) => {
    releaseContent = resolve;
  });
  const store = createStore({
    chunkWorker: {
      request() { return Promise.resolve(createPage(0, 0)); },
    },
    contentProvider: {
      getChunk() { return content; },
      dispose() {},
    },
  });

  const request = store.requestChunk(0, 0);
  await Promise.resolve();
  store.dispose();
  releaseContent({ entities: [] });

  await assert.rejects(
    request,
    (error) => error?.cancelled === true && /store disposal/.test(error.message),
  );
  assert.equal(store.pendingChunks.size, 0);
  assert.equal(store.cache.size, 0);
});

test('chunk requests after disposal are rejected without touching the worker', async () => {
  let calls = 0;
  const store = createStore({
    chunkWorker: {
      request() {
        calls += 1;
        return Promise.resolve(createPage(0, 0));
      },
    },
  });

  store.dispose();

  await assert.rejects(
    store.requestChunk(0, 0),
    (error) => error?.cancelled === true && /after store disposal/.test(error.message),
  );
  assert.equal(calls, 0);
  assert.equal(store.cache.size, 0);
});

test('continuous edits coalesce into one quiet-period regeneration and preserve the last cached page', async () => {
  const requests = [];
  const store = createStore({ chunkWorker: { request(x, z, options) {
    return new Promise(resolve => requests.push({ options, resolve: () => resolve(createPage(x, z)) }));
  } } });
  const turn = () => new Promise(resolve => setImmediate(resolve));
  try {
    const first = store.requestChunk(0, 0); await turn(); requests[0].resolve();
    const visible = await first;
    store.tileOverrides.set('0:0', 1);
    const pending = store.requestChunk(0, 0); await turn();
    for (let i = 2; i <= 10; i++) {
      store.tileOverrides.set('0:0', i);
      assert.equal(store.requestChunk(0, 0), pending);
    }
    requests[1].resolve(); await turn();
    assert.equal(requests.length, 2, 'stale completions do not immediately start another worker');
    assert.equal(store.cache.get('0:0'), visible);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[2].options.terrainOverrides.tiles, [[0, 0, 10]]);
    requests[2].resolve();
    const latest = await pending;
    assert.equal(latest.editState.tileVersion, store.pageEditState(0, 0).tileVersion);
    assert.equal(requests.length, 3);
  } finally { store.dispose(); }
});
