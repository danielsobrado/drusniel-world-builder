import test from 'node:test';
import assert from 'node:assert/strict';
import { placeOnSide } from '../src/editor/workshop/shapes/cities/ShapeSidePlacement.js';
import { normalizeShapeVolume, planShapeVolume } from '../src/editor/workshop/shapes/ShapeVolume.js';
import { SHAPE_PRESETS, createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { normalizeProceduralRecipe } from '../src/editor/workshop/ProceduralAssetStore.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';
import { MAX_WORKSHOP_MATERIAL_DRAW_PARTS } from '../src/editor/workshop/ProceduralWorkshopMaterialConfig.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { SHAPE_CITY_CATALOGS } from '../src/editor/workshop/shapes/config/ShapeCityPresets.generated.js';

function pointAt(footprint, at) {
  const plan = planShapeVolume(normalizeShapeVolume({ id: 'probe', kind: 'curved-volume', footprint }));
  const target = at * plan.curve.length;
  return plan.curve.samples.reduce((best, s) => (Math.abs(s.distance - target) < Math.abs(best.distance - target) ? s : best)).point;
}

for (const footprint of [
  { family: 'rounded', width: 8, depth: 5, cornerRadius: 0.4 },
  { family: 'rounded', width: 4, depth: 9, cornerRadius: 1.2 },
  { family: 'oval', width: 6, depth: 4 },
]) {
  test(`side placement lands on the named ${footprint.family} ${footprint.width}x${footprint.depth} wall`, () => {
    const x = footprint.width / 2, z = footprint.depth / 2, tol = 0.3;
    const expect = { front: [0, z], back: [0, -z], right: [x, 0], left: [-x, 0] };
    for (const [side, [ex, ez]] of Object.entries(expect)) {
      const [px, pz] = pointAt(footprint, placeOnSide(footprint, side));
      assert.ok(Math.hypot(px - ex, pz - ez) < tol, `${side}: ${px},${pz}`);
    }
    // Positive offsets move to the viewer's right when facing the wall from outside (+x on the front).
    if (footprint.family === 'rounded') {
      assert.ok(pointAt(footprint, placeOnSide(footprint, 'front', 0.5))[0] > 0.3);
      assert.ok(pointAt(footprint, placeOnSide(footprint, 'back', 0.5))[0] < -0.3);
    }
  });
}

// Every realm city must be buildable on its own: the minimum building mix per catalog.
const CITY_MINIMUMS = { house: 5, farm: 3, inn: 3, shop: 5, tower: 3, wall: 2, stair: 2, plaza: 2 };

for (const catalog of SHAPE_CITY_CATALOGS) {
  test(`${catalog.group} has a full city's building mix and grouped picker entries`, () => {
    for (const [kind, min] of Object.entries(CITY_MINIMUMS)) {
      const count = new Set(catalog.kit.filter((e) => e.blueprint.startsWith(`${kind}-`)).map((e) => e.blueprint)).size;
      assert.ok(count >= min, `${kind}: ${count} distinct types, needs ${min}`);
    }
    assert.ok(catalog.presets.length >= 2, 'a realm needs hand-made landmarks of its own');
    // Every design opens with the realm's palette, and every shell gets a realm material.
    for (const item of [...catalog.kit, ...catalog.presets]) {
      const composition = createShapePreset(item.id), preset = SHAPE_PRESETS.find((p) => p.id === item.id);
      const { recipe: bases, document } = preset.materials(composition.primitives);
      const recipe = normalizeProceduralRecipe({ archetype: 'manor', composition, ...bases, ...document });
      for (const p of composition.primitives.filter((p) => p.kind !== 'traversal'))
        assert.match(recipe.materialAreaOverrides[`${p.id}:walls`] ?? '', new RegExp(`^${catalog.realm}-`), `${item.id}/${p.id}`);
    }
    const sample = createShapePreset(catalog.kit[0].id);
    const look = SHAPE_PRESETS.find((p) => p.id === catalog.kit[0].id).materials(sample.primitives);
    const parts = createProceduralWorkshopComponentParts(normalizeProceduralRecipe({ archetype: 'manor', composition: sample, detail: 2,
      ...look.recipe, ...look.document }));
    try { assert.ok(parts.length > 0 && parts.length <= MAX_WORKSHOP_MATERIAL_DRAW_PARTS); } finally { disposeModelParts(parts); }
    for (const item of [...catalog.kit, ...catalog.presets]) assert.equal(SHAPE_PRESETS.find((p) => p.id === item.id)?.group, catalog.group);
  });
}

test('preset ids are unique and side offsets stay on their wall', () => {
  assert.equal(new Set(SHAPE_PRESETS.map((p) => p.id)).size, SHAPE_PRESETS.length);
  assert.throws(() => placeOnSide({ family: 'rounded', width: 4, depth: 4, cornerRadius: 0.2 }, 'front', 3), /leaves the front side/);
});
