import test from 'node:test';
import assert from 'node:assert/strict';
import { createFallenLogGeometry } from '../src/editor/stylized/forest/forestDebrisGeometry.js';
import {
  collectChunkObstacleCircles,
  computePrototypeFootprint,
  footprintHitsObstacle,
  pathBlockedForFootprint,
} from '../src/editor/stylized/UnderstoryClearance.js';

test('computePrototypeFootprint measures elongated fallen log XZ extents', () => {
  const geometry = createFallenLogGeometry({ length: 3.6, radius: 0.24 });
  const footprint = computePrototypeFootprint([{ geometry }]);
  assert.ok(footprint.halfX >= 1.7 && footprint.halfX <= 2.0, `expected halfX ~1.8-1.95, got ${footprint.halfX}`);
  assert.ok(footprint.halfZ >= 0.2 && footprint.halfZ <= 0.65, `expected halfZ ~0.25-0.55, got ${footprint.halfZ}`);
  geometry.dispose();
});

test('footprintHitsObstacle blocks a fallen log intersecting a tree trunk and allows parallel placement', () => {
  const footprint = { halfX: 1.8, halfZ: 0.26 };
  const obstacles = [{ x: 11.4, z: 20, radius: 0.58 }];

  // Centered at (10, 20) along X (rotationY = 0): reaches 10 ± 1.8 = [8.2, 11.8], hitting trunk at 11.4.
  assert.equal(footprintHitsObstacle({ x: 10, z: 20, scale: 1, rotationY: 0 }, footprint, obstacles), true);

  // Rotated 90° (along Z): reaches X = 10 ± 0.26 = [9.74, 10.26], well clear of trunk at 11.4 (radius 0.58).
  assert.equal(footprintHitsObstacle({ x: 10, z: 20, scale: 1, rotationY: Math.PI / 2 }, footprint, obstacles), false);
});

test('collectChunkObstacleCircles gathers trees from neighbouring chunks and rock blockers', () => {
  const result = collectChunkObstacleCircles(2, 3, {
    treePlacementsProvider: (cx, cz) => (cx === 3 && cz === 3 ? [{ x: 100, z: -100, scale: 1.5 }] : null),
    rockBlockersProvider: () => ({ placements: [{ x: 80, z: -90, radius: 1.2 }], signature: 'r1' }),
  });
  assert.equal(result.obstacles.length, 2);
  assert.ok(result.obstacles[0].radius >= 0.8);
  assert.equal(result.obstacles[1].radius, 1.2);
  assert.equal(result.signature, 't1:rr1');
});

test('pathBlockedForFootprint catches elongated log ends protruding into a walk path', () => {
  const footprint = { halfX: 1.8, halfZ: 0.25 };
  const pathClearance = {
    // Path occupies x >= 11.2
    blocks: (x, _z, r = 0) => x + r >= 11.2,
  };
  // Center at x = 10 is outside the path, but X-aligned log reaches x = 11.55 > 11.2.
  assert.equal(pathBlockedForFootprint(pathClearance, { x: 10, z: 5, scale: 1, rotationY: 0, radius: 0.3 }, footprint), true);
  // Parallel to path (rotationY = Math.PI / 2): X reach stays within 10 ± 0.25.
  assert.equal(pathBlockedForFootprint(pathClearance, { x: 10, z: 5, scale: 1, rotationY: Math.PI / 2, radius: 0.3 }, footprint), false);
});
