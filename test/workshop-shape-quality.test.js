import assert from 'node:assert/strict';
import test from 'node:test';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';
import { buildShapeOpenings } from '../src/editor/workshop/shapes/ShapeOpeningBuilder.js';
import { createShapeWallSurface, addWallPatch } from '../src/editor/workshop/shapes/ShapeWallSurface.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';

const meshSet = () => Object.fromEntries(['walls', 'trim', 'inserts', 'glazing', 'metal'].map(key => [key, new ShapeMesh()]));
const plan = primitive => planWorkshopComposition({ composition: { primitives: [primitive] } }).shapePlans[0];
const uvArea = (uv, i) => (uv[i + 2] - uv[i]) * (uv[i + 5] - uv[i + 1]) - (uv[i + 3] - uv[i + 1]) * (uv[i + 4] - uv[i]);

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
