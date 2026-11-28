import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryFrame, galleryCoverage } from '../scripts/fixtures/vegetation-gallery-layout.mjs';

test('union framing centers asymmetric geometry and reserves a margin', () => {
  const frame = galleryFrame([-1, -2, -3], [5, 8, 1]);
  assert.deepEqual(frame.center, [2, 3, -1]);
  assert.equal(frame.halfSize, 6);
  assert.ok(frame.distance > 4);
});

test('gallery coverage rejects blank, tiny and clipped captures', () => {
  const pixels = new Uint8Array(32 * 32 * 4);
  const fill = (x, y) => { pixels[(y * 32 + x) * 4 + 3] = 255; };
  assert.equal(galleryCoverage(pixels, 32, 32).passed, false);
  fill(16, 16);
  assert.equal(galleryCoverage(pixels, 32, 32).passed, false);
  for (let y = 6; y < 26; y++) for (let x = 8; x < 24; x++) fill(x, y);
  assert.equal(galleryCoverage(pixels, 32, 32).passed, true);
  fill(0, 15);
  assert.equal(galleryCoverage(pixels, 32, 32).passed, false);
});
