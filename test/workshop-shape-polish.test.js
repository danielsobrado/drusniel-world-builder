import assert from 'node:assert/strict';
import test from 'node:test';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { normalizeProceduralRecipe, ProceduralAssetStore } from '../src/editor/workshop/ProceduralAssetStore.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { createShapeWallSurface, addWallPatch } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { buildShapeRoofCraft } from '../src/editor/workshop/shapes/ShapeRoofCraft.js';
import { buildShapeRoofTiles } from '../src/editor/workshop/shapes/ShapeRoofTiles.js';
import { buildShapeWindowBoxes } from '../src/editor/workshop/shapes/ShapeWindowBoxes.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';

const plans = (composition) => planWorkshopComposition({ composition }).shapePlans;
const host = (composition) => plans(composition).find((p) => p.id === 'cottage');
const cross = (a, b, c) => {
  const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

test('crafted dressing is deterministic resolved intent with suppressible provenance', () => {
  const composition = createShapePreset('rounded-cottage'), before = structuredClone(composition);
  const resolved = host(composition);
  assert.ok(resolved.decorations.some((d) => d.role === 'chimney'));
  assert.ok(resolved.decorations.some((d) => d.role === 'window-box'));
  for (const d of resolved.decorations) {
    assert.equal(d.provenance.source, 'auto');
    assert.equal(d.provenance.ruleId, 'crafted-building-details');
    assert.deepEqual(d.provenance.sourceEntityIds, ['cottage']);
    assert.equal(d.provenance.derivationKey, d.derivationKey);
  }
  assert.deepEqual(host(composition).decorations, resolved.decorations);
  assert.deepEqual(composition, before);
  const chimney = resolved.decorations.find((d) => d.role === 'chimney');
  composition.primitives[0].suppressed = [chimney.derivationKey];
  assert.ok(!host(composition).decorations.some((d) => d.role === 'chimney'));
  assert.ok(host(composition).decorations.some((d) => d.role === 'window-box'));
});

test('craft toggle persists and undoes without persisting generated decoration records', () => {
  const session = new WorkshopShapeSession(createShapePreset('rounded-cottage'));
  try {
    assert.throws(() => session.update('cottage', { craft: 'yes' }), /boolean/);
    session.update('cottage', { craft: false });
    assert.equal(host(session.composition).decorations.length, 0);
    const store = new ProceduralAssetStore();
    store.add({ label: 'Plain cottage', recipe: { composition: session.composition } });
    const saved = store.toDocument().at(-1).recipe.composition.primitives[0];
    assert.equal(saved.craft, false);
    assert.equal(saved.decorations, undefined);
    session.undo();
    assert.equal(session.getPrimitive('cottage').craft, true);
    session.redo();
    assert.equal(session.getPrimitive('cottage').craft, false);
  } finally { session.dispose(); }
});

test('craft toggles rebuild roof and facade while reusing walls, ivy and other buildings', () => {
  const composition = createShapePreset('cottage-turret'), cache = new WorkshopShapeCache();
  const update = () => {
    const recipe = normalizeProceduralRecipe({ composition, ivy: true });
    const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans);
    cache.releaseRemoved(result);
    return result;
  };
  try {
    update();
    const before = cache.entries.get('cottage').domains, turret = cache.entries.get('turret');
    composition.primitives[0].craft = false;
    assert.equal(update().stats.rebuiltDomains, 2);
    const after = cache.entries.get('cottage').domains;
    for (const name of ['walls', 'ivy']) assert.equal(after.get(name), before.get(name));
    for (const name of ['roof', 'facade']) assert.notEqual(after.get(name), before.get(name));
    assert.equal(cache.entries.get('turret'), turret);
    composition.primitives[0].roof.rise += 0.5;
    update();
    assert.equal(cache.entries.get('cottage').domains.get('facade'), after.get('facade'));
  } finally { cache.clear(); }
});

test('low windows omit boxes and completely covered windows omit all box geometry', () => {
  const composition = createShapePreset('rounded-cottage');
  for (const o of composition.primitives[0].openings) if (o.role === 'window') o.bottom = 0.4;
  assert.ok(!host(composition).decorations.some((d) => d.role === 'window-box'));
  const covered = host(createShapePreset('rounded-cottage'));
  const meshes = { inserts: new ShapeMesh(), foliage: new ShapeMesh() };
  const surface = createShapeWallSurface(covered);
  surface.excluded = () => true;
  buildShapeWindowBoxes(covered, meshes, { detail: 2, seed: 1848 }, surface);
  assert.equal(meshes.inserts.positions.length, 0);
  assert.equal(meshes.foliage.positions.length, 0);
});

test('host-local face UVs remain attached when a wall moves, elevates or rotates', () => {
  for (const bevel of [false, true]) {
    const composition = createShapePreset('rounded-cottage');
    const build = () => {
      const mesh = new ShapeMesh(), surface = createShapeWallSurface(host(composition));
      addWallPatch(mesh, surface, 0.2, 0.9, 0.1, 0.6, 0.18, 0.04, [1, 1, 1],
        { bevel, back: false, start: false, end: false });
      // Front and bevel vertices precede the caps, which retain the generic UV fallback.
      return mesh.uvs.slice(0, bevel ? 36 : 12);
    };
    const before = build();
    Object.assign(composition.primitives[0], { position: [13, -17], elevation: 2.5, rotation: 77 });
    assert.deepEqual(build(), before);
  }
});

test('ridge caps and roof tile tops face upward after rotation', () => {
  for (const preset of ['rounded-cottage', 'bell-turret']) {
    const composition = createShapePreset(preset);
    composition.primitives[0].rotation = 77;
    const resolved = plans(composition)[0], surface = createShapeRoofSurface(resolved);
    let triangles = 0;
    const mesh = {
      triangle(a, b, c) { assert.ok(cross(a, b, c)[1] >= -1e-8); triangles++; },
      quad() {},
    };
    buildShapeRoofTiles(resolved, mesh, surface, { detail: 2, seed: 1848 }, () => false);
    assert.ok(triangles > 100);
    if (preset === 'rounded-cottage') {
      const roof = new ShapeMesh();
      buildShapeRoofCraft({ ...resolved, decorations: [] }, { roof }, { seed: 1848 }, surface, () => false);
      const geometry = roof.geometry();
      try {
        const normals = geometry.getAttribute('normal');
        for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0);
      } finally { geometry.dispose(); }
    }
  }
});

test('window-box flowers face the light for both footprint winding directions', () => {
  const composition = createShapePreset('rounded-cottage'), resolved = host(composition);
  for (const clockwise of [false, true]) {
    const surface = createShapeWallSurface(resolved);
    // Reverse parameter direction while retaining the host's outward offset.
    const point = surface.point;
    if (clockwise !== surface.clockwise) surface.point = (u, y, offset) => point(surface.length - u, y, offset);
    surface.clockwise = clockwise;
    surface.excluded = () => false;
    const meshes = { inserts: new ShapeMesh(), foliage: new ShapeMesh() };
    buildShapeWindowBoxes(resolved, meshes, { detail: 2, seed: 1848 }, surface);
    let flowers = 0;
    for (let i = 0; i < meshes.foliage.positions.length; i += 9) {
      if (meshes.foliage.colors[i] < 0.7) continue;
      const points = [0, 3, 6].map((j) => meshes.foliage.positions.slice(i + j, i + j + 3));
      assert.ok(cross(...points)[1] > 0);
      flowers++;
    }
    assert.ok(flowers > 20);
  }
});

test('planter front boards follow the curved host instead of spanning long chords', () => {
  const resolved = host(createShapePreset('rounded-cottage'));
  const meshes = { inserts: new ShapeMesh(), foliage: new ShapeMesh() };
  buildShapeWindowBoxes(resolved, meshes, { detail: 2, seed: 1848 }, createShapeWallSurface(resolved));
  let faces = 0;
  for (let i = 0; i < meshes.inserts.positions.length; i += 9) {
    if (meshes.inserts.colors[i] !== 0.84) continue;
    const points = [0, 3, 6].map((j) => meshes.inserts.positions.slice(i + j, i + j + 3));
    for (const a of points) for (const b of points)
      assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.18);
    faces++;
  }
  assert.ok(faces > 20);
});
