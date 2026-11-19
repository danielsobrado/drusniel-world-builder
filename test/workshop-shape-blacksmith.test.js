import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProceduralRecipe } from '../src/editor/workshop/ProceduralAssetStore.js';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';
import { createProceduralObjectLodParts } from '../src/editor/workshop/ProceduralAssetManager.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { buildShapeWalls } from '../src/editor/workshop/shapes/ShapeWallBuilder.js';
import { buildShapeRoof } from '../src/editor/workshop/shapes/ShapeRoofBuilder.js';
import { buildShapeFeatures } from '../src/editor/workshop/shapes/ShapeFeatureBuilder.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { buildShapeGrounding } from '../src/editor/workshop/shapes/ShapeGrounding.js';

const SLOTS = ['walls', 'roof', 'trim', 'inserts', 'glazing', 'glow', 'deck', 'foliage', 'metal', 'flashing'];

test('suppressing the foundation terrace restores the exposed ground and its moss', () => {
  const composition = createShapePreset('craft-blacksmith-forge');
  const source = composition.primitives.find((p) => p.id === 'main-workshop');
  const primitive = { ...source, age: 1, features: [] };
  const planFor = (p) => planWorkshopComposition({ composition: { primitives: [p] } }).shapePlans[0];
  const normal = planFor(primitive);
  const terrace = normal.ground.paving.find((paving) => paving.role === 'terrace');
  const suppressed = planFor({ ...primitive, suppressed: [terrace.derivationKey] });
  assert.equal(suppressed.ground.paving.some((paving) => paving.role === 'terrace'), false);
  assert.equal(suppressed.ground.masks.length, normal.ground.masks.length - 1);
  const meshes = { trim: new ShapeMesh(), foliage: new ShapeMesh() };
  buildShapeGrounding(suppressed, meshes, { detail: 2, seed: 1848 });
  assert.ok(meshes.foliage.positions.length > 0);
});

function buildPlanMeshes(plan, detail = 3) {
  const meshes = Object.fromEntries(SLOTS.map((slot) => [slot, new ShapeMesh()]));
  buildShapeWalls(plan, meshes, { seed: 1848, detail });
  buildShapeRoof(plan, meshes, { seed: 1848, detail });
  buildShapeFeatures(plan, meshes, { seed: 1848, detail });
  return meshes;
}

test('shed roofs share consistent surface height, crest line, verge lines, and sloped wall ceilings', () => {
  for (const axis of ['width', 'depth']) {
    const comp = createShapePreset('craft-blacksmith-forge');
    const shedPrim = {
      ...comp.primitives.find((p) => p.id === 'forge-shed'),
      roof: { family: 'shed', axis, rise: 1.4, overhang: 0.35, sweep: 0.25, sag: 0.05 },
    };
    const plan = planWorkshopComposition({ composition: { primitives: [shedPrim] } }).shapePlans[0];
    const roof = createShapeRoofSurface(plan);
    const wall = createShapeWallSurface(plan);
    for (const distance of [0.2 * plan.curve.length, 0.5 * plan.curve.length, 0.8 * plan.curve.length]) {
      for (const r of [0.1, 0.5, 0.9]) {
        const pt = roof.point(distance, r);
        assert.ok(Math.abs(pt[1] - roof.heightAt(pt[0], pt[2])) < 0.05, `${axis} r=${r} y=${pt[1]} heightAt=${roof.heightAt(pt[0], pt[2])}`);
      }
    }
    const ridges = roof.ridgeLines(0.5);
    assert.equal(ridges.length, 1);
    assert.ok(ridges[0].every((p) => p[1] >= plan.primitive.elevation + plan.primitive.height + plan.primitive.roof.rise - 0.1));
    const verges = roof.vergeLines(0.5);
    assert.equal(verges.length, 2);
    for (const line of verges) {
      assert.ok(line[0][1] > line.at(-1)[1], 'Verge lines descend from high crest to low eave.');
    }
    const wallHeights = [0.15, 0.4, 0.65, 0.9].map((at) => wall.ceiling(at * plan.curve.length));
    assert.ok(Math.max(...wallHeights) > shedPrim.height + 0.1, `Sloped side/end wall rises above plate (${wallHeights.join(', ')})`);
  }
});

test('gable-triangle attic openings resolve above wall height, punch holes in gable walls/courses, and isolate roof cache to upper openings', () => {
  const composition = createShapePreset('craft-blacksmith-forge');
  const main = composition.primitives.find((p) => p.id === 'main-workshop');
  const single = { primitives: [{ ...main, terrace: 0, quoins: false, beltCourses: false }] };
  const resolved = planWorkshopComposition({ composition: single }).shapePlans[0];
  const gableVent = resolved.openings.find((o) => o.id === 'right-gable-vent');
  assert.ok(gableVent, 'Gable vent opening present');
  assert.ok(gableVent.bottom > resolved.primitive.height, `Gable vent stays above eave: ${gableVent.bottom} > ${resolved.primitive.height}`);
  assert.equal(gableVent.height, 0.36);

  const roofWithout = buildPlanMeshes({ ...resolved, openings: resolved.openings.filter((o) => o.id !== 'right-gable-vent') }, 3);
  const roofWith = buildPlanMeshes(resolved, 3);
  assert.notEqual(roofWith.walls.positions.length + roofWith.trim.positions.length, roofWithout.walls.positions.length + roofWithout.trim.positions.length);

  // Moving a lower window inside the wall band reuses roof buffers, whereas moving a gable vent rebuilds roof.
  const session = new WorkshopShapeSession(single);
  const cache = new WorkshopShapeCache();
  try {
    const sync = () => {
      const recipe = normalizeProceduralRecipe({ archetype: 'manor', composition: session.composition, detail: 2, seed: 1848 });
      const plans = planWorkshopComposition({ composition: session.composition }).shapePlans;
      cache.releaseRemoved(cache.update(recipe, plans));
      return plans;
    };
    let plans = sync();
    const beforeRoof = cache.entries.get('main-workshop')?.domains?.get('roof');
    assert.ok(beforeRoof);
    session.update('main-workshop', {
      openings: plans[0].primitive.openings.map((o) => (o.id === 'right-ground' ? { ...o, width: 0.8 } : o)),
    });
    plans = sync();
    const afterLowerEditRoof = cache.entries.get('main-workshop')?.domains?.get('roof');
    assert.equal(afterLowerEditRoof, beforeRoof, 'Lower wall opening edit preserves roof domain cache.');
    session.update('main-workshop', {
      openings: plans[0].primitive.openings.map((o) => (o.id === 'right-gable-vent' ? { ...o, width: 0.42 } : o)),
    });
    sync();
    const afterGableEditRoof = cache.entries.get('main-workshop')?.domains?.get('roof');
    assert.notEqual(afterGableEditRoof, beforeRoof, 'Gable-triangle opening edit invalidates roof domain cache.');
  } finally {
    cache.clear();
    session.dispose();
  }
});

test('stepped-plinth, quoins, beltCourses, curved buttresses, grounded chimney, mullions, rubble weathering, terrace, and forge interior build complete geometry', () => {
  const composition = createShapePreset('craft-blacksmith-forge');
  const plans = planWorkshopComposition({ composition }).shapePlans;
  const mainPlan = plans.find((p) => p.id === 'main-workshop');
  const shedPlan = plans.find((p) => p.id === 'forge-shed');

  assert.equal(mainPlan.primitive.base.style, 'stepped-plinth');
  assert.equal(mainPlan.primitive.quoins, true);
  assert.equal(mainPlan.primitive.beltCourses, true);
  assert.ok(mainPlan.ground.paving.some((p) => p.role === 'terrace'));
  assert.ok(shedPlan.ground.paving.some((p) => p.role === 'terrace'));
  assert.equal(shedPlan.interior.forge?.provenance?.ruleId, 'interior-treatment');
  assert.equal(shedPlan.interior.forge?.role, 'interior-forge');

  const noArticulationPlan = planWorkshopComposition({
    composition: {
      primitives: [{ ...mainPlan.primitive, quoins: false, beltCourses: false, age: 0, features: [], base: { ...mainPlan.primitive.base, style: 'none' } }],
    },
  }).shapePlans[0];
  const richMeshes = buildPlanMeshes(mainPlan, 3);
  const plainMeshes = buildPlanMeshes(noArticulationPlan, 3);
  assert.ok(richMeshes.trim.positions.length > plainMeshes.trim.positions.length, 'Quoins, belt courses, stepped plinth, buttress & chimney add articulated trim stone.');
  assert.ok(richMeshes.flashing.positions.length > 0, 'Grounded gable chimney adds lead roof flashing.');

  const shedMeshes = buildPlanMeshes(shedPlan, 3);
  assert.ok(shedMeshes.metal.positions.length > 0, 'Forge interior emits iron smoke hood.');
  assert.ok(shedMeshes.glow.positions.length > 0, 'Forge interior emits glowing hearth coals.');
  assert.ok(shedMeshes.inserts.positions.length > 0, 'Opening divider post & forge timber props emit inserts geometry.');
});

test('craft-blacksmith-forge builds finite <=8 runtime batches and passes runtime coarse/shell LOD envelope & reduction gates', () => {
  const recipe = normalizeProceduralRecipe({
    archetype: 'manor',
    composition: createShapePreset('craft-blacksmith-forge'),
    detail: 3,
    seed: 1848,
  });
  const parts = createProceduralWorkshopComponentParts(recipe);
  let lod = null;
  try {
    assert.ok(parts.length > 0 && parts.length <= 8, `Expected <=8 batches, got ${parts.length}`);
    for (const part of parts) {
      assert.ok(part.geometry.getAttribute('position').array.every(Number.isFinite));
      assert.ok(part.geometry.getAttribute('normal').array.every(Number.isFinite));
      assert.ok(part.geometry.boundingBox && !part.geometry.boundingBox.isEmpty());
    }
    lod = createProceduralObjectLodParts({ recipe }, parts);
    assert.ok(lod, 'Expected craft-blacksmith-forge to qualify for runtime coarse/shell LOD.');
    assert.ok(lod.statistics.envelopeDelta <= lod.statistics.envelopeTolerance, `Envelope delta ${lod.statistics.envelopeDelta} > tolerance ${lod.statistics.envelopeTolerance}`);
    assert.ok(lod.statistics.coarseRatio < 0.95, `Coarse ratio ${lod.statistics.coarseRatio} should be < 0.95`);
  } finally {
    disposeModelParts(parts);
    if (lod) {
      disposeModelParts(lod.coarse);
      disposeModelParts(lod.shell);
    }
  }
});
