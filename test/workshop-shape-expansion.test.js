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
import { roundedFootprint } from '../src/editor/workshop/shapes/ShapePaths.js';
import { resolveWorkshopMaterialRegion } from '../src/editor/workshop/ProceduralWorkshopMaterialConfig.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { createProceduralObjectLodParts } from '../src/editor/workshop/ProceduralAssetManager.js';

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

test('projecting floors expand custom curved footprints without changing their canonical path', () => {
  const composition = createShapePreset('timber-cottage'), p = composition.primitives[0];
  p.footprint = { family: 'custom', path: roundedFootprint('custom-host', 6, 4, 0.7).toJSON() };
  p.features = [{ id: 'projecting-floor', kind: 'jetty', depth: 0.45 }];
  const before = structuredClone(p.footprint.path), plan = plans(composition)[0], child = plan.features[0].child;
  assert.equal(child.primitive.footprint.width, 6.9); assert.equal(child.primitive.footprint.depth, 4.9);
  assert.ok(Math.max(...child.boundary.map(([x]) => x)) > 3.4);
  assert.deepEqual(p.footprint.path, before);
  assert.deepEqual(child.curve.path.points.map((v) => v.id), before.points.map((v) => v.id));
  assert.ok(child.neighbors.find((n) => n.id === p.id).roofReplaced);
});

test('interactive detail rebuilds remain local and settled previews upgrade only those products', () => {
  const session = new WorkshopShapeSession(createShapePreset('cottage-turret')), cache = new WorkshopShapeCache();
  const update = (interactive) => {
    const recipe = normalizeProceduralRecipe({ composition: session.composition, ivy: true });
    const result = cache.update({ ...recipe, shapeInteractive: interactive }, planWorkshopComposition(recipe).shapePlans);
    cache.releaseRemoved(result); return result;
  };
  try {
    update(false); const turret = cache.entries.get('turret'), before = cache.entries.get('cottage').domains;
    const p = session.getPrimitive('cottage');
    session.update(p.id, { openings: p.openings.map((o) => o.role === 'window' ? { ...o, bottom: o.bottom + 0.1 } : o) });
    update(true); const draft = cache.entries.get('cottage').domains;
    assert.ok(cache.entries.get('turret') === turret, 'An opening drag preserves the neighboring turret.');
    assert.ok(draft.get('roof') === before.get('roof'), 'An opening drag preserves its roof.');
    assert.equal(draft.get('walls').detail, 1);
    const upgraded = update(false);
    assert.ok(cache.entries.get('turret') === turret); assert.ok(cache.entries.get('cottage').domains.get('roof') === before.get('roof'));
    assert.equal(cache.entries.get('cottage').domains.get('walls').detail, 2);
    assert.equal(upgraded.stats.rebuiltDomains, [...draft.values()].filter((d) => d.detail === 1).length);
  } finally { cache.clear(); session.dispose(); }
});

test('floor material inheritance follows the host floor override and a local override takes precedence', () => {
  const composition = createShapePreset('timber-pavilion'), plan = plans(composition).find((p) => p.id === 'ramp');
  const region = plan.regions.find((r) => r.id === 'ramp:deck');
  const recipe = normalizeProceduralRecipe({ composition, materialAreaOverrides: { 'pavilion:deck': 'aged-timber' } });
  assert.equal(resolveWorkshopMaterialRegion(recipe, region).presetId, 'aged-timber');
  const local = normalizeProceduralRecipe({ ...recipe, materialAreaOverrides: { ...recipe.materialAreaOverrides, 'ramp:deck': 'sandstone-masonry' } });
  assert.equal(resolveWorkshopMaterialRegion(local, region).presetId, 'sandstone-masonry');
});

test('projecting features create spatial contacts and propagate replaced roofs without affecting distant products', () => {
  const composition = createShapePreset('rounded-cottage'), host = composition.primitives[0];
  host.features = [{ id: 'upper-floor', kind: 'jetty', depth: 1.5 }];
  composition.primitives.push({ ...host, id: 'neighbor', position: [6.4, 0], features: [],
    footprint: { family: 'rounded', width: 2, depth: 3, cornerRadius: 0.2 } },
  { ...host, id: 'distant', position: [40, 0], features: [] });
  const cache = new WorkshopShapeCache();
  const update = () => {
    const recipe = normalizeProceduralRecipe({ composition });
    const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans); cache.releaseRemoved(result);
  };
  try {
    const first = plans(composition), upper = first[0].features[0].child;
    const other = first.find((p) => p.id === 'neighbor');
    assert.ok(other.neighbors.some((n) => n.id === upper.id), 'Projection contact is discovered outside the original host bounds.');
    assert.ok(upper.neighbors.some((n) => n.id === 'neighbor'));
    assert.ok(upper.neighbors.find((n) => n.id === host.id).roofReplaced);
    assert.doesNotThrow(() => JSON.stringify(first));
    assert.deepEqual(plans({ primitives: [...composition.primitives].reverse() }).find((p) => p.id === 'neighbor'), other);
    update(); const distant = cache.entries.get('distant');
    host.features[0].depth = 1.7; update();
    assert.ok(cache.entries.get('distant') === distant);
  } finally { cache.clear(); }
});

test('projecting floors retain lower wall bands and rehost the chimney on the replacement roof', () => {
  const recipe = normalizeProceduralRecipe({ composition: createShapePreset('jettied-townhouse') });
  const plan = planWorkshopComposition(recipe).shapePlans[0], upper = plan.features[0].child;
  const chimney = upper.decorations.find((d) => d.role === 'chimney');
  assert.ok(chimney); assert.equal(chimney.position[1], createShapeRoofSurface(upper).heightAt(chimney.position[0], chimney.position[2]) - 0.14);
  assert.deepEqual(chimney, plan.decorations.find((d) => d.id === chimney.id));
  const parts = createProceduralWorkshopComponentParts(recipe, { preserveComponents: true, resolvedShapePlans: [plan], shapeDomains: ['walls'] });
  try {
    const wall = parts.find((p) => p.materialRegion.id === `${plan.id}:walls`);
    assert.ok(wall);
    const points = wall.geometry.getAttribute('position');
    const lowerWall = Array.from({ length: points.count }, (_, i) => [points.getX(i), points.getY(i), points.getZ(i)])
      .filter(([x, y, z]) => y > 0.5 && y < upper.primitive.elevation && (Math.abs(x) > 2 || Math.abs(z) > 1));
    assert.ok(lowerWall.length > 24, 'The first storey remains a closed wall shell below the projecting floor.');
  } finally { disposeModelParts(parts); }
});

test('buttresses adapt around authored openings while retaining their requested anchor', () => {
  const composition = createShapePreset('rounded-cottage'), p = composition.primitives[0], door = p.openings.find((o) => o.role === 'door');
  p.features = [{ id: 'door-support', kind: 'buttress', at: door.at }];
  const resolved = plans(composition)[0], feature = resolved.features[0];
  assert.equal(feature.intent.at, door.at);
  const requested = door.at * resolved.curve.length;
  assert.ok(Math.abs(feature.frame.u - requested) > door.width / 2);
  assert.deepEqual(p.features, [{ id: 'door-support', kind: 'buttress', at: door.at }]);
});

test('roof flashing has a matte lead finish with explicit material override priority', () => {
  const composition = createShapePreset('cottage-turret');
  const recipe = normalizeProceduralRecipe({ composition }), parts = createProceduralWorkshopComponentParts(recipe, { preserveComponents: true });
  try {
    const flashing = parts.find((p) => p.materialRegion.id.endsWith(':flashing'));
    assert.ok(flashing); assert.equal(flashing.materialRegion.presetId, 'weathered-lead');
    assert.equal(flashing.material.roughness, 0.92);
    assert.equal(resolveWorkshopMaterialRegion({ ...recipe, materialAreaOverrides: { [flashing.materialRegion.id]: 'aged-timber' } }, flashing.materialRegion).presetId, 'aged-timber');
  } finally { disposeModelParts(parts); }
});

test('new architectural presets enter the runtime distance tiers with cheaper geometry and preserved envelopes', () => {
  for (const id of ['dormer-cottage', 'bay-porch-cottage', 'jettied-townhouse', 'buttressed-chapel']) {
    const recipe = normalizeProceduralRecipe({ composition: createShapePreset(id), detail: 2 });
    const near = createProceduralWorkshopComponentParts(recipe); let lod;
    try {
      lod = createProceduralObjectLodParts({ recipe }, near);
      assert.ok(lod, `${id} must be accepted by runtime LOD validation.`);
      assert.ok(lod.statistics.coarseRatio < 0.95);
      assert.ok(lod.statistics.envelopeDelta < 0.15);
      assert.ok(lod.coarse.length <= 8);
    } finally {
      const parts = [...near, ...(lod?.coarse ?? []), ...(lod?.shell ?? [])];
      disposeModelParts([...new Map(parts.map((p) => [p.geometry, p])).values()]);
    }
  }
});
