import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';
import { SettlementPlanPreparation } from '../src/editor/world/settlements/view/SettlementPlanPreparation.js';
import { settlementPreparationStatus } from '../src/editor/world/settlements/view/SettlementPreparationStatus.js';

const city = { id: 18, name: 'City', cellX: 500, cellZ: -300, population: 28,
  capital: true, walls: true, citadel: true, plaza: true, temple: true };
function field(sampleGround = (x, z) => Math.sin(x * .01) + Math.cos(z * .013)) {
  return new SettlementField({ settlements: [city], tileSize: 2, worldSeed: 1234,
    routes: [[[400, -300], [600, -300]]], sampleGround, isBuildable: () => true });
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('worker-derived city keeps canonical pads, streets and deterministic geometry inputs', async () => {
  const workerField = field(), expected = field();
  const response = structuredClone(generateSettlementPlan({ ensureSettlementField: () => workerField }, city.id));
  assert.deepEqual(response.plan, expected.ensurePlan(expected.entries[0]).plan);
  const main = field(() => assert.fail('main-thread planning sampled ground'));
  let requests = 0, ready = 0;
  const preparation = new SettlementPlanPreparation(() => ready++);
  preparation.configure(main, { chunkWorker: { request: async () => { requests++; return response; } } });
  assert.equal(preparation.get(main.entries[0]), null);
  preparation.get(main.entries[0]);
  assert.equal(requests, 1, 'requests are deduplicated');
  await tick();
  preparation.advance(() => true);
  assert.equal(main.entries[0].plan, undefined, 'an exhausted frame cannot install the plan');
  let frames = 0;
  while (preparation.pending) {
    let units = 0;
    preparation.advance(() => ++units > 8);
    assert.ok(++frames < 10000);
  }
  assert.ok(frames > 1, 'large index installation spans multiple frames');
  assert.equal(ready, 1);
  assert.deepEqual(main.entries[0].plan, response.plan);
  for (const building of response.plan.buildings.slice(0, 30)) {
    const x = city.cellX + building.x / 2, z = city.cellZ + building.z / 2;
    assert.equal(main.cover(x, z), expected.cover(x, z));
    assert.equal(main.grade(x, z, 0), expected.grade(x, z, 0));
  }
});

test('late plans cannot cross world revisions or repopulate cancelled residency', async () => {
  const main = field(), resolvers = [], cancelled = [];
  const store = { baseTerrainRevision: 1, chunkWorker: {
    request: () => new Promise(resolve => resolvers.push(resolve)),
    cancelSettlementPlan: id => cancelled.push(id),
  } };
  const preparation = new SettlementPlanPreparation();
  preparation.configure(main, store); preparation.begin(); preparation.get(main.entries[0]); preparation.end();
  store.baseTerrainRevision++;
  preparation.configure(main, store);
  const response = generateSettlementPlan({ ensureSettlementField: () => field() }, city.id);
  resolvers[0](response); await tick(); preparation.advance(() => false);
  assert.equal(main.entries[0].plan, undefined);
  preparation.begin(); preparation.get(main.entries[0]); preparation.end();
  preparation.begin(); preparation.end();
  resolvers[1](response); await tick(); preparation.advance(() => false);
  assert.equal(main.entries[0].plan, undefined);
  assert.deepEqual(cancelled, [city.id, city.id]);
});

test('repeated lookups pin once and a pass releases what it stopped asking for', () => {
  const main = field(), preparation = new SettlementPlanPreparation();
  preparation.configure(main, { chunkWorker: { request: () => new Promise(() => {}) } });
  const pin = main.planCache.pin.bind(main.planCache);
  let pins = 0;
  main.planCache.pin = (...args) => { pins++; pin(...args); };
  for (let lookup = 0; lookup < 100; lookup++) preparation.get(main.entries[0]);
  assert.equal(pins, 1);
  assert.ok(main.planCache.isPinned(main.entries[0]));
  preparation.begin(); preparation.end();
  assert.equal(main.planCache.isPinned(main.entries[0]), false);
});

test('mismatched or unavailable worker plans remain explicit readiness failures', async () => {
  const main = field(), preparation = new SettlementPlanPreparation();
  preparation.configure(main, { chunkWorker: { request: async () => ({ settlementId: -1 }) } });
  preparation.get(main.entries[0]); await tick();
  assert.match(preparation.errors[0], /mismatched/);
  const status = settlementPreparationStatus({ enabled: true, plans: preparation, sites: new Map(),
    pool: { entries: new Map(), pending: 0, uncompiled: [], compiling: 0, unrevealed: [] } });
  assert.equal(status.ready, false);
  assert.equal(status.plans, 1);
  assert.equal(main.entries[0].plan, undefined);
  preparation.configure(main, {}); preparation.get(main.entries[0]);
  assert.match(preparation.errors[0], /requires the terrain worker/);
});
