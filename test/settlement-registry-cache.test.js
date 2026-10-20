import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { serializeSettlementRegistry } from '../src/editor/world/settlements/SettlementRegistry.js';
import { SettlementRegistryPreparation } from '../src/editor/world/settlements/view/SettlementRegistryPreparation.js';

test('registry hydration performs no coastline searches or global entry/bucket construction', () => {
  const settlements = Array.from({ length: 1000 }, (_, id) => ({ id, population: .3,
    cellX: (id % 40) * 64, cellZ: Math.floor(id / 40) * 64 }));
  const expected = new SettlementField({ settlements, tileSize: 2, worldSeed: 7,
    sampleGround: () => 0, isBuildable: (x, z) => Math.sin(x * .01) + Math.cos(z * .01) > -.5,
    landSearchStepCells: 32 });
  const registry = JSON.parse(JSON.stringify(serializeSettlementRegistry(expected, 'source')));
  let probes = 0;
  const hydrated = SettlementField.fromRegistry(registry, { sampleGround: () => 0, isBuildable: () => { probes++; return true; } });
  assert.equal(probes, 0); assert.equal(hydrated.resolvedEntries.size, 0);
  const actual = hydrated.entriesNear(640, 400, 80), near = expected.entriesNear(640, 400, 80);
  assert.deepEqual(actual.map(v => v.entry.settlement), near.map(v => v.entry.settlement));
  assert.ok(hydrated.resolvedEntries.size < expected.entries.length / 4);
  assert.deepEqual(hydrated.entries.map(entry => entry.settlement), expected.entries.map(entry => entry.settlement),
    'explicit complete enumeration preserves the canonical relocation and ordering');
  hydrated.entries[0].plan = { test: true };
  assert.equal(registry.entries[0].plan, undefined, 'derived plans never pollute the saved registry');
});

test('uncached registries use their worker and ignore responses after a world change', async () => {
  let resolve, installed = 0;
  const generator = { source: { settlements: [1] }, settlementRegistryKey: 'source',
    ensureSettlementField: () => assert.fail('view invoked synchronous field construction'),
    installSettlementRegistry: () => installed++ };
  const owner = new SettlementRegistryPreparation();
  const store = { baseTerrainRevision: 0, chunkWorker: { request: () => new Promise(done => { resolve = done; }) } };
  assert.equal(owner.get(generator, store), null); assert.equal(owner.pending, 1);
  owner.reset(); resolve({ registry: {} }); await new Promise(done => setImmediate(done));
  assert.equal(installed, 0); assert.equal(owner.pending, 0);
});
