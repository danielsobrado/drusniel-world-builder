import assert from 'node:assert/strict';
import test from 'node:test';
import { GpuPassProfiler } from '../src/editor/performance/qa/GpuPassProfiler.js';

test('normal rendering and unsupported adapters never request GPU readback', () => {
  const renderer = { backend: { isWebGPUBackend: true, trackTimestamp: true },
    resolveTimestampsAsync() { throw new Error('Normal-runtime readback'); } };
  const normal = new GpuPassProfiler(renderer);
  normal.beginFrame(0); normal.endFrame(); assert.equal(normal.report(), null);
  const unsupported = new GpuPassProfiler({ backend: { isWebGPUBackend: true, trackTimestamp: false } }, { requested: true });
  unsupported.beginFrame(0); unsupported.endFrame(); assert.equal(unsupported.report().supported, false);
});

test('GPU pass readback is asynchronous, attributed by context and excluded after a capture reset', async () => {
  let release;
  const backend = { isWebGPUBackend: true, trackTimestamp: true, beginRender() {},
    getTimestampUID: context => `r:${context.id}:f1`, getTimestamp: () => 2.5 };
  const renderer = { backend, resolveTimestampsAsync: () => new Promise(resolve => { release = resolve; }) };
  const profiler = new GpuPassProfiler(renderer, { requested: true, sampleEvery: 1 }); profiler.reset();
  profiler.beginFrame(16); backend.beginRender({ id: 4, color: false }); profiler.endFrame();
  assert.equal(backend.trackTimestamp, false);
  profiler.beginFrame(32); assert.equal(backend.trackTimestamp, false);
  release(); await profiler.pending;
  assert.equal(profiler.report().total.avgMs, 2.5);
  assert.equal(profiler.report().passes['shadow/depth (context 4)'].avgMs, 2.5);
  profiler.beginFrame(48); backend.beginRender({ id: 5, color: true }); profiler.endFrame();
  profiler.reset(); release(); await profiler.pending;
  assert.equal(profiler.report().total.samples, 0); profiler.dispose();
});
