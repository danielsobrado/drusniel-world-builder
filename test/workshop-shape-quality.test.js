import assert from 'node:assert/strict';
import test from 'node:test';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { buildShapeOpenings } from '../src/editor/workshop/shapes/ShapeOpeningBuilder.js';
import { createShapeWallSurface, addWallPatch } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { planShapeRoofTiles } from '../src/editor/workshop/shapes/ShapeRoofLayout.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { planShapeIvy } from '../src/editor/workshop/shapes/ShapeIvyLayout.js';
import { buildShapeWalls } from '../src/editor/workshop/shapes/ShapeWallBuilder.js';
import { pointInShape } from '../src/editor/workshop/shapes/ShapeEnvelope.js';
import { WorkshopShapeCache } from '../src/editor/workshop/shapes/WorkshopShapeCache.js';
import { normalizeProceduralRecipe } from '../src/editor/workshop/ProceduralAssetStore.js';
import { addShapePolygonSurface } from '../src/editor/workshop/shapes/ShapePolygonSurface.js';
import { createShapeCurveSampler } from '../src/editor/workshop/shapes/ShapeCurveSampler.js';
import { curvePathMetrics } from '../src/editor/workshop/curves/CurveSampling.js';
import { curveSegmentPointAtLength } from '../src/editor/workshop/curves/CurveSegment.js';
import { buildShapeProfileRail } from '../src/editor/workshop/shapes/ShapeProfileRail.js';
import { resolveVolumePath } from '../src/editor/workshop/shapes/ShapeVolume.js';

const meshSet = () => Object.fromEntries(['walls', 'trim', 'inserts', 'glazing', 'metal', 'deck', 'foliage'].map(key => [key, new ShapeMesh()]));
const plan = primitive => planWorkshopComposition({ composition: { primitives: [primitive] } }).shapePlans[0];
const uvArea = (uv, i) => (uv[i + 2] - uv[i]) * (uv[i + 5] - uv[i + 1]) - (uv[i + 3] - uv[i + 1]) * (uv[i + 4] - uv[i]);

test('compiled workshop sampling matches the curve kernel through rounded and oval segments', () => {
  for (const id of ['rounded-cottage', 'courtyard-pavilion']) {
    const host = plan(createShapePreset(id).primitives[0]), path = resolveVolumePath(host.primitive);
    const sampler = createShapeCurveSampler(path), metrics = curvePathMetrics(path);
    for (const metric of metrics.segments) for (let i = 0; i <= 40; i++) {
      const d = metric.length * i / 40;
      const expected = curveSegmentPointAtLength(metrics.path.getSegment(metric.id), d);
      const actual = sampler.segmentPoint(metric.id, d);
      assert.ok(Math.hypot(...actual.point.map((v,k) => v - expected.point[k])) < 1e-10);
      assert.ok(Math.hypot(...actual.tangent.map((v,k) => v - expected.tangent[k])) < 1e-10);
    }
  }
});

test('a closed swept eave has no open seam or overlapping end caps', () => {
  const mesh = new ShapeMesh();
  buildShapeProfileRail(mesh, t => [Math.cos(t * Math.PI * 2) * 3, 2, Math.sin(t * Math.PI * 2) * 2], 16,
    0.1, 0.12, 2, [1,1,1], { closed: true, step: 0.32 });
  const edges = new Map(), key = p => p.map(v => Math.round(v * 1e6)).join(':');
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const t = [0,3,6].map(k => mesh.positions.slice(i+k,i+k+3));
    for (let j = 0; j < 3; j++) { const id = [key(t[j]), key(t[(j+1)%3])].sort().join('|'); edges.set(id,(edges.get(id)??0)+1); }
  }
  assert.ok([...edges.values()].every(n => n === 2));
});

test('curved window crossbar faces remain in front of the actual glass at every point', () => {
  for (const rotation of [0, 71]) for (const taper of [1, 0.78]) {
    const p = createShapePreset('timber-cottage').primitives[0];
    Object.assign(p, { rotation, taper, position: [3.25, -2.6] });
    p.openings = [{ id: 'test-window', at: 0.49, role: 'window', bottom: 1, width: 0.8, height: 1.2 }];
    const host = plan(p), surface = createShapeWallSurface(host), meshes = meshSet(), o = host.openings[0];
    buildShapeOpenings(host, meshes, { detail: 1, seed: 1848 }, surface);
    const y = host.primitive.elevation + o.bottom + o.height / 2;
    let checked = 0;
    for (let i = 0; i < meshes.inserts.positions.length; i += 9) {
      const triangle = [0, 3, 6].map(k => meshes.inserts.positions.slice(i + k, i + k + 3));
      if (!triangle.every(v => Math.abs(v[1] - y) < 0.04)) continue;
      const center = [0, 1, 2].map(k => triangle.reduce((sum, v) => sum + v[k] / 3, 0));
      let best;
      for (let j = 0; j <= 160; j++) {
        const u = o.at * surface.length - o.width / 2 + o.width * j / 160;
        const at = surface.point(u, center[1] - host.primitive.elevation);
        const distance = Math.hypot(at[0] - center[0], at[2] - center[2]);
        if (!best || distance < best.distance) best = { u, at, distance };
      }
      const out = surface.point(best.u, center[1] - host.primitive.elevation, 1).map((v, k) => v - best.at[k]);
      const clearance = out.reduce((sum, v, k) => sum + v * (center[k] - best.at[k]), 0);
      assert.ok(clearance > 0.005, `Crossbar behind glass: ${clearance}, rotation ${rotation}, taper ${taper}`);
      checked++;
    }
    assert.ok(checked > 0);
  }
});

test('slate course exposure uses slope distance across wide shallow and narrow steep roofs', () => {
  for (const family of ['gable', 'hip', 'bell']) for (const rise of [0.5, 4.8]) {
    const p = createShapePreset('rounded-cottage').primitives[0]; p.roof.family = family; p.roof.rise = rise;
    const host = plan(p), tiles = planShapeRoofTiles(host, createShapeRoofSurface(host), 1848);
    assert.ok(tiles.length > 20);
    assert.ok(tiles.every(t => t.exposed > 0 && t.exposed <= 0.34 + 1e-8 && t.width > 0.1 && t.width < 0.7));
    assert.ok(tiles.every(t => t.t0 < t.t1 && t.u0 < t.u1));
    const moved = plan({ ...p, position: [3.25, -2.6], rotation: 71 });
    const again = planShapeRoofTiles(moved, createShapeRoofSurface(moved), 1848);
    assert.deepEqual(tiles.map(t => t.key), again.map(t => t.key));
    for (let i = 0; i < tiles.length; i++) assert.ok(Math.abs(tiles[i].t0 - again[i].t0) < 1e-6);
  }
});

test('ivy density retains existing growth keys and positions while unrelated walls stay cached', () => {
  const p = createShapePreset('rounded-cottage').primitives[0], host = plan({ ...p, ivyDensity: 0.4 });
  const a = planShapeIvy(host, 1848), b = planShapeIvy(plan({ ...p, ivyDensity: 0.9 }), 1848);
  const byKey = new Map(b.leaves.map(leaf => [leaf.key, leaf]));
  assert.ok(a.leaves.length > 0 && b.leaves.length > a.leaves.length);
  for (const leaf of a.leaves) assert.deepEqual(leaf, byKey.get(leaf.key));
  const recipe = structuredClone(normalizeProceduralRecipe({ detail: 2, ivy: true, composition: { primitives: [{ ...p, ivyDensity: 0.4 }] } }));
  const cache = new WorkshopShapeCache();
  try {
    cache.update(recipe, planWorkshopComposition(recipe).shapePlans); const before = cache.entries.get(p.id);
    recipe.composition.primitives[0].ivyDensity = 0.9;
    const result = cache.update(recipe, planWorkshopComposition(recipe).shapePlans), after = cache.entries.get(p.id);
    for (const domain of ['walls', 'roof', 'ground', 'facade']) assert.equal(before.domains.get(domain), after.domains.get(domain));
    assert.notEqual(before.domains.get('ivy'), after.domains.get('ivy')); cache.releaseRemoved(result);
  } finally { cache.clear(); }
});

test('entrance paving gives a connected ground-level path its full width without overlapping it', () => {
  const p = createShapePreset('rounded-cottage').primitives[0]; p.openings = [p.openings[0]];
  const paving = plan(p).ground.paving[0], [a,b,,d] = paving.points;
  const direction = [d[0]-a[0], d[2]-a[2]], length = Math.hypot(...direction);
  const start = [(a[0]+b[0])/2 + direction[0]*0.2, (a[2]+b[2])/2 + direction[1]*0.2];
  const path = { id: 'access', kind: 'traversal', style: { from: p.id }, rise: 0, elevation: 0.04,
    position: start.map((v,k) => v + direction[k]/length*2), rotation: Math.atan2(direction[1],direction[0])*180/Math.PI,
    length: 4, width: 1.2, mode: 'walkway', support: 'none' };
  const host = planWorkshopComposition({ composition: { primitives: [p,path] } }).shapePlans.find(v => v.id === p.id);
  const resolved = host.ground.paving[0]; assert.deepEqual(resolved.connectedTo, ['access']);
  const area = polygon => Math.abs(polygon.reduce((sum,v,i) => { const b = polygon[(i+1)%polygon.length]; return sum + v[0]*b[1]-b[0]*v[1]; },0))/2;
  const remaining = resolved.polygons.reduce((sum,polygon) => sum + area(polygon[0]),0);
  assert.ok(remaining < area(paving.points.map(([x,,z])=>[x,z])) - 0.5);
  assert.equal(p.ground, undefined, 'Access clipping stays derived.');
});

test('interior treatments have suppressible provenance, own one floor, and respect concave rooms', () => {
  const p = createShapePreset('courtyard-pavilion').primitives[0];
  const points = [[-3,-3],[3,-3],[3,-1],[-1,-1],[-1,3],[-3,3]];
  p.interior = 'paving'; p.openings = [];
  const host = plan(p), meshes = meshSet(); buildShapeWalls(host, meshes, { detail: 2, seed: 1848 });
  assert.ok(host.interior.paving.provenance.ruleId === 'interior-treatment');
  assert.ok(host.rpg.walkableFloors[0].surfaceOwner === host.interior.paving.id);
  for (let i = 0; i < meshes.deck.positions.length; i += 9) {
    const triangle = meshes.deck.positions.slice(i, i + 9);
    assert.ok(pointInShape([(triangle[0]+triangle[3]+triangle[6])/3, (triangle[2]+triangle[5]+triangle[8])/3], host.interior.room));
  }
  assert.equal(plan({ ...p, interior: 'none' }).interior.paving, null);
  assert.equal(plan({ ...p, suppressed: [host.interior.paving.id] }).interior.paving, null);
  // Canonical profile roofs reject concave outlines; the shared floor seam must still handle them safely.
  const concave = new ShapeMesh(); addShapePolygonSurface(concave, [points], 0.05, [1,1,1]);
  let area = 0;
  for (let i = 0; i < concave.positions.length; i += 9) {
    const t = concave.positions.slice(i, i+9);
    assert.ok(pointInShape([(t[0]+t[3]+t[6])/3,(t[2]+t[5]+t[8])/3], points));
    area += Math.abs((t[3]-t[0])*(t[8]-t[2])-(t[5]-t[2])*(t[6]-t[0]))/2;
  }
  assert.ok(Math.abs(area - 20) < 1e-8);
});

test('beam texture coordinates follow its physical length and stay attached through rigid movement', () => {
  const a = new ShapeMesh(), b = new ShapeMesh();
  a.beam([0, 0, 0], [0, 2, 0], 0.1, 0.2);
  b.beam([3.25, 1.4, -2.6], [5.25, 1.4, -2.6], 0.1, 0.2);
  assert.deepEqual(a.uvs, b.uvs);
  assert.ok(a.uvs.some(v => Math.abs(v - 2) < 1e-6), 'Long grain uses metres along the beam.');
  for (let i = 0; i < a.uvs.length; i += 6) assert.ok(Math.abs(uvArea(a.uvs, i)) > 1e-8);
});

test('wall returns and bevels retain nondegenerate attached UVs on a rotated host', () => {
  const p = createShapePreset('rounded-cottage').primitives[0], a = new ShapeMesh(), b = new ShapeMesh();
  for (const [mesh, rotation, position] of [[a, 0, [0, 0]], [b, 71, [3.25, -2.6]]]) {
    const host = plan({ ...p, rotation, position });
    addWallPatch(mesh, createShapeWallSurface(host), 1, 1.7, 0.6, 1.4, 0.2, 0.14, [1, 1, 1], { bevel: true });
  }
  assert.deepEqual(a.uvs, b.uvs);
  for (let i = 0; i < a.uvs.length; i += 6) assert.ok(Math.abs(uvArea(a.uvs, i)) > 1e-8);
});
