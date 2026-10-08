import assert from 'node:assert/strict';
import test from 'node:test';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { normalizeProceduralRecipe } from '../src/editor/workshop/ProceduralAssetStore.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';
import { createProceduralObjectLodParts } from '../src/editor/workshop/ProceduralAssetManager.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { shapeDirectHandleDefinitions, shapeDirectHandleChanges } from '../src/editor/workshop/shapes/ShapeDirectHandles.js';
import { shapeShutterAngle, buildShapeShutters } from '../src/editor/workshop/shapes/ShapeShutterBuilder.js';
import { buildShapeBalcony } from '../src/editor/workshop/shapes/ShapeBalconyBuilder.js';
import { buildShapeFloors } from '../src/editor/workshop/shapes/ShapeFloorBuilder.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';

const resolve = (recipe) => planWorkshopComposition(recipe).shapePlans;
const recipeFor = (id) => structuredClone(normalizeProceduralRecipe({ composition: createShapePreset(id), detail: 2, ivy: true }));
const buffers = () => Object.fromEntries(['inserts', 'metal', 'deck', 'trim'].map((key) => [key, new ShapeMesh()]));

test('curved balcony deck, vertical rails and published floor use the same rotated tapered host frame', () => {
  const recipe = recipeFor('balcony-tower');
  const p = recipe.composition.primitives[0]; p.rotation = 61; p.position = [4, -3];
  const plan = resolve(recipe)[0], feature = plan.features[0], b = feature.balcony;
  const wall = createShapeWallSurface(plan), floor = plan.rpg.walkableFloors.find((f) => f.featureId === feature.intent.id);
  assert.deepEqual(floor.footprint.points, b.footprint);
  assert.equal(floor.elevation, p.elevation + b.bottom);
  assert.deepEqual(b.inner[0], wall.point(b.start, b.bottom, p.thickness / 2 + 0.015));
  const mesh = buffers(); buildShapeBalcony(plan, feature, mesh, recipe);
  assert.ok(mesh.inserts.positions.length > 0);
  assert.ok(mesh.inserts.positions.every(Number.isFinite));
  for (let i = 1; i < mesh.inserts.positions.length; i += 3)
    assert.ok(mesh.inserts.positions[i] <= floor.elevation + b.height + 0.11);
  assert.ok(!plan.rpg.roomBoundaries.some((r) => r.featureId === feature.intent.id));
  assert.ok(!plan.rpg.foundationContacts.some((r) => r.featureId === feature.intent.id));
  const rails = plan.rpg.collisionSlabs.filter((r) => r.featureId === feature.intent.id && r.id.includes(':rail-'));
  assert.equal(rails.length, b.outer.length + 1);
  assert.ok(rails.every((r) => r.elevation === floor.elevation && r.height === b.height));
});

test('generic floors do not add a second stone surface over an authored timber balcony', () => {
  const plan = resolve(recipeFor('balcony-manor'))[0], a = buffers(), b = buffers();
  buildShapeFloors(plan, a);
  buildShapeFloors({ ...plan, rpg: { ...plan.rpg, walkableFloors: plan.rpg.walkableFloors.filter((f) => !f.featureId) } }, b);
  assert.deepEqual(a.deck.positions, b.deck.positions);
});

test('feature dragging preserves dimensions, changes semantic placement and cancels or replays atomically', () => {
  const session = new WorkshopShapeSession(createShapePreset('balcony-tower'));
  try {
    const p = session.primitives[0], plan = resolve({ composition: session.composition })[0];
    const editor = { primitive: p, featureId: p.features[0].id, resolvedPlans: new Map([[p.id, plan]]) };
    const handle = shapeDirectHandleDefinitions(editor).find((h) => h.type === 'feature');
    const zero = shapeDirectHandleChanges(p, handle, [0, 0, 0]).features[0];
    assert.ok(Math.abs(zero.at - p.features[0].at) < 0.002);
    const changes = shapeDirectHandleChanges(p, handle, [0.45, 0.35, 0.1]);
    assert.equal(changes.features[0].width, p.features[0].width);
    assert.equal(changes.features[0].bottom, p.features[0].bottom + 0.35);
    session.begin(); session.update(p.id, changes); session.cancel(); assert.deepEqual(session.primitives[0], p);
    session.begin(); session.update(p.id, changes); session.commit(); const after = session.primitives[0];
    session.undo(); assert.deepEqual(session.primitives[0], p); session.redo(); assert.deepEqual(session.primitives[0], after);
  } finally { session.dispose(); }
});

test('local balcony placement edits retain the host wall, roof, ground and ivy products', () => {
  const recipe = recipeFor('balcony-tower'), cache = new WorkshopShapeCache();
  try {
    cache.update(recipe, resolve(recipe)); const before = cache.entries.get('tower');
    recipe.composition.primitives[0].features[0].bottom += 0.25;
    const result = cache.update(recipe, resolve(recipe)), after = cache.entries.get('tower');
    for (const domain of ['walls', 'roof', 'ground', 'ivy']) assert.ok(before.domains.get(domain) === after.domains.get(domain), `${domain} retained`);
    assert.ok(before.domains.get('features') !== after.domains.get('features'));
    cache.releaseRemoved(result);
  } finally { cache.clear(); }
});

test('shutter pose is stable across window movement and supports distinct open, ajar and closed states', () => {
  const o = { id: 'window', shutterPose: 'auto' }, moved = { ...o, at: 0.8, bottom: 4.2 };
  for (const side of [-1, 1]) assert.equal(shapeShutterAngle(42, 'host', o, side), shapeShutterAngle(42, 'host', moved, side));
  const angle = (pose) => shapeShutterAngle(42, 'host', { ...o, shutterPose: pose }, 1);
  assert.equal(angle('closed'), 0); assert.ok(angle('ajar') > 0 && angle('ajar') < 1); assert.ok(angle('open') > 2.9);
});

for (const pose of ['auto', 'open', 'ajar', 'closed']) test(`${pose} shutters retain their silhouette at coarse detail with finite normals`, () => {
  const recipe = recipeFor('rounded-cottage');
  recipe.composition.primitives[0].openings.forEach((o) => { o.shutterPose = pose; });
  const plan = resolve(recipe)[0], near = buffers(), coarse = buffers(), surface = createShapeWallSurface(plan);
  buildShapeShutters(plan, near, recipe, surface); buildShapeShutters(plan, coarse, { ...recipe, detail: 1 }, surface);
  assert.ok(coarse.inserts.positions.length > 0 && coarse.inserts.positions.length < near.inserts.positions.length);
  for (const mesh of [near.inserts, coarse.inserts]) {
    assert.ok(mesh.positions.every(Number.isFinite));
    for (let i = 0; i < mesh.normals.length; i += 3) assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 1e-6);
  }
  for (const axis of [0, 1, 2]) {
    const values = (mesh) => mesh.positions.filter((v, i) => i % 3 === axis);
    assert.ok(Math.abs(Math.max(...values(near.inserts)) - Math.max(...values(coarse.inserts))) < 0.06);
    assert.ok(Math.abs(Math.min(...values(near.inserts)) - Math.min(...values(coarse.inserts))) < 0.06);
  }
});

test('closed shutters meet over the centre of a curved window instead of inheriting divergent hinge tangents', () => {
  const recipe = recipeFor('rounded-cottage');
  recipe.composition.primitives[0].openings = [{ id: 'curved-window', role: 'window', at: 0.49, bottom: 1, width: 1.3, height: 1.4, shutterPose: 'closed' }];
  const plan = resolve(recipe)[0], surface = createShapeWallSurface(plan), mesh = buffers(), o = plan.openings[0];
  buildShapeShutters(plan, mesh, recipe, surface);
  for (const side of [-1, 1]) {
    const position = surface.point(o.at * surface.length + side * 0.015, o.bottom + 0.045, plan.primitive.thickness / 2 + 0.217);
    assert.ok(mesh.inserts.positions.some((v, i, values) => i % 3 === 0 && Math.hypot(v - position[0], values[i + 1] - position[1], values[i + 2] - position[2]) < 0.002));
  }
});

test('a shutter edit rebuilds facade only and invalid poses cannot enter history', () => {
  const recipe = recipeFor('rounded-cottage'), cache = new WorkshopShapeCache();
  try {
    cache.update(recipe, resolve(recipe)); const before = cache.entries.get('cottage');
    recipe.composition.primitives[0].openings.find((o) => o.role === 'window').shutterPose = 'closed';
    const result = cache.update(recipe, resolve(recipe)), after = cache.entries.get('cottage');
    for (const domain of ['walls', 'roof', 'ground', 'ivy']) assert.ok(before.domains.get(domain) === after.domains.get(domain), `${domain} retained`);
    assert.ok(before.domains.get('facade') !== after.domains.get('facade')); cache.releaseRemoved(result);
  } finally { cache.clear(); }
  const session = new WorkshopShapeSession();
  try {
    const before = session.composition;
    assert.throws(() => session.update('cottage', { openings: [{ id: 'window', shutterPose: 'broken' }] }), /shutter pose/);
    assert.deepEqual(session.composition, before); assert.equal(session.history.canUndo, false);
  } finally { session.dispose(); }
});

for (const id of ['balcony-manor', 'balcony-tower']) test(`${id} keeps its projecting silhouette in cheaper runtime distance tiers`, () => {
  const recipe = recipeFor(id), near = createProceduralWorkshopComponentParts(recipe); let lod;
  try {
    lod = createProceduralObjectLodParts({ recipe }, near);
    assert.ok(lod, `${id} runtime LOD accepted`); assert.ok(lod.statistics.coarseRatio < 0.95);
    assert.ok(lod.statistics.envelopeDelta < lod.statistics.envelopeTolerance);
    assert.ok(near.length <= 8 && lod.coarse.length <= 8);
  } finally { disposeModelParts([...new Map([...near, ...(lod?.coarse ?? []), ...(lod?.shell ?? [])].map((p) => [p.geometry, p])).values()]); }
});

test('a projecting balcony discovers a neighboring wall without a root footprint overlap', () => {
  const recipe = recipeFor('balcony-manor'), owner = recipe.composition.primitives[0]; owner.features = [owner.features[0]];
  let plan = resolve(recipe)[0]; const f = plan.features[0], tip = f.balcony.outer[Math.floor(f.balcony.outer.length / 2)];
  recipe.composition.primitives.push({ id: 'neighbor', kind: 'curved-volume', position: [tip[0], tip[2] + 0.35],
    footprint: { family: 'rounded', width: 2, depth: 2, cornerRadius: 0.1 }, height: 6 });
  plan = resolve(recipe).find((p) => p.id === 'manor');
  assert.ok(plan.neighbors.some((n) => n.id === 'neighbor'));
  const cache = new WorkshopShapeCache();
  try {
    cache.update(recipe, resolve(recipe)); const before = cache.entries.get('manor').domains.get('features');
    recipe.composition.primitives.find((p) => p.id === 'neighbor').position[0] += 0.1;
    const result = cache.update(recipe, resolve(recipe));
    assert.ok(cache.entries.get('manor').domains.get('features') !== before, 'A neighboring wall edit refreshes clipped balcony geometry.');
    cache.releaseRemoved(result);
  } finally { cache.clear(); }
  const mesh = buffers(); buildShapeBalcony(plan, plan.features[0], mesh, recipe);
  for (let i = 0; i < mesh.inserts.positions.length; i += 9) {
    const triangle = mesh.inserts.positions.slice(i, i + 9);
    const x = (triangle[0] + triangle[3] + triangle[6]) / 3, z = (triangle[2] + triangle[5] + triangle[8]) / 3;
    assert.ok(x <= tip[0] - 1 + 0.03 || x >= tip[0] + 1 - 0.03 || z <= tip[2] - 0.65 + 0.03 || z >= tip[2] + 1.35 - 0.03);
  }
});
