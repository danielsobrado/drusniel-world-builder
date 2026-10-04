import assert from 'node:assert/strict';
import test from 'node:test';
import { UnderwaterCausticsPostProcess } from '../src/editor/water/UnderwaterCausticsPostProcess.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

test('caustic reports keep the full pipeline cost while isolating the post-effect', () => {
  const previous = globalThis.performance;
  let now = 0;
  globalThis.performance = { now: () => now };
  const effect = Object.create(UnderwaterCausticsPostProcess.prototype);
  Object.assign(effect, {
    enabled: true, disposed: false, blend: { value: 1 },
    ensurePipeline() {}, updateCamera() {},
    pipeline: { render() { effect.sceneCpuMs += 35; now += 36; } },
  });
  try {
    assert.equal(effect.render({}), true);
    assert.equal(PerfCounters.get('waterProjectedCausticCpuMs'), 1);
    assert.equal(PerfCounters.get('waterProjectedCausticSceneCpuMs'), 35);
    assert.equal(PerfCounters.get('waterProjectedCausticPipelineCpuMs'), 36);
    assert.equal(effect.render({}), true);
    assert.equal(PerfCounters.get('waterProjectedCausticCpuMs'), 1,
      'scene time resets each frame instead of accumulating across dives');
    effect.blend.value = 0;
    assert.equal(effect.render({}), false);
  } finally {
    globalThis.performance = previous;
    PerfCounters.reset();
  }
});
