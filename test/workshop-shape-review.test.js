import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { shapeFieldChanges } from '../src/editor/workshop/shapes/WorkshopShapeFields.js';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { buildShapeRoof } from '../src/editor/workshop/shapes/ShapeRoofBuilder.js';
import { buildShapeTraversal, buildShapeSupports } from '../src/editor/workshop/shapes/ShapeTraversalBuilder.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { roundedFootprint } from '../src/editor/workshop/shapes/ShapePaths.js';

const plan = (primitive) => planWorkshopComposition({ composition: { primitives: [primitive] } }).shapePlans[0];

test('shape updates preserve identity and reject invalid records without adding history', () => {
  const session = new WorkshopShapeSession();
  try {
    const before = session.composition;
    assert.throws(() => session.update('cottage', { id: 'other' }), /identity|id/i);
    assert.throws(() => session.update('cottage', { kind: 'curved-wall' }), /kind|identity/i);
    assert.throws(() => session.update('cottage', null), /object/i);
    assert.deepEqual(session.composition, before);
    assert.equal(session.history.undoDepth, 0);
  } finally { session.dispose(); }
});

test('invalid replacement preserves a pending gesture and the editor requires registered shapes', () => {
  const session = new WorkshopShapeSession();
  try {
    session.begin();
    session.update('cottage', { height: 5 });
    assert.throws(() => session.replace({ primitives: [{ id: 'bad', kind: 'unknown' }] }));
    assert.equal(session.getPrimitive('cottage').height, 5);
    assert.ok(session.transaction);
    assert.throws(() => session.replace({ primitives: [] }), /at least one/i);
    assert.throws(() => new WorkshopShapeSession({ primitives: [{ id: 'legacy', kind: 'rectangle' }] }), /registered|shape/i);
  } finally { session.dispose(); }
});

test('runtime recovery discards speculative edits and restores matching undo and redo', () => {
  const session = new WorkshopShapeSession(), restored = new WorkshopShapeSession();
  try {
    const original = session.getPrimitive('cottage').height;
    session.update('cottage', { height: 5 });
    session.begin();
    session.update('cottage', { height: 7 });
    const state = session.captureRuntimeState();
    assert.equal(session.getPrimitive('cottage').height, 7, 'Capturing must not mutate the active preview.');
    restored.restoreRuntimeState(state);
    assert.equal(restored.getPrimitive('cottage').height, 5);
    restored.undo();
    assert.equal(restored.getPrimitive('cottage').height, original);
    restored.redo();
    assert.equal(restored.getPrimitive('cottage').height, 5);
  } finally { session.dispose(); restored.dispose(); }
});

test('lowering a building adapts elevated openings in the same undoable edit', () => {
  const session = new WorkshopShapeSession(createShapePreset('bell-turret'));
  try {
    const p = session.primitives[0], before = session.composition;
    session.update(p.id, shapeFieldChanges(p, 'height', 1));
    const changed = session.getPrimitive(p.id);
    assert.ok(changed.openings.every((o) => o.bottom + o.height <= changed.height));
    assert.equal(session.history.undoDepth, 1);
    session.undo();
    assert.deepEqual(session.composition, before);
  } finally { session.dispose(); }
});

test('narrowing a thick volume adapts wall thickness instead of rejecting the resize', () => {
  const session = new WorkshopShapeSession();
  try {
    session.update('cottage', { thickness: 0.9 });
    const p = session.getPrimitive('cottage');
    session.update(p.id, shapeFieldChanges(p, 'width', 2));
    assert.equal(session.getPrimitive(p.id).thickness, 0.4);
  } finally { session.dispose(); }
});

test('custom outlines reject unsupported edits instead of silently ignoring them', () => {
  const p = createShapePreset('rounded-cottage').primitives[0];
  const custom = plan({ ...p, footprint: { family: 'custom', path: roundedFootprint('custom', 6, 4, 0.7).toJSON() } }).primitive;
  assert.throws(() => shapeFieldChanges(custom, 'width', 8), /custom|outline/i);
  const wall = plan({ id: 'custom-wall', kind: 'curved-wall', path: {
    id: 'wall-path', closed: false,
    points: [{ id: 'a', position: [-3, 0] }, { id: 'b', position: [3, 0] }],
    segments: [{ id: 'edge', kind: 'line', startId: 'a', endId: 'b' }],
  } }).primitive;
  assert.throws(() => shapeFieldChanges(wall, 'bend', 2), /custom|outline/i);
});

test('resolved openings and portals fit the actual wall without modifying authoring intent', () => {
  const input = { id: 'short-wall', kind: 'curved-wall', length: 2, bend: 0, height: 2,
    openings: [{ id: 'gate', role: 'arch', profile: 'square', at: 0.1, width: 2, bottom: 1, height: 2 }] };
  const before = structuredClone(input), host = plan(input);
  const opening = host.openings[0], portal = host.rpg.portals[0];
  assert.equal(opening.width, 1.2);
  assert.equal(opening.at, 0.3);
  assert.equal(opening.height, 1);
  assert.equal(portal.width, opening.width);
  assert.equal(portal.height, opening.height);
  assert.ok(host.rpg.collisionSlabs.every((slab) => slab.gaps.includes(opening)));
  assert.deepEqual(input, before);
});

test('closed volume portals clip opening height at the host wall', () => {
  const p = createShapePreset('rounded-cottage').primitives[0];
  p.openings = [{ id: 'door', role: 'door', at: 0.5, bottom: 3, height: 3, width: 1 }];
  const host = plan(p);
  assert.equal(host.openings[0].height, host.primitive.height - 3);
  assert.equal(host.rpg.portals[0].height, host.openings[0].height);
});

test('volume bounds contain the roof perimeter including thick walls', () => {
  const p = createShapePreset('rounded-cottage').primitives[0];
  p.thickness = 0.9;
  p.roof.overhang = 0.05;
  const host = plan(p), surface = createShapeRoofSurface(host);
  for (const sample of host.curve.samples) {
    const [x, , z] = surface.point(sample.distance, 1);
    assert.ok(x >= host.bounds.min[0] && x <= host.bounds.max[0]);
    assert.ok(z >= host.bounds.min[1] && z <= host.bounds.max[1]);
  }
});

test('all valid maximum-length shape IDs produce bounded deterministic curve IDs', () => {
  const id = `a${'b'.repeat(63)}`;
  for (const input of [
    { id, kind: 'curved-volume' },
    { id, kind: 'curved-volume', footprint: { family: 'oval' } },
    { id, kind: 'curved-wall' },
    { id, kind: 'traversal' },
  ]) {
    const host = plan(input);
    assert.ok(host.curve.path.id.length <= 64);
    assert.equal(plan(input).curve.path.id, host.curve.path.id);
  }
});

test('opening at the top of a gable wall does not remove the wall above it', () => {
  const p = createShapePreset('rounded-cottage').primitives[0];
  p.footprint.cornerRadius = 0;
  p.openings = [];
  const build = (primitive) => {
    const meshes = { roof: new ShapeMesh(), walls: new ShapeMesh(), trim: new ShapeMesh() };
    buildShapeRoof(plan(primitive), meshes, { seed: 1848, detail: 1 });
    return meshes.walls.positions;
  };
  const before = build(p);
  p.openings = [{ id: 'arch', role: 'arch', profile: 'square', at: 0.4, width: 3, bottom: 0, height: p.height }];
  assert.deepEqual(build(p), before);
});

test('every stair tread uses the intended height at exact division boundaries', () => {
  const host = plan({ id: 'stairs', kind: 'traversal', rise: 4.5, length: 8, mode: 'stairs', railing: false, support: 'none' });
  assert.equal(host.steps, 25);
  const meshes = { deck: new ShapeMesh(), trim: new ShapeMesh() };
  buildShapeTraversal(host, meshes, { seed: 1848 });
  // Each tread has six quads, each quad has two triangles.
  for (let i = 0; i < host.steps; i++) {
    const y = meshes.deck.positions[i * 6 * 18 + 1];
    assert.ok(Math.abs(y - 4.5 * (i + 1) / host.steps) < 1e-10, `Tread ${i + 1} has height ${y}.`);
  }
});

test('short support caps and footings stay below the raised floor', () => {
  const mesh = new ShapeMesh();
  buildShapeSupports({ supports: [{ position: [0, 0.1, 0] }] }, mesh);
  const heights = mesh.positions.filter((_, index) => index % 3 === 1);
  assert.ok(Math.min(...heights) >= -1e-10);
  assert.ok(Math.max(...heights) <= 0.1);
});
