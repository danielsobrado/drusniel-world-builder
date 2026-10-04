import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameProfiler } from '../src/editor/performance/qa/FrameProfiler.js';
import { buildPerfReport } from '../src/editor/performance/qa/buildPerfReport.js';
import { PerfQaHarness } from '../src/editor/performance/qa/PerfQaHarness.js';

test('scenery percentiles sum early preparation and updates within each frame', () => {
  const previous = globalThis.performance;
  let now = 0;
  globalThis.performance = { now: () => now };
  try {
    const profiler = new FrameProfiler();
    profiler.start(); profiler.beginFrame(0); profiler.endFrame({});
    for (const [index, preparation] of [8, 0].entries()) {
      now = (index + 1) * 10;
      profiler.beginFrame(now);
      now += preparation; profiler.mark('placementPreparation');
      now += 8 - preparation; profiler.mark('stylized');
      now += 1; profiler.mark('render');
      profiler.endFrame({});
    }
    const report = buildPerfReport({ config: {}, profiler });
    assert.deepEqual(report.sceneryUpdateCpu, {
      includesPlacementPreparation: true, avgMs: 8, p95Ms: 8, p99Ms: 8, maxMs: 8,
    });
    assert.equal(report.cpuUpdate.p95Ms, 9, 'combined scenery is not counted twice');
  } finally { globalThis.performance = previous; }
});

test('sampling diagnostics collect only measured misses and release their observer', () => {
  let previousCalls = 0;
  const observer = () => previousCalls++;
  const worldStore = { onProceduralSamplingMiss: observer };
  const harness = new PerfQaHarness({ config: { keys: [] }, terrainView: { worldStore },
    playerController: { setHarnessActive() {}, setHarnessKeys() {} } });
  worldStore.onProceduralSamplingMiss({ kind: 'height', x: 0, z: 0 });
  assert.equal(harness.samplingMisses.length, 0);
  harness.status = 'running'; harness.phaseIndex = 1;
  for (let x = 0; x < 10; x++) worldStore.onProceduralSamplingMiss({ kind: 'height', x, z: 0 });
  assert.equal(harness.samplingMisses.length, 8);
  assert.equal(previousCalls, 11);
  assert.match(harness.samplingMisses[0].stack, /sceneryCpuReport/);
  harness.dispose();
  assert.strictEqual(worldStore.onProceduralSamplingMiss, observer);
});
