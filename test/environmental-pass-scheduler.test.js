import assert from 'node:assert/strict';
import test from 'node:test';
import { EnvironmentalPassScheduler } from '../src/editor/performance/EnvironmentalPassScheduler.js';

test('visual passes preserve cadence, allow urgent changes and bound deferral', () => {
  let time = 0, runs = 0;
  const scheduler = new EnvironmentalPassScheduler({}, () => time);
  const budget = { reserveStrict: () => null, run: work => work() };
  const draw = () => runs++;
  assert.equal(scheduler.run('wind', budget, draw, { urgent: true }), true);
  time = 5;
  assert.equal(scheduler.run('wind', budget, draw, { intervalMs: 10 }), false);
  time = 11;
  assert.equal(scheduler.run('wind', budget, draw, { intervalMs: 10, maxDeferralMs: 20 }), false);
  time = 31;
  assert.equal(scheduler.run('wind', budget, draw, { intervalMs: 10, maxDeferralMs: 20 }), true);
  assert.equal(runs, 2);
});

test('ground preparation gets a bounded progress slice during sustained contention', () => {
  let time = 0, progress = 0;
  const scheduler = new EnvironmentalPassScheduler({ fieldMaxDeferralMs: 100 }, () => time);
  const budget = { available: () => 0, run: work => work() };
  const prepare = gate => { if (!gate()) progress++; };
  scheduler.prepare('snow', budget, prepare);
  time = 50; scheduler.prepare('snow', budget, prepare);
  time = 100; scheduler.prepare('snow', budget, prepare);
  assert.equal(progress, 2);
});
