import { ShapeUtils, Vector2 } from 'three/webgpu';

/** Floors use the same authored footprint and level elevations as gameplay products. */
export function buildShapeFloors(plan, meshes) {
  for (const floor of plan.rpg.walkableFloors) {
    const outline = floor.footprint.points;
    const triangles = ShapeUtils.triangulateShape(
      outline.map(([x, z]) => new Vector2(x, z)),
      [],
    );
    for (const indices of triangles) {
      const points = indices.map((i) => [outline[i][0], floor.elevation + 0.01, outline[i][1]]);
      meshes.trim.triangle(points[0], points[2], points[1], [0.8, 0.8, 0.8]);
      const bottom = points.map(([x, y, z]) => [x, y - 0.12, z]);
      meshes.trim.triangle(...bottom, [0.75, 0.75, 0.75]);
    }
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        y = floor.elevation + 0.01;
      meshes.trim.quad(
        [a[0], y, a[1]],
        [b[0], y, b[1]],
        [b[0], y - 0.12, b[1]],
        [a[0], y - 0.12, a[1]],
        [0.8, 0.8, 0.8],
      );
    }
  }
}
