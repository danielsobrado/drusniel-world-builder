import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { residentObjectCellBounds } from '../src/editor/ObjectView.js';

const source = readFileSync(
  new URL('../src/editor/ObjectView.js', import.meta.url),
  'utf8',
);

test('ObjectView delegates placement and foundation matrices to the shared resolver', () => {
  assert.match(source, /new ObjectPlacementResolver/);
  assert.match(source, /return this\.placementResolver\.resolve\(object\)/);
  assert.match(source, /return this\.placementResolver\.createObjectMatrix/);
  assert.match(source, /return this\.placementResolver\.createFoundationMatrix/);
});


test('resident object bounds cover only assigned terrain chunks', () => {
  const bounds = residentObjectCellBounds([
    { descriptor: { originCellX: -64, originCellZ: 0 } },
    { descriptor: { originCellX: 0, originCellZ: 64 } },
    { descriptor: null },
  ], 64);
  assert.deepEqual(bounds, {
    minX: -64,
    minZ: 0,
    maxX: 63,
    maxZ: 127,
  });
  assert.equal(residentObjectCellBounds([{ descriptor: null }], 64), null);
});
