import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { GpuPassFeedback, classifyGpuPass, groupGpuPasses, bindGpuFeedback, readGpuFeedback } from '../src/editor/performance/gpu/GpuPassFeedback.js';
import { GpuPassProfiler } from '../src/editor/performance/qa/GpuPassProfiler.js';
import { AuxiliaryGpuFeedback, auxiliaryGpuCosts } from '../src/editor/performance/gpu/AuxiliaryGpuFeedback.js';
import { AtmosphericPassAdmission, atmosphericLayerBudget } from '../src/render/postprocessing/AtmosphericPassAdmission.js';

const config = resolveRenderEnhancements();
const settings = config.gpuAdmissionBudget;
function fixture() {
  const profiler = { enabled: true, error: null, latestSample: null, markScope() {} };
  const feedback = new GpuPassFeedback(profiler, settings);
  const sample = (timestamp, totalMs, passes, scope = 'world') => {
    profiler.latestSample = { timestamp, totalMs, passes, scope };
    return feedback.read(scope, timestamp + 1);
  };
  return { profiler, feedback, sample };
}

test('only controllable named GPU passes contribute to group cost', () => {
  assert.equal(classifyGpuPass('GTAONode.AO (context 19)'), 'ao');
  assert.equal(classifyGpuPass('Godrays (context 7)'), 'volumetric');
  assert.equal(classifyGpuPass('ShadowMapFarCascade (context 8)'), null);
  assert.deepEqual(groupGpuPasses({ 'Adaptive Bloom Prefilter (context 1)': 0.7,
    'Adaptive Bloom Downsample 1 (context 2)': 0.5, 'Adaptive SSR Trace': 2,
    'GTAONode.AO': 0, screen: 15 }), { bloom: 1.2, ssr: 2 });
});
test('distinct high samples reduce only the most expensive eligible effect', () => {
  const { sample, feedback } = fixture();
  const passes = { 'Adaptive SSR Trace': 3, 'GTAONode.AO': 0.4, 'Adaptive Bloom Prefilter': 1.1 };
  assert.deepEqual(sample(100, 15, passes).groups, []);
  for (let i = 0; i < 20; i++) assert.deepEqual(feedback.read('world', 101 + i).groups, []);
  assert.deepEqual(sample(200, 15, passes).groups, []);
  assert.deepEqual(sample(300, 15, passes).groups, ['ssr']);
  assert.deepEqual(sample(400, 15, passes).groups, ['ssr', 'bloom']);
});
test('expensive scene without expensive known effects preserves authored quality', () => {
  const { sample } = fixture();
  for (let i = 1; i <= 10; i++) assert.deepEqual(sample(i * 100, 25, { screen: 24, 'GTAONode.AO': 0.4 }).groups, []);
});
test('low total alone or missing group timings cannot release the reduction', () => {
  const { sample } = fixture();
  for (let i = 1; i <= 3; i++) sample(i * 100, 15, { 'Adaptive SSR Trace': 3 });
  for (let i = 4; i <= 30; i++) assert.deepEqual(sample(i * 100, 6, { screen: 6 }).groups, ['ssr']);
  for (let i = 31; i <= 37; i++) assert.deepEqual(sample(i * 100, 7, { 'Adaptive SSR Trace': 0.5 }).groups, ['ssr']);
  assert.deepEqual(sample(3800, 7, { 'Adaptive SSR Trace': 0.5 }).groups, []);
});
test('stale, mismatched, future and failed timestamps fall back', () => {
  const { sample, feedback, profiler } = fixture();
  sample(100, 15, { 'Adaptive SSR Trace': 3 });
  assert.equal(feedback.read('location', 101), null);
  assert.equal(feedback.read('world', 99), null);
  assert.equal(feedback.read('world', 2000), null);
  sample(2100, 15, { 'Adaptive SSR Trace': 3 });
  profiler.error = 'lost';
  assert.equal(feedback.read('world', 2102), null);
});
test('bypass and path changes require a new completed sample before resuming feedback', () => {
  const { sample, feedback } = fixture();
  sample(100, 15, { 'Adaptive SSR Trace': 3 });
  assert.equal(feedback.read('world', 102, true), null);
  assert.equal(feedback.read('world', 103), null);
  assert.deepEqual(sample(200, 15, { 'Adaptive SSR Trace': 3 }).groups, []);
  assert.equal(feedback.read('location', 202), null);
  assert.equal(feedback.read('world', 203), null);
  assert.deepEqual(sample(300, 15, { 'Adaptive SSR Trace': 3 }).groups, []);
});
test('measured mask selectively overrides cadence and restores authored quality before fallback', () => {
  const admission = new AtmosphericPassAdmission(config.atmosphericPassBudget, 'test');
  const profile = admission.update(100, false, { groups: ['ssr'] });
  assert.equal(atmosphericLayerBudget(profile, 'ao'), null);
  assert.equal(atmosphericLayerBudget(profile, 'ssr'), profile);
  assert.equal(admission.qualityKey, 'ssr');
  admission.update(101, false, { groups: ['ao'] });
  assert.equal(admission.qualityKey, 'ao');
  assert.equal(admission.update(102), null);
  assert.equal(admission.qualityKey, 'full');
  assert.equal(admission.update(103, true, { groups: ['ao'] }), null);
});
test('renderer binding disposal does not remove another owner', () => {
  const renderer = {};
  const a = fixture(), b = fixture();
  const releaseA = bindGpuFeedback(renderer, a.feedback);
  const releaseB = bindGpuFeedback(renderer, b.feedback);
  b.sample(100, 5, { 'GTAONode.AO': 1 });
  releaseA();
  assert.deepEqual(readGpuFeedback(renderer, 'world', 101).groups, []);
  releaseB();
  assert.equal(readGpuFeedback(renderer, 'world', 101), null);
});
test('sample owner resolves asynchronously and keeps only the latest runtime sample', async () => {
  const backend = { isWebGPUBackend: true, trackTimestamp: true, beginRender() {},
    getTimestampUID: context => context.id, getTimestamp: () => 2 };
  const original = backend.beginRender;
  const renderer = { backend, resolveTimestampsAsync: () => Promise.resolve() };
  const profiler = new GpuPassProfiler(renderer, { requested: true, sampleEvery: 1, retainHistory: false });
  for (let i = 1; i <= 3; i++) {
    profiler.beginFrame(i * 100);
    profiler.markScope('world');
    backend.beginRender({ id: i, renderTarget: { texture: { name: 'Adaptive SSR Trace' } } });
    profiler.endFrame();
    assert.equal(backend.trackTimestamp, false);
    await profiler.pending;
  }
  assert.equal(profiler.samples.length, 1);
  assert.equal(profiler.latestSample.timestamp, 300);
  assert.equal(profiler.latestSample.scope, 'world');
  profiler.beginFrame(400);
  profiler.markScope('world');
  profiler.markScope('location');
  backend.beginRender({ id: 4 });
  profiler.endFrame();
  await profiler.pending;
  assert.equal(profiler.latestSample.scope, null);
  profiler.dispose();
  assert.equal(backend.beginRender, original);
  assert.equal(profiler.latestSample, null);
});
test('synchronous timestamp failure disables sampling without leaving tracking on', () => {
  const backend = { isWebGPUBackend: true, trackTimestamp: true, beginRender() {} };
  const profiler = new GpuPassProfiler({ backend, resolveTimestampsAsync() { throw Error('unavailable'); } }, { requested: true });
  profiler.beginFrame(100);
  profiler.endFrame();
  assert.equal(profiler.error, 'unavailable');
  assert.equal(backend.trackTimestamp, false);
  profiler.beginFrame(200);
  assert.equal(profiler.active, false);
  profiler.dispose();
});
test('configuration is independent and validates measurement settings', () => {
  const enabled = resolveRenderEnhancements({}, '?measuredGpuAdmission=1');
  assert.equal(config.measuredGpuAdmission, false);
  assert.equal(enabled.measuredGpuAdmission, true);
  assert.equal(enabled.atmosphericPassAdmission, false);
  assert.throws(() => resolveRenderEnhancements({ gpuAdmissionBudget: { recoveryRenderMs: 14 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ gpuAdmissionBudget: { passMs: { ao: -1 } } }), RangeError);
});

test('auxiliary attribution ignores all unnamed and unrelated passes', () => {
  assert.deepEqual(auxiliaryGpuCosts({ 'ShadowMapFarCascade (context 9)': 1.5,
    'WaterReflectionCubeFace (context 12)': 2, 'WaterReflectionPlanar (context 13)': 3,
    'shadow/depth': 8, screen: 10, 'WaterReflectionCubeFace (context 14)': 1 }), { farShadow: 1.5, cube: 3, planar: 3 });
});

function auxiliaryFixture() {
  const profiler = { enabled: true, error: null, latestSample: null };
  const feedback = new AuxiliaryGpuFeedback(profiler, settings);
  feedback.read('world', 0);
  const sample = (timestamp, totalMs, passes, scope = 'world') => {
    profiler.latestSample = { timestamp, totalMs: 100, passes: { screen: 100 },
      gameplay: { scope, totalMs, passes } };
    return feedback.read(scope, timestamp + 1);
  };
  return { profiler, feedback, sample };
}

test('sparse measured GPU observations independently pressure only expensive auxiliary targets', () => {
  const { feedback, sample } = auxiliaryFixture();
  assert.equal(sample(100, 16, { ShadowMapFarCascade: 3 }).farShadow, false);
  for (let i = 0; i < 10; i++) assert.equal(feedback.read('world', 101 + i).farShadow, false);
  sample(200, 16, { WaterReflectionCubeFace: 3 });
  sample(300, 16, { ShadowMapFarCascade: 3 });
  const reduced = sample(400, 16, { ShadowMapFarCascade: 3, WaterReflectionPlanar: 1 });
  assert.deepEqual(reduced, { farShadow: true, cube: false, planar: false });
  sample(500, 16, { WaterReflectionCubeFace: 3 });
  const both = sample(600, 16, { WaterReflectionCubeFace: 3 });
  assert.equal(both.cube, true);
  assert.equal(both.planar, false);
  assert.equal(sample(2001, 8, { screen: 8 }).farShadow, false, 'expired pass evidence is not retained');
});

test('recovery requires distinct low-cost observations, and scope changes reject old samples', () => {
  const { sample, feedback } = auxiliaryFixture();
  for (const now of [100, 200, 300]) sample(now, 16, { WaterReflectionPlanar: 4 });
  assert.equal(sample(400, 8, { screen: 8 }).planar, true);
  for (let i = 1; i <= 8; i++) sample(400 + i * 250, 8, { WaterReflectionPlanar: 1 });
  assert.equal(feedback.read('world', 2401).planar, false);
  assert.equal(feedback.read(null, 2402), null);
  assert.equal(feedback.read('world', 2403), null);
  assert.equal(feedback.read('world', 2404), null);
  assert.equal(sample(2500, 8, { WaterReflectionPlanar: 1 }).planar, false);
});

test('profiler exposes only completed gameplay-window passes, not preparation or failed draws', async () => {
  const backend = { isWebGPUBackend: true, trackTimestamp: true, beginRender() {},
    getTimestampUID: context => context.id, getTimestamp: uid => uid, hasTimestampQuery: uid => uid !== 99 };
  const profiler = new GpuPassProfiler({ backend, resolveTimestampsAsync: () => Promise.resolve() }, { requested: true, sampleEvery: 1 });
  profiler.beginFrame(100);
  backend.beginRender({ id: 10, renderTarget: { texture: { name: 'ShadowMapFarCascade' } } });
  profiler.beginGameplay('world');
  backend.beginRender({ id: 2, renderTarget: { texture: { name: 'ShadowMapFarCascade' } } });
  backend.beginRender({ id: 3, renderTarget: { texture: { name: 'WaterReflectionCubeFace' } } });
  profiler.endGameplay();
  backend.beginRender({ id: 4 });
  profiler.endFrame(); await profiler.pending;
  assert.equal(profiler.latestSample.totalMs, 19);
  assert.equal(profiler.latestSample.gameplay.totalMs, 5);
  assert.deepEqual(auxiliaryGpuCosts(profiler.latestSample.gameplay.passes), { farShadow: 2, cube: 3 });
  profiler.beginFrame(200); profiler.beginGameplay('world'); backend.beginRender({ id: 2 });
  profiler.endGameplay(false); profiler.endFrame(); await profiler.pending;
  assert.equal(profiler.latestSample.gameplay, undefined);
  profiler.beginFrame(300); profiler.beginGameplay('world'); backend.beginRender({ id: 2 }); backend.beginRender({ id: 99 });
  profiler.endGameplay(); profiler.endFrame(); await profiler.pending;
  assert.equal(profiler.latestSample.gameplay, undefined);
  profiler.dispose();
});

test('auxiliary thresholds are independently configurable and validated', () => {
  assert.equal(resolveRenderEnhancements({ gpuAdmissionBudget: { auxiliaryPassMs: { cube: 3 } } }).gpuAdmissionBudget.auxiliaryPassMs.cube, 3);
  assert.throws(() => resolveRenderEnhancements({ gpuAdmissionBudget: { auxiliaryPassMs: { cube: 0 } } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ gpuAdmissionBudget: { auxiliaryPassMs: { unknown: 1 } } }), RangeError);
});

test('runtime staggering visits alternate phases without changing the QA cadence', async () => {
  const captures = async staggerSamples => {
    const backend = { isWebGPUBackend: true, trackTimestamp: true, beginRender() {},
      getTimestampUID: context => context.id, getTimestamp: () => 1 };
    const profiler = new GpuPassProfiler({ backend, resolveTimestampsAsync: () => Promise.resolve() },
      { requested: true, sampleEvery: 4, staggerSamples });
    const frames = [];
    for (let frame = 0; frame < 18; frame++) {
      profiler.beginFrame(frame * 16);
      if (profiler.active) {
        frames.push(frame);
        backend.beginRender({ id: frame });
        profiler.endFrame();
        await profiler.pending;
      }
    }
    profiler.dispose();
    return frames;
  };
  assert.deepEqual(await captures(false), [0, 4, 8, 12, 16]);
  assert.deepEqual(await captures(true), [0, 4, 9, 13]);
});
