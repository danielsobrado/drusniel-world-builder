import assert from 'node:assert/strict';
import test from 'node:test';
import { DeferredWorkBudget } from '../src/editor/performance/DeferredWorkBudget.js';
import { PreparationPressure, hasPreparationBacklog } from '../src/editor/performance/PreparationPressure.js';

test('sustained backlog reaches the existing ceiling and resets once preparation clears', () => {
  const pressure = new PreparationPressure();
  pressure.update(0, true); assert.equal(pressure.floorMs, 0.25);
  pressure.update(150, true); assert.equal(pressure.floorMs, 0.25);
  pressure.update(375, true); assert.equal(pressure.floorMs, 0.725);
  pressure.update(600, true); assert.equal(pressure.floorMs, 1.2);
  pressure.update(10000, true); assert.equal(pressure.floorMs, 1.2);
  pressure.update(10001, false); assert.equal(pressure.floorMs, 1.2);
  pressure.update(10151, false); assert.equal(pressure.floorMs, 0.25);
  pressure.update(10152, true); assert.equal(pressure.ageMs, 0);
});

test('pressure grants one bounded frame allowance across queues and reservations', () => {
  let now = 0;
  const budget = new DeferredWorkBudget({ enabled: true, targetFps: 144,
    reserveMs: 0.5, minimumMs: 0.25, maximumMs: 1.2 });
  budget.slack.now = () => now;
  const queue = { size: 1 };
  budget.attachSurface({ treeBuildQueue: queue });
  budget.slack.fixedMs = 9;
  budget.beginFrame(); assert.equal(budget.available(3), 0.25);
  now = 2000;
  budget.beginFrame(); assert.equal(budget.available(3), 1.2);
  const reservation = budget.reserve(0.4);
  assert.ok(Math.abs(budget.available(3) - 0.8) < 1e-9);
  budget.run(() => { now += 0.8; });
  assert.ok(budget.available(3) < 1e-9, 'another consumer cannot grant a second floor');
  reservation.run(() => { now += 0.4; });
  assert.ok(budget.slack.deferredMs <= 1.2 + 1e-9);
  assert.ok(budget.peek(3) < 1e-9);
  queue.size = 0; now += 10;
  budget.beginFrame(); assert.equal(budget.available(3), 1.2);
  now += 151;
  budget.beginFrame(); assert.equal(budget.available(3), 0.25);
});

test('one quiet frame between a manifest and its dependent publication preserves bounded pressure', () => {
  const pressure = new PreparationPressure();
  pressure.update(0, true); pressure.update(800, true);
  pressure.update(810, false); pressure.update(826, true);
  assert.equal(pressure.floorMs, 1.2);
  assert.equal(pressure.ageMs, 826);
  pressure.update(900, false); pressure.update(1100, false);
  assert.equal(pressure.floorMs, .25);
});

test('manifest-only and meadow-only preparation participate in pressure detection', () => {
  assert.equal(hasPreparationBacklog(null), false);
  assert.equal(hasPreparationBacklog({}), false);
  assert.equal(hasPreparationBacklog({ treeView: { manifestStore: { queue: { size: 1 } } } }), true);
  assert.equal(hasPreparationBacklog({ meadowGrass: { blades: { staleTiles: [1] } } }), true);
  assert.equal(hasPreparationBacklog({ treeView: { pendingLodRebuild: {} } }), true);
  assert.equal(hasPreparationBacklog({ detailViews: [{ stagedRebuild: {} }] }), true);
});
