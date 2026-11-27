import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three/webgpu';
import { OceanFftController } from '../src/editor/water/fft/OceanFftController.js';
import { GpuSnowComputeField } from '../src/editor/stylized/snow/GpuSnowComputeField.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { GpuComputeBudget, bindComputeBudget, admitCompute, cancelComputeWait } from '../src/editor/performance/gpu/GpuComputeBudget.js';

const settings = resolveRenderEnhancements().gpuComputeBudget;
const fixture = () => new GpuComputeBudget({ ...settings, frameCredits: 10, mandatoryReserveCredits: 4 });

test('shared credits reserve future mandatory work and never deny mandatory dependencies', () => {
  const budget = fixture(), a = {}, b = {};
  budget.beginFrame(0);
  assert.equal(budget.admit(a, 'fft', 6), true);
  assert.equal(budget.admit(b, 'snow'), false);
  assert.equal(budget.admit(b, 'impostor', 10, true), true);
  assert.equal(budget.used, 16);
  assert.equal(budget.mandatory, 10);
  budget.endFrame();
  assert.equal(budget.admit(b, 'snow'), true, 'outside a frame always bypass');
});

test('optional deadline is per owner, not reset by intervening frames', () => {
  const budget = fixture(), a = {}, b = {};
  budget.beginFrame(0);
  assert.equal(budget.admit(a, 'fft', 20), false);
  budget.beginFrame(20);
  assert.equal(budget.admit(a, 'fft', 20), false);
  assert.equal(budget.admit(b, 'fft', 20), false);
  budget.beginFrame(34);
  assert.equal(budget.admit(a, 'fft', 20), true);
  assert.equal(budget.admit(b, 'fft', 20), false);
  assert.equal(budget.forced, 1);
  assert.equal(budget.optional, 20);
});

test('mandatory use consumes reserved credits rather than counting reserve twice', () => {
  const budget = fixture(), owner = {};
  budget.beginFrame(0);
  budget.admit(owner, 'impostor', 4, true);
  assert.equal(budget.admit(owner, 'fft', 6), true);
  assert.equal(budget.used, 10);
});

test('cancel, suspend and clock gaps clear pending evidence', () => {
  const budget = fixture(), owner = {};
  budget.beginFrame(0); budget.admit(owner, 'fft', 20);
  budget.cancel(owner);
  budget.beginFrame(34); assert.equal(budget.admit(owner, 'fft', 20), false);
  budget.beginFrame(300); assert.equal(budget.admit(owner, 'fft', 20), false);
  budget.beginFrame(200); assert.equal(budget.admit(owner, 'fft', 20), false);
  budget.suspend();
  budget.beginFrame(1000); assert.equal(budget.admit(owner, 'fft', 20), false);
});

test('renderer bindings do not affect standalones or another renderer', () => {
  const a = {}, b = {}, owner = {}, first = fixture(), second = fixture();
  const releaseFirst = bindComputeBudget(a, first);
  const releaseSecond = bindComputeBudget(a, second);
  releaseFirst();
  second.beginFrame(0);
  assert.equal(admitCompute(a, owner, 'fft', 20), false);
  assert.equal(admitCompute(b, owner, 'fft', 20), true);
  cancelComputeWait(a, owner);
  second.beginFrame(34);
  assert.equal(admitCompute(a, owner, 'fft', 20), false);
  releaseSecond();
  assert.equal(admitCompute(a, owner, 'fft', 20), true);
});

test('configuration is opt-in, nested and validated', () => {
  assert.equal(resolveRenderEnhancements().gpuComputeAdmission, false);
  assert.equal(resolveRenderEnhancements({}, '?gpuComputeAdmission=1').gpuComputeAdmission, true);
  assert.equal(resolveRenderEnhancements({ gpuComputeBudget: { credits: { snow: 4 } } }).gpuComputeBudget.credits.fft, 1);
  assert.throws(() => resolveRenderEnhancements({ gpuComputeBudget: { frameCredits: 2 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ gpuComputeBudget: { maxDeferralMs: { snow: 70 } } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ gpuComputeBudget: { credits: { unknown: 1 } } }), RangeError);
});

test('FFT keeps its published output and spectrum while waiting and seeks at absolute time', () => {
  const budget = fixture(), device = {}, renderer = { backend: { device } };
  const release = bindComputeBudget(renderer, budget);
  const controller = Object.create(OceanFftController.prototype);
  const calls = [], output = {}, elapsed = [];
  Object.assign(controller, { lastMs: null, lastPreparedTime: null, forceNextPrepare: true,
    runtime: { state: 'active', renderer, device, kernels: { dispatchCount: 20 },
      output, counters: { transforms: 0 }, prepare: time => calls.push(time) },
    binding: { available: { value: 1 }, update(value) { assert.equal(value, output); } },
    spectrum: { wind: { windSpeed: 1 }, update(dt) { elapsed.push(dt); return null; } },
  });
  try {
    budget.beginFrame(0); controller.prepare(0, 0);
    budget.beginFrame(16); controller.prepare(0.016, 16);
    budget.beginFrame(32); controller.prepare(0.032, 32);
    assert.deepEqual(calls, [0]);
    assert.deepEqual(elapsed, [0]);
    budget.beginFrame(50); controller.prepare(0.05, 50);
    assert.deepEqual(calls, [0, 0.05]);
    assert.equal(elapsed[1], 0.05);
    budget.beginFrame(60); controller.prepare(3, 60);
    assert.deepEqual(calls, [0, 0.05, 3]);
    budget.beginFrame(70); controller.prepare(1, 70);
    assert.deepEqual(calls, [0, 0.05, 3, 1]);
  } finally { release(); }
});

test('deferred cosmetic snow preserves submitted focus and integrates accumulated delta', () => {
  const budget = fixture(), calls = [], renderer = { compute: node => calls.push(node) };
  const release = bindComputeBudget(renderer, budget);
  const snow = Object.create(GpuSnowComputeField.prototype);
  const vector = () => ({ value: new Vector3() });
  Object.assign(snow, { renderer, supported: true, ground: { ready: true }, mesh: { visible: false },
    initialized: false, pendingDelta: 0, current: 0, lastPlayerPos: null, playerVelScratch: new Vector3(),
    initCompute: 'init', stepCompute: 'step',
    uniforms: { intensity: { value: 0 }, stormBoost: { value: 0 }, dt: { value: 0 }, focus: vector(),
      shift: vector(), wind: vector(), playerPos: vector(), playerVel: vector() },
  });
  const state = { focus: { x: 0, y: 0, z: 0 }, weights: { snow: 1 }, windiness: 1, axis: { x: 1, z: 0 } };
  try {
    budget.beginFrame(0); snow.update(0.016, state);
    assert.deepEqual(calls, ['init', 'step']);
    budget.beginFrame(16); budget.admit({}, 'ripple', 8, true);
    state.focus.x = 1; snow.update(0.016, state);
    assert.equal(snow.uniforms.focus.value.x, 0);
    assert.equal(snow.pendingDelta, 0.016);
    assert.deepEqual(calls, ['init', 'step']);
    snow.shiftWorld(128, 0);
    state.focus.x = -126;
    budget.beginFrame(32); snow.update(0.016, state);
    assert.equal(snow.uniforms.focus.value.x, -126);
    assert.equal(snow.uniforms.shift.value.x, 2);
    assert.equal(snow.uniforms.dt.value, 0.032);
    assert.deepEqual(calls, ['init', 'step', 'step']);
    budget.beginFrame(48); budget.admit({}, 'ripple', 8, true);
    state.focus.x += 20; snow.update(0.016, state);
    assert.equal(snow.pendingDelta, 0);
    assert.equal(snow.uniforms.shift.value.x, 20);
    assert.deepEqual(calls, ['init', 'step', 'step', 'step']);
  } finally { release(); }
});
