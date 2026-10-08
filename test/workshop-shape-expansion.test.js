import assert from 'node:assert/strict';
import test from 'node:test';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { normalizeProceduralRecipe, ProceduralAssetStore } from '../src/editor/workshop/ProceduralAssetStore.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { SHAPE_FEATURES } from '../src/editor/workshop/shapes/ShapeFeatureSchema.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { shapeDirectHandleDefinitions, shapeDirectHandleChanges } from '../src/editor/workshop/shapes/ShapeDirectHandles.js';
import { shapeGroundExcluded } from '../src/editor/workshop/shapes/ShapeGrounding.js';
import { shapeCellWear } from '../src/editor/workshop/shapes/ShapeWeathering.js';

const plans = (composition) => planWorkshopComposition({ composition }).shapePlans;
function editorFor(session, extra = {}) {
  const primitive = session.primitives[0], resolved = plans(session.composition);
  return { primitive, openingId: primitive.openings?.[0]?.id, resolvedPlans: new Map(resolved.map((p) => [p.id, p])), ...extra };
}

for (const { kind } of SHAPE_FEATURES) test(`${kind} adapts to a rotated host, generates finite batches, and persists intent`, () => {
  const composition = createShapePreset('timber-cottage');
  Object.assign(composition.primitives[0], { rotation: 37, features: [{ id: 'feature-one', kind, at: 0.52 }] });
  const before = structuredClone(composition), recipe = normalizeProceduralRecipe({ composition, detail: 2 });
  const resolved = planWorkshopComposition(recipe), feature = resolved.shapePlans[0].features[0];
  assert.equal(feature.provenance.source, 'authored'); assert.ok(feature.frame.origin.every(Number.isFinite));
  if (feature.child) assert.ok(feature.child.boundary.flat().every(Number.isFinite));
  assert.deepEqual(composition, before);
  const parts = createProceduralWorkshopComponentParts(recipe);
  try {
    assert.ok(parts.length > 0);
    for (const part of parts) for (const attr of Object.values(part.geometry.attributes)) assert.ok(Array.from(attr.array).every(Number.isFinite));
    assert.ok(new Set(parts.map((p) => p.material)).size <= 8);
  } finally { disposeModelParts(parts); }
  const store = new ProceduralAssetStore(); store.add({ label: kind, recipe });
  const saved = store.toDocument().at(-1).recipe.composition;
  assert.deepEqual(saved, recipe.composition); assert.equal(saved.primitives[0].features[0].child, undefined);
  assert.deepEqual(plans(saved)[0].features, resolved.shapePlans[0].features);
});

test('architectural features undo atomically and invalid feature data cannot commit', () => {
  const session = new WorkshopShapeSession();
  try {
    const before = session.composition;
    session.begin(); session.update('cottage', { features: [{ id: 'dormer-one', kind: 'dormer' }] });
    session.update('cottage', { features: [{ id: 'dormer-one', kind: 'dormer', width: 2.7 }] }); session.commit();
    const after = session.composition;
    session.undo(); assert.deepEqual(session.composition, before); session.redo(); assert.deepEqual(session.composition, after);
    assert.throws(() => session.update('cottage', { features: [{ id: 'bad', kind: 'dormer', width: NaN }] }), /finite/);
    assert.deepEqual(session.composition, after);
  } finally { session.dispose(); }
});

test('opening drags follow a curved tapered host and preserve other opening identities', () => {
  const session = new WorkshopShapeSession(createShapePreset('bell-turret'));
  try {
    const editor = editorFor(session), handle = shapeDirectHandleDefinitions(editor).find((h) => h.type === 'opening');
    const p = editor.primitive;
    session.begin(); session.update(p.id, shapeDirectHandleChanges(p, handle, [0.3, 0.4, 0])); session.commit();
    assert.notEqual(session.getPrimitive(p.id).openings[0].at, p.openings[0].at);
    assert.equal(session.getPrimitive(p.id).openings[0].bottom, 0.4);
    assert.deepEqual(session.getPrimitive(p.id).openings.slice(1), p.openings.slice(1));
    session.undo(); assert.deepEqual(session.getPrimitive(p.id), p);
  } finally { session.dispose(); }
});

test('curve point and control drags publish stable canonical paths and support cancel', () => {
  for (const id of ['rounded-cottage', 'curved-courtyard']) {
    const session = new WorkshopShapeSession(createShapePreset(id));
    try {
      const editor = editorFor(session, { curveEditing: true }), point = shapeDirectHandleDefinitions(editor).find((h) => h.type.startsWith('curve-'));
      const p = editor.primitive;
      session.begin(); session.update(p.id, shapeDirectHandleChanges(p, point, [0.1, 0, -0.1]));
      const path = session.getPrimitive(p.id).path ?? session.getPrimitive(p.id).footprint.path;
      assert.deepEqual(path.points.map((v) => v.id), point.path.points.map((v) => v.id));
      assert.deepEqual(path.segments.map((v) => v.id), point.path.segments.map((v) => v.id));
      session.cancel(); assert.deepEqual(session.getPrimitive(p.id), p);
    } finally { session.dispose(); }
  }
});

test('individual chimney and planter movement stores host-local overrides and suppression remains separate', () => {
  const session = new WorkshopShapeSession();
  try {
    let editor = editorFor(session), chimney = editor.resolvedPlans.get('cottage').decorations.find((d) => d.role === 'chimney');
    editor.detailId = chimney.id;
    const handle = shapeDirectHandleDefinitions(editor).find((h) => h.type === 'chimney');
    session.update('cottage', shapeDirectHandleChanges(editor.primitive, handle, [0.25, 0, 0]));
    assert.equal(plans(session.composition)[0].decorations.find((d) => d.role === 'chimney').provenance.source, 'promoted');
    editor = editorFor(session);
    const box = editor.resolvedPlans.get('cottage').decorations.find((d) => d.role === 'window-box'); editor.detailId = box.id;
    const boxHandle = shapeDirectHandleDefinitions(editor).find((h) => h.type === 'box');
    session.update('cottage', shapeDirectHandleChanges(editor.primitive, boxHandle, [0.1, 0.1, 0]));
    const moved = plans(session.composition)[0].decorations.find((d) => d.id === box.id); assert.equal(moved.provenance.source, 'promoted');
    session.update('cottage', { suppressed: [box.id] }); assert.ok(!plans(session.composition)[0].decorations.some((d) => d.id === box.id));
    session.undo(); assert.deepEqual(plans(session.composition)[0].decorations.find((d) => d.id === box.id), moved);
  } finally { session.dispose(); }
});

test('ground exclusions cover foundations, entrances and stair routes', () => {
  const resolved = plans(createShapePreset('terraced-cottage')), masks = resolved.flatMap((p) => p.ground.masks);
  assert.equal(shapeGroundExcluded([0, 0], masks), true);
  for (const [x, , z] of resolved.find((p) => p.id === 'steps').route.map((r) => r.position)) assert.equal(shapeGroundExcluded([x, z], masks), true);
  const cottage = plans(createShapePreset('rounded-cottage'))[0]; assert.ok(cottage.ground.paving.length > 0);
  for (const paving of cottage.ground.paving) assert.equal(shapeGroundExcluded([0, 2].map((k) => paving.points.reduce((sum, p) => sum + p[k] / 4, 0)), cottage.ground.masks), true);
});

test('wear is stable by local cell and age edits preserve the roof and ivy buffers', () => {
  const session = new WorkshopShapeSession(), cache = new WorkshopShapeCache();
  const update = () => {
    const recipe = normalizeProceduralRecipe({ composition: session.composition, ivy: true });
    const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans); cache.releaseRemoved(result); return result;
  };
  try {
    update(); const before = cache.entries.get('cottage').domains, wear = shapeCellWear(plans(session.composition)[0], 1848, '2:1');
    session.update('cottage', { height: 4.2 }); assert.deepEqual(shapeCellWear(plans(session.composition)[0], 1848, '2:1'), wear);
    session.undo(); update(); session.update('cottage', { age: 0.8 }); update();
    const after = cache.entries.get('cottage').domains;
    assert.equal(before.get('roof'), after.get('roof')); assert.equal(before.get('ivy'), after.get('ivy')); assert.notEqual(before.get('walls'), after.get('walls'));
  } finally { cache.clear(); session.dispose(); }
});

test('connected traversal inherits timber and per-property overrides preserve the remaining inheritance', () => {
  const composition = createShapePreset('timber-pavilion'); composition.primitives[1].style = { from: 'pavilion', supports: 'stone' };
  const ramp = plans(composition).find((p) => p.id === 'ramp');
  assert.equal(ramp.resolvedStyle.hostId, 'pavilion'); assert.equal(ramp.resolvedStyle.values.floor, 'timber');
  assert.equal(ramp.resolvedStyle.values.railing, 'timber'); assert.equal(ramp.resolvedStyle.values.supports, 'stone'); assert.equal(ramp.resolvedStyle.sources.supports, 'ramp');
  assert.deepEqual(plans({ primitives: [...composition.primitives].reverse() }).find((p) => p.id === 'ramp').resolvedStyle, ramp.resolvedStyle);
  const parts = createProceduralWorkshopComponentParts(normalizeProceduralRecipe({ composition }), { preserveComponents: true });
  try {
    assert.equal(parts.find((p) => p.materialRegion.id === 'ramp:deck').materialRegion.family, 'wood');
    assert.equal(parts.find((p) => p.materialRegion.id === 'ramp:rails').materialRegion.family, 'wood');
  } finally { disposeModelParts(parts); }
});
