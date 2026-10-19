import assert from 'node:assert/strict';
import test from 'node:test';
import { perfPreparationFailures } from '../scripts/lib/perf-preparation-gates.mjs';

test('direct performance runner rejects initial and revisit settling timeouts', () => {
  const report = { scenario: { settle: { settled: false } },
    revisit: { scenario: { settle: { settled: false } } } };
  assert.equal(perfPreparationFailures(report, true).length, 2);
  report.scenario.settle.settled = true;
  assert.deepEqual(perfPreparationFailures(report, true), ['revisit: preparation did not settle before measurement']);
  report.revisit.scenario.settle.settled = true;
  assert.deepEqual(perfPreparationFailures(report, true), []);
  report.preparation = { start: { ready: false } };
  assert.match(perfPreparationFailures(report, true)[0], /incomplete scenery/);
});

test('an explicitly requested settle cannot pass with missing evidence', () => {
  assert.equal(perfPreparationFailures({}, true).length, 1);
  assert.deepEqual(perfPreparationFailures({ scenario: { settle: null } }), []);
});
