import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSurfaceMaskChunkRadius,
  getSurfaceMaskSearchRadius,
} from '../src/editor/world/ChunkRenderPixels.js';

test('surface mask chunk invalidation covers the full configured halo', () => {
  // The barren-land grass fringe plus the biome snow blur (SNOW_BIOME_BLUR_CELLS).
  assert.equal(getSurfaceMaskSearchRadius(2.5), 17);
  assert.equal(getSurfaceMaskSearchRadius(2.5, 1), 27);
  assert.equal(getSurfaceMaskChunkRadius(2.5, 64), 1);
  assert.equal(getSurfaceMaskChunkRadius(64, 64), 2);
  assert.equal(getSurfaceMaskChunkRadius(130, 64), 3);
});

test('surface mask chunk invalidation rejects invalid chunk sizes', () => {
  assert.throws(
    () => getSurfaceMaskChunkRadius(2.5, 0),
    /chunk size must be a positive integer/,
  );
});
