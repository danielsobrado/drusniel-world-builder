import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRenderedImages } from '../scripts/lib/rendered-image-metrics.mjs';

function image(values) { return { width: values.length, height: 1, channels: 3, data: Uint8Array.from(values.flatMap(value => [value, value, value])) }; }
const options = { minimumCoveredPixels: 2 };
test('pixel checks reject blank rendering, shifted silhouettes, and inert effects', () => {
  const reference = image([0, 100, 100, 0]);
  assert.equal(compareRenderedImages(reference, reference, options).passed, true);
  assert.equal(compareRenderedImages(reference, image([0, 0, 0, 0]), options).passed, false);
  assert.equal(compareRenderedImages(reference, image([100, 0, 0, 100]), options).passed, false);
  assert.equal(compareRenderedImages(reference, reference, { ...options, minimumBrightnessRatio: 1.1 }).passed, false);
});
test('paired effects can change brightness while preserving coverage', () => {
  const result = compareRenderedImages(image([0, 100, 100, 0]), image([0, 120, 120, 0]),
    { ...options, maximumCoverageDelta: 0.02, minimumBrightnessRatio: 1.1 });
  assert.equal(result.passed, true);
  assert.equal(result.brightnessRatio, 1.2);
});
