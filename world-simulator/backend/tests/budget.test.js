import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateNpcBudget } from '../src/npc/NpcBudgetAllocator.js';
import { config, eldaraModel } from './fixtures.js';

const ranges = { small: { min: 4, max: 12 }, big: { min: 10, max: 20 } };
const town = (sourceId, population, extra = {}) => ({ id: `s${sourceId}`, sourceId, population, class: population >= 1000 ? 'big' : 'small', economy: {}, ...extra });
const towns = [town(1, 100), town(2, 400), town(3, 900), town(4, 1600), town(5, 2500)];

test('every settlement stays inside its range and the sum equals the target', () => {
  for (const target of [32, 40, 50, 60, 76]) {
    const budget = allocateNpcBudget(towns, { target, ranges });
    assert.equal(budget.feasible, true);
    assert.equal(budget.allocated, target);
    for (const a of budget.allocations) assert.ok(a.npcs >= a.min && a.npcs <= a.max);
  }
});

test('allocation is deterministic and independent of input order', () => {
  const a = allocateNpcBudget(towns, { target: 47, ranges });
  const b = allocateNpcBudget([...towns].reverse(), { target: 47, ranges });
  assert.deepEqual(a, b);
});

test('targets outside the summed bounds are infeasible and never break caps', () => {
  const low = allocateNpcBudget(towns, { target: 10, ranges });
  assert.equal(low.feasible, false);
  assert.equal(low.allocated, low.minimumTotal);
  assert.match(low.reason, /below/);
  const high = allocateNpcBudget(towns, { target: 500, ranges });
  assert.equal(high.feasible, false);
  assert.equal(high.allocated, high.maximumTotal);
  assert.match(high.reason, /exceeds/);
  assert.ok(high.allocations.every((a) => a.npcs === a.max));
});

test('capital importance raises the share of an otherwise equal settlement', () => {
  const pair = [town(1, 400), town(2, 400, { capital: true })];
  const budget = allocateNpcBudget(pair, { target: 14, ranges, importance: { capital: 2 } });
  const [plain, capital] = budget.allocations;
  assert.ok(capital.npcs > plain.npcs);
});

test('ties in remainders resolve by source id', () => {
  const pair = [town(2, 400), town(1, 400)];
  const budget = allocateNpcBudget(pair, { target: 9, ranges });
  assert.deepEqual(budget.allocations.map((a) => [a.sourceId, a.npcs]), [[1, 5], [2, 4]]);
});

test('settlements below the eligibility floor receive nothing', () => {
  const budget = allocateNpcBudget([town(1, 0), town(2, 400)], { target: 6, ranges, minimumEligiblePopulation: 1 });
  assert.equal(budget.eligibleSettlements, 1);
  assert.equal(budget.allocations.length, 1);
});

test('Eldara comparison scenarios report feasibility honestly', () => {
  const { scenarios } = eldaraModel();
  const byTarget = Object.fromEntries(scenarios.map((s) => [s.target, s]));
  assert.deepEqual(Object.keys(byTarget).map(Number), config.npc.comparisonScenarios);
  assert.equal(byTarget[10040].feasible, true);
  assert.equal(byTarget[10040].allocated, 10040);
  for (const s of scenarios) assert.equal(s.feasible, s.target >= s.minimumTotal && s.target <= s.maximumTotal);
});
