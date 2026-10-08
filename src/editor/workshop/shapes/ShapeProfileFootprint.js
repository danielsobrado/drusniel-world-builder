import { assertSimpleFootprint } from '../topology/FootprintTopology.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { sampleShapePath } from './ShapePaths.js';
import { pointInShape } from './ShapeEnvelope.js';

/** Profile roofs require a convex footprint around the authored local origin. */
export function profileFootprintDimensions(path) {
  assertSimpleFootprint(path);
  const points = sampleShapePath(path).samples.map((sample) => sample.point);
  const orientation = Math.sign(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0),
  );
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      c = points[(i + 2) % points.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross * orientation < -tolerance.intersection)
      throw new Error('Profile roof footprints must be convex.');
  }
  if (!pointInShape([0, 0], points))
    throw new Error('Profile roof footprints must enclose their local origin.');
  return {
    width: 2 * Math.max(...points.map((p) => Math.abs(p[0]))),
    depth: 2 * Math.max(...points.map((p) => Math.abs(p[1]))),
  };
}
