import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSeaOptics } from '../src/editor/water/SeaOptics.js';
import { resolveCoastSand } from '../src/editor/water/CoastSandConfig.js';
import { COAST_PATTERN_FRAMES, createCoastPatternOrigins } from '../src/editor/stylized/CoastSwashShading.js';
import { createWaterPatternOrigins } from '../src/editor/stylized/WaterPatternOrigins.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { latticePatternOrigin, wavePatternOrigin, wrapPeriodic } from '../src/editor/stylized/PatternOrigins.js';

test('sea and sand reject invalid palettes, extinction and depth ramps before shader creation', () => {
  assert.throws(() => resolveSeaOptics({ sunny: { deep: 'blue' } }), /sunny.deep/);
  assert.throws(() => resolveSeaOptics({ absorptionCoefficients: [0.1, -1, 0.2] }), /absorptionCoefficients/);
  assert.throws(() => resolveSeaOptics({ lagoonStart: 3, lagoonEnd: 2 }), /depth ramps/);
  assert.throws(() => resolveSeaOptics({ maximumOpticalDistance: 0 }), /positive/);
  assert.throws(() => resolveCoastSand({ reefStrength: 4 }), /reefStrength/);
  assert.throws(() => resolveCoastSand({ seabedColor: 'sand' }), /seabedColor/);
});

test('sand grain, reefs, caustics and swash retain phase on distant neighbouring chunks', () => {
  const gap = (a, b, period) => Math.min(wrapPeriodic(a - b, period), wrapPeriodic(b - a, period));
  for (const cx of [-5000137, -4226432, 4999968]) {
    for (const [name, frame] of Object.entries(COAST_PATTERN_FRAMES)) {
      if (frame.wave) {
        const left = Math.fround(wavePatternOrigin(cx, 278528, ...frame.wave)) + 32 * frame.wave[0];
        const right = Math.fround(wavePatternOrigin(cx + 64, 278528, ...frame.wave)) - 32 * frame.wave[0];
        assert.ok(gap(left, right, Math.PI * 2) < 1e-5, name);
      } else {
        const period = frame.period ?? 512;
        const left = Math.fround(latticePatternOrigin(cx, 278528, frame.scale, period)[0]) + 32 * frame.scale;
        const right = Math.fround(latticePatternOrigin(cx + 64, 278528, frame.scale, period)[0]) - 32 * frame.scale;
        assert.ok(gap(left, right, period) < 1e-4, name);
      }
    }
  }
  const coast = createCoastPatternOrigins();
  const water = createWaterPatternOrigins({ noiseScale: 1, scale: 1 });
  coast.update(-4226432, 278528); water.update(-4226432, 278528);
  for (const name of ['drift', 'frontBreakup', 'foamBreakup']) {
    assert.deepEqual(coast.uniforms[name].value, water.uniforms[name].value, `shared ${name}`);
  }
});

test('desktop reflections use bounded defaults and preserve mobile and explicit opt-outs', () => {
  const desktop = resolveRenderEnhancements().waterReflections;
  assert.equal(desktop.enabled, true); assert.equal(desktop.planar, true);
  assert.equal(desktop.resolution, 128); assert.equal(desktop.intervalMs, 500);
  assert.equal(resolveRenderEnhancements({}, '', { mobile: true }).waterReflections.enabled, false);
  assert.equal(resolveRenderEnhancements({}, '?waterCube=0').waterReflections.enabled, false);
  assert.equal(resolveRenderEnhancements({}, '?waterPlanar=0').waterReflections.planar, false);
});
