import assert from 'node:assert/strict';
import test from 'node:test';
import { InfiniteWorldStore } from '../src/editor/world/InfiniteWorldStore.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { PreparedPlacementStore } from '../src/editor/world/PreparedPlacementStore.js';
import { generatePreparedPlacementChunk } from '../src/editor/world/PreparedPlacementChunk.js';
import { StylizedChunkRevisionTracker } from '../src/editor/stylized/StylizedChunkRevisionTracker.js';

const config = { trees: { habitat: {} }, rocks: {}, water: {}, path: {} };

function fixture() {
  const generator = new ProceduralWorldGenerator({ seed: 123 });
  const world = new InfiniteWorldStore({ generator, chunkSize: 4, tileSize: 2 });
  const revisions = new StylizedChunkRevisionTracker({ worldStore: world });
  const requests = [], cancelled = [];
  world.chunkWorker = {
    request(x, z, options) {
      return new Promise(resolve => requests.push({ x, z, options, resolve }));
    },
    cancel(...args) { cancelled.push(args); },
    reprioritize() {},
  };
  const store = new PreparedPlacementStore({ worldStore: world, revisionTracker: revisions, config, limit: 9 });
  const complete = async () => {
    for (const request of requests.splice(0)) request.resolve(generatePreparedPlacementChunk({
      chunkX: request.x, chunkZ: request.z, chunkSize: 4,
      placementSamplingConfig: request.options.placementSamplingConfig,
    }, generator));
    await Promise.resolve(); store.flush();
  };
  const dispose = () => { store.dispose(); revisions.dispose(); };
  return { world, store, requests, cancelled, complete, dispose };
}

test('ready precise samples survive eviction from the separate canonical terrain memo', async () => {
  const f = fixture();
  f.store.request(-1, -1, 0); await f.complete();
  const height = f.world.getHeight(-2, -3), tile = f.world.getTile(-2, -3);
  f.world.generatedHeightBlocks.clear(); f.world.lastHeightBlock = null;
  f.world.generatedTileBlocks.clear(); f.world.lastTileBlock = null;
  f.world.generator.sampleHeight = f.world.generator.sampleTile = () => { throw new Error('Unexpected procedural fallback'); };
  assert.equal(f.world.getHeight(-2, -3), height);
  assert.equal(f.world.getTile(-2, -3), tile);
  f.world.heightOverrides.set('-2:-3', 42);
  f.world.tileOverrides.set('-2:-3', 32);
  assert.equal(f.world.getHeight(-2, -3), 42);
  assert.equal(f.world.getTile(-2, -3), 32);
  f.dispose();
});

test('focus change cancels obsolete jobs, ignores late results and pins the dependency window', async () => {
  const f = fixture();
  f.store.setWindow(0, 0, 1);
  f.store.ensureChunk(0, 0, 1);
  const old = [...f.requests];
  f.store.setWindow(10, 10, 1);
  assert.equal(f.store.pending.size, 0);
  assert.equal(f.cancelled.filter(args => args[2] === 'placement:').length, 18);
  await f.complete();
  assert.equal(f.store.entries.size, 0);
  assert.equal(old.length, 9);
  f.store.ensureChunk(10, 10, 1); await f.complete();
  assert.equal(f.store.entries.size, 9);
  assert.equal(f.store.ensureChunk(10, 10, 1), true);
  assert.throws(() => f.store.setWindow(10, 10, 2), /dependency window/);
  f.store.request(30, 30, 0);
  assert.equal(f.store.pending.size, 0);
  assert.ok(f.store.arrayBytes > 0);
  f.dispose();
  assert.equal(f.store.arrayBytes, 0);
  assert.equal(f.world.preparedPlacementSamples, null);
});
