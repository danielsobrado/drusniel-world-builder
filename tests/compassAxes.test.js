import assert from 'node:assert/strict';
import test from 'node:test';
import {
  burgToNormalized,
  canonicalWorldToNormalized,
  normalizedToCanonicalWorld,
} from '../src/editor/map/worldMapCoordinates.js';
import { directionFromAngles } from '../src/editor/stylized/StylizedGodRaysPostProcess.js';
import { azgaarYToAtlas } from '../src/editor/import/azgaarAtlasY.js';

const source = { sourceWidth: 1000, sourceHeight: 1000 };
const bounds = { minCellX: -500, minCellZ: -500, widthCells: 1000, heightCells: 1000 };
const worldOf = (x, y) => {
  const { nx, nz } = burgToNormalized({ x, y }, source);
  return normalizedToCanonicalWorld(nx, nz, bounds, 2);
};

test('the map lands un-mirrored: its north is world -Z and its east world +X', () => {
  const centre = worldOf(500, 500);
  const north = worldOf(500, 100);
  const east = worldOf(900, 500);
  assert.ok(north.z < centre.z);
  assert.ok(Math.abs(north.x - centre.x) < 1e-9);
  assert.ok(east.x > centre.x);
  assert.ok(Math.abs(east.z - centre.z) < 1e-9);
  // Facing north, east is on the right: forward × right points down.
  const forward = [north.x - centre.x, north.z - centre.z];
  const right = [east.x - centre.x, east.z - centre.z];
  assert.ok(forward[0] * right[1] - forward[1] * right[0] > 0);
});

test('map rows survive the trip to the world and back', () => {
  const { nx, nz } = canonicalWorldToNormalized(...Object.values(worldOf(300, 200)), bounds, 2);
  assert.ok(Math.abs(nx - 0.3) < 2e-3);
  assert.ok(Math.abs(nz - 0.2) < 2e-3);
});

test('the map north edge stays inside the world', () => {
  const world = worldOf(500, 0);
  assert.ok(canonicalWorldToNormalized(world.x, world.z, bounds, 2).nz >= 0);
});

test('atlas rows grow northwards, and the mapping is its own inverse', () => {
  assert.equal(azgaarYToAtlas(0, 100, 50), 50);
  assert.equal(azgaarYToAtlas(100, 100, 50), 0);
  assert.equal(azgaarYToAtlas(azgaarYToAtlas(25, 100, 1), 1, 100), 25);
});

test('the sun rises in the east and stands in the south at noon', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9);
  const sunrise = directionFromAngles(0, 90);
  near(sunrise.x, 1);
  near(sunrise.z, 0);
  const noon = directionFromAngles(0, 180);
  near(noon.x, 0);
  near(noon.z, 1);
});
