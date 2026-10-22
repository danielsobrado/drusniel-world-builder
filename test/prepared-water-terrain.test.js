import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureWaterDomainGenerator } from '../src/editor/water/GeneratorWaterAdapter.js';
import { clonePreparedWaterSource, installPreparedWaterTerrain, preparedWaterTerrain, waterPreparationKey } from '../src/editor/water/PreparedWaterTerrain.js';
import { TerrainAwareEditorController } from '../src/editor/TerrainAwareEditorController.js';
import { MacroFarTerrainView } from '../src/editor/world/MacroFarTerrainView.js';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';
import { Scene } from 'three/webgpu';

const metadata = { seed: 19, version: 1, heightScale: 20, seaLevel: 0 };
const source = () => ({ atlas: { width: 32, height: 32 }, bounds: { minCellX: 0, minCellZ: 0, widthCells: 64, heightCells: 64 },
  rivers: [{ id: 1, widthAtlas: .2, points: [[2, 2], [16, 16], [30, 30]] }] });
function generator(input, sample = () => {}) {
  const height = (x, z) => { sample(); return 20 - x * .1 + Math.sin(z) * .1; };
  return ensureWaterDomainGenerator({ source: input, seed: 19, seaLevel: 0,
    sampleHeight: height, sampleTile: () => 4, toMetadata: () => metadata,
    sampleMacroColumn: (x, z) => ({ height: height(x, z) - .5, tileId: 4 }) }, metadata);
}

test('worker-prepared river profiles skip global tracing and preserve exact water and macro samples', () => {
  const reference = generator(source()), payload = structuredClone(reference.prepareWaterTerrain());
  assert.ok(payload.canonical.length > 0 && payload.macro.length > 0);
  const input = source(); installPreparedWaterTerrain(input, metadata, payload);
  let samples = 0;
  const hydrated = generator(input, () => samples++);
  assert.equal(samples, 0, 'constructing an interactive generator must not trace whole-world rivers');
  hydrated.sampleMacroColumn(16, 16);
  assert.ok(samples < 10, 'first macro use must not trace the rivers either');
  for (let x = 0; x < 32; x += 2) for (let z = 0; z < 32; z += 3) {
    assert.equal(hydrated.sampleHeight(x + .3, z + .7), reference.sampleHeight(x + .3, z + .7));
    assert.deepEqual(hydrated.sampleWater(x, z), reference.sampleWater(x, z));
    assert.deepEqual(hydrated.sampleMacroColumn(x, z), reference.sampleMacroColumn(x, z));
  }
  assert.deepEqual(hydrated.prepareWaterTerrain().canonical, payload.canonical);
  const copy = clonePreparedWaterSource(input);
  assert.equal(preparedWaterTerrain(copy, metadata), payload);
  assert.deepEqual(copy, input);
  assert.equal(preparedWaterTerrain(copy, { ...metadata, seed: 20 }), null);
  assert.equal(JSON.stringify(copy).includes('canonical'), false, 'runtime preparation is not persisted');
  assert.throws(() => installPreparedWaterTerrain(input, metadata, { ...payload, key: 'wrong-world' }), /Mismatched/);
  const invalid = structuredClone(payload); invalid.canonical[0].profile.levels = [];
  assert.throws(() => installPreparedWaterTerrain(input, metadata, invalid), /Invalid/);
});

test('a river world is prepared before publication and a superseded or failed load leaves the current world alone', async () => {
  const controller = Object.create(TerrainAwareEditorController.prototype), replies = [];
  Object.assign(controller, { worldStore: { chunkWorker: { request: (_x, _z, options) => {
    assert.equal(options.sourcePreparation.metadata, metadata);
    return new Promise((resolve, reject) => replies.push({ resolve, reject }));
  } } }, loadPreparedDocument(document) { this.published = document; } });
  const doc = { world: { generator: metadata, baseTerrain: source() } };
  const first = controller.loadDocument(doc);
  assert.equal(controller.published, undefined);
  const payload = { key: waterPreparationKey(metadata), canonical: [], macro: [], canonicalReaches: [], macroReaches: [] };
  replies[0].resolve(payload); await first;
  assert.equal(controller.published.world.baseTerrain, doc.world.baseTerrain);
  assert.equal(preparedWaterTerrain(doc.world.baseTerrain, metadata), null, 'mutable input documents do not keep a stale preparation cache');
  const pending = controller.loadDocument({ world: { generator: metadata, baseTerrain: source() } });
  controller.loadDocument({ world: {} }); const current = controller.published;
  replies[1].resolve(payload);
  await assert.rejects(pending, /superseded/); assert.equal(controller.published, current);
  const failed = controller.loadDocument({ world: { generator: metadata, baseTerrain: source() } });
  replies[2].reject(new Error('injected worker failure'));
  await assert.rejects(failed, /injected/); assert.equal(controller.published, current);
});

test('far terrain waits for an exact missing plan and retries the same samples without synchronous generation', async () => {
  const settlements = [{ id: 18, cellX: 0, cellZ: 0, population: 1 }];
  const make = () => new SettlementField({ settlements, tileSize: 2, worldSeed: 19,
    sampleGround: () => 20, isBuildable: () => true });
  const field = make(), canonical = make(); let deliver;
  const world = { tileSize: 2, chunkWorker: { request: () => new Promise(resolve => { deliver = resolve; }) },
    generator: { settlementField: field, sampleMacroColumn: () => ({ height: 20, tileId: field.cover(0, 0) ?? 4 }) } };
  const view = new MacroFarTerrainView({ scene: new Scene(), worldStore: world, config: {},
    floatingOrigin: { getState: () => ({ x: 0, z: 0 }) } });
  view.generator = world.generator; view.startJob(0, 0);
  const sample = () => view.samplePreparedRing(view.job, 0, 0, 1, () => false);
  assert.equal(sample(), false); assert.equal(field.entries[0].plan, undefined);
  assert.equal(field.requirePreparedPlans, undefined, 'the guard is scoped to the far sampler');
  deliver(generateSettlementPlan({ ensureSettlementField: () => canonical }, 18)); await Promise.resolve();
  assert.equal(sample(), true);
  assert.equal(view.job.tileIds[0], canonical.cover(0, 0) ?? 4);
  assert.equal(field.planCache.getStatus().pinned, 0);
  view.dispose();
});
