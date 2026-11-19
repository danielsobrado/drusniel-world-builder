import { ShapeUtils, Vector2 } from 'three/webgpu';
import { shapeStoneTint } from './ShapeMasonryCourses.js';
import { hasShapeRuin } from './ShapeRuin.js';

/** Floors use the same authored footprint and level elevations as gameplay products. */
export function buildShapeFloors(plan, meshes, recipe = null) {
  const mesh = meshes.deck ?? meshes.trim;
  const tint = recipe ? shapeStoneTint(recipe, plan) : [1, 1, 1];
  const topTone = tint.map((c) => c * 0.8);
  const botTone = tint.map((c) => c * 0.72);
  const ruined = hasShapeRuin(plan.primitive) && plan.ruinColumns?.length;
  const minRuinY = ruined
    ? plan.primitive.elevation + Math.min(...plan.ruinColumns.map((col) => col.height))
    : Infinity;
  for (const floor of plan.rpg.walkableFloors.filter((f) => f.primitiveId === plan.id && !f.featureId && !f.surfaceOwner)) {
    if (ruined && floor.elevation > plan.primitive.elevation + 0.05 && floor.elevation >= minRuinY - 0.1) continue;
    const outline = floor.footprint.points;
    const triangles = ShapeUtils.triangulateShape(
      outline.map(([x, z]) => new Vector2(x, z)),
      [],
    );
    for (const indices of triangles) {
      const points = indices.map((i) => [outline[i][0], floor.elevation + 0.01, outline[i][1]]);
      mesh.triangle(points[0], points[2], points[1], topTone);
      const bottom = points.map(([x, y, z]) => [x, y - 0.12, z]);
      mesh.triangle(...bottom, botTone);
    }
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        y = floor.elevation + 0.01;
      mesh.quad(
        [a[0], y, a[1]],
        [b[0], y, b[1]],
        [b[0], y - 0.12, b[1]],
        [a[0], y - 0.12, a[1]],
        topTone,
      );
    }
  }
}
