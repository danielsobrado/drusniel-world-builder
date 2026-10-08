import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProceduralRecipe,
  ProceduralAssetStore,
} from '../src/editor/workshop/ProceduralAssetStore.js';
import {
  planWorkshopComposition,
  serializeWorkshopComposition,
} from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { SHAPE_PRESETS, createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { shapeRandom } from '../src/editor/workshop/shapes/ShapeMesh.js';
import {
  createWorkshopDocumentFromRecipe,
  resolveWorkshopRecipe,
} from '../src/editor/workshop/kernel/WorkshopRecipeBridge.js';
import { WorkshopSpatialIndex } from '../src/editor/workshop/spatial/WorkshopSpatialIndex.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { roundedFootprint } from '../src/editor/workshop/shapes/ShapePaths.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { buildShapeFloors } from '../src/editor/workshop/shapes/ShapeFloorBuilder.js';

for (const preset of SHAPE_PRESETS) {
  test(`${preset.id} builds finite batched geometry and persists semantic shape intent`, () => {
    const recipe = normalizeProceduralRecipe({
      archetype: 'manor',
      composition: createShapePreset(preset.id),
      detail: 2,
      seed: 1848,
    });
    const roundtrip = resolveWorkshopRecipe(createWorkshopDocumentFromRecipe(recipe));
    assert.deepEqual(roundtrip, recipe);
    const parts = createProceduralWorkshopComponentParts(recipe);
    try {
      assert.ok(parts.length > 0 && parts.length <= 8, `${parts.length} runtime batches`);
      for (const part of parts) {
        assert.ok(part.geometry.getAttribute('position').array.every(Number.isFinite));
        assert.ok(part.geometry.getAttribute('normal').array.every(Number.isFinite));
        assert.ok(part.geometry.boundingBox && !part.geometry.boundingBox.isEmpty());
      }
      assert.equal(parts.components.length, recipe.composition.primitives.length);
      assert.ok(parts.semantics.collisionSlabs.length > 0);
    } finally {
      disposeModelParts(parts);
    }
  });
}

test('semantic shape gestures commit once and cancel/undo/save/load preserve intent', () => {
  const session = new WorkshopShapeSession();
  const original = serializeWorkshopComposition(session.composition);
  session.begin('Round the cottage');
  for (const radius of [1, 1.2, 1.4])
    session.update('cottage', {
      footprint: {
        ...session.getPrimitive('cottage').footprint,
        cornerRadius: radius,
      },
    });
  assert.deepEqual(resolveWorkshopRecipe(session.bus.document).composition, original);
  session.commit();
  assert.equal(session.history.undoDepth, 1);
  const committed = session.composition;
  session.undo();
  assert.deepEqual(session.composition, original);
  session.redo();
  assert.deepEqual(session.composition, committed);
  session.begin();
  session.update('cottage', { height: 7 });
  session.cancel();
  assert.deepEqual(session.composition, committed);
  const store = new ProceduralAssetStore();
  store.add({ label: 'Rounded cottage', recipe: { composition: committed } });
  const saved = store.toDocument();
  const restored = new ProceduralAssetStore();
  restored.replaceAll(saved);
  assert.deepEqual(restored.toDocument(), saved);
  session.dispose();
});

test('invalid paths and invalid authored shape dimensions cannot commit', () => {
  const session = new WorkshopShapeSession();
  const before = session.composition;
  assert.throws(() => session.update('cottage', { height: NaN }), /finite/);
  assert.throws(
    () =>
      session.update('cottage', {
        footprint: { family: 'rounded', width: 2, depth: 2, cornerRadius: 2 },
      }),
    /Corner radius/,
  );
  assert.deepEqual(session.composition, before);
  assert.equal(session.history.canUndo, false);
  session.dispose();
});

test('shape spatial indexing includes curved volumes, walls, and traversal widths', () => {
  const doc = createWorkshopDocumentFromRecipe({
    composition: createShapePreset('terraced-cottage'),
  });
  const index = new WorkshopSpatialIndex(doc);
  const bounds = index.boundsOf('composition:cottage');
  assert.ok(bounds.min[0] < 0);
  assert.ok(index.queryRadius([0, 0], 10).length >= 3);
});

test('openings publish matching wall cuts, decoration exclusions, and portals', () => {
  const plan = planWorkshopComposition({
    composition: createShapePreset('rounded-cottage'),
  });
  const shape = plan.shapePlans[0],
    surface = createShapeWallSurface(shape);
  const door = shape.primitive.openings.find((o) => o.role === 'door');
  assert.ok(surface.excluded(door.at * shape.curve.length, door.height * 0.5));
  assert.ok(!surface.excluded(door.at * shape.curve.length, shape.primitive.height - 0.1));
  assert.ok(plan.rpg.portals.some((portal) => portal.openingId === door.id));
  assert.deepEqual(plan.rpg.collisionSlabs[0].gaps, shape.primitive.openings);
});

test('raised volumes resolve suppressible supports without adding authored entities', () => {
  const session = new WorkshopShapeSession(createShapePreset('terraced-cottage'));
  const before = session.primitives.length;
  const recipe = { composition: session.composition };
  const plan = planWorkshopComposition(recipe);
  const supports = plan.structural.supports.filter((s) => s.sourceEntityIds.includes('cottage'));
  assert.equal(supports.length, 4);
  assert.ok(supports.every((s) => s.source === 'auto' && s.derivationKey));
  session.update('cottage', { suppressed: [supports[0].derivationKey] });
  assert.equal(
    planWorkshopComposition({
      composition: session.composition,
    }).structural.supports.filter((s) => s.sourceEntityIds.includes('cottage')).length,
    3,
  );
  assert.equal(session.primitives.length, before);
  session.dispose();
});

test('volume contact changes both neighboring plans and preserves unrelated plans', () => {
  const input = createShapePreset('cottage-turret');
  input.primitives.push({
    ...createShapePreset('rounded-cottage').primitives[0],
    id: 'distant',
    position: [30, 30],
  });
  const before = planWorkshopComposition({ composition: input });
  assert.ok(before.structural.contacts.length > 0);
  const moved = structuredClone(input);
  moved.primitives.find((p) => p.id === 'turret').position = [15, 0];
  const after = planWorkshopComposition({ composition: moved });
  assert.notDeepEqual(
    before.shapePlans.find((p) => p.id === 'cottage'),
    after.shapePlans.find((p) => p.id === 'cottage'),
  );
  assert.deepEqual(
    before.shapePlans.find((p) => p.id === 'distant'),
    after.shapePlans.find((p) => p.id === 'distant'),
  );
});

test('local product updates reuse unaffected resources and dispose replaced resources once', () => {
  const disposed = [],
    built = [];
  const cache = new WorkshopShapeCache({
    build: (recipe) => {
      const parts = [{ id: recipe.composition.primitives[0].id, token: {} }];
      built.push(parts);
      return parts;
    },
    dispose: (parts) => disposed.push(parts),
  });
  const input = createShapePreset('curved-courtyard');
  let recipe = normalizeProceduralRecipe({ composition: input });
  const first = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
  cache.releaseRemoved(first);
  const right = cache.entries.get('wall-right').parts;
  input.primitives[0].bend = 6;
  recipe = normalizeProceduralRecipe({ composition: input });
  const second = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
  cache.releaseRemoved(second);
  assert.equal(cache.entries.get('wall-right').parts, right);
  assert.equal(second.stats.rebuilt, 1);
  assert.equal(second.stats.reused, 1);
  assert.equal(built.length, 3);
  assert.equal(disposed.length, 1);
  cache.clear();
  assert.equal(disposed.length, 3);
  assert.equal(new Set(disposed).size, 3);
});

test('detail randomness is anchored to entity/domain/cell rather than generation order', () => {
  const original = shapeRandom(1848, 'cottage', 'masonry', '3:8');
  for (let i = 0; i < 100; i++) shapeRandom(1848, 'other', 'roof-tiles', String(i));
  assert.equal(shapeRandom(1848, 'cottage', 'masonry', '3:8'), original);
  assert.notEqual(shapeRandom(1848, 'cottage', 'roof-tiles', '3:8'), original);
});

test('traversal resolves slopes and publishes the same treads as walkable routes', () => {
  const base = createShapePreset('garden-bridge').primitives[0];
  const resolve = (rise) =>
    planWorkshopComposition({
      composition: { primitives: [{ ...base, mode: 'auto', rise }] },
    }).shapePlans[0];
  assert.equal(resolve(0).mode, 'walkway');
  assert.equal(resolve(0.5).mode, 'ramp');
  const stair = resolve(2);
  assert.equal(stair.mode, 'stairs');
  assert.ok(stair.steps >= 11);
  assert.equal(stair.rpg.walkableFloors[0].steps, stair.steps);
  assert.equal(stair.rpg.stairSockets.length, 2);
});

test('near and coarse shape products retain structural silhouette', () => {
  const input = { composition: createShapePreset('bell-turret'), seed: 1 };
  const near = createProceduralWorkshopComponentParts({ ...input, detail: 3 });
  const coarse = createProceduralWorkshopComponentParts({
    ...input,
    detail: 1,
  });
  try {
    const vertices = (parts) =>
      parts.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0);
    assert.ok(vertices(coarse) < vertices(near));
    const maxY = (parts) => Math.max(...parts.map((p) => p.geometry.boundingBox.max.y));
    assert.ok(Math.abs(maxY(near) - maxY(coarse)) < 0.06);
  } finally {
    disposeModelParts([...near, ...coarse]);
  }
});

test('roof edits rebuild the roof domain while preserving wall and ivy buffers', () => {
  const cache = new WorkshopShapeCache();
  const input = createShapePreset('rounded-cottage');
  let recipe = normalizeProceduralRecipe({ composition: input, ivy: true });
  cache.releaseRemoved(cache.update(recipe, planWorkshopComposition(recipe).shapePlans));
  const before = cache.entries.get('cottage').domains;
  input.primitives[0].roof.rise = 3.6;
  recipe = normalizeProceduralRecipe({ composition: input, ivy: true });
  const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
  const after = cache.entries.get('cottage').domains;
  assert.equal(after.get('walls'), before.get('walls'));
  assert.equal(after.get('ivy'), before.get('ivy'));
  assert.notEqual(after.get('roof'), before.get('roof'));
  assert.equal(result.stats.rebuiltDomains, 1);
  cache.releaseRemoved(result);
  cache.clear();
});

test('a failed domain build keeps previous resources and disposes only staged resources', () => {
  const disposed = [];
  let fail = false;
  const cache = new WorkshopShapeCache({
    build: (recipe, { shapeDomains }) => {
      if (fail && shapeDomains[0] === 'roof') throw new Error('Roof builder failure');
      return [{ token: {} }];
    },
    dispose: (parts) => disposed.push(...parts),
  });
  const input = createShapePreset('rounded-cottage');
  let recipe = normalizeProceduralRecipe({ composition: input, ivy: false });
  cache.releaseRemoved(cache.update(recipe, planWorkshopComposition(recipe).shapePlans));
  const before = cache.entries;
  fail = true;
  input.primitives[0].height = 4.5;
  recipe = normalizeProceduralRecipe({ composition: input, ivy: false });
  assert.throws(
    () => cache.update(recipe, planWorkshopComposition(recipe).shapePlans),
    /Roof builder failure/,
  );
  assert.equal(cache.entries, before);
  assert.equal(disposed.length, 1);
  cache.clear();
  assert.equal(disposed.length, 4);
  assert.equal(new Set(disposed).size, 4);
});

test('all roof profiles agree between geometry sampling and surface height queries', () => {
  for (const family of ['gable', 'hip', 'bell', 'cone', 'spire', 'flat']) {
    const input = createShapePreset('bell-turret');
    input.primitives[0].roof.family = family;
    const plan = planWorkshopComposition({ composition: input }).shapePlans[0];
    const surface = createShapeRoofSurface(plan);
    for (const sample of plan.curve.samples)
      for (const t of [0.2, 0.6, 1]) {
        const point = surface.point(sample.distance, t);
        assert.ok(
          Math.abs(surface.heightAt(point[0], point[2]) - point[1]) < 0.015,
          `${family}: sample ${sample.distance} at ${t}, surface ${surface.heightAt(point[0], point[2])}, mesh ${point[1]}`,
        );
      }
  }
});

test('arch bridge supports preserve a clear span and remain suppressible', () => {
  const input = createShapePreset('garden-bridge');
  const plan = planWorkshopComposition({ composition: input }).shapePlans[0];
  assert.equal(plan.supports.length, 2);
  assert.ok(plan.supports.every((s) => Math.abs(s.position[0]) > 2.5));
  input.primitives[0].suppressed = plan.supports.map((s) => s.derivationKey);
  assert.equal(planWorkshopComposition({ composition: input }).shapePlans[0].supports.length, 0);
});

test('shape sessions reject duplicates, excessive shape counts, and coerced values atomically', () => {
  const input = createShapePreset('rounded-cottage');
  input.primitives = Array.from({ length: 48 }, (_, i) => ({
    ...input.primitives[0],
    id: `shape-${i}`,
  }));
  const session = new WorkshopShapeSession(input),
    before = session.composition;
  assert.throws(() => session.add({ ...input.primitives[0], id: 'extra' }), /48/);
  assert.throws(() => session.add(input.primitives[0]), /Duplicate/);
  assert.throws(() => session.update('shape-0', { height: null }), /finite/);
  assert.deepEqual(session.composition, before);
  assert.equal(session.history.canUndo, false);
  session.dispose();
});

test('resolved floors have visible tops at their published walkable elevations', () => {
  const plan = planWorkshopComposition({
    composition: createShapePreset('terraced-cottage'),
  }).shapePlans.find((p) => p.id === 'cottage');
  const mesh = new ShapeMesh();
  buildShapeFloors(plan, { trim: mesh });
  const geometry = mesh.geometry(),
    positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal');
  let topVertices = 0;
  for (let i = 0; i < positions.count; i++)
    if (normals.getY(i) > 0.9) {
      topVertices++;
      assert.ok(Math.abs(positions.getY(i) - plan.rpg.walkableFloors[0].elevation - 0.01) < 1e-6);
    }
  assert.ok(topVertices > 0);
  geometry.dispose();
});

test('custom profile footprints derive their dimensions and reject unsupported concavity', () => {
  const primitive = createShapePreset('rounded-cottage').primitives[0];
  const path = roundedFootprint('custom', 6, 4, 0.7).toJSON();
  const recipe = normalizeProceduralRecipe({
    composition: {
      primitives: [{ ...primitive, footprint: { family: 'custom', path } }],
    },
  });
  assert.equal(recipe.composition.primitives[0].footprint.width, 6);
  assert.equal(recipe.composition.primitives[0].footprint.depth, 4);
  const points = [
    [-3, -2],
    [3, -2],
    [3, 2],
    [0, 0],
    [-3, 2],
  ];
  const concave = {
    id: 'concave',
    closed: true,
    points: points.map((position, i) => ({ id: `p-${i}`, position })),
    segments: points.map((_, i) => ({
      id: `edge-${i}`,
      kind: 'line',
      startId: `p-${i}`,
      endId: `p-${(i + 1) % points.length}`,
    })),
  };
  assert.throws(
    () =>
      normalizeProceduralRecipe({
        composition: {
          primitives: [{ ...primitive, footprint: { family: 'custom', path: concave } }],
        },
      }),
    /convex/,
  );
});
