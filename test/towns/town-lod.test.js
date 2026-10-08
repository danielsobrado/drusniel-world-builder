import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOWN_LOD_FAR,
  TOWN_LOD_NEAR,
  selectTownLod,
  townEdgeDistance,
} from '../../src/editor/towns/TownLod.js';

const OPTIONS = { farDistance: 100, hysteresis: 10 };

test('a near town turns far only past the upper edge of the hysteresis band', () => {
  assert.equal(selectTownLod(TOWN_LOD_NEAR, 105, OPTIONS), TOWN_LOD_NEAR);
  assert.equal(selectTownLod(TOWN_LOD_NEAR, 111, OPTIONS), TOWN_LOD_FAR);
});

test('a far town turns near only inside the lower edge of the hysteresis band', () => {
  assert.equal(selectTownLod(TOWN_LOD_FAR, 95, OPTIONS), TOWN_LOD_FAR);
  assert.equal(selectTownLod(TOWN_LOD_FAR, 89, OPTIONS), TOWN_LOD_NEAR);
});

test('edge distance subtracts the town reach and never goes negative', () => {
  assert.equal(townEdgeDistance({ x: 0, z: 0 }, 30, 50, 0), 20);
  assert.equal(townEdgeDistance({ x: 0, z: 0 }, 30, 10, 10), 0);
});
