import assert from 'node:assert/strict';
import test from 'node:test';
import { spatialResourceSnapshot, spatialResourceBytes } from '../src/editor/performance/qa/SpatialResourceSnapshot.js';
import { spatialRendererSnapshot } from '../src/editor/performance/qa/SpatialRendererSnapshot.js';

test('assigned slot resources distinguish accounted, estimated, unknown, shared and unallocated textures', () => {
  const actual = {}, estimated = { image: { data: new Uint8Array(64) }, generateMipmaps: false };
  const shared = {}, unknown = {}, unallocated = {};
  const slot = (x, texture) => ({ descriptor: { chunkX: x, chunkZ: -2 }, mesh: { visible: true, material: { name: 'terrain' } },
    tileTexture: texture, heightTexture: shared });
  const a = slot(-1, actual), b = slot(0, estimated);
  a.surfaceMaskTexture = unknown; a.forestFloorTexture = unallocated; a.loading = true;
  const surface = { terrainView: { slots: [a, b], renderer: { info: { memoryMap: new Map([[actual, 128]]) },
    _textures: { has: t => t === unknown ? undefined : t !== unallocated } } },
    waterSlots: [{ terrainSlot: a, mesh: { visible: false }, waterFieldTexture: actual, hasWaterCoverage: false }] };
  const snapshot = spatialResourceSnapshot(surface, 100, () => null);
  const first = snapshot.cells.get('-1:-2'), second = snapshot.cells.get('0:-2');
  assert.equal(first.accountedTextureBytes, 128);
  assert.equal(first.unknownTextures, 1);
  assert.equal(first.unallocatedTextures, 1);
  assert.equal(first.sharedTextures, 1);
  assert.equal(first.terrain.loading, true);
  assert.equal(first.water.wet, false);
  assert.equal(second.estimatedTextureBytes, 64);
  assert.equal(snapshot.sharedTextures, 1);
  assert.equal(spatialResourceBytes(first), 128);
  assert.equal(spatialResourceBytes({ accountedTextureBytes: 0, estimatedTextureBytes: 0, unknownTextures: 1 }), null);
});

test('snapshot preserves unavailable counters and separates timestamps', () => {
  const surface = { terrainView: { renderer: { info: { memory: { total: 1024 } } },
    getStreamingStatus: () => ({ resident: 2, loading: 1, capacity: 4, pendingCommits: 3, maxQueuedCommitAgeMs: 5 }) } };
  const result = spatialRendererSnapshot(surface, { rendererDrawCalls: 0, 'gpuCompute.fft.deferred': 2 },
    { timestamp: 10, totalMs: 2, passes: { screen: 2 } }, 50);
  assert.equal(result.renderer.rendererDrawCalls, 0);
  assert.equal(result.renderer.rendererTriangles, null);
  assert.equal(result.memory.rendererTotalBytes, 1024);
  assert.equal(result.compute['gpuCompute.frameCredits'], null);
  assert.equal(result.computeTotals['gpuCompute.fft.deferred'], 2);
  assert.equal(result.streaming.pendingCommits, 3);
  assert.equal(result.gpuRenderSample.ageMs, 40);
});
