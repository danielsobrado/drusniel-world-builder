import assert from 'node:assert/strict';
import test from 'node:test';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { buildShapeWalls } from '../src/editor/workshop/shapes/ShapeWallBuilder.js';
import { buildShapeRoof } from '../src/editor/workshop/shapes/ShapeRoofBuilder.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { shapeShutterLeafFits } from '../src/editor/workshop/shapes/ShapeShutterBuilder.js';

const SLOTS = ['walls', 'roof', 'trim', 'inserts', 'glazing', 'deck', 'foliage', 'metal', 'flashing'];
const chapel = () => planWorkshopComposition({ composition: createShapePreset('buttressed-chapel') }).shapePlans[0];
const build = (plan, detail, builder) => {
  const meshes = Object.fromEntries(SLOTS.map((slot) => [slot, new ShapeMesh()]));
  builder(plan, meshes, { seed: 1848, detail });
  return meshes;
};
const vertices = (mesh) => Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions.slice(i * 3, i * 3 + 3));

test('masonry courses stay under a steep roof instead of piercing its slope', () => {
  const plan = chapel(), roof = createShapeRoofSurface(plan);
  const stones = vertices(build(plan, 3, buildShapeWalls).trim);
  assert.ok(stones.length > 0);
  for (const [x, y, z] of stones) assert.ok(y <= roof.heightAt(x, z) + 1e-6, `Stone at ${y} pierces the roof.`);
});

test('masonry courses continue into a gable rather than leaving a plaster triangle', () => {
  const plan = chapel();
  const top = vertices(build(plan, 3, buildShapeWalls).trim).reduce((max, v) => Math.max(max, v[1]), -Infinity);
  assert.ok(top > plan.primitive.elevation + plan.primitive.height + 1, `Courses stop at ${top}.`);
});

test('coarse masonry renders its wall and gable cores in the stone slot', () => {
  const plan = chapel();
  const walls = build(plan, 1, buildShapeWalls), roof = build(plan, 1, buildShapeRoof);
  assert.equal(walls.walls.positions.length, 0);
  assert.equal(roof.walls.positions.length, 0);
  assert.ok(walls.trim.positions.length > 0 && roof.trim.positions.length > 0);
  const plaster = planWorkshopComposition({ composition: createShapePreset('rounded-cottage') }).shapePlans[0];
  assert.ok(build(plaster, 1, buildShapeWalls).walls.positions.length > 0);
});

test('roof overhang undersides are boarded rather than bare slate', () => {
  const meshes = build(chapel(), 3, buildShapeRoof);
  assert.ok(meshes.inserts.positions.length > 0);
});

test('the garden bridge lands both ends on the ground', () => {
  const plan = planWorkshopComposition({ composition: createShapePreset('garden-bridge') }).shapePlans[0];
  for (const node of [plan.route[0], plan.route.at(-1)]) assert.ok(node.position[1] <= 0.15);
  assert.equal(plan.supports.length, 2);
});

test('masonry jambs, soffits and wall ends are stone rather than the mortar core', () => {
  const plans = planWorkshopComposition({ composition: createShapePreset('garden-gateway') }).shapePlans;
  const wall = plans.find((p) => p.primitive.kind === 'curved-wall');
  assert.ok(wall.openings.length > 0);
  const meshes = build(wall, 3, buildShapeWalls);
  // The core's own faces are vertical; any horizontal face (an arch soffit) must be in the stone slot.
  const vertical = (mesh) => Array.from({ length: mesh.normals.length / 3 }, (_, i) => Math.abs(mesh.normals[i * 3 + 1]) > 0.9);
  assert.ok(!vertical(meshes.walls).some(Boolean), 'A soffit is left in the mortar core.');
  assert.ok(vertical(meshes.trim).some(Boolean));
});

test('a jettied storey carried by its host has no footing course', () => {
  const host = planWorkshopComposition({ composition: createShapePreset('jettied-townhouse') }).shapePlans[0];
  const jetty = host.features.find((f) => f.intent.kind === 'jetty').child;
  assert.equal(jetty.primitive.grounded, false);
  const carried = build(jetty, 3, buildShapeWalls).trim.positions.length;
  const footed = build({ ...jetty, primitive: { ...jetty.primitive, grounded: true } }, 3, buildShapeWalls).trim.positions.length;
  assert.ok(carried < footed);
});

test('shutters only open onto flat, free wall and never onto a bay', () => {
  const host = planWorkshopComposition({ composition: createShapePreset('bay-porch-cottage') }).shapePlans[0];
  assert.equal(host.features.find((f) => f.intent.kind === 'bay').child.primitive.shutters, false);
  const townhouse = planWorkshopComposition({ composition: createShapePreset('jettied-townhouse') }).shapePlans[0];
  const jetty = townhouse.features.find((f) => f.intent.kind === 'jetty').child, surface = createShapeWallSurface(jetty);
  const corner = jetty.openings.find((o) => o.id === 'upper-side');
  assert.equal(shapeShutterLeafFits(jetty, surface, corner, -1), false);
  const cottage = planWorkshopComposition({ composition: createShapePreset('rounded-cottage') }).shapePlans[0];
  const front = cottage.openings.find((o) => o.id === 'window-front'), wall = createShapeWallSurface(cottage);
  assert.ok([-1, 1].every((side) => shapeShutterLeafFits(cottage, wall, front, side)));
});
