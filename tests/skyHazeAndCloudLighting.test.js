import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSunHazeConfig, SUN_HAZE_DEFAULTS } from '../src/editor/stylized/sky/sunHaze.js';
import { CLOUD_LIGHTING_DEFAULTS, resolveCloudLightingConfig } from '../src/editor/stylized/sky/cloudLighting.js';

test('sun haze resolves defaults and overrides', () => {
  assert.deepEqual({ ...resolveSunHazeConfig({}) }, { ...SUN_HAZE_DEFAULTS });
  assert.equal(resolveSunHazeConfig({ sunHaze: { tightStrength: 0.8 } }).tightStrength, 0.8);
  assert.equal(resolveSunHazeConfig({ sunHaze: { enabled: false } }).enabled, false);
});

test('sun haze rejects unsafe values', () => {
  assert.throws(() => resolveSunHazeConfig({ sunHaze: [] }), TypeError);
  assert.throws(() => resolveSunHazeConfig({ sunHaze: { enabled: 'yes' } }), TypeError);
  assert.throws(() => resolveSunHazeConfig({ sunHaze: { tightStrength: -1 } }), RangeError);
  assert.throws(() => resolveSunHazeConfig({ sunHaze: { broadFalloff: 0 } }), RangeError);
  // A full shade would turn the far side of the haze black.
  assert.throws(() => resolveSunHazeConfig({ sunHaze: { awayShade: 1 } }), RangeError);
});

test('cloud lighting resolves defaults and rejects unsafe values', () => {
  assert.deepEqual({ ...resolveCloudLightingConfig({}) }, { ...CLOUD_LIGHTING_DEFAULTS });
  assert.equal(resolveCloudLightingConfig({ cloudLighting: { sunShading: 0.3 } }).sunShading, 0.3);
  assert.throws(() => resolveCloudLightingConfig({ cloudLighting: { sunShading: 2 } }), RangeError);
  assert.throws(() => resolveCloudLightingConfig({ cloudLighting: { slopeScale: 0 } }), RangeError);
  assert.throws(() => resolveCloudLightingConfig({ cloudLighting: { horizonFade: 0 } }), RangeError);
  assert.throws(() => resolveCloudLightingConfig({ cloudLighting: { enabled: 1 } }), TypeError);
});
