import { shapeProfileOut } from './ShapeProfile.js';

export function pointInShape(point, boundary) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i],
      b = boundary[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

const MITER_LIMIT = 4;

/**
 * Offset a closed polygon by a true perpendicular distance: each vertex moves to the
 * intersection of its two offset edges (a miter), so a 90° corner keeps both faces `distance` away.
 * shortcut: spikes are clamped at MITER_LIMIT × distance instead of bevelled, so the vertex
 * count (and index correspondence callers rely on) is kept; a deep inward offset of a
 * concave footprint can still self-intersect — switch to a clipper-style offset if custom
 * footprints start needing that.
 */
export function offsetShapePolygon(points, distance) {
  if (!distance) return points;
  const n = points.length;
  const area = points.reduce((sum, a, i) => { const b = points[(i + 1) % n]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  const sign = area < 0 ? -1 : 1;
  // Outward unit normal of the edge from points[i] to the next distinct vertex.
  const normal = (i, step) => {
    for (let k = 1; k < n; k++) {
      const a = points[i], b = points[(i + step * k + n * k) % n];
      const dx = (b[0] - a[0]) * step, dz = (b[1] - a[1]) * step, length = Math.hypot(dx, dz);
      if (length > 1e-9) return [(dz / length) * sign, (-dx / length) * sign];
    }
    return [0, 0];
  };
  return points.map((point, i) => {
    const before = normal(i, -1), after = normal(i, 1);
    const mx = before[0] + after[0], mz = before[1] + after[1], m = Math.hypot(mx, mz);
    if (m < 1e-9) return [point[0] + after[0] * distance, point[1] + after[1] * distance];
    const cos = (mx * after[0] + mz * after[1]) / m;
    const reach = distance / Math.max(cos, 1 / MITER_LIMIT);
    return [point[0] + (mx / m) * reach, point[1] + (mz / m) * reach];
  });
}

/** Whether an open or closed polyline touches a closed polygon: a vertex inside it or any edge crossing. */
export function polylineTouchesShape(line, shape, closed = false) {
  if (line.some((point) => pointInShape(point, shape))) return true;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < line.length - (closed ? 0 : 1); i++) {
    const a = line[i], b = line[(i + 1) % line.length];
    for (let j = 0; j < shape.length; j++) {
      const c = shape[j], d = shape[(j + 1) % shape.length];
      const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
      if (ac * ad > 0 || ca * cb > 0) continue;
      // Collinear segments only touch when their extents overlap.
      if (!ac && !ad && [0, 1].some((k) => Math.max(a[k], b[k]) < Math.min(c[k], d[k]) || Math.max(c[k], d[k]) < Math.min(a[k], b[k]))) continue;
      return true;
    }
  }
  return false;
}

export function shapeEnvelopeAtHeight(plan, height) {
  const p = plan.primitive, local = Math.max(0, Math.min(p.height, height - p.elevation));
  const t = local / p.height;
  return offsetShapePolygon(plan.boundary.map((point, i) => [
    point[0] + (plan.topBoundary[i][0] - point[0]) * t,
    point[1] + (plan.topBoundary[i][1] - point[1]) * t,
  ]), shapeProfileOut(p, Math.min(local, p.height - 1e-4)));
}
