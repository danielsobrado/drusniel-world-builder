import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { pointInShape } from './ShapeEnvelope.js';
import { shapeRandom } from './ShapeMesh.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

export function buildShapeRoof(plan, meshes, recipe) {
  const p = plan.primitive,
    surface = createShapeRoofSurface(plan),
    length = plan.curve.length;
  const neighbors = (plan.neighbors ?? []).map((n) => ({
    ...n,
    roof: createShapeRoofSurface(n),
  }));
  function hidden(points) {
    const point = points.reduce((sum, v) => sum.map((n, i) => n + v[i] / points.length), [0, 0, 0]);
    return neighbors.some(
      (n) =>
        pointInShape([point[0], point[2]], n.topBoundary) &&
        n.roof.heightAt(point[0], point[2]) > point[1] + 0.01,
    );
  }
  const rings = p.roof.family === 'flat' ? 1 : recipe.detail >= 2 ? 20 : 10;
  const samples = plan.curve.samples.length;
  const roofQuad = (quad, color, solid = false) => {
    const area = quad.reduce((sum, a, i) => {
      const b = quad[(i + 1) % quad.length];
      return sum + a[0] * b[2] - b[0] * a[2];
    }, 0);
    if (Math.abs(area) < tolerance.length * tolerance.length) return false;
    if (surface.wall.clockwise) meshes.roof.quad(...quad, color);
    else meshes.roof.quad(...quad.toReversed(), color);
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
      if (!hidden(quad)) roofQuad(quad, [0.94, 0.97, 1], true);
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
    if ((c[1] > b[1] + tolerance.length || d[1] > a[1] + tolerance.length) && !hidden([a, b, c, d])) {
      if (surface.wall.clockwise) meshes.walls.quad(a, b, c, d, [1, 1, 1]);
      else meshes.walls.quad(d, c, b, a, [1, 1, 1]);
    }
    const edgeA = surface.point(u0, 1),
      edgeB = surface.point(u1, 1);
    if (!hidden([edgeA, edgeB])) meshes.trim.beam(edgeA, edgeB, 0.1, 0.12, [0.8, 0.8, 0.8]);
  }
  if (recipe.detail < 2 || p.roof.family === 'flat') return;
  const rows = Math.max(4, Math.ceil(p.roof.rise / 0.28));
  for (let row = 0; row < rows; row++) {
    const t0 = row / rows,
      t1 = Math.min(1, (row + 1.12) / rows);
    const cells = Math.max(6, Math.ceil((length * (p.roof.family === 'gable' ? 1 : t1)) / 0.5));
    for (let cell = 0; cell < cells; cell++) {
      const phase = (row % 2) / 2;
      const u0 = ((cell + phase) * length) / cells + 0.015;
      const u1 = ((cell + phase + 0.95) * length) / cells;
      const quad = [
        surface.point(u0, t0, 0.028),
        surface.point(u0, t1, 0.05),
        surface.point(u1, t1, 0.05),
        surface.point(u1, t0, 0.028),
      ];
      if (hidden(quad)) continue;
      const v = 0.78 + shapeRandom(recipe.seed, plan.id, 'roof-tiles', `${row}:${cell}`) * 0.22;
      if (!roofQuad(quad, [v, v, v])) continue;
      const a = quad[1],
        b = quad[2];
      meshes.roof.quad(a, [a[0], a[1] - 0.035, a[2]], [b[0], b[1] - 0.035, b[2]], b, [
        v * 0.8,
        v * 0.8,
        v * 0.8,
      ]);
    }
  }
}
