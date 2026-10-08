import { curvePathMetrics } from '../curves/CurveSampling.js';
import { curveSegmentPointAtLength } from '../curves/CurveSegment.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance, clamp01 } from '../curves/GeometryTolerancePolicy.js';
import { placeShapePoint } from './ShapePaths.js';

/** One height policy for rendered treads, gameplay routes, and crossing gates. */
export function shapeTraversalHeight(primitive, mode, steps, fraction) {
  const t = clamp01(fraction);
  const tread = steps ? Math.max(0, Math.ceil(t * steps - tolerance.parameter)) / steps : t;
  return primitive.elevation + primitive.rise * tread +
    (mode === 'bridge' ? Math.sin(Math.PI * t) * Math.min(1.4, primitive.length * 0.12) : 0);
}

export function createShapeTraversalSurface(plan) {
  const metrics = curvePathMetrics(plan.curve.path), samples = new Map();
  return (fraction, side = 0, lift = 0) => {
    const t = clamp01(fraction), distance = t * metrics.totalLength;
    if (!samples.has(t)) {
      const metric = metrics.segments.find((m) => distance <= m.end) ?? metrics.segments.at(-1);
      samples.set(t, curveSegmentPointAtLength(metrics.path.getSegment(metric.id), distance - metric.offset));
    }
    const sample = samples.get(t), p = plan.primitive;
    const [x, z] = placeShapePoint(p, [
      sample.point[0] + sample.tangent[1] * side,
      sample.point[1] - sample.tangent[0] * side,
    ]);
    return [x, shapeTraversalHeight(p, plan.mode, plan.steps, t) + lift, z];
  };
}
