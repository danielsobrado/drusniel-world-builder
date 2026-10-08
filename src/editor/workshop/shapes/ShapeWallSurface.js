import { curvePathMetrics } from '../curves/CurveSampling.js';
import { curveSegmentPointAtLength } from '../curves/CurveSegment.js';
import { placeShapePoint } from './ShapePaths.js';
import { pointInShape, shapeEnvelopeAtHeight } from './ShapeEnvelope.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { addShapeWallBevel } from './ShapeWallBevel.js';

export function createShapeWallSurface(plan) {
  const p = plan.primitive,
    length = plan.curve.length;
  const metrics = curvePathMetrics(plan.curve.path),
    samples = new Map();
  const clockwise =
    plan.curve.closed &&
    plan.boundary.reduce((sum, point, i) => {
      const next = plan.boundary[(i + 1) % plan.boundary.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) < 0;
  function sample(distance) {
    const d = plan.curve.closed
      ? ((distance % length) + length) % length
      : Math.max(0, Math.min(length, distance));
    if (!samples.has(d)) {
      const metric =
        metrics.segments.find((segment) => d <= segment.end) ?? metrics.segments.at(-1);
      samples.set(
        d,
        curveSegmentPointAtLength(metrics.path.getSegment(metric.id), d - metric.offset),
      );
    }
    return samples.get(d);
  }
  function point(distance, y, offset = 0) {
    const s = sample(distance),
      scale = p.kind === 'curved-volume' ? 1 + ((p.taper - 1) * y) / p.height : 1;
    if (p.kind === 'curved-wall') offset *= 1 + ((p.taper - 1) * y) / p.height;
    const sign = clockwise ? -1 : 1;
    const local = [
      s.point[0] * scale + s.tangent[1] * offset * sign,
      s.point[1] * scale - s.tangent[0] * offset * sign,
    ];
    const world = placeShapePoint(p, local);
    return [world[0], p.elevation + y, world[1]];
  }
  function gaps(distance) {
    return (plan.openings ?? p.openings ?? []).flatMap((o) => {
      let dx = distance - o.at * length;
      if (plan.curve.closed) dx = ((((dx + length / 2) % length) + length) % length) - length / 2;
      if (Math.abs(dx) > o.width / 2 + tolerance.length) return [];
      const radius = o.profile === 'square' ? 0 : Math.min(o.width / 2, o.height * 0.4);
      const top =
        o.bottom +
        o.height -
        radius +
        radius * Math.sqrt(Math.max(0, 1 - (dx / (o.width / 2)) ** 2));
      return [{ bottom: o.bottom, top: Math.min(p.height, top), opening: o }];
    });
  }
  function neighborExcluded(distance, y) {
    const position = point(distance, y);
    return (plan.neighbors ?? []).some((n) => {
      if (n.roofOnly) return false;
      const t = (position[1] - n.primitive.elevation) / n.primitive.height;
      if (t < 0 || t > 1) return false;
      const boundary = shapeEnvelopeAtHeight(n, position[1]);
      return pointInShape([position[0], position[2]], boundary);
    });
  }
  function excluded(distance, y) {
    return gaps(distance).some((gap) => y >= gap.bottom && y <= gap.top) || neighborExcluded(distance, y);
  }
  return {
    point,
    gaps,
    excluded,
    neighborExcluded,
    length,
    clockwise,
    closed: plan.curve.closed,
  };
}

/** Clip each material layer against the same continuous opening envelope. */
export function wallSolidBands(surface, u0, u1, y0, y1, neighborCuts = true) {
  const center = (u0 + u1) / 2;
  const gaps = surface.gaps(center).sort((a, b) => a.bottom - b.bottom);
  const at = (distance) => new Map(surface.gaps(distance).map((gap) => [gap.opening.id, gap.top]));
  const left = at(u0),
    right = at(u1),
    bands = [];
  let bottom = [y0, y0];
  for (const gap of [...gaps, { bottom: y1, top: y1 }]) {
    const top = Math.min(y1, gap.bottom);
    if (
      top > Math.max(...bottom) + tolerance.length &&
      (!neighborCuts || !surface.neighborExcluded(center, (Math.max(...bottom) + top) / 2))
    ) {
      bands.push({ bottom: [...bottom], top: [top, top] });
    }
    bottom = bottom.map((value, i) =>
      Math.min(
        y1,
        Math.max(
          value,
          gap.opening ? ((i ? right : left).get(gap.opening.id) ?? gap.top) : gap.top,
        ),
      ),
    );
  }
  return bands;
}

export function addWallPatch(mesh, surface, u0, u1, y0, y1, offset, thickness, color, caps = {}) {
  const low = Array.isArray(y0) ? y0 : [y0, y0];
  const high = Array.isArray(y1) ? y1 : [y1, y1];
  const a = surface.point(u0, low[0], offset),
    b = surface.point(u1, low[1], offset);
  const c = surface.point(u1, high[1], offset),
    d = surface.point(u0, high[0], offset);
  const face = (a, b, c, d) =>
    surface.clockwise !== thickness < 0
      ? mesh.quad(a, b, c, d, color)
      : mesh.quad(d, c, b, a, color);
  if (caps.bevel) addShapeWallBevel(mesh, surface, { u0, u1, low, high, offset, thickness, color, caps });
  else {
    const uv = [[u0, low[0]], [u1, low[1]], [u1, high[1]], [u0, high[0]]];
    if (surface.clockwise !== thickness < 0) mesh.quad(a, b, c, d, color, uv);
    else mesh.quad(d, c, b, a, color, uv.toReversed());
  }
  if (Math.abs(thickness) > 0) {
    const ai = surface.point(u0, low[0], offset - thickness),
      bi = surface.point(u1, low[1], offset - thickness);
    const ci = surface.point(u1, high[1], offset - thickness),
      di = surface.point(u0, high[0], offset - thickness);
    if (caps.back !== false) face(bi, ai, di, ci);
    face(a, ai, bi, b);
    face(d, c, ci, di);
    if (caps.start !== false) face(a, d, di, ai);
    if (caps.end !== false) face(b, bi, ci, c);
  }
}
