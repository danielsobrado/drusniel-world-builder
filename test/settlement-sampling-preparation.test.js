import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { SettlementSamplingPreparation } from '../src/editor/world/settlements/SettlementSamplingPreparation.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';
import { SettlementCollisionProvider } from '../src/editor/collision/providers/SettlementCollisionProvider.js';
import { COLLISION_BUILD_DEFERRED } from '../src/editor/collision/CollisionBuildResult.js';
import { SettlementResidents } from '../src/editor/actors/SettlementResidents.js';

const settlements = [{ id: 18, cellX: 0, cellZ: 0, population: 5 }];
const createField = sampleGround => new SettlementField({ settlements, tileSize: 2, worldSeed: 19,
  sampleGround, isBuildable: () => true });

test('cold interactive sampling waits for a worker plan and retains exact grading with no main-thread planning', async () => {
  const main = createField(() => assert.fail('main-thread planning')), canonical = createField(() => 20);
  let requests = 0, deliver;
  const store = { generator: { settlementField: main }, baseTerrainRevision: 1,
    chunkWorker: { request: () => { requests++; return new Promise(resolve => { deliver = resolve; }); } } };
  const sampler = new SettlementSamplingPreparation(store), bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
  assert.equal(sampler.prepare(bounds), false);
  assert.equal(sampler.prepare(bounds), false); assert.equal(requests, 1);
  deliver(generateSettlementPlan({ ensureSettlementField: () => canonical }, 18));
  await Promise.resolve();
  sampler.prepare(bounds);
  assert.equal(main.entries[0].index, null, 'bootstrap without a frame budget still installs only a bounded slice');
  let ready = false;
  for (let turn = 0; turn < 1000 && !ready; turn++) {
    let checks = 0; ready = sampler.prepare(bounds, () => ++checks > 5);
  }
  assert.equal(ready, true);
  const plans = sampler.preparation.plans;
  let lookups = 0;
  const originalGet = plans.get;
  plans.get = function (...args) { lookups++; return originalGet.apply(this, args); };
  try {
    assert.equal(sampler.prepare(bounds), true);
    assert.equal(lookups, 0, 'ready sampling does not recheck pinned plans every frame');
    assert.equal(sampler.prepare({ ...bounds, maxX: 48 }), true);
    assert.ok(lookups > 0, 'changing sampling bounds requires new plan verification');
  } finally {
    plans.get = originalGet;
  }
  for (let x = -32; x <= 32; x += 8) assert.equal(main.grade(x, 0, 20), canonical.grade(x, 0, 20));
  assert.equal(main.planCache.getStatus().pinned, 1);
  sampler.dispose(); assert.equal(main.planCache.getStatus().pinned, 0);
});

test('sampling source replacement cancels obsolete leases before adopting another field', async () => {
  const old = createField(() => assert.fail('old planning')), next = createField(() => assert.fail('new planning'));
  const responses = [], store = { generator: { settlementField: old }, baseTerrainRevision: 1,
    chunkWorker: { request: () => new Promise(resolve => responses.push(resolve)), cancelSettlementPlan() {} } };
  const sampler = new SettlementSamplingPreparation(store), bounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  sampler.prepare(bounds);
  store.generator = { settlementField: next }; store.baseTerrainRevision++;
  sampler.prepare(bounds);
  responses[0](generateSettlementPlan({ ensureSettlementField: () => createField(() => 20) }, 18));
  await Promise.resolve();
  assert.equal(old.entries[0].plan, undefined); assert.equal(next.entries[0].plan, undefined);
  sampler.dispose();
});

test('cold collision defers rather than planning on the main thread, then publishes identical colliders', async () => {
  const main = createField(() => 20), canonical = createField(() => 20);
  const ensure = main.ensurePlan.bind(main);
  main.ensurePlan = entry => { assert.ok(entry.plan, 'collision never plans synchronously'); return ensure(entry); };
  let deliver;
  const provider = new SettlementCollisionProvider({ chunkWorldSize: 128, terrainView: { worldStore: {
    tileSize: 2, generator: { settlementField: main, ensureSettlementField: () => main },
    chunkWorker: { request: () => new Promise(resolve => { deliver = resolve; }), cancelSettlementPlan() {} },
  } } });
  assert.equal(provider.buildChunkData(0, 0), COLLISION_BUILD_DEFERRED);
  deliver(generateSettlementPlan({ ensureSettlementField: () => canonical }, 18)); await Promise.resolve();
  let result = COLLISION_BUILD_DEFERRED;
  for (let turn = 0; turn < 1000 && result === COLLISION_BUILD_DEFERRED; turn++) result = provider.buildChunkData(0, 0);
  assert.notEqual(result, COLLISION_BUILD_DEFERRED);
  const expected = new SettlementCollisionProvider({ chunkWorldSize: 128,
    terrainView: { worldStore: { generator: { ensureSettlementField: () => canonical } } } });
  assert.deepEqual(result.colliders, expected.buildChunkData(0, 0).colliders);
  assert.equal(provider.preparation.size, 0); assert.equal(main.planCache.getStatus().pinned, 0);
  provider.dispose(); expected.dispose();
});

test('resident refresh and wander wait for canonical plans without changing the manifest', async () => {
  const main = createField(() => 20), canonical = createField(() => 20);
  const ensure = main.ensurePlan.bind(main);
  main.ensurePlan = entry => { assert.ok(entry.plan, 'residents never plan synchronously'); return ensure(entry); };
  let deliver;
  const store = { chunkSize: 32, tileSize: 2, generator: { worldSeed: 19,
    settlementField: main, ensureSettlementField: () => main },
    chunkWorker: { request: () => new Promise(resolve => { deliver = resolve; }) } };
  const residents = Object.create(SettlementResidents.prototype);
  Object.assign(residents, { terrainView: { worldStore: store }, manifests: new Map(), nextRefresh: 0,
    settings: { enabled: true, radiusMeters: 300, wanderRadius: 12, maxResidents: 10, maxPerSettlement: 10, refreshSeconds: 5 },
    sampling: new SettlementSamplingPreparation(store),
    npcs: { desired: new Map(), clear() {}, updates: 0, update() { this.updates++; },
      setManifest(records) { this.records = records; this.desired = new Map(records.map(record => [record.id, record])); } } });
  const focus = { x: 0, z: 0 };
  residents.update(0.016, null, focus, 1);
  assert.equal(residents.npcs.updates, 0); assert.equal(residents.npcs.records, undefined);
  deliver(generateSettlementPlan({ ensureSettlementField: () => canonical }, 18)); await Promise.resolve();
  for (let turn = 0; turn < 1000 && !residents.npcs.updates; turn++) {
    let units = 0;
    residents.update(0.016, null, focus, 1, { runner: run => run(), shouldYield: () => ++units > 5 });
  }
  assert.equal(residents.npcs.updates, 1);
  const expected = Object.create(SettlementResidents.prototype);
  Object.assign(expected, { terrainView: { worldStore: { tileSize: 2 } }, manifests: new Map(),
    generator: { worldSeed: 19, ensureSettlementField: () => canonical }, settings: residents.settings,
    npcs: { setManifest(records) { this.records = records; } } });
  expected.refresh(focus);
  assert.deepEqual(residents.npcs.records, expected.npcs.records);
  assert.ok(residents.npcs.records.length);
  // A pending model from the old publication stays protected during travel.
  const old = residents.npcs.records[0];
  let captured;
  residents.sampling.prepare = bounds => { captured = bounds; return false; };
  residents.prepareSampling({ x: 4000, z: 4000 });
  assert.ok(captured.minX <= (old.x - old.wander) / 2 && captured.maxZ >= (-old.z + old.wander) / 2);
  residents.sampling.dispose();
});
