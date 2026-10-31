import assert from 'node:assert/strict';
import test from 'node:test';

import { selectMinimapBurgs } from '../src/editor/map/minimapBurgs.js';

const campaign = (burgs) => ({
  source: { sourceWidth: 100, sourceHeight: 100, target: { minCellX: 0, minCellZ: 0, widthCells: 100, heightCells: 100 } },
  burgs,
  states: [],
});

test('a crowded burg keeps its dot and yields its name to the nearer one', () => {
  const markers = selectMinimapBurgs({
    campaign: campaign([
      { i: 1, name: 'Near', x: 50, y: 50 },
      { i: 2, name: 'Crowded', x: 55, y: 51 },
      { i: 3, name: 'Clear', x: 62, y: 62 },
    ]),
    center: { x: 50, z: 50 },
    cells: 40,
  });
  assert.deepEqual(markers.map(({ name, labelled }) => [name, labelled]), [
    ['Near', true],
    ['Crowded', false],
    ['Clear', true],
  ]);
});
