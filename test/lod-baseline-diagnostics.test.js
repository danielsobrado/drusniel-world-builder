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

test('hitch attribution uses the preceding callback and its LOD sampler', () => {
  const diagnostics = new LodBaselineDiagnostics();
  diagnostics.sample(surface([]), 1, 20);
  const report = diagnostics.report([
    { index: 20, dt: 12, phases: { stylized: 208 } },
    { index: 21, dt: 215, hitch: true, phases: { stylized: 1 } },
  ]);
  assert.deepEqual(report.hitchCallbackFrames, [{ hitchFrame: 21, precedingFrame: 20,
    precedingPhases: { stylized: 208 }, precedingSamplerMs: report.samples[0].samplingCpuMs }]);
  assert.equal(report.handoffMeanReadyWaitMs, null);
});


test('reused planner maps discard removed chunks and preserve layer identity', () => {
  const diagnostics = new LodBaselineDiagnostics();
  const world = surface([['0:0', state('near', 'proxy')]]);
  diagnostics.sample(world, 0, 0);
  world.treeView.chunkLodStates.clear();
  diagnostics.sample(world, 100, 1);
  world.treeView.chunkLodStates.set('0:0', state('proxy', 'near'));
  diagnostics.sample(world, 200, 2);
  assert.equal(diagnostics.report([]).samples[2].layers.tree.observedReversals, 0);
});

test('missing lease duration and nonadjacent callbacks remain unknown', () => {
  const report = new LodBaselineDiagnostics().report([
    { index: 2, dt: 10, countersDelta: { sceneryLodHandoffDrawsReady: 1 } },
    { index: 4, dt: 40, hitch: true },
  ]);
  assert.equal(report.handoffMeanReadyWaitMs, null);
  assert.equal(report.hitchCallbackFrames[0].precedingFrame, null);
});
