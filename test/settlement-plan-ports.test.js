import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { SettlementPlanPortAuthority, SettlementPlanPortClient } from '../src/editor/world/settlements/SettlementPlanPorts.js';
import { settlementPreparationFor } from '../src/editor/world/settlements/SettlementPreparation.js';

function generator(sampleGround = () => 0) {
  const field = new SettlementField({ settlements: [{ id: 18, cellX: 0, cellZ: 0, population: 28 }],
    tileSize: 2, worldSeed: 91, sampleGround, isBuildable: () => true });
  return { settlementRegistryKey: 'world-91', ensureSettlementField: () => field };
}

test('eight cold terrain workers and visual planning share one canonical plan over direct channels', async () => {
  const canonical = generator(); let generated = 0;
  const authority = new SettlementPlanPortAuthority(() => canonical, () => generated++);
  authority.reset(1);
  const clients = [], workers = [];
  try {
    for (let index = 0; index < 8; index++) {
      const channel = new MessageChannel(), client = new SettlementPlanPortClient();
      authority.connect(channel.port1, 1); client.connect(channel.port2, 1);
      clients.push(client);
      workers.push(generator(() => assert.fail('terrain worker replanned the city')));
    }
    await Promise.all(clients.map((client, index) => client.prepare(workers[index], { seed: 91 }, 18)));
    assert.equal(generated, 1);
    const expected = canonical.ensureSettlementField().findById(18).plan;
    for (const worker of workers) {
      const field = worker.ensureSettlementField(), entry = field.findById(18);
      assert.deepEqual(entry.plan, expected);
      assert.ok(entry.index);
      assert.equal(field.cover(0, 0), canonical.ensureSettlementField().cover(0, 0));
    }
  } finally { clients.forEach(client => client.disconnect()); authority.reset(2); }
});

test('disconnect rejects outstanding preparation and mismatched versions cannot install', async () => {
  const client = new SettlementPlanPortClient(), channel = new MessageChannel(), world = generator();
  client.connect(channel.port1, 1);
  const pending = client.prepare(world, {}, 18);
  client.disconnect();
  await assert.rejects(pending, error => error.retryable);
  channel.port2.close();
  const next = new MessageChannel(); client.connect(next.port1, 2);
  next.port2.onmessage = ({ data }) => next.port2.postMessage({ id: data.id, revision: 1 });
  try { await assert.rejects(client.prepare(world, {}, 18), /Stale/); }
  finally { client.disconnect(); next.port2.close(); }
  assert.equal(world.ensureSettlementField().findById(18).plan, undefined);
});

test('renderer leases deduplicate requests and releasing one cannot cancel another consumer', () => {
  let requests = 0, cancelled = 0;
  const store = { chunkWorker: { request: () => { requests++; return new Promise(() => {}); },
    cancelSettlementPlan: () => cancelled++ } };
  const first = settlementPreparationFor(store), second = settlementPreparationFor(store);
  assert.equal(first, second);
  const field = generator().ensureSettlementField(), entry = field.findById(18), towns = {}, view = {};
  first.plans.configure(field, store);
  first.plans.begin(towns); first.plans.get(entry, 0, towns); first.plans.end();
  second.plans.begin(view); second.plans.get(entry, 0, view); second.plans.end();
  assert.equal(requests, 1);
  first.plans.release(towns); assert.equal(cancelled, 0);
  second.plans.release(view); assert.equal(cancelled, 1);
});
