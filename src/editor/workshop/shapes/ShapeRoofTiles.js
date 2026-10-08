import { shapeRandom } from './ShapeMesh.js';

/** Chamfered, overlapping tiles have real shaded edges, without separate scene objects. */
export function buildShapeRoofTiles(plan, mesh, surface, recipe, hidden) {
  const p = plan.primitive, length = plan.curve.length;
  const rows = Math.max(4, Math.ceil(p.roof.rise / 0.28));
  for (let row = 0; row < rows; row++) {
    const top = row / rows + 0.002, bottom = Math.min(1, (row + 1.12) / rows);
    const cells = Math.max(6, Math.ceil(length * (p.roof.family === 'gable' ? 1 : bottom) / 0.5));
    for (let cell = 0; cell < cells; cell++) {
      const key = `${row}:${cell}`;
      const phase = (row % 2) / 2, width = length / cells;
      const left = (cell + phase) * width + 0.012, right = (cell + phase + 0.96) * width;
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
      const value = 0.72 + shapeRandom(recipe.seed, p.id, 'roof-tiles', key) * 0.26;
      const tint = recipe.topStyle === 'terracotta' ? [value * 1.04, value, value * 0.94]
        : [value * 0.93, value, value * 1.05];
      // The host can fold a tile around a rounded gable end; each triangle retains upward winding.
      if (area > 0) points = points.toReversed();
      for (let i = 1; i < points.length - 1; i++) {
        const [a, b, c] = [points[0], points[i], points[i + 1]];
        const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        if (Math.abs(up) < 1e-8) continue;
        mesh.triangle(a, ...(up > 0 ? [b, c] : [c, b]), tint);
      }
      for (let i = 3; i < 7; i++) {
        const a = surface.point(...coordinates[i], lift + (coordinates[i][1] - top) / (bottom - top) * 0.025);
        const b = surface.point(...coordinates[i + 1], lift + (coordinates[i + 1][1] - top) / (bottom - top) * 0.025);
        const lip = [a, [a[0], a[1] - 0.024, a[2]], [b[0], b[1] - 0.024, b[2]], b];
        mesh.quad(...(area > 0 ? lip.toReversed() : lip), tint.map((v) => v * 0.64));
      }
    }
  }
}
