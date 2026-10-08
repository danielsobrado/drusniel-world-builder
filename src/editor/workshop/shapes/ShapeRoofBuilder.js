import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { createShapeRoofOcclusion, clipShapeRoofMesh } from './ShapeRoofOcclusion.js';
import { buildShapeRoofTiles } from './ShapeRoofTiles.js';
import { buildShapeRoofCraft } from './ShapeRoofCraft.js';
import { buildShapeRoofJunctions } from './ShapeRoofJunctionBuilder.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

export function buildShapeRoof(plan, sourceMeshes, recipe) {
  if (plan.roofReplaced) return;
  const p = plan.primitive,
    surface = createShapeRoofSurface(plan),
    length = plan.curve.length;
  const mask = createShapeRoofOcclusion(plan), hidden = mask.hidden;
  const meshes = Object.fromEntries(Object.entries(sourceMeshes).map(([slot, mesh]) => [slot, clipShapeRoofMesh(mesh, mask)]));
  const rings = p.roof.family === 'flat' ? 1 : recipe.detail >= 2 ? 20 : 10;
  const samples = plan.curve.samples.length;
  const roofQuad = (quad, color, solid = false) => {
    const area = quad.reduce((sum, a, i) => {
      const b = quad[(i + 1) % quad.length];
      return sum + a[0] * b[2] - b[0] * a[2];
    }, 0);
    if (Math.abs(area) < tolerance.length * tolerance.length) return false;
    const top = surface.wall.clockwise ? quad : quad.toReversed();
    meshes.roof.quad(...top, color, top.map((v) => surface.uvAt(v[0], v[2])), top.map((v) => surface.normalAt(v[0], v[2])));
    if (solid) {
      const underside = quad.map(([x, y, z]) => [x, y - 0.06, z]);
      if (surface.wall.clockwise) meshes.roof.quad(...underside.toReversed(), [0.65, 0.65, 0.65]);
      else meshes.roof.quad(...underside, [0.65, 0.65, 0.65]);
    }
    return true;
  };
  for (let row = 0; row < rings; row++) {
    const t0 = row / rings,
      t1 = (row + 1) / rings;
    for (let i = 0; i < samples; i++) {
      const u0 = plan.curve.samples[i].distance,
        u1 = i + 1 < samples ? plan.curve.samples[i + 1].distance : length;
      const quad = [
        surface.point(u0, t0),
        surface.point(u0, t1),
        surface.point(u1, t1),
        surface.point(u1, t0),
      ];
      roofQuad(quad, [0.94, 0.97, 1], true);
    }
  }
  // Close the wall up to the roof surface; especially visible on rounded gable ends.
  for (let i = 0; i < samples; i++) {
    const u0 = plan.curve.samples[i].distance,
      u1 = i + 1 < samples ? plan.curve.samples[i + 1].distance : length;
    const a = surface.wall.point(u0, p.height, p.thickness / 2),
      b = surface.wall.point(u1, p.height, p.thickness / 2);
    const c = [b[0], Math.max(b[1], surface.heightAt(b[0], b[2])), b[2]];
    const d = [a[0], Math.max(a[1], surface.heightAt(a[0], a[2])), a[2]];
    if (c[1] > b[1] + tolerance.length || d[1] > a[1] + tolerance.length) {
      if (surface.wall.clockwise) meshes.walls.quad(a, b, c, d, [1, 1, 1]);
      else meshes.walls.quad(d, c, b, a, [1, 1, 1]);
    }
    const edgeA = surface.point(u0, 1),
      edgeB = surface.point(u1, 1);
    meshes.trim.beam(edgeA, edgeB, 0.1, 0.12, [0.8, 0.8, 0.8]);
  }
  buildShapeRoofCraft(plan, meshes, recipe, surface, hidden);
  if (recipe.detail >= 2 && p.roof.family !== 'flat') buildShapeRoofTiles(plan, meshes.roof, surface, recipe, () => false);
  buildShapeRoofJunctions(plan, meshes.metal, surface);
}
