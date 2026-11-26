import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { AtmosphericPassAdmission, reducedSampleCount, reducedResolution } from '../src/render/postprocessing/AtmosphericPassAdmission.js';

const settings = resolveRenderEnhancements().atmosphericPassBudget;
function run(controller, start, delta, count) {
  let now = start;
  for (let i = 0; i < count; i++) controller.update(now += delta);
  return now;
}

test('short hitches do not reduce quality; sustained pressure does', () => {
  const c = new AtmosphericPassAdmission(settings, 'test');
  c.update(0);
  c.update(80);
  c.update(96);
  assert.equal(c.reduced, false);
  const now = run(c, 96, 20, 14);
  assert.equal(c.reduced, false);
  assert.equal(c.update(now + 20), settings);
});
test('quality recovery requires dwell and sustained fast frames', () => {
  const c = new AtmosphericPassAdmission(settings, 'test');
  c.update(0);
  let now = run(c, 0, 20, 15);
  assert.equal(c.reduced, true);
  now = run(c, now, 16, 150);
  assert.equal(c.reduced, true);
  run(c, now, 16, 40);
  assert.equal(c.reduced, false);
});
test('slow frames interrupt recovery and middle-band frames keep the current tier', () => {
  const c = new AtmosphericPassAdmission(settings, 'test');
  c.update(0);
  let now = run(c, 0, 20, 15);
  now = run(c, now, 16, 100);
  now = run(c, now, 17.5, 100);
  assert.equal(c.reduced, true);
  now = run(c, now, 16, 120);
  assert.equal(c.reduced, true);
  c.update(now + 32);
  assert.equal(c.fastMs, 0);
});
test('gaps and backward clock reset stale quality without counting elapsed downtime', () => {
  const c = new AtmosphericPassAdmission(settings, 'test');
  c.update(0);
  let now = run(c, 0, 20, 15);
  assert.equal(c.reduced, true);
  assert.equal(c.update(now + 500), null);
  now = run(c, now + 500, 20, 15);
  assert.equal(c.reduced, true);
  assert.equal(c.update(0), null);
});
test('diagnostic bypass restores authored quality and separate paths do not share pressure', () => {
  const a = new AtmosphericPassAdmission(settings, 'world-test');
  const b = new AtmosphericPassAdmission(settings, 'location-test');
  a.update(0);
  const now = run(a, 0, 20, 15);
  assert.equal(a.reduced, true);
  assert.equal(b.update(now), null);
  assert.equal(a.update(now + 20, true), null);
});
test('count and resolution reductions never raise an authored quality setting', () => {
  assert.equal(reducedSampleCount(18, 0.65, 12), 12);
  assert.equal(reducedSampleCount(8, 0.65, 12), 8);
  assert.equal(reducedSampleCount(40, 0.6, 16), 24);
  assert.equal(reducedSampleCount(32, 0.5, 8), 16);
  assert.equal(reducedResolution(0.5, 0.75, 0.25), 0.375);
  assert.equal(reducedResolution(0.25, 0.75, 0.25), 0.25);
});
test('configuration is independently opt-in and validates ordering and types', () => {
  assert.equal(resolveRenderEnhancements().atmosphericPassAdmission, false);
  assert.equal(resolveRenderEnhancements({}, '?atmosphericPassAdmission=1').atmosphericPassAdmission, true);
  assert.throws(() => resolveRenderEnhancements({ atmosphericPassBudget: { recoveryFrameMs: 20 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ atmosphericPassBudget: { ssrStepFactor: 0 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ atmosphericPassBudget: { reduceBloomFilter: 'true' } }), TypeError);
});
