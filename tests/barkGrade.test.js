import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeBarkRgb, resolveBarkGrade } from '../src/editor/stylized/forest/barkGrade.js';

test('painted bark retains ordered reflectance without black roots or clipped pale bark', () => {
  const settings = resolveBarkGrade({ enabled: true });
  const swatches = [[0, 0, 0], [.02, .01, .005], [.18, .09, .035], [.85, .88, .8]];
  const graded = swatches.map(sample => gradeBarkRgb(sample, settings));
  const value = rgb => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  assert.ok(value(graded[0]) > 0 && value(graded[0]) < .05);
  for (let i = 1; i < graded.length; i++) assert.ok(value(graded[i]) > value(graded[i - 1]));
  assert.ok(graded.flat().every(channel => channel >= 0 && channel < 1));
  assert.ok(graded[2][0] > graded[2][1] && graded[2][1] > graded[2][2], 'warm bark keeps its pigment order');
  assert.deepEqual(gradeBarkRgb(swatches[2], null), swatches[2]);
  assert.deepEqual(gradeBarkRgb(swatches[2], resolveBarkGrade({ strength: 0 })), swatches[2]);
});

test('bark reflectance parameters reject nonfinite and extrapolating grades', () => {
  assert.equal(resolveBarkGrade({ enabled: false }), null);
  for (const key of ['contrast', 'pivot', 'saturation', 'strength']) {
    for (const value of [-.1, 1.1, NaN, Infinity]) assert.throws(() => resolveBarkGrade({ [key]: value }), RangeError);
  }
});
