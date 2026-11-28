import assert from 'node:assert/strict';
import test from 'node:test';
import { reserveEnvironmentalGroundTurn } from '../src/editor/performance/EnvironmentalGroundTurn.js';

test('late ground consumers alternate reserved turns and use the reserved gate once', () => {
  const events = [], gate = () => false;
  const budget = { slack: { frameId: 0 }, maximumMs: 1.2, shouldYield: () => true,
    canPublish: bytes => bytes <= 16, run: work => work(), reserve: amount => ({
      run(work) { events.push(amount); return work(gate); }, cancel() { events.push('cancel'); },
    }) };
  const pending = { valley: true, ambient: true };
  let turn = reserveEnvironmentalGroundTurn(budget, pending);
  assert.equal(turn.ambient, budget);
  assert.equal(turn.valley.runner(received => received), gate);
  assert.equal(turn.valley.canPublish(16), true);
  turn.cancel();
  assert.deepEqual(events, [1.2]);
  budget.slack.frameId = 2;
  turn = reserveEnvironmentalGroundTurn(budget, pending);
  assert.equal(turn.valley, budget);
  turn.cancel();
  assert.deepEqual(events, [1.2, 'cancel']);
  budget.slack.frameId = 3;
  turn = reserveEnvironmentalGroundTurn(budget, pending);
  assert.equal(turn.ambient, budget);
});
