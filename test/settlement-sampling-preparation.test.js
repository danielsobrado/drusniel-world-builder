import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { SettlementSamplingPreparation } from '../src/editor/world/settlements/SettlementSamplingPreparation.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';

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
  let ready = false;
  for (let turn = 0; turn < 1000 && !ready; turn++) {
    let checks = 0; ready = sampler.prepare(bounds, () => ++checks > 5);
  }
  assert.equal(ready, true);
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
