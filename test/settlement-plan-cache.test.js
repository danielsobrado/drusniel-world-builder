import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementPlanCache } from '../src/editor/world/settlements/SettlementPlanCache.js';
import { SettlementField } from '../src/editor/world/settlements/SettlementField.js';
import { prepareSettlementSkyline } from '../src/editor/world/settlements/view/SettlementSkylineData.js';

const entry = id => ({ settlement: { id }, plan: { buildings: [{}], props: [], streets: [] },
  index: { grid: { buckets: new Map() } }, skyline: { positions: new Float32Array(12) } });

test('travel cache evicts payloads on stable entries and preserves independently pinned jobs', () => {
  const cache = new SettlementPlanCache({ maxEntries: 2 }), site = {}, terrain = {};
  const first = entry(1), second = entry(2);
  cache.pin(site, new Set([1])); cache.pin(terrain, new Set([1, 2]));
  cache.retain(first); cache.retain(second); cache.retain(entry(3));
  assert.ok(cache.getStatus().overBudget);
  cache.release(site);
  assert.ok(first.plan, 'terrain still owns the plan');
  cache.release(terrain);
  assert.equal(cache.getStatus().plans, 2);
  cache.retain(entry(4));
  assert.equal(first.plan, undefined); assert.equal(first.index, null); assert.equal(first.skyline, undefined);
  for (let id = 5; id < 100; id++) cache.retain(entry(id));
  assert.equal(cache.getStatus().plans, 2);
  assert.ok(cache.getStatus().evictions >= 97);
});

test('byte allowance includes skyline arrays and reports pinned exceptions', () => {
  const cache = new SettlementPlanCache({ maxBytes: 1000 });
  const first = entry(1), second = entry(2), owner = {};
  cache.pin(owner, new Set([1])); cache.retain(first); cache.retain(second);
  assert.ok(cache.getStatus().overBudget);
  assert.equal(cache.getStatus().skylineBytes, 96);
  cache.release(owner);
  assert.equal(cache.getStatus().plans, 1);
  assert.equal(cache.getStatus().overBudget, false);
  second.skyline.positions = new Float32Array(1000);
  second.skyline = { ...second.skyline };
  cache.retain(second);
  assert.equal(cache.getStatus().skylineBytes, 4000);
  assert.ok(cache.getStatus().overBudget);
});

test('travelling through real plans reaches a plateau and an evicted town regenerates exactly', () => {
  const field = new SettlementField({ settlements: Array.from({ length: 24 }, (_, id) => ({
    id: id + 1, cellX: id * 1000, cellZ: 0, population: 1 })), tileSize: 2,
    worldSeed: 19, sampleGround: () => 20, isBuildable: () => true });
  field.planCache = new SettlementPlanCache({ maxEntries: 2 });
  const install = entry => {
    field.ensurePlan(entry); entry.skyline = prepareSettlementSkyline(entry.plan);
    field.planCache.retain(entry);
  };
  const first = field.entries[0]; install(first);
  const plan = structuredClone(first.plan), skyline = structuredClone(first.skyline);
  const heights = [-12, 0, 12].map(x => field.grade(x, 0, 20));
  for (const entry of field.entries.slice(1)) {
    install(entry);
    assert.ok(field.planCache.getStatus().plans <= 2);
    assert.ok(field.planCache.getStatus().estimatedBytes <= field.planCache.maxBytes);
  }
  assert.equal(first.plan, undefined); assert.equal(first.index, null); assert.equal(first.skyline, undefined);
  assert.equal(field.planCache.getStatus().evictions, 22);
  install(first);
  assert.deepEqual(first.plan, plan); assert.deepEqual(first.skyline, skyline);
  assert.deepEqual([-12, 0, 12].map(x => field.grade(x, 0, 20)), heights);
});
