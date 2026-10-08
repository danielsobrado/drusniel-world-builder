import assert from 'node:assert/strict';
import test from 'node:test';

import { kitTownsEnabled } from '../../src/editor/towns/townMode.js';

test('kit towns are opt-in through ?towns=kit', () => {
  assert.equal(kitTownsEnabled(''), false);
  assert.equal(kitTownsEnabled('?qa=x'), false);
  assert.equal(kitTownsEnabled('?towns=kit'), true);
  assert.equal(kitTownsEnabled('?a=1&towns=kit'), true);
  assert.equal(kitTownsEnabled('?towns=settlements'), false);
});
