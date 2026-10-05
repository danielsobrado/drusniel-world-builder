import test from 'node:test';
import assert from 'node:assert/strict';
import { ktx2MipChain, sharpenCutoutAlpha } from '../scripts/lib/foliage-ktx2-mips.mjs';

test('ETC1S mip chain excludes the unusable cutout tail for rectangular atlases', () => {
  const levels = Array.from({ length: 11 }, (_, i) => ({ width: Math.max(1, 1024 >> i), height: Math.max(1, 256 >> i) }));
  assert.deepEqual(ktx2MipChain(levels).at(-1), { width: 32, height: 8 });
  assert.equal(ktx2MipChain(levels).length, 6);
});

test('alpha sharpening preserves the cutoff mask, RGB and source bytes', () => {
  const data = Uint8Array.from([11, 22, 33, 127, 44, 55, 66, 128, 77, 88, 99, 140]);
  const result = sharpenCutoutAlpha({ data, width: 3, height: 1 });
  assert.deepEqual([result.data[3] >= 128, result.data[7] >= 128, result.data[11] >= 128], [false, true, true]);
  assert.equal(result.data[11], 203);
  assert.deepEqual([result.data[0], result.data[4], result.data[8]], [11, 44, 77]);
  assert.equal(data[11], 140);
});
