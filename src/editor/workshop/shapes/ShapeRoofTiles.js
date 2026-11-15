import { shapeRandom } from './ShapeMesh.js';
import { planShapeRoofTiles } from './ShapeRoofLayout.js';
import { irregularityAmount } from '../ProceduralWorkshopIrregularity.js';

/**
 * Chamfered, overlapping tiles have real shaded edges, without separate scene objects. Like
 * hand-laid tiles they are never quite in line: each course's lower edge wavers, every tile sits
 * at its own lift and twist, and with age a few slip down the slope, go missing (the deck shows),
 * or darken with moss and soot. All of it is keyed per tile, so edits elsewhere never reshuffle it.
 */
export function buildShapeRoofTiles(plan, mesh, surface, recipe, hidden) {
  const p = plan.primitive, amount = irregularityAmount(recipe, 'shingle'), age = p.age ?? 0.22;
  for (const tile of planShapeRoofTiles(plan, surface, recipe.seed, amount)) {
      const { key, u0: left, u1: right, t0: top } = tile;
      const random = (lane) => shapeRandom(recipe.seed, p.id, `tile-${lane}`, key);
      if (tile.row > 0 && random('missing') < age * 0.02 * (0.5 + amount)) continue;
      const slipped = random('slip') < age * 0.05 * (0.5 + amount);
      // Metres the lower edge moves down-slope: a slow wave along the course, per-tile scatter, slips.
      const drop = Math.sin(left * 1.7 + tile.row * 2.1) * 0.012 * amount + (random('drop') - 0.35) * 0.03 * amount
        + (slipped ? 0.05 + random('slip-depth') * 0.05 : 0);
      const bottom = Math.min(1, Math.max(top + (tile.t1 - top) * 0.6, tile.t1 + drop * (tile.t1 - top) / (tile.exposed + 0.055)));
      const cut = 0.045 + shapeRandom(recipe.seed, p.id, 'tile-corner', key) * 0.025;
      const du = (right - left) * cut, dt = (bottom - top) * cut;
      const coordinates = [
        [left, top + dt], [left + du, top], [right - du, top], [right, top + dt],
        [right, bottom - dt], [right - du, bottom], [left + du, bottom], [left, bottom - dt],
      ];
      const lift = 0.016 + shapeRandom(recipe.seed, p.id, 'tile-relief', key) * 0.02 * (0.5 + amount);
      const twist = (random('twist') - 0.5) * 0.022 * (0.3 + amount) + (slipped ? 0.012 : 0);
      const liftAt = (u, t) => lift + (t - top) / (bottom - top) * 0.025 + twist * ((u - left) / (right - left) - 0.5);
      let points = coordinates.map(([u, t]) => surface.point(u, t, liftAt(u, t)));
      const area = points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length];
        return sum + a[0] * b[2] - b[0] * a[2];
      }, 0);
      if (Math.abs(area) < 1e-8 || hidden(points)) continue;
      const value = 0.82 + shapeRandom(recipe.seed, p.id, 'roof-tiles', key) * 0.15;
      const base = recipe.topStyle === 'terracotta' ? [value * 1.04, value, value * 0.94]
        : [value * 0.93, value, value * 1.05];
      // Old roofs gather moss on some tiles and soot on others; a fresh roof stays clean.
      const weathered = random('moss') < age * 0.28 ? [0.8, 0.9, 0.72] : random('soot') < age * 0.12 ? [0.78, 0.77, 0.76] : [1, 1, 1];
      const tint = base.map((v, i) => v * weathered[i]);
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
        const a = surface.point(...coordinates[i], liftAt(...coordinates[i]));
        const b = surface.point(...coordinates[i + 1], liftAt(...coordinates[i + 1]));
        const lip = [a, [a[0], a[1] - 0.024, a[2]], [b[0], b[1] - 0.024, b[2]], b];
        mesh.quad(...(area > 0 ? lip.toReversed() : lip), tint.map((v) => v * 0.64));
      }
  }
}
