import assert from 'node:assert/strict';
import test from 'node:test';

import { DeferredWorkBudget } from '../src/editor/performance/DeferredWorkBudget.js';

test('end-frame telemetry does not open a deferred-work deadline', () => {
  const budget = new DeferredWorkBudget({
    enabled: true,
    targetFps: 144,
    reserveMs: 0.5,
    minimumMs: 0.25,
    maximumMs: 1.2,
  });

  budget.beginFrame();
  budget.endFrame();

  assert.equal(budget.slack.deadline, null);
});

test('shared shouldYield is stable and non-mutating', () => {
  const budget = new DeferredWorkBudget({
    enabled: true,
    targetFps: 144,
    reserveMs: 0.5,
    minimumMs: 0.25,
    maximumMs: 1.2,
  });

  const gate = budget.shouldYield;
  budget.beginFrame();
  assert.equal(gate, budget.shouldYield);
  assert.equal(gate(), false);
  assert.equal(budget.slack.deadline, null);
});


test('tryRun does not execute after the shared allowance is consumed', () => {
  const budget = new DeferredWorkBudget({
    enabled: true,
    targetFps: 144,
    reserveMs: 0.5,
    minimumMs: 0.25,
    maximumMs: 1.2,
  });

  budget.beginFrame();
  budget.slack.allowanceMs = 0;
  let ran = false;
  const result = budget.tryRun(() => { ran = true; }, 1);

  assert.equal(result, undefined);
  assert.equal(ran, false);
});
