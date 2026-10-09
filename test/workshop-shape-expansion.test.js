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
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { buildShapeFeatures } from '../src/editor/workshop/shapes/ShapeFeatureBuilder.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';

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
  const envelope = feature.child?.bounds ?? feature.solidSupport?.bounds;
  if (envelope) for (const axis of [0, 1]) {
    assert.ok(resolved.shapePlans[0].bounds.min[axis] <= envelope.min[axis]);
    assert.ok(resolved.shapePlans[0].bounds.max[axis] >= envelope.max[axis]);
  }
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

test('vertical opening, planter and feature drags preserve their anchor on a tapered oval', () => {
  const composition = createShapePreset('rounded-cottage'), source = composition.primitives[0];
  Object.assign(source, { height: 6, taper: 0.65, rotation: 37,
    footprint: { family: 'oval', width: 8, depth: 3 },
    openings: [{ id: 'window', role: 'window', at: 0.13, bottom: 1, height: 1 }],
    features: [{ id: 'balcony', kind: 'balcony', at: 0.13, bottom: 1 }, { id: 'bay', kind: 'bay', at: 0.13, bottom: 1 }] });
  const plan = plans(composition)[0], p = plan.primitive;
  const editor = { primitive: p, openingId: 'window', resolvedPlans: new Map([[p.id, plan]]) };
  const opening = shapeDirectHandleDefinitions(editor).find((h) => h.type === 'opening');
  const moved = shapeDirectHandleChanges(p, opening, [0, 0.8, 0]).openings[0];
  assert.ok(Math.abs(moved.at - p.openings[0].at) < 1e-6, 'A vertical window drag stays at the same perimeter location.');
  const planter = { ...opening, type: 'box', key: `detail:${p.id}:window-box:window`, bottom: 1, y: 0.85 };
  const patch = shapeDirectHandleChanges(p, planter, [0, 0.8, 0]).detailOverrides[0];
  assert.ok(Math.abs(patch.at - p.openings[0].at) < 1e-6, 'A vertical planter drag keeps its anchor.');
  for (const feature of p.features) {
    const handle = shapeDirectHandleDefinitions({ ...editor, featureId: feature.id }).find((h) => h.type === 'feature');
    const movedFeature = shapeDirectHandleChanges(p, handle, [0, 0.8, 0]).features.find((f) => f.id === feature.id);
    assert.ok(Math.abs(movedFeature.at - feature.at) < 1e-6, `A vertical ${feature.kind} drag keeps its anchor.`);
  }
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

test('buttress contacts anchor to ground level on a tapered wall', () => {
  const composition = createShapePreset('rounded-cottage'), p = composition.primitives[0];
  Object.assign(p, { taper: 0.65, rotation: 37, openings: [], features: [{ id: 'support', kind: 'buttress', at: 0.12, height: 4 }] });
  const plan = plans(composition)[0], f = plan.features[0], wall = createShapeWallSurface(plan);
  const ground = wall.point(f.frame.u, 0, plan.primitive.thickness / 2);
  assert.deepEqual(f.frame.origin, ground);
  const mesh = new ShapeMesh(); buildShapeFeatures(plan, { trim: mesh }, { detail: 2 });
  const top = wall.point(f.frame.u, Math.min(f.intent.height, p.height * 0.86), plan.primitive.thickness / 2);
  const nearTop = Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions.slice(i * 3, i * 3 + 3))
    .filter((v) => Math.abs(v[1] - top[1]) < 1e-7);
  assert.ok(nearTop.some((v) => Math.abs((v[0] - top[0]) * f.frame.outward[0] + (v[2] - top[2]) * f.frame.outward[2]) < 1e-7),
    'The inner upper edge also follows the tapered wall.');
});

test('neighboring roof and host height edits refresh buttresses while distant buffers are reused', () => {
  const composition = createShapePreset('rounded-cottage'), p = composition.primitives[0];
  Object.assign(p, { height: 8, openings: [], features: [{ id: 'support', kind: 'buttress', at: 0.12, depth: 1.8, height: 8, bottom: 0 }] });
  const f = plans(composition)[0].features[0];
  composition.primitives.push({ ...structuredClone(p), id: 'neighbor', height: 1.2, features: [],
    position: [f.frame.origin[0] + f.frame.outward[0] * 0.9, f.frame.origin[2] + f.frame.outward[2] * 0.9],
    footprint: { family: 'rounded', width: 2, depth: 2, cornerRadius: 0.1 },
    roof: { family: 'hip', rise: 0.4, overhang: 0.1 } },
  { ...structuredClone(p), id: 'distant', position: [40, 40], features: [] });
  const cache = new WorkshopShapeCache();
  const update = () => {
    const recipe = normalizeProceduralRecipe({ composition }), result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
    cache.releaseRemoved(result);
  };
  const vertices = (product) => JSON.stringify(product.parts.map((part) => Array.from(part.geometry.getAttribute('position').array)));
  try {
    update(); const before = cache.entries.get(p.id).domains.get('features'), shape = vertices(before), distant = cache.entries.get('distant');
    composition.primitives.find((v) => v.id === 'neighbor').roof.rise = 5; update();
    const after = cache.entries.get(p.id).domains.get('features');
    assert.ok(after !== before, 'A roof edit refreshes support clipping.');
    assert.ok(vertices(after) !== shape, 'The changed roof actually cuts different support geometry.');
    assert.ok(cache.entries.get('distant') === distant);
    p.height = 5; update();
    assert.ok(cache.entries.get(p.id).domains.get('features') !== after, 'Host height refreshes the resolved support height.');
    assert.ok(cache.entries.get('distant') === distant);
  } finally { cache.clear(); }
});

test('porches choose the nearest door across the closed footprint seam', () => {
  const composition = createShapePreset('rounded-cottage'), p = composition.primitives[0];
  p.openings = [{ id: 'near-door', role: 'door', at: 0.02 }, { id: 'far-door', role: 'door', at: 0.7 }];
  p.features = [{ id: 'porch', kind: 'porch', at: 0.99 }];
  const plan = plans(composition)[0];
  assert.ok(Math.abs(plan.features[0].frame.u / plan.curve.length - 0.02) < 1e-8);
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
