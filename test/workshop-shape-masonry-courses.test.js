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

test('the arch bridge is coursed stone with parapets instead of thin rails', async () => {
  const { buildShapeTraversal } = await import('../src/editor/workshop/shapes/ShapeTraversalBuilder.js');
  const plan = planWorkshopComposition({ composition: createShapePreset('garden-bridge') }).shapePlans[0];
  const meshes = { deck: new ShapeMesh(), trim: new ShapeMesh(), supports: new ShapeMesh(), rails: new ShapeMesh() };
  buildShapeTraversal(plan, meshes, { seed: 1848, detail: 3 });
  assert.equal(meshes.rails.positions.length, 0);
  const crown = plan.route.reduce((max, node) => Math.max(max, node.position[1]), 0);
  const stones = vertices(meshes.trim);
  assert.ok(stones.length > 10_000);
  assert.ok(stones.every(([, y]) => y >= -0.15 && y <= crown + 0.62), 'Stone escapes the bridge envelope.');
});

test('hip roofs cap their ridge and hips along the real eaves outline', () => {
  const plan = planWorkshopComposition({ composition: createShapePreset('timber-pavilion') }).shapePlans
    .find((p) => p.primitive.roof?.family === 'hip');
  const lines = createShapeRoofSurface(plan).ridgeLines();
  assert.equal(lines.length, 5);
  for (const line of lines) for (const [x, y, z] of line) {
    assert.ok(Math.abs(y - createShapeRoofSurface(plan).heightAt(x, z)) < 1e-9);
  }
});

test('a bay that starts at the ground stands on its own base with raised sills', () => {
  const host = planWorkshopComposition({ composition: createShapePreset('bay-porch-cottage') }).shapePlans[0];
  const bay = host.features.find((f) => f.intent.kind === 'bay').child;
  assert.equal(bay.primitive.grounded, true);
  assert.ok(bay.openings.every((o) => o.bottom >= 0.8));
});

test('an open pavilion is paved to its walls and has a bench broken at every archway', () => {
  const plan = planWorkshopComposition({ composition: createShapePreset('courtyard-pavilion') }).shapePlans[0];
  const near = build(plan, 3, buildShapeWalls), coarse = build(plan, 1, buildShapeWalls);
  const floor = vertices(near.deck);
  assert.ok(floor.length > 1000 && floor.every(([, y]) => y >= 0.05 - 1e-9 && y < 0.08), 'Paving sits above the ground.');
  assert.ok(vertices(coarse.deck).length > 0 && vertices(coarse.deck).length < floor.length);
  const surface = createShapeWallSurface(plan), length = surface.length;
  // Every seat-top vertex, projected onto the wall, lies outside each archway's span.
  const seat = vertices(near.trim).filter(([, y]) => Math.abs(y - 0.44) < 1e-6);
  assert.ok(seat.length > 0);
  const stations = Array.from({ length: Math.ceil(length / 0.01) }, (_, i) => i * 0.01);
  const along = ([x, , z]) => stations.reduce((best, u) => {
    const q = surface.point(u, 0.44, -plan.primitive.thickness / 2 - 0.2), d = Math.hypot(q[0] - x, q[2] - z);
    return d < best.d ? { u, d } : best;
  }, { u: 0, d: Infinity }).u;
  const spans = seat.filter((_, i) => i % 7 === 0).map(along);
  for (const arch of plan.openings) {
    const gap = (u) => Math.abs(((u - arch.at * length + length / 2) % length + length) % length - length / 2);
    assert.ok(spans.every((u) => gap(u) >= arch.width / 2 - 0.02), `Bench blocks ${arch.id}.`);
  }
  const cottage = planWorkshopComposition({ composition: createShapePreset('rounded-cottage') }).shapePlans[0];
  assert.equal(build(cottage, 3, buildShapeWalls).deck.positions.length, 0);
});
