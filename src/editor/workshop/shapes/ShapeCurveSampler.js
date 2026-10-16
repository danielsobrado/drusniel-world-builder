import { curvePathMetrics } from '../curves/CurveSampling.js';
import { evaluateCurveSegment } from '../curves/CurveSegment.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

/** Compile the kernel's exact quadratic arc-length table once per derived surface. */
export function createShapeCurveSampler(path) {
  const metrics = curvePathMetrics(path), byId = new Map();
  for (const metric of metrics.segments) {
    const segment = metrics.path.getSegment(metric.id), samples = [{ t: 0, length: 0 }];
    if (segment.kind === 'quadratic') {
      let previous = segment.start, length = 0;
      for (let i = 1; i <= tolerance.bezierSubdivisions; i++) {
        const t = i / tolerance.bezierSubdivisions, p = evaluateCurveSegment(segment, t).point;
        length += Math.hypot(p[0] - previous[0], p[1] - previous[1]); samples.push({ t, length }); previous = p;
      }
    }
    byId.set(metric.id, { metric, segment, samples });
  }
  function segmentPoint(id, distance) {
    const { metric, segment, samples } = byId.get(id);
    const target = Math.max(0, Math.min(metric.length, distance));
    let t = metric.length <= tolerance.length ? 0 : target / metric.length;
    if (segment.kind === 'quadratic' && metric.length > tolerance.length) {
      const i = Math.max(1, samples.findIndex(s => s.length >= target)), a = samples[i-1], b = samples[i];
      t = a.t + (b.t - a.t) * (b.length - a.length <= tolerance.length ? 0 : (target - a.length) / (b.length - a.length));
    }
    return evaluateCurveSegment(segment, t);
  }
  return { metrics, segmentPoint, point(distance) {
    const metric = metrics.segments.find(m => distance <= m.end) ?? metrics.segments.at(-1);
    return segmentPoint(metric.id, distance - metric.offset);
  } };
}
