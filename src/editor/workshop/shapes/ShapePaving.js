import polygonClipping from 'polygon-clipping';
import { shapeRandom } from './ShapeMesh.js';
import { addShapePolygonSurface } from './ShapePolygonSurface.js';

/** Entrance stones share a continuous bedding and are cropped to resolved access surfaces. */
export function buildShapePaving(paving, mesh, recipe, primitive) {
  const polygons = paving.polygons ?? [[paving.points.map(([x, , z]) => [x, z])]];
  const base = primitive.elevation;
  for (const polygon of polygons) addShapePolygonSurface(mesh, polygon, base + 0.022, recipe.detail < 2 ? [0.78, 0.77, 0.72] : [0.42, 0.42, 0.38], primitive);
  if (recipe.detail < 2) return;
  const [a, b, , d] = paving.points;
  const width = Math.hypot(b[0] - a[0], b[2] - a[2]), depth = Math.hypot(d[0] - a[0], d[2] - a[2]);
  const across = Math.max(2, Math.ceil(width / 0.46)), rows = Math.max(1, Math.ceil(depth / 0.4));
  const point = (u, v) => [a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, a[2] + (b[2] - a[2]) * u + (d[2] - a[2]) * v];
  for (let row = 0; row < rows; row++) for (let col = -1; col < across; col++) {
    const key = `${paving.id}:${row}:${col}`, shift = (row % 2) * 0.5;
    const u0 = (col + shift) / across + 0.012 / width, u1 = (col + shift + 1) / across - 0.012 / width;
    const v0 = row / rows + 0.012 / depth, v1 = (row + 1) / rows - 0.012 / depth;
    const stone = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
    const clipped = polygonClipping.intersection([stone], polygons);
    const random = shapeRandom(recipe.seed, primitive.id, 'entrance-stone', key);
    const tone = 0.75 + random * 0.13, y = base + 0.035 + primitive.age * random * 0.007;
    for (const polygon of clipped) addShapePolygonSurface(mesh, polygon, y, [tone, tone, tone * 0.95], primitive);
  }
}
