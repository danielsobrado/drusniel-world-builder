import test from 'node:test';
import assert from 'node:assert/strict';
import { LodBaselineDiagnostics, lodCellDiagnostics, lodRendererFrame, sampleLodPlans } from '../src/editor/performance/qa/LodBaselineDiagnostics.js';

const state = (from, target, extra = {}) => ({ from, target, complete: false, startedAt: 10,
  representations: [{ band: from, fade: 0.6 }, { band: target, fade: 0.4 }], ...extra });
const surface = states => ({ treeView: { chunkLodStates: new Map(states) } });

test('distinguishes planned overlap, pending data, and unavailable layers', () => {
  const world = surface([['0:0', state('near', 'proxy')], ['1:0', state('culled', 'near', { waitingForData: true })]]);
  const { layers, next } = sampleLodPlans(world, 110);
  assert.equal(layers.tree.overlapping, 1);
  assert.equal(layers.tree.transitioning, 1);
  assert.equal(layers.tree.pendingData, 1);
  assert.equal(layers.tree.maxPendingDataAgeMs, 100);
  assert.equal(layers.rock, null);
  assert.equal(lodCellDiagnostics(world, '0:0', 110).tree.target, 'proxy');
  world.treeView.chunkLodStates.set('0:0', state('proxy', 'near'));
  assert.equal(sampleLodPlans(world, 210, next).layers.tree.observedReversals, 1);
});

test('sampling is throttled, resettable and missing counters are not zero', () => {
  const diagnostics = new LodBaselineDiagnostics();
  const world = surface([]);
  diagnostics.sample(world, 0, 0);
  diagnostics.sample(world, 50, 1);
  diagnostics.sample(world, 100, 2);
  const report = diagnostics.report([{ countersDelta: { sceneryLodHandoffTimeouts: 2 } }]);
  assert.equal(report.samples.length, 2);
  assert.equal(report.counters.sceneryLodHandoffTimeouts, 2);
  assert.equal(report.counters.sceneryLodHandoffDeferred, null);
  diagnostics.reset();
  assert.equal(diagnostics.report([]).samples.length, 0);
});


test('whole renderer frame accounting preserves zero and missing measurements', () => {
  const frame = lodRendererFrame({ info: { render: { calls: 0, triangles: 30 }, memory: {} } });
  assert.deepEqual(frame, { draws: 0, triangles: 30, bytes: null });
  const report = new LodBaselineDiagnostics().report([{ index: 2, dt: 12, counters: frame }]);
  assert.deepEqual(report.rendererFrames, [{ frameIndex: 2, dtMs: 12, draws: 0, triangles: 30, bytes: null }]);
});
