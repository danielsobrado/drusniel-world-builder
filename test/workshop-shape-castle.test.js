import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { shapeCapability } from '../src/editor/workshop/shapes/ShapeRegistry.js';
import { resolveShapeChemistry } from '../src/editor/workshop/shapes/ShapeChemistry.js';
import { buildRegisteredShape } from '../src/editor/workshop/shapes/ShapeGeometryRegistry.js';
import { SHAPE_PRESETS, createShapePreset, createShapePrimitive } from '../src/editor/workshop/shapes/ShapePresets.js';
import { SHAPE_CASTLE_PRESETS } from '../src/editor/workshop/shapes/config/ShapeCastleConfig.generated.js';
import { shapeProfileOut, shapeProfileBreaks } from '../src/editor/workshop/shapes/ShapeProfile.js';
import { offsetShapePolygon, polylineTouchesShape } from '../src/editor/workshop/shapes/ShapeEnvelope.js';
import { shapeRandom } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { shapeOpeningTop } from '../src/editor/workshop/shapes/ShapeOpenings.js';
import { createShapeWallSurface } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { shapeStoneTint } from '../src/editor/workshop/shapes/ShapeMasonryCourses.js';
import { normalizeWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import {
  BUILTIN_WORKSHOP_MATERIAL_PRESETS,
  normalizeWorkshopMaterialDocument,
  serializeWorkshopMaterialDocument,
} from '../src/editor/workshop/ProceduralWorkshopMaterialConfig.js';
import {
  WORKSHOP_PBR_PRESET_LIST,
  WORKSHOP_PROCEDURAL_PRESET_LIST,
} from '../src/editor/workshop/ProceduralWorkshopPbrPresets.js';
import {
  createWorkshopProceduralPixels,
  sampleWorkshopProceduralSurface,
} from '../src/editor/workshop/ProceduralWorkshopSynthTextures.js';

const materials = new Proxy({}, { get: (_, key) => key });
const plan = (source) => { const c = shapeCapability(source.kind); return c.plan(c.normalize(source)); };
const tower = (extra = {}) => ({ id: 'tower', kind: 'curved-volume', surface: 'masonry', shutters: false, craft: false,
  height: 10.2, thickness: 0.5, footprint: { family: 'oval', width: 6, depth: 6 }, roof: { family: 'flat' }, ...extra });
const radius = (surface, y, offset) => { const v = surface.point(0, y, offset); return Math.hypot(v[0], v[2]); };

test('castle presets are plain shape data that survive a composition round trip', () => {
  assert.equal(SHAPE_CASTLE_PRESETS.length, 18);
  for (const preset of SHAPE_CASTLE_PRESETS) {
    assert.ok(SHAPE_PRESETS.some((item) => item.id === preset.id));
    const composition = normalizeWorkshopComposition(createShapePreset(preset.id));
    const again = normalizeWorkshopComposition(JSON.parse(JSON.stringify(composition)));
    assert.deepEqual(again, composition);
  }
});

test('a vertical profile moves both wall faces and splits collision at its breaks', () => {
  const p = plan(tower({ base: { style: 'batter', height: 2.04, out: 0.6 }, stages: [{ at: 6.8, out: -0.1 }] }));
  assert.equal(shapeProfileOut(p.primitive, 0), 0.6);
  assert.ok(Math.abs(shapeProfileOut(p.primitive, 1.02) - 0.3) < 1e-9);
  assert.equal(shapeProfileOut(p.primitive, 3), 0);
  assert.equal(shapeProfileOut(p.primitive, 7), -0.1);
  assert.deepEqual(shapeProfileBreaks(p.primitive).map((y) => Math.round(y * 100)), [204, 680]);
  const surface = createShapeWallSurface(p);
  assert.ok(Math.abs(radius(surface, 0, 0.25) - radius(surface, 3, 0.25) - 0.6) < 1e-6);
  assert.ok(Math.abs(radius(surface, 0, -0.25) - radius(surface, 3, -0.25) - 0.6) < 1e-6, 'the hollow interior follows the batter');
  assert.equal(p.rpg.collisionSlabs.length, 3);
  assert.equal(plan(tower()).rpg.collisionSlabs.length, 1, 'a plain shaft keeps its single shell slab');
});

test('a corbelled crown lays out whole corbels, bays and merlons around a closed tower', () => {
  const p = plan(tower({ crown: { style: 'corbelled', projection: 0.5, machicolation: 'open' } }));
  const crown = p.crown;
  assert.equal(crown.base, 10.2);
  assert.equal(crown.corbels.length, crown.bays.length);
  assert.ok(crown.corbels.length >= 20 && crown.merlons.length >= 8);
  assert.equal(crown.drops.length, crown.bays.length, 'open machicolations are recorded as real drops');
  for (const bay of crown.bays) assert.ok(bay.u1 > bay.u0);
  assert.ok(p.rpg.collisionSlabs.some((slab) => slab.id === 'tower:crown'));
  assert.ok(p.rpg.walkableFloors.some((floor) => floor.id === 'tower:crown-deck'));
  assert.equal(plan(tower({ crown: { style: 'parapet' }, roof: { family: 'cone' } })).crown, undefined, 'a flush parapet needs a flat top');
  const roofed = plan(tower({ crown: { style: 'corbelled', height: 1.4 }, roof: { family: 'cone' } })).crown;
  assert.ok(roofed.roofed && roofed.merlons.length === 0 && Math.abs(roofed.wallTop - 10.2) < 1e-9);
});

test('pointed heads and arrow slits share one opening contour', () => {
  const pointed = { profile: 'pointed', bottom: 0, width: 1, height: 2.4 };
  assert.ok(Math.abs(shapeOpeningTop(pointed, 0) - 2.4) < 1e-9);
  assert.ok(Math.abs(shapeOpeningTop(pointed, 0.5) - (2.4 - 0.866)) < 1e-9);
  assert.ok(shapeOpeningTop(pointed, 0.25) > shapeOpeningTop({ ...pointed, profile: 'arched' }, 0.25) - 0.5);
  const p = plan(tower({ openings: [{ id: 'loop', role: 'slit', profile: 'square', at: 0.5, bottom: 3, width: 0.12, height: 1.3 }] }));
  assert.equal(p.rpg.portals.length, 0, 'an arrow slit is not a traversable portal');
});

test('turrets, crowns and joined walls build finite geometry through the shared builders', () => {
  const plans = [
    plan(tower({ base: { style: 'batter', height: 2, out: 0.5 }, crown: { style: 'corbelled' },
      features: [{ id: 'turret-a', kind: 'turret', roof: 'cone', at: 0.125, width: 2, height: 4, bottom: 9.2 },
        { id: 'turret-b', kind: 'turret', roof: 'flat', at: 0.625, width: 2, height: 3, bottom: 9.2 }] })),
    plan({ id: 'wall', kind: 'curved-wall', position: [7, 0], length: 9, bend: 0, height: 5.1, thickness: 1, crown: { style: 'parapet' } }),
  ];
  const { plans: resolved, contacts } = resolveShapeChemistry(plans);
  assert.ok(contacts.some((contact) => contact.ruleId === 'wall-tower-join'));
  const host = resolved[0], turrets = host.features.filter((f) => f.turret);
  assert.equal(turrets.length, 2);
  assert.ok(turrets[0].child.primitive.roof.family === 'cone' && turrets[1].child.crown, 'an open turret carries its own battlement');
  for (const detail of [2, 1]) for (const shape of resolved) {
    const parts = buildRegisteredShape(shape, materials, { seed: 11, detail, ivy: false });
    assert.ok(parts.length > 0);
    for (const part of parts) {
      assert.ok(part.geometry.attributes.position.array.every(Number.isFinite), `${shape.id} ${part.materialRegion.id}`);
      part.geometry.dispose();
    }
  }
});

test('polygon offsets keep a true perpendicular distance at square corners', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  for (const points of [square, [...square].reverse()]) {
    const out = offsetShapePolygon(points, 1);
    for (const [x, z] of out) assert.ok(Math.abs(Math.abs(x - 1) - 2) < 1e-9 && Math.abs(Math.abs(z - 1) - 2) < 1e-9, `corner ${x},${z}`);
    const inset = offsetShapePolygon(points, -0.5);
    for (const [x, z] of inset) assert.ok(Math.abs(Math.abs(x - 1) - 0.5) < 1e-9 && Math.abs(Math.abs(z - 1) - 0.5) < 1e-9);
  }
  const spike = offsetShapePolygon([[0, 0], [10, 0.2], [0, 0.4]], 0.1);
  assert.ok(Math.hypot(spike[1][0] - 10, spike[1][1] - 0.2) <= 0.4 + 1e-9, 'a needle tip is clamped at the miter limit');
});

test('a wall crossing a tower with no vertex inside it still joins', () => {
  const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.ok(polylineTouchesShape([[-5, 0], [5, 0]], square), 'a segment straight through the footprint');
  assert.ok(!polylineTouchesShape([[-5, 3], [5, 3]], square));
  assert.ok(!polylineTouchesShape([[2, -1], [5, -1]], square), 'collinear with an edge but past its end');
  const plans = [plan(tower()), plan({ id: 'wall', kind: 'curved-wall', path: { id: 'wall-path', closed: false,
    points: [{ id: 'a', position: [-12, 0] }, { id: 'b', position: [12, 0] }],
    segments: [{ id: 's0', kind: 'line', startId: 'a', endId: 'b' }] }, height: 5, thickness: 1 })];
  const { contacts } = resolveShapeChemistry(plans);
  assert.ok(contacts.some((c) => c.ruleId === 'wall-tower-join'), 'a straight wall through the tower joins it');
});

test('battlement collision carries the same voids the masonry leaves', () => {
  const slab = (p) => p.rpg.collisionSlabs.find((s) => s.id === `${p.primitive.id}:crown`);
  const solidAt = (crown, u) => crown.merlons.some((m) => u > m.u0 && u < m.u1);
  const p = plan(tower({ crown: { style: 'parapet' } })), crown = p.crown, length = p.curve.length;
  const gaps = slab(p).gaps;
  assert.equal(gaps.length, crown.merlons.length, 'one embrasure between each pair of merlons around a closed ring');
  for (const g of gaps) {
    assert.ok(!solidAt(crown, g.at * length), 'an embrasure never sits on a merlon');
    assert.ok(Math.abs(g.bottom - (crown.wallTop)) < 1e-9 && g.height > 0);
  }
  const pierced = plan(tower({ crown: { style: 'parapet', merlons: 'pierced' } }));
  assert.equal(slab(pierced).gaps.filter((g) => g.id.endsWith(':loop')).length, pierced.crown.merlons.length);
  const ruined = plan(tower({ crown: { style: 'parapet', ruin: 0.9 } }));
  const broken = ruined.crown.merlons.filter((m) => m.ruined);
  assert.ok(broken.length > 0 && broken.length < ruined.crown.merlons.length, 'ruin varies merlon by merlon');
  assert.equal(slab(ruined).gaps.filter((g) => g.id.endsWith(':ruin')).length, broken.length, 'a broken merlon leaves air above it');
  const walls = resolveShapeChemistry([plan({ id: 'wall', kind: 'curved-wall', length: 9, bend: 0, height: 5, thickness: 1,
    crown: { style: 'parapet' } })]).plans;
  assert.ok(slab(walls[0]).gaps.length > 0, 'path-gate resolution keeps the embrasures');
});

test('shape randomness spreads keys that differ only in a trailing index', () => {
  const values = Array.from({ length: 64 }, (_, i) => shapeRandom(0, 'tower', 'crown-ruin', i));
  assert.ok(Math.max(...values) - Math.min(...values) > 0.8);
  assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) / values.length - 0.5) < 0.12);
});

test('polygonal tower footprints support flexible side counts, mitered corners, and tall heights', () => {
  for (const sides of [4, 6, 8, 16, 24, 48]) {
    const p = plan(tower({
      height: sides === 8 ? 28 : 11,
      levels: sides === 8 ? 8 : 3,
      footprint: { family: 'polygon', width: 6, depth: 6, sides, cornerRadius: 0 },
      base: { style: 'molded', height: 1.0, out: 0.3 },
      crown: { style: 'corbelled', projection: 0.45, arcade: 'round' },
    }));
    assert.equal(p.primitive.footprint.sides, sides);
    const surface = createShapeWallSurface(p);
    assert.equal(surface.corners.length, sides, `${sides}-gon exposes all sharp corner stations`);
    if (sides === 4) {
      // Exact mitered 90° outer corner: offset 0.5m shifts both X and Z by 0.5m.
      const c = surface.point(0, 5, 0.5);
      assert.ok(Math.abs(Math.abs(c[0]) - 3.5) < 1e-4 && Math.abs(Math.abs(c[2]) - 3.5) < 1e-4, `mitered corner ${c}`);
    }
    const [resolved] = resolveShapeChemistry([p]).plans;
    for (const detail of [1, 2, 3]) {
      const parts = buildRegisteredShape(resolved, materials, { seed: 7, detail, ivy: false });
      assert.ok(parts.length > 0);
      for (const part of parts) {
        assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));
        part.geometry.dispose();
      }
    }
  }
  const quickTower = createShapePrimitive('tower', 'tower-1');
  assert.equal(quickTower.footprint.family, 'polygon');
  assert.equal(quickTower.footprint.sides, 8);
});

test('stepped-masonry wall ruin breaches walls, crowns, and collision deterministically', () => {
  const p = plan(tower({
    footprint: { family: 'polygon', width: 5.6, depth: 5.6, sides: 4, cornerRadius: 0 },
    crown: { style: 'corbelled', projection: 0.42 },
    ruin: { amount: 0.72, at: 0.625, width: 0.48 },
  }));
  assert.ok(p.ruinColumns.some((col) => col.breached));
  assert.ok(p.ruinColumns.some((col) => !col.breached));
  const shell = p.rpg.collisionSlabs.find((s) => s.id === 'tower:shell');
  assert.ok(shell.gaps.some((g) => g.role === 'breach'), 'ruin breach publishes collision gaps');
  assert.ok(!p.rpg.walkableFloors.some((f) => f.id === 'tower:crown-deck'), 'heavily ruined tower opens its top deck');
  const [resolved] = resolveShapeChemistry([p]).plans;
  const parts = buildRegisteredShape(resolved, materials, { seed: 19, detail: 2, ivy: false });
  assert.ok(parts.length > 0);
  for (const part of parts) {
    assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));
    part.geometry.dispose();
  }
});

test('full-PBR workshop presets map to real texture files and round-trip cleanly', () => {
  assert.ok(WORKSHOP_PBR_PRESET_LIST.length >= 18);
  const publicRoot = path.resolve('public/assets/textures');
  for (const preset of WORKSHOP_PBR_PRESET_LIST) {
    assert.ok(BUILTIN_WORKSHOP_MATERIAL_PRESETS[preset.id]);
    const { folder, set, maps } = preset.pbrAsset;
    const suffixes = maps === 'arm' ? ['color', 'normal', 'arm'] : ['color', 'normal', 'rough'];
    for (const suffix of suffixes) {
      const file = path.join(publicRoot, folder, `${set}-${suffix}.webp`);
      assert.ok(fs.existsSync(file), `Missing PBR texture file ${file}`);
    }
  }
  const doc = normalizeWorkshopMaterialDocument({
    materialAreaOverrides: { 'tower:trim': 'pbr-dressed-stone', 'tower:walls': 'pbr-brick-castle' },
    materialLibrary: {
      presets: {
        'custom-basalt': {
          ...BUILTIN_WORKSHOP_MATERIAL_PRESETS['pbr-basalt'],
          id: 'custom-basalt',
          label: 'Custom Basalt',
          repeat: 2.2,
        },
      },
    },
    materialDefaults: { stone: 'custom-basalt' },
  });
  const roundTrip = normalizeWorkshopMaterialDocument(serializeWorkshopMaterialDocument(doc));
  assert.deepEqual(roundTrip, doc);
  assert.deepEqual(roundTrip.materialLibrary.presets['custom-basalt'].pbrAsset, BUILTIN_WORKSHOP_MATERIAL_PRESETS['pbr-basalt'].pbrAsset);
  const p = plan(tower({ stonework: 'ashlar' }));
  assert.deepEqual(shapeStoneTint({ style: 'limestone', materialAreaOverrides: { 'tower:trim': 'pbr-brick-castle' } }, p), [1, 1, 1]);
});

test('royal fortress gates build sculpted arches, heraldic crests, double doors, and stay within real-time polygon budgets', () => {
  const gateIds = [
    'royal-barbican-gate',
    'heraldic-gable-gate',
    'twin-spire-curtain-gate',
    'closed-fortress-portal-gate',
    'asymmetric-bastion-gate',
    'citadel-pavilion-gate',
  ];
  for (const id of gateIds) {
    const comp = normalizeWorkshopComposition(createShapePreset(id));
    const plans = comp.primitives.map((src) => plan(src));
    const { plans: resolved } = resolveShapeChemistry(plans);
    let totalTriangles = 0;
    let hasInserts = false;
    for (const shape of resolved) {
      const parts = buildRegisteredShape(shape, materials, { seed: 23, detail: 2, ivy: false });
      assert.ok(parts.length > 0, `${id}:${shape.id} builds parts`);
      for (const part of parts) {
        assert.ok(part.geometry.attributes.position.array.every(Number.isFinite), `${id}:${shape.id} finite vertices`);
        const index = part.geometry.getIndex();
        totalTriangles += index ? index.count / 3 : part.geometry.attributes.position.count / 3;
        if (part.materialRegion.id.endsWith(':inserts')) hasInserts = true;
        part.geometry.dispose();
      }
    }
    // Reasonable real-time game budget: rich irregular masonry yet well under 180k tris per full multi-tower gatehouse.
    assert.ok(totalTriangles > 1500 && totalTriangles < 180_000, `${id} triangle budget: ${totalTriangles}`);
    if (id === 'closed-fortress-portal-gate') {
      assert.ok(hasInserts, 'closed fortress portal gate builds heavy double-leaf wooden doors');
    }
  }
  const quickGate = createShapePrimitive('gate', 'gate-1');
  assert.equal(quickGate.kind, 'curved-wall');
  assert.equal(quickGate.stonework, 'weathered-ashlar');
  assert.ok(quickGate.openings[0].width >= 3);
});

test('irregular stonework modes and heraldic crests resolve and build cleanly', () => {
  for (const stonework of ['weathered-ashlar', 'rubble']) {
    const p = plan(tower({
      stonework,
      beltCourses: true,
      footprint: { family: 'polygon', width: 5, depth: 3.4, sides: 4, cornerRadius: 0 },
      roof: { family: 'gable', axis: 'depth', rise: 2.5, overhang: 0.25 },
      features: [{ id: 'crest-1', kind: 'crest', at: 0.625, width: 1.4, depth: 0.26, height: 1.8, bottom: 8.6 }],
    }));
    const [resolved] = resolveShapeChemistry([p]).plans;
    assert.ok(resolved.features.some((f) => f.crest), `${stonework} resolves heraldic crest`);
    const parts = buildRegisteredShape(resolved, materials, { seed: 31, detail: 2, ivy: false });
    assert.ok(parts.length > 0);
    for (const part of parts) {
      assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));
      part.geometry.dispose();
    }
  }
});

test('synthesized procedural PBR presets are periodic, produce valid RGBA maps, and round-trip in material config', () => {
  assert.ok(WORKSHOP_PROCEDURAL_PRESET_LIST.length >= 14);
  for (const kind of ['weatheredAshlar', 'mossyFortress', 'chiseledLimestone', 'slateShingle']) {
    // Exact periodicity across UV tile boundaries guarantees seamless wrapping.
    const a = sampleWorkshopProceduralSurface(kind, 0.23, 0.41);
    const b = sampleWorkshopProceduralSurface(kind, 1.23, 2.41);
    for (let i = 0; i < 5; i += 1) {
      assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `${kind} sample channel ${i} wraps seamlessly`);
    }
    const pixels = createWorkshopProceduralPixels(kind, { size: 32 });
    assert.equal(pixels.color.length, 32 * 32 * 4);
    assert.equal(pixels.normal.length, 32 * 32 * 4);
    assert.equal(pixels.roughness.length, 32 * 32 * 4);
  }
  const doc = normalizeWorkshopMaterialDocument({
    materialAreaOverrides: { 'gate-wall:trim': 'proc-weathered-ashlar', 'gate-wall:roof': 'proc-slate-shingle' },
    materialLibrary: {
      presets: {
        'custom-mossy': {
          ...BUILTIN_WORKSHOP_MATERIAL_PRESETS['proc-mossy-fortress'],
          id: 'custom-mossy',
          label: 'Custom Mossy Stone',
          repeat: 1.9,
        },
      },
    },
    materialDefaults: { stone: 'custom-mossy' },
  });
  const roundTrip = normalizeWorkshopMaterialDocument(serializeWorkshopMaterialDocument(doc));
  assert.deepEqual(roundTrip, doc);
  assert.equal(roundTrip.materialLibrary.presets['custom-mossy'].proceduralKind, 'mossyFortress');
  const p = plan(tower({ stonework: 'weathered-ashlar' }));
  assert.deepEqual(
    shapeStoneTint({ style: 'limestone', materialAreaOverrides: { 'tower:trim': 'proc-weathered-ashlar' } }, p),
    [1, 1, 1],
  );
});
