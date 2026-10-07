import assert from 'node:assert/strict';
import test from 'node:test';
import { InfiniteWorldStore } from '../src/editor/world/InfiniteWorldStore.js';
import { SpatialOverrideMap } from '../src/editor/world/SpatialOverrideMap.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { WorkerBackedWorldStore } from '../src/editor/world/WorkerBackedWorldStore.js';
import { generateBaseWorldChunk } from '../src/editor/world/generateWorldChunk.js';
import { sampleWorldStoreWater } from '../src/editor/water/TerrainWaterQueries.js';
import { enrichPageWaterField } from '../src/editor/water/WaterField.js';
import { enrichPageRenderPixels } from '../src/editor/world/ChunkRenderPixels.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ hold = false, contentProvider = null } = {}) {
  const generator = new ProceduralWorldGenerator({ seed: 73 });
  const jobs = [];
  const worker = { dispose() {}, request(x, z, options) {
    const page = generateBaseWorldChunk({ chunkX: x, chunkZ: z, chunkSize: 4,
      generator: generator.toMetadata(), terrainOverrides: options.terrainOverrides });
    return new Promise(resolve => {
      jobs.push({ options, page, release: () => resolve(page) });
      if (!hold) resolve(page);
    });
  } };
  const store = new WorkerBackedWorldStore({ chunkSize: 4, tileSize: 2, generator, chunkWorker: worker, contentProvider });
  return { store, jobs };
}

test('authored sampling bypasses world-string lookups in edited and untouched chunks', () => {
  const store = new InfiniteWorldStore({ chunkSize: 4, tileSize: 2 });
  store.setTile(-1, -1, 9); store.setHeight(-4, 0, 23.125);
  store.tileOverrides.get = store.heightOverrides.get = () => { throw new Error('World-string lookup'); };
  assert.equal(store.getTile(-1, -1), 9);
  assert.equal(store.getHeight(-4, 0), 23.125);
  for (let x = 32; x < 48; x++) {
    assert.equal(store.getTile(x, 8), store.generator.sampleTile(x, 8));
    assert.equal(store.getHeight(x, 8), store.generator.sampleHeight(x, 8));
  }
});

test('override blocks track direct Map edits, deletions, negative borders and restoration', () => {
  const map = new SpatialOverrideMap(4);
  assert.equal(map.getAt(-1, -1), undefined); // Cached negative block.
  map.set('-1:-1', 0); map.set('-4:0', 12);
  assert.equal(map.getAt(-1, -1), 0);
  assert.deepEqual(map.entriesInRect(-4, 0, -1, 0).sort(), [[-4, 0, 12], [-1, -1, 0]].sort());
  const before = map.signature(-4, 0, -4, 0);
  map.delete('-1:-1');
  assert.equal(map.getAt(-1, -1), undefined);
  assert.ok(map.signature(-4, 0, -4, 0) > before);
  map.clear(); assert.equal(map.getAt(-4, 0), undefined);
  const store = new InfiniteWorldStore({ chunkSize: 4, tileSize: 2 });
  store.setTile(-4, 0, 9); store.setHeight(0, -4, 23.125);
  const snapshot = store.createSnapshot(); const document = store.toDocument();
  store.clearOverrides(); store.restoreSnapshot(snapshot);
  assert.equal(store.getTile(-4, 0), 9); assert.equal(store.getHeight(0, -4), 23.125);
  store.clearOverrides(); store.loadDocument(document);
  assert.equal(store.getTile(-4, 0), 9); assert.equal(store.getHeight(0, -4), 23.125);
});

test('undo after installing edited prepared samples reveals procedural terrain and heights', () => {
  const store = new InfiniteWorldStore({ chunkSize: 4, tileSize: 2 });
  const tile = store.generator.sampleTile(1, 1); const height = store.generator.sampleHeight(1, 1);
  store.setTile(1, 1, tile === 9 ? 4 : 9); store.setHeight(1, 1, 23.125);
  const tiles = new Uint8Array(16).fill(9); const heights = new Float64Array(25).fill(23.125);
  store.installPreparedSamples({ chunkX: 0, chunkZ: 0, tiles, canonicalHeights: heights });
  store.setTile(1, 1, tile); store.setHeight(1, 1, height);
  assert.equal(store.getTile(1, 1), tile); assert.equal(store.getHeight(1, 1), height);
});

test('worker sparse halo edits produce the same height, water and surface pixels as canonical queries', async () => {
  const { store, jobs } = fixture();
  store.setTile(-1, 0, 0); store.setTile(1, 1, 9);
  store.setHeight(4, 4, 18.125); store.setHeight(-1, 0, -12.5);
  store.setTile(4096, -4096, 9);
  store.refreshPageRenderPixels = () => { throw new Error('Main-thread derived fields'); };
  const page = await store.requestChunk(0, 0);
  assert.equal(jobs[0].options.terrainOverrides.tiles.length, 2);
  assert.equal(page.heights[24], 18.125);
  const reference = { ...page };
  enrichPageWaterField(reference, (x, z) => sampleWorldStoreWater(store, x, z));
  enrichPageRenderPixels(reference, (x, z) => store.getTile(x, z),
    { ...store.surfaceMaskConfig, worldSeed: 73 }, id => store.generator.getTileDefinition?.(id));
  assert.deepEqual(page.waterFieldPixels, reference.waterFieldPixels);
  assert.deepEqual(page.waterFlowPixels, reference.waterFlowPixels);
  assert.deepEqual(page.surfaceMaskPixels, reference.surfaceMaskPixels);
  const neighbor = await store.requestChunk(1, 1);
  assert.equal(neighbor.heights[0], page.heights[24]);
  store.dispose();
});

test('an edit during generation supersedes the stale worker result before caching', async () => {
  const { store, jobs } = fixture({ hold: true });
  const pending = store.requestChunk(0, 0); await tick();
  store.setTile(1, 1, 9); jobs[0].release(); await tick();
  assert.equal(jobs.length, 2); assert.equal(store.cache.size, 0);
  jobs[1].release(); const page = await pending;
  assert.equal(page.tiles[5], 9); assert.equal(store.cache.get('0:0'), page);
  store.dispose();
});

test('unrelated edits neither scan global overrides nor restart an in-flight terrain page', async () => {
  const { store, jobs } = fixture({ hold: true });
  store.setTile(4096, -4096, 9);
  store.tileOverrides[Symbol.iterator] = () => { throw new Error('Global override scan'); };
  const pending = store.requestChunk(0, 0); await tick();
  store.setHeight(8192, 8192, 1.25); jobs[0].release(); await pending;
  assert.equal(jobs.length, 1); assert.deepEqual(jobs[0].options.terrainOverrides, { tiles: [], heights: [] });
  store.dispose();
});

test('edits while content loads and cached halo changes are also worker-resolved', async () => {
  let releaseContent;
  const content = new Promise(resolve => { releaseContent = resolve; });
  const { store, jobs } = fixture({ contentProvider: { getChunk: () => content, dispose() {} } });
  const pending = store.requestChunk(0, 0); await tick();
  store.setTile(1, 1, 9); releaseContent({ entities: [] });
  const page = await pending;
  assert.equal(page.tiles[5], 9); assert.equal(jobs.length, 2);
  store.setTile(-1, 0, 0);
  const updated = await store.requestChunk(0, 0);
  assert.notEqual(updated, page); assert.equal(jobs.length, 3);
  store.dispose();
});
