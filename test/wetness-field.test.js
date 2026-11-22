import test from 'node:test';
import assert from 'node:assert/strict';
import { float, vec3 } from 'three/tsl';
import { Vector3 } from 'three/webgpu';

import { evaluateShaderNode as evaluate } from './helpers/evaluateShaderNode.js';
import { wetnessTexel } from '../src/editor/weather/wetness/wetnessFieldModel.js';
import { wetnessFieldNeedsRender } from '../src/editor/weather/wetness/WetnessFieldPass.js';
import { registerWetnessField, wetnessFieldEnabled } from '../src/editor/weather/wetness/wetnessField.js';
import { createRainWetnessShading } from '../src/editor/stylized/RainWetnessShading.js';
import { SurfaceWetness, groundWetnessClocksUniform, sunDryingRate } from '../src/editor/weather/surfaceWetness.js';
import { DEFAULT_SURFACE_WETNESS, resolveSurfaceWetnessConfig } from '../src/editor/weather/surfaceWetnessConfig.js';

const texel = (ground, clocks) => evaluate(wetnessTexel({
  slope: float(ground.slope ?? 0), hollow: float(ground.hollow ?? 0), sun: float(ground.sun ?? 0),
  patches: float(ground.patches ?? 0.5), mottle: float(ground.mottle ?? 0.5), clocks: vec3(...clocks),
}));

test('soaked ground is uneven: slopes shed rain, the mottle varies the film', () => {
  const [flat] = texel({}, [1, 1, 1]);
  const [steep] = texel({ slope: 1.2 }, [1, 1, 1]);
  assert.ok(flat > 0.75 && steep < flat * 0.5, `flat ${flat}, steep ${steep}`);
  assert.ok(texel({ mottle: 0 }, [1, 1, 1])[0] < texel({ mottle: 1 }, [1, 1, 1])[0]);
});

test('puddles stand in flat hollows, never on slopes or before the puddle clock', () => {
  const hollow = texel({ hollow: 0.6 }, [1, 1, 1])[1];
  const rise = texel({ hollow: -0.5 }, [1, 1, 1])[1];
  assert.ok(hollow > 0.75 && rise < hollow * 0.5, `hollow ${hollow}, rise ${rise}`);
  assert.equal(texel({ hollow: 0.6, slope: 0.5 }, [1, 1, 1])[1], 0);
  assert.equal(texel({ hollow: 0.6 }, [1, 1, 0.4])[1], 0, 'the film soaks before water pools');
  assert.deepEqual(texel({ sun: 1 }, [1, 1, 1]), texel({}, [1, 1, 1]), 'a noon storm still pools: the sun only dries');
});

test('drying is patchy: sunny slopes go first, shaded hollows hold water', () => {
  // Mid-drying: the fast clock is down, the slow one still high.
  const clocks = [0.2, 0.7, 0.8];
  const sunnySlope = texel({ slope: 0.3, sun: 1 }, clocks)[0];
  const shadedHollow = texel({ hollow: 0.5 }, clocks)[0];
  assert.ok(shadedHollow > sunnySlope * 2, `hollow ${shadedHollow}, slope ${sunnySlope}`);
  assert.ok(texel({ hollow: 0.5, sun: 1 }, clocks)[1] < texel({ hollow: 0.5 }, clocks)[1], 'sun shrinks puddles');
});

test('ground clocks: puddles fill last and dry last, the sun speeds drying, any frame rate', () => {
  const simulate = (step, sun) => {
    const state = new SurfaceWetness(DEFAULT_SURFACE_WETNESS, { value: 0 }, { value: new Vector3() });
    for (let t = 0; t < 60; t += step) state.update(step, 1, sun);
    const soaking = state.groundValues.toArray();
    state.update(1000, 1, sun);
    for (let t = 0; t < 120; t += step) state.update(step, 0, sun);
    return [...soaking, ...state.groundValues.toArray()];
  };
  const [fastWet, slowWet, puddleWet, fast, slow, puddle] = simulate(0.5, 1);
  assert.ok(fastWet >= slowWet && slowWet > puddleWet, 'standing water needs sustained rain');
  assert.ok(fast < slow && slow < puddle, 'exposed ground dries first, puddles last');
  const night = simulate(0.5, -0.5);
  assert.ok(night[3] > fast, 'drying slows at night');
  simulate(0.25, 1).forEach((value, i) => assert.ok(Math.abs(value - simulate(0.5, 1)[i]) < 1e-9));
  assert.deepEqual(groundWetnessClocksUniform.value.toArray().length, 3);
  assert.equal(sunDryingRate(NaN), sunDryingRate(1));
});

test('the field draws only when its inputs move, at most at its cadence', () => {
  const now = (clocks, window = 1, sun = [0, 1, 0]) => ({ clocks, window, sun });
  assert.equal(wetnessFieldNeedsRender(null, now([0, 0, 0]), 0, 0.25), false, 'dry from the start: no GPU work');
  assert.equal(wetnessFieldNeedsRender(null, now([0.1, 0, 0]), 0, 0.25), true);
  const last = now([0.5, 0.5, 0.5]);
  assert.equal(wetnessFieldNeedsRender(last, now([0.6, 0.5, 0.5]), 0.1, 0.25), false, 'cadence cap');
  assert.equal(wetnessFieldNeedsRender(last, now([0.6, 0.5, 0.5]), 0.3, 0.25), true);
  assert.equal(wetnessFieldNeedsRender(last, now([0.5005, 0.5, 0.5]), 9, 0.25), false, 'settled: no GPU work');
  assert.equal(wetnessFieldNeedsRender(last, now([0.5, 0.5, 0.5], 2), 0, 0.25), true, 'a new window draws at once');
  assert.equal(wetnessFieldNeedsRender(last, now([0.5, 0.5, 0.5], 1, [0.3, 0.9, 0]), 1, 0.25), true, 'the sun moved');
  assert.equal(wetnessFieldNeedsRender(now([0, 0, 0]), now([0, 0, 0], 5), 9, 0.25), false, 'dry stays undrawn');
});

test('field settings default off, validate, and take the QA override', () => {
  assert.equal(resolveSurfaceWetnessConfig().field.enabled, false);
  const resolved = resolveSurfaceWetnessConfig({ field: { enabled: true } });
  assert.deepEqual(resolveSurfaceWetnessConfig(resolved), resolved, 'resolving twice is harmless');
  assert.equal(resolveSurfaceWetnessConfig({ field: { enabled: true } }, '?wetnessField=0').field.enabled, false);
  assert.equal(resolveSurfaceWetnessConfig({}, '?wetnessField=1').field.enabled, true);
  assert.throws(() => resolveSurfaceWetnessConfig({ field: { enabled: 'yes' } }), /field.enabled/);
  assert.throws(() => resolveSurfaceWetnessConfig({ field: { intervalSeconds: 0 } }), /intervalSeconds/);
  assert.throws(() => resolveSurfaceWetnessConfig({ field: { extent: 9 } }), /unknown/);
});

test('with the field off, ground wetness is the global value; on, it samples the field', () => {
  const build = () => createRainWetnessShading({ snow: float(0), canopy: float(0), config: resolveSurfaceWetnessConfig() });
  registerWetnessField({ enabled: false });
  assert.equal(build().field, null);
  registerWetnessField({ enabled: true });
  assert.ok(wetnessFieldEnabled() && build().field?.film && build().field?.puddleClock);
  registerWetnessField({ enabled: false });
});
