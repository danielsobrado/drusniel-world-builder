import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallenLogGeometry,
  createStumpGeometry,
} from '../src/editor/stylized/forest/forestDebrisGeometry.js';
import { createForestDebrisPrototypes } from '../src/editor/stylized/forest/forestDebrisPrototypes.js';
import {
  collectChunkObstacleCircles,
  collectDebrisContactFootprints,
  collectDebrisGrassZones,
  computePrototypeFootprint,
  footprintHitsObstacle,
  pathBlockedForFootprint,
} from '../src/editor/stylized/UnderstoryClearance.js';
import { paintContactShade } from '../src/editor/stylized/contactShade.js';

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

test('collectDebrisContactFootprints emits oriented spine disks for fallen logs and skips tiny litter', () => {
  const logGeo = createFallenLogGeometry();
  const stumpGeo = createStumpGeometry();
  const footprints = [
    computePrototypeFootprint([{ geometry: logGeo }]),
    computePrototypeFootprint([{ geometry: stumpGeo }]),
    { halfX: 0.25, halfZ: 0.25 },
  ];
  const circles = collectDebrisContactFootprints([
    { x: 10, z: 20, scale: 1, rotationY: 0, prototypeIndex: 0 },
    { x: 30, z: 40, scale: 1, rotationY: 0, prototypeIndex: 1 },
    { x: 50, z: 60, scale: 1, rotationY: 0, prototypeIndex: 2 },
  ], footprints);
  assert.equal(circles.length, 4);
  assert.ok(circles[0].x < 10 && circles[1].x === 10 && circles[2].x > 10);
  assert.equal(circles[3].x, 30);
  logGeo.dispose();
  stumpGeo.dispose();
});

test('createForestDebrisPrototypes binds albedo-preserving colorNode and bark bump normalNode', () => {
  const defs = createForestDebrisPrototypes({
    variants: {
      fallenLog: { kind: 'fallenLog', enabled: true },
    },
  }, { soilColor: '#5c4a30', floorColor: '#3b5233' });
  assert.equal(defs.length, 1);
  const mat = defs[0].parts[0].material;
  assert.equal(mat.vertexColors, false);
  assert.ok(mat.colorNode, 'expected colorNode on fallenLog material');
  assert.ok(mat.normalNode, 'expected bark bump normalNode on fallenLog material');
  assert.ok(mat.roughnessNode, 'expected roughnessNode on fallenLog material');
  mat.dispose();
  defs[0].parts[0].geometry.dispose();
});

test('collectDebrisGrassZones emits capsule logs, tight stumps, and skips flat leaf litter', () => {
  const logGeo = createFallenLogGeometry();
  const stumpGeo = createStumpGeometry();
  const footprints = [
    computePrototypeFootprint([{ geometry: logGeo }]),
    computePrototypeFootprint([{ geometry: stumpGeo }]),
    { halfX: 1.7, halfZ: 1.7, height: 0.04 },
  ];
  const zones = collectDebrisGrassZones([
    { x: 10, z: 20, scale: 1, rotationY: 0, prototypeIndex: 0 },
    { x: 30, z: 40, scale: 1, rotationY: 0, prototypeIndex: 1 },
    { x: 50, z: 60, scale: 1, rotationY: 0, prototypeIndex: 2 },
  ], footprints);
  assert.equal(zones.length, 2);
  assert.equal(zones[0].kind, 'log');
  assert.ok(zones[0].x0 < 10 && zones[0].x1 > 10);
  assert.ok(zones[0].radius <= 0.35 && zones[0].collar > zones[0].radius);
  assert.equal(zones[1].kind, 'stump');
  logGeo.dispose();
  stumpGeo.dispose();
});

test('paintContactShade paints elongated capsule contact shadow along fallen log axes', () => {
  const pixels = new Uint8Array(64 * 64 * 4);
  const painted = paintContactShade({
    pixels,
    size: 64,
    centerWorldX: 0,
    centerWorldZ: 0,
    chunkWorldSize: 64,
    sources: [{ x0: -5, z0: 0, x1: 5, z1: 0, radius: 1.5, strength: 1 }],
    channel: 1,
  });
  assert.equal(painted, 1);
  // Texels along z = 0 (-4, 0, +4) get capsule contact AO, while far corners remain 0.
  const idx = (x, z) => ((31 - z) * 64 + (x + 31)) * 4 + 1;
  assert.ok(pixels[idx(-4, 0)] > 100);
  assert.ok(pixels[idx(0, 0)] > 100);
  assert.ok(pixels[idx(4, 0)] > 100);
  assert.equal(pixels[idx(0, 8)], 0);
});
