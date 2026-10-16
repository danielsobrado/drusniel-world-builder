import { shapeRandom } from './ShapeMesh.js';
import { planShapeRoofTiles } from './ShapeRoofLayout.js';

/** Chamfered, overlapping tiles have real shaded edges, without separate scene objects. */
export function buildShapeRoofTiles(plan, mesh, surface, recipe, hidden) {
  const p = plan.primitive;
  for (const tile of planShapeRoofTiles(plan, surface, recipe.seed)) {
      const { key, u0: left, u1: right, t0: top, t1: bottom } = tile;
      const cut = 0.045 + shapeRandom(recipe.seed, p.id, 'tile-corner', key) * 0.025;
      const du = (right - left) * cut, dt = (bottom - top) * cut;
      const coordinates = [
        [left, top + dt], [left + du, top], [right - du, top], [right, top + dt],
        [right, bottom - dt], [right - du, bottom], [left + du, bottom], [left, bottom - dt],
      ];
      const lift = 0.022 + shapeRandom(recipe.seed, p.id, 'tile-relief', key) * 0.007;
      let points = coordinates.map(([u, t]) => surface.point(u, t, lift + (t - top) / (bottom - top) * 0.025));
      const area = points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length];
        return sum + a[0] * b[2] - b[0] * a[2];
      }, 0);
      if (Math.abs(area) < 1e-8 || hidden(points)) continue;
      const value = 0.82 + shapeRandom(recipe.seed, p.id, 'roof-tiles', key) * 0.15;
      const tint = recipe.topStyle === 'terracotta' ? [value * 1.04, value, value * 0.94]
        : [value * 0.93, value, value * 1.05];
      // The host can fold a tile around a rounded gable end; each triangle retains upward winding.
      if (area > 0) points = points.toReversed();
      for (let i = 1; i < points.length - 1; i++) {
        const [a, b, c] = [points[0], points[i], points[i + 1]];
        const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        if (Math.abs(up) < 1e-8) continue;
        const triangle = [a, ...(up > 0 ? [b, c] : [c, b])];
        mesh.triangle(...triangle, tint, triangle.map((v) => surface.uvAt(v[0], v[2])), triangle.map((v) => surface.normalAt(v[0], v[2])));
      }
      for (let i = 3; i < 7; i++) {
        const a = surface.point(...coordinates[i], lift + (coordinates[i][1] - top) / (bottom - top) * 0.025);
        const b = surface.point(...coordinates[i + 1], lift + (coordinates[i + 1][1] - top) / (bottom - top) * 0.025);
        const lip = [a, [a[0], a[1] - 0.024, a[2]], [b[0], b[1] - 0.024, b[2]], b];
        mesh.quad(...(area > 0 ? lip.toReversed() : lip), tint.map((v) => v * 0.64));
      }
  }
}
