import test from 'node:test';
import assert from 'node:assert/strict';

import { airReach } from '../src/editor/stylized/forest/foliageLight.js';

test('crown haze reaches nearer as the fog thickens, never farther, and is capped', () => {
  assert.equal(airReach(undefined), 1);
  assert.equal(airReach(0.5), 1);
  assert.equal(airReach(4), 2);
  assert.equal(airReach(100), 2.5);
});
