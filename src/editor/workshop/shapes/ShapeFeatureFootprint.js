import { CurvePath } from '../curves/CurvePath.js';
import { evaluateCurveSegment } from '../curves/CurveSegment.js';

export function expandShapeFeatureFootprint(footprint, distance) {
  const width = footprint.width + distance * 2, depth = footprint.depth + distance * 2;
  if (footprint.family !== 'custom') return { ...footprint, width, depth,
    cornerRadius: (footprint.cornerRadius ?? 0) + Math.min(0.3, distance) };
  const path = new CurvePath(footprint.path), sx = width / footprint.width, sz = depth / footprint.depth;
  const scale = ([x, z]) => [x * sx, z * sz], serialized = path.toJSON();
  const points = serialized.points.map((p) => ({ ...p, position: scale(p.position) }));
  const segments = serialized.segments.map((s) => {
    if (s.kind === 'quadratic') return { ...s, control: scale(s.control) };
    if (s.kind !== 'arc') return s;
    const source = path.getSegment(s.id), midpoint = evaluateCurveSegment(source, 0.5).point;
    const { center, clockwise, ...fields } = s; void center; void clockwise;
    return { ...fields, kind: 'quadratic', control: scale(midpoint.map((v, i) => 2 * v - (source.start[i] + source.end[i]) / 2)) };
  });
  return { ...footprint, width, depth, path: new CurvePath({ ...serialized, points, segments }).toJSON() };
}
