import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { geometryTriangles, partsRenderCost, batchRenderCost, effectiveRenderCost, emptyRenderCost, RegionalRenderCostModel } from '../src/editor/performance/RegionalRenderCost.js';
import { evaluateSceneryDemand } from '../src/editor/performance/RegionalSceneryBudget.js';
import { collectRegionalSceneryDemand, sceneryChunkKey } from '../src/editor/performance/RegionalSceneryDemand.js';

const settings = resolveRenderEnhancements().regionalBudget;
const geometry = triangles => ({ index: { count: triangles * 3 } });
const part = (triangles, kind) => ({ geometry: geometry(triangles), kind });
const drain = iterator => {
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
};
const surface = () => ({
  config: { enhancements: { shadowCascades: 2, waterReflections: { enabled: true } } },
  waterSlots: [{ hasWaterCoverage: true }],
  terrainView: { focusChunk: { chunkX: 0, chunkZ: 0 }, chunkWorldSize: 128 },
});

test('indexed, nonindexed and clamped draw range triangle counts', () => {
  assert.equal(geometryTriangles(geometry(100)), 100);
  assert.equal(geometryTriangles({ attributes: { position: { count: 30 } } }), 10);
  assert.equal(geometryTriangles({ index: { count: 30 }, drawRange: { start: 6, count: Infinity } }), 8);
  assert.equal(geometryTriangles({ index: { count: 30 }, drawRange: { start: 40, count: 9 } }), 0);
  assert.equal(geometryTriangles(null), null);
});

test('instancing multiplies triangles but not draw groups, and pass counts are separate', () => {
  const parts = [part(80, 'trunk'), part(120, 'leaf')];
  const cost = partsRenderCost(parts, p => p.kind === 'trunk');
  const batch = batchRenderCost(cost, 10, { shadow: 2, reflection: 1 });
  assert.deepEqual(batch, { triangles: 2000, draws: 2, shadowTriangles: 1600, shadowDraws: 2,
    reflectionTriangles: 2000, reflectionDraws: 2, unknown: 0 });
  assert.deepEqual(effectiveRenderCost(batch, 0.25), { triangles: 4100, draws: 4.5 });
  assert.equal(batchRenderCost(null, 3, { shadow: 2, reflection: 1 }).unknown, 3);
});

test('prototype estimates preserve baseline and count overlapping selected LODs', () => {
  const model = new RegionalRenderCostModel(surface());
  const view = {
    prototypes: [[part(100, 'trunk'), part(300, 'leaf')]],
    proxyPrototypes: [[part(20, 'trunk')]],
    previousPlan: { entries: [{ chunkX: 2, chunkZ: 0, baselineBand: 'near', band: 'proxy',
      representations: [{ band: 'near', fade: 0.25 }, { band: 'proxy', fade: 0.75 }] }] },
  };
  const placements = [{ prototypeIndex: 0 }, { prototypeIndex: 0 }];
  const estimate = drain(model.manifest(view, 'tree', '2:0', placements));
  assert.equal(estimate.requested.triangles, 800);
  assert.equal(estimate.requested.draws, 2);
  assert.equal(estimate.requested.shadowTriangles, 400);
  assert.equal(estimate.selected.triangles, 840);
  assert.equal(estimate.selected.draws, 3);
  const outside = drain(model.manifest(view, 'tree', '5:0', placements));
  assert.equal(outside.requested.triangles, 0);
});

test('impostor and proxy fallback use existing geometries', () => {
  const model = new RegionalRenderCostModel(surface());
  const view = {
    prototypes: [[part(400, 'leaf')]], proxyPrototypes: [[part(20, 'trunk')]],
    impostorAtlases: [{}], impostorBatches: [{ batch: { geometry: geometry(2) } }],
    previousPlan: { entries: [{ chunkX: 2, chunkZ: 0, baselineBand: 'impostor', band: 'impostor' }] },
  };
  const placements = [{ prototypeIndex: 0, scale: 1, heightScale: 1, ageClass: 'dead' },
    { prototypeIndex: 0, scale: 1, heightScale: 1, foliageDensity: 0.1 }];
  const fallback = drain(model.manifest(view, 'tree', '2:0', placements));
  assert.equal(fallback.requested.triangles, 40);
  assert.equal(fallback.requested.draws, 1);
  assert.equal(model.physicalBand(view, 'tree', 0, 'impostor', true), 'impostor');
  assert.equal(model.prototypeCost(view, 'tree', 0, 'impostor').triangles, 2);
});

test('geometry pressure uses baseline costs and falls back for missing geometry', () => {
  const cost = (triangles, draws, unknown = 0) => ({ ...emptyRenderCost(), triangles, draws, unknown });
  const cells = new Map([
    ['2:0', { tree: 1, renderCost: { requested: cost(210000, 1), selected: cost(100, 1) } }],
    ['3:0', { tree: 500, renderCost: { requested: cost(100, 1), selected: cost(100, 1) } }],
    ['4:0', { tree: 500, renderCost: { requested: cost(0, 0, 500), selected: cost(0, 0, 500) } }],
    ['5:0', { rock: 1, renderCost: { requested: cost(100, 101), selected: cost(100, 101) } }],
  ]);
  const result = evaluateSceneryDemand(cells, new Set(), settings, true);
  assert.deepEqual([...result.pressured], ['2:0', '4:0', '5:0']);
  assert.equal(result.fallbackChunks, 1);
  assert.equal(result.requestedCost.triangles, 210200);
  const recover = new Map([['2:0', { tree: 1, renderCost: { requested: cost(160000, 1), selected: cost(1, 1) } }]]);
  assert.equal(evaluateSceneryDemand(recover, result.pressured, settings, true).pressured.has('2:0'), true);
  recover.get('2:0').renderCost.requested.triangles = 150000;
  assert.equal(evaluateSceneryDemand(recover, result.pressured, settings, true).pressured.has('2:0'), false);
});

test('grass uses the template and untrimmed output for requested cost', () => {
  const model = new RegionalRenderCostModel(surface());
  const layer = { templates: { cards: { ...geometry(4), instanceCount: 100 } } };
  const tile = { band: 'cards', output: { count: 100 }, regionalCountFactor: 0.8 };
  const result = model.grass(layer, tile, 'card');
  assert.equal(result.requested.triangles, 400);
  assert.equal(result.selected.triangles, 320);
  assert.equal(result.requested.draws, 1);
  assert.equal(result.selected.shadowTriangles, 0);
  assert.equal(model.water({ mesh: part(10) }).requested.reflectionTriangles, 0);
});

test('town estimates distinguish full near kit from visible published tier rows', () => {
  const model = new RegionalRenderCostModel(surface());
  const near = { ...part(100), castShadow: true, count: 1, visible: true, instanceMatrix: { array: new Float32Array(16) } };
  const far = { ...part(20), castShadow: false, count: 1, visible: true, instanceMatrix: { array: new Float32Array(16) } };
  far.instanceMatrix.array[12] = 128;
  const module = { values: new Float32Array([0, 0, 0, 0, 128, 0, 0, 0]), nearMeshes: [near], farMeshes: [far] };
  const town = { layout: { anchor: { x: 0, z: -64 } }, mesh: { modules: [module] } };
  const requested = drain(model.town(town, 128, sceneryChunkKey));
  const selected = drain(model.selectedTown(town, 128, sceneryChunkKey));
  assert.equal(requested.get('0:0').triangles, 100);
  assert.equal(requested.get('1:0').triangles, 100);
  assert.equal(model.townPasses(requested.get('1:0')).shadowTriangles, 200);
  assert.equal(selected.get('1:0').triangles, 20);
  assert.equal(selected.get('1:0').shadowTriangles, 0);
});

test('cost collector preserves raw layer counts and cost totals independently', () => {
  const s = surface();
  s.treeView = {
    prototypes: [[part(100, 'trunk')]],
    manifestStore: { cache: new Map([['2:0', { placements: [{ prototypeIndex: 0 }] }]]) },
  };
  const cells = drain(collectRegionalSceneryDemand(s, s.terrainView.focusChunk, 128, settings, new WeakMap(), new RegionalRenderCostModel(s)));
  assert.equal(cells.get('2:0').tree, 1);
  assert.equal(cells.get('2:0').renderCost.layers.tree.requested.triangles, 100);
  assert.equal(evaluateSceneryDemand(cells, new Set(), settings, true).layerCosts.tree.requested.triangles, 100);
});

test('geometry cost flag is opt-in and thresholds are validated', () => {
  assert.equal(resolveRenderEnhancements().regionalGeometryCostBudget, false);
  assert.equal(resolveRenderEnhancements({}, '?regionalGeometryCostBudget=1').regionalGeometryCostBudget, true);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { spatialTriangleBudget: 0 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ regionalBudget: { spatialReflectionPassWeight: 2 } }), RangeError);
});

test('pressure reserves published town tiers while preserving full near demand telemetry', () => {
  const requested = { ...emptyRenderCost(), triangles: 400000, draws: 4 };
  const selected = { ...emptyRenderCost(), triangles: 20000, draws: 4 };
  const cells = new Map([['3:0', { town: 200, renderCost: { requested, selected,
    layers: { town: { requested, selected } } } }]]);
  const result = evaluateSceneryDemand(cells, new Set(), settings, true);
  assert.equal(result.requestedCost.triangles, 400000);
  assert.equal(result.selectedCost.triangles, 20000);
  assert.equal(result.peakTriangles, 20000);
  assert.equal(result.pressured.size, 0);
  selected.unknown = 1;
  assert.equal(evaluateSceneryDemand(cells, new Set(), settings, true).pressured.has('3:0'), true);
});
