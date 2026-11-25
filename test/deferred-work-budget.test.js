import assert from 'node:assert/strict';
import test from 'node:test';

import { DeferredWorkBudget } from '../src/editor/performance/DeferredWorkBudget.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

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

test('publication accounting shares one allowance without double-counting water', () => {
  const budget = new DeferredWorkBudget({ enabled: true, targetFps: 144, reserveMs: 0.5,
    minimumMs: 0.25, maximumMs: 1.2, maxUploadBytes: 100 });
  budget.beginFrame();
  assert.equal(budget.canPublish(120), true, 'one indivisible oversized publication can progress');
  PerfCounters.inc('textureBytesUploaded', 40);
  PerfCounters.inc('waterUploadBytes', 40);
  PerfCounters.inc('attributeBytesUploaded', 10);
  PerfCounters.inc('publicationCustomAttributeBytes', 5);
  assert.equal(budget.remainingUploadBytes(), 45);
  assert.equal(budget.canPublish(46), false);
  const release = budget.reserveUpload(30);
  assert.equal(budget.remainingUploadBytes(), 15);
  release(); release();
  assert.equal(budget.remainingUploadBytes(), 45);
  budget.beginFrame();
  assert.equal(budget.remainingUploadBytes(), 100);
});
