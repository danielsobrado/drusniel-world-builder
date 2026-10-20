import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { generateSettlementPlan } from '../src/editor/world/settlements/SettlementPlanRequest.js';
import { SettlementPlanPreparation } from '../src/editor/world/settlements/view/SettlementPlanPreparation.js';

const tick = () => new Promise(done => setImmediate(done));
function field() { return new SettlementField({ settlements: [{ id: 1, cellX: 0, cellZ: 0, population: .3 }],
  tileSize: 2, worldSeed: 7, sampleGround: () => 0, isBuildable: () => true }); }

test('a transient plan failure recovers in place after exponential backoff, without duplicate requests', async () => {
  const main = field(), worker = field(), result = generateSettlementPlan({ ensureSettlementField: () => worker }, 1);
  let now = 0, calls = 0;
  const owner = new SettlementPlanPreparation(() => {}, { now: () => now, delayMs: 100 });
  owner.configure(main, { chunkWorker: { request: async () => {
    if (++calls < 3) throw Object.assign(new Error('worker restarted'), { retryable: true }); return result;
  } } });
  const entry = main.entries[0];
  owner.get(entry); await tick(); owner.get(entry); owner.advance(() => false);
  assert.equal(calls, 1);
  now = 100; owner.advance(() => false); await tick(); assert.equal(calls, 2);
  now = 299; owner.get(entry); assert.equal(calls, 2);
  now = 300; owner.get(entry); owner.get(entry); await tick(); owner.advance(() => false);
  assert.equal(calls, 3); assert.equal(owner.pending, 0); assert.deepEqual(entry.plan, result.plan);
});

test('retry exhaustion, malformed data and deterministic index failures are terminal', async () => {
  for (const transient of [true, false]) {
    const main = field(); let now = 0, calls = 0;
    const owner = new SettlementPlanPreparation(() => {}, { now: () => now });
    owner.configure(main, { chunkWorker: { request: async () => {
      calls++; throw Object.assign(new Error('failure'), { retryable: transient });
    } } });
    for (let i = 0; i < 8; i++) { owner.get(main.entries[0]); await tick(); now += 10000; }
    assert.equal(calls, transient ? 3 : 1); assert.equal(owner.errors.length, 1);
  }
  const main = field(), result = structuredClone(generateSettlementPlan({ ensureSettlementField: () => field() }, 1));
  result.plan.buildings = null;
  let calls = 0;
  const owner = new SettlementPlanPreparation();
  owner.configure(main, { chunkWorker: { request: async () => { calls++; return result; } } });
  owner.get(main.entries[0]); await tick(); owner.advance(() => false); owner.get(main.entries[0]);
  assert.equal(calls, 1); assert.equal(main.entries[0].plan, undefined); assert.equal(owner.errors.length, 1);
});
