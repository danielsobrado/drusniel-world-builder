import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveMapEntry, validateAzgaarDocument } from '../src/world/AzgaarWorldLoader.js';
import { burgInhabitants, populationScale, ruralInhabitants } from '../src/world/PopulationNormalizer.js';
import { classifySettlement } from '../src/world/SettlementClassifier.js';
import { buildWorldAudit } from '../src/world/WorldAudit.js';
import { config, eldaraModel, fixtureDocument } from './fixtures.js';

const identity = { mapId: 'fixture' };

test('map entries must stay inside the maps directory and be listed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ws-maps-'));
  mkdirSync(path.join(dir, 'maps'));
  const manifest = path.join(dir, 'maps/manifest.json');
  writeFileSync(manifest, JSON.stringify({ maps: [
    { id: 'escape', url: '../secret.json', format: 'azgaar-full-json' },
    { id: 'other', url: 'a.map', format: 'azgaar-map' },
  ] }));
  const args = { manifestPath: manifest, mapsDirectory: path.join(dir, 'maps') };
  assert.throws(() => resolveMapEntry({ ...args, mapId: 'escape' }), /outside the maps directory/);
  assert.throws(() => resolveMapEntry({ ...args, mapId: 'other' }), /only azgaar-full-json/);
  assert.throws(() => resolveMapEntry({ ...args, mapId: 'missing' }), /not listed/);
});

test('malformed documents are rejected with the failing field', () => {
  assert.throws(() => validateAzgaarDocument(null), /not an object/);
  const doc = fixtureDocument();
  doc.settings.populationRate = 0;
  assert.throws(() => validateAzgaarDocument(doc), /populationRate/);
  const noBurgs = fixtureDocument();
  noBurgs.pack.burgs = [];
  assert.throws(() => validateAzgaarDocument(noBurgs), /pack.burgs/);
  assert.equal(validateAzgaarDocument(fixtureDocument()).info.width, 100);
});

test('population points convert to inhabitants with rate and urbanization', () => {
  const scale = populationScale({ populationRate: 1000, urbanization: 1 });
  assert.equal(burgInhabitants(14.468, scale), 14468);
  assert.equal(burgInhabitants(2, populationScale({ populationRate: 500, urbanization: 1.5 })), 1500);
  assert.equal(ruralInhabitants([{ pop: 1.25 }, { pop: 0.5 }, {}], scale), 1750);
});

test('classification boundaries follow the configured thresholds', () => {
  const classes = config.simulator.classification;
  const at = (n) => classifySettlement(n, classes).id;
  assert.deepEqual([0, 999, 1000, 2999, 3000, 7999, 8000, 14999, 15000, 24999, 25000, 1e7].map(at), [
    'named-village', 'named-village', 'small-town', 'small-town', 'town', 'town',
    'large-town', 'large-town', 'city', 'city', 'major-city', 'major-city',
  ]);
});

test('audit keeps valid settlements, reports invalid and removed ones, and assigns stable ids', () => {
  const audit = buildWorldAudit({ identity, document: fixtureDocument() }, config.simulator);
  assert.deepEqual(audit.settlements.map((s) => s.sourceId), [1, 2, 3, 4, 5]);
  assert.equal(audit.removedCount, 1);
  assert.deepEqual(audit.invalidRecords, [{ sourceId: 7, name: '', reason: 'missing name' }]);
  const three = audit.settlements[2];
  assert.equal(three.id, 'settlement:azgaar-burg:3');
  assert.equal(three.stateId, 'region:azgaar-state:1');
  assert.equal(three.provinceName, 'North');
  assert.equal(three.population, 16000);
  assert.equal(three.class, 'city');
  assert.deepEqual(three.economy.craftedGoods.map((g) => g.name), ['Tools']);
  assert.equal(three.economy.marketCenter, true);
  assert.equal(audit.counts.states, 1, 'removed states are excluded');
  assert.equal(audit.population.named, 500 + 2500 + 16000 + 30000 + 1000);
  assert.equal(audit.population.rural, 12000);
});

test('Eldara source matches the documented reference counts', () => {
  const { audit } = eldaraModel();
  assert.deepEqual(audit.counts, { settlements: 502, provinces: 131, states: 8, cultures: 14 });
  assert.ok(Object.values(audit.referenceCheck).every((c) => c.matches));
  assert.equal(audit.invalidRecords.length, 0);
  assert.equal(audit.population.named, 3592734);
  assert.equal(audit.population.total, audit.population.named + audit.population.rural);
  assert.equal(audit.classDistribution.reduce((sum, c) => sum + c.count, 0), 502);
  assert.equal(new Set(audit.settlements.map((s) => s.id)).size, 502);
  assert.equal(audit.settlements.filter((s) => s.capital).length, 8);
});
