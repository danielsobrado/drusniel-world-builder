import assert from 'node:assert/strict';
import test from 'node:test';
import { planWorkshopComposition } from '../src/editor/workshop/ProceduralWorkshopComposition.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';
import { createShapeRoofSurface } from '../src/editor/workshop/shapes/ShapeRoofSurface.js';
import { createShapeRoofOcclusion } from '../src/editor/workshop/shapes/ShapeRoofOcclusion.js';
import { buildShapeRoofTiles } from '../src/editor/workshop/shapes/ShapeRoofTiles.js';
import { buildShapeRoofJunctions } from '../src/editor/workshop/shapes/ShapeRoofJunctionBuilder.js';
import { ShapeMesh } from '../src/editor/workshop/shapes/ShapeMesh.js';

const plan = (composition) => planWorkshopComposition({ composition }).shapePlans;
const vertex = (position, uv = [0, 0]) => ({ position, uv, normal: [0, 1, 0] });

test('continuous roof clipping keeps the exposed part of a triangle crossing a neighboring wall', () => {
  const composition = createShapePreset('cottage-turret'), plans = plan(composition);
  const host = plans.find((p) => p.id === 'cottage'), mask = createShapeRoofOcclusion(host);
  const triangle = [vertex([-6, 4.5, 0], [0, 0]), vertex([-3, 4.5, 0], [1, 0]), vertex([-6, 4.5, 1], [0, 1])];
  const parts = mask.clip(triangle);
  assert.ok(parts.length > 0);
  assert.ok(parts.some((t) => t.some((v) => v.position[0] > -6 && v.position[0] < -3)));
  for (const part of parts) {
    const center = [0, 1, 2].map((axis) => part.reduce((sum, v) => sum + v.position[axis] / 3, 0));
    assert.equal(mask.hidden([center]), false);
    for (const v of part) {
      assert.ok(v.position.every(Number.isFinite));
      assert.ok(v.uv.every((n) => n >= -1e-6 && n <= 1 + 1e-6));
      assert.deepEqual(v.normal, [0, 1, 0]);
    }
  }
});

test('roof clipping preserves lower roof geometry beneath a taller building overhang', () => {
  const plans = plan(createShapePreset('cottage-turret')), host = plans.find((p) => p.id === 'cottage');
  const neighbor = plans.find((p) => p.id === 'turret'), roof = createShapeRoofSurface(neighbor);
  // This lies between the tower wall and its eave, below the top of the tower wall.
  const u = neighbor.curve.length * 0.3;
  const a = roof.wall.point(u, 4.5, neighbor.primitive.thickness / 2 + 0.25);
  const b = roof.wall.point(u + 0.08, 4.5, neighbor.primitive.thickness / 2 + 0.25);
  const c = roof.wall.point(u, 4.55, neighbor.primitive.thickness / 2 + 0.3);
  const mask = createShapeRoofOcclusion(host);
  assert.equal(mask.hidden([a, b, c]), false);
  const area = ([a, b, c]) => {
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    return Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2;
  };
  const visible = mask.clip([a, b, c].map((p) => vertex(p)));
  assert.ok(Math.abs(visible.reduce((sum, part) => sum + area(part.map((v) => v.position)), 0) - area([a, b, c])) < 1e-9);
});

test('identical roofs have one deterministic owner including their tile relief', () => {
  const source = createShapePreset('rounded-cottage').primitives[0];
  const plans = plan({ primitives: [{ ...source, id: 'a' }, { ...source, id: 'b' }] });
  const triangle = [[-1, 6.07, 0], [1, 6.07, 0], [0, 6.07, 1]].map((p) => vertex(p));
  assert.equal(createShapeRoofOcclusion(plans.find((p) => p.id === 'a')).clip(triangle).length, 1);
  assert.equal(createShapeRoofOcclusion(plans.find((p) => p.id === 'b')).clip(triangle).length, 0);
});

test('curved slate tops share smooth surface normals while their physical lips remain flat', () => {
  const host = plan(createShapePreset('bell-turret'))[0], surface = createShapeRoofSurface(host);
  let tops = 0, lips = 0;
  buildShapeRoofTiles(host, {
    triangle(a, b, c, color, uv, normals) {
      for (const [i, v] of [a, b, c].entries()) {
        assert.deepEqual(normals[i], surface.normalAt(v[0], v[2]));
        assert.ok(Math.abs(Math.hypot(...normals[i]) - 1) < 1e-8);
        assert.ok(normals[i][1] > 0);
      }
      tops++;
    },
    quad(a, b, c, d, color, uv, normals) { assert.equal(normals, undefined); lips++; },
  }, surface, { seed: 1848, detail: 2 }, () => false);
  assert.ok(tops > 100 && lips > 100);
});

test('crossed roof slopes resolve deterministic valleys on their actual shared height field', () => {
  const source = createShapePreset('rounded-cottage').primitives[0];
  const composition = { primitives: [{ ...source, id: 'a' }, { ...source, id: 'b', rotation: 90 }] };
  const original = structuredClone(composition), plans = plan(composition), host = plans[0];
  const valleys = host.roofJunctions.filter((j) => j.role === 'valley');
  assert.ok(valleys.length > 10);
  const a = createShapeRoofSurface(host), b = createShapeRoofSurface(plans[1]);
  for (const junction of valleys) {
    assert.equal(junction.provenance.ruleId, 'roof-junction');
    assert.deepEqual(junction.provenance.sourceEntityIds, ['a', 'b']);
    for (const [x, y, z] of junction.points) {
      assert.ok(Math.abs(a.heightAt(x, z) - y) < 1e-8);
      assert.ok(Math.abs(b.heightAt(x, z) - y) < 1e-5);
    }
  }
  assert.deepEqual(plan(composition)[0].roofJunctions, host.roofJunctions);
  assert.deepEqual(composition, original);
  composition.primitives[0].suppressed = [valleys[0].derivationKey];
  assert.ok(!plan(composition)[0].roofJunctions.some((j) => j.id === valleys[0].id));
});

test('roof-to-wall flashing follows a tapered tower and produces finite batched geometry', () => {
  const plans = plan(createShapePreset('cottage-turret')), host = plans.find((p) => p.id === 'cottage');
  assert.ok(host.roofJunctions.some((j) => j.role === 'abutment'));
  const mesh = new ShapeMesh();
  buildShapeRoofJunctions(host, mesh, createShapeRoofSurface(host));
  assert.ok(mesh.positions.length > 60);
  assert.ok(mesh.positions.every(Number.isFinite));
  assert.ok(mesh.normals.every(Number.isFinite));
});
