import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainRegionalFeatures, TERRAIN_FEATURES as F, FULL_TERRAIN_FEATURES } from '../src/editor/materials/TerrainRegionalFeatures.js';
import { RegionalDensityBudget } from '../src/editor/performance/RegionalDensityBudget.js';
import { pruneRegionalMaterials } from '../src/editor/performance/RegionalMaterialCache.js';
import { RegionalImpostorResidency } from '../src/editor/stylized/impostor/RegionalImpostorResidency.js';
import { RegionalResourceBudget, estimateRegionalTextureBytes } from '../src/editor/performance/RegionalResourceBudget.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

test('regional profiles retain all features for unknown terrain and mixed boundaries', () => {
  const config = { biomeLooks: { arid: { sand: [1], mineral: [2] }, glacier: { 5: 1 } } };
  assert.equal(terrainRegionalFeatures(null, config, false), FULL_TERRAIN_FEATURES);
  assert.equal(terrainRegionalFeatures({ tiles: [1, 5], surfaceMaskPixels: new Uint8Array([0, 0, 0, 0, 0, 2, 0, 0]) }, config, true), FULL_TERRAIN_FEATURES);
  assert.equal(terrainRegionalFeatures({ tiles: [1], surfaceMaskPixels: new Uint8Array(4) }, config, false), F.ARID);
  assert.equal(terrainRegionalFeatures({ tiles: [9] }, config, false), F.GRASS);
});

test('density budget preserves hysteresis and recovers reach', () => {
  const budget = new RegionalDensityBudget({ sampleIntervalMs: 100, triangleBudget: 100, drawBudget: 100, townInstanceBudget: 100, recoveryRatio: 0.75, farGrassPressure: 0.85 });
  assert.equal(budget.update(0, { triangles: 101 }), 0.85);
  assert.equal(budget.update(50, { triangles: 0 }), 0.85);
  assert.equal(budget.update(100, { triangles: 80 }), 0.85);
  assert.equal(budget.update(200, { triangles: 70 }), 1);
  assert.equal(budget.update(300, { townInstances: 101 }), 1);
  assert.equal(budget.update(400, { townInstances: 101, vegetationInstances: 1 }), 0.85);
});

test('material retirement protects live variants and limits work', () => {
  const retired = [];
  const material = id => ({ dispose: () => retired.push(id) });
  const a = material('a'), b = material('b'), c = material('c');
  const cache = new Map([['a', a], ['b', b], ['c', c]]);
  const idle = new Map(), active = new Set([a]);
  assert.equal(pruneRegionalMaterials(cache, idle, active, 0, 100, 1), 0);
  assert.equal(pruneRegionalMaterials(cache, idle, active, 100, 100, 1), 1);
  assert.deepEqual(retired, ['b']);
  assert.equal(pruneRegionalMaterials(cache, idle, active, 101, 100, 1), 1);
  assert.deepEqual(retired, ['b', 'c']);
  assert.equal(cache.get('a'), a);
});

test('texture estimation accounts for explicit mips and typed pixels', () => {
  assert.equal(estimateRegionalTextureBytes({ mipmaps: [{ data: new Uint8Array(64) }, { data: new Uint8Array(16) }] }), 80);
  assert.equal(estimateRegionalTextureBytes({ image: { data: new Uint8Array(48) }, generateMipmaps: true }), 64);
});

test('resource budget evicts only inactive registered textures after grace period', () => {
  const mib = 1024 * 1024, disposed = [];
  const registered = new Set();
  const info = { memory: { total: 2 * mib }, memoryMap: new Map() };
  const texture = id => {
    const t = { dispose() { disposed.push(id); registered.delete(t); info.memory.total -= mib; } };
    registered.add(t); info.memoryMap.set(t, mib); return t;
  };
  const active = texture('active'), idle = texture('idle');
  const budget = new RegionalResourceBudget({ sampleIntervalMs: 100, idleMs: 100, maxTrackedTextureMiB: 100000, maxRendererMiB: 1, evictionsPerFrame: 1 });
  const surface = { terrainView: { renderer: { _textures: registered, info }, slots: [
    { mesh: { visible: true, userData: {} }, tileTexture: active },
    { mesh: { visible: false, userData: {} }, tileTexture: idle }
  ] }, waterSlots: [] };
  budget.update(surface, 0);
  assert.deepEqual(disposed, []);
  budget.update(surface, 100);
  assert.deepEqual(disposed, ['idle']);
  assert.ok(registered.has(active));
});

async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test('impostor demand limits concurrency, rejects stale completions and retires idle atlases', async () => {
  let now = 0;
  const loads = new Map(), installed = [], released = [], removed = [];
  const residency = new RegionalImpostorResidency({
    concurrency: 1, now: () => now,
    load: index => new Promise(resolve => loads.set(index, resolve)),
    install: index => installed.push(index), release: atlas => released.push(atlas),
    remove: index => removed.push(index)
  });
  residency.setDemand([1, 2]);
  await flush();
  assert.deepEqual([...loads.keys()], [1]);
  residency.setDemand([2]);
  loads.get(1)('atlas1');
  await flush();
  assert.deepEqual(released, ['atlas1']);
  assert.deepEqual([...loads.keys()], [1, 2]);
  loads.get(2)('atlas2');
  await flush();
  assert.deepEqual(installed, [2]);
  assert.equal(residency.ready, true);
  residency.setDemand([]);
  now = 101;
  assert.equal(residency.retireIdle(now, 100), 1);
  assert.deepEqual(removed, [2]);
  residency.dispose();
});

test('regional flags are independent and experimental by default', () => {
  const defaults = resolveRenderEnhancements();
  for (const key of ['regionalTerrainProfiles', 'regionalLazyTrees', 'regionalResourceBudget', 'regionalDensityBudget']) assert.equal(defaults[key], false);
  const enabled = resolveRenderEnhancements({}, '?regionalLazyTrees=1&regionalResourceBudget=1');
  assert.equal(enabled.regionalLazyTrees, true);
  assert.equal(enabled.regionalResourceBudget, true);
  assert.equal(enabled.regionalTerrainProfiles, false);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { maxRendererMiB: 0 } }), /maxRendererMiB/);
});
