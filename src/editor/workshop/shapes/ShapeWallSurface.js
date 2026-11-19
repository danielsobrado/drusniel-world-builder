import { createShapeCurveSampler } from './ShapeCurveSampler.js';
import { placeShapePoint } from './ShapePaths.js';
import { pointInShape, shapeEnvelopeAtHeight } from './ShapeEnvelope.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { addShapeWallBevel } from './ShapeWallBevel.js';
import { shapeProfileOut } from './ShapeProfile.js';
import { shapeOpeningTop } from './ShapeOpenings.js';
import { createShapeRoofHeightField } from './ShapeRoofHeight.js';
import { shapeRuinCeiling } from './ShapeRuin.js';

const MITER_CLAMP = 2.2;

function buildSegmentMiters(sampler, closed, sign) {
  const segments = sampler.metrics.segments;
  const count = segments.length;
  const normals = segments.map((m) => {
    const a = sampler.segmentPoint(m.id, 0).tangent;
    const b = sampler.segmentPoint(m.id, m.length).tangent;
    return {
      startT: a,
      endT: b,
      startN: [a[1] * sign, -a[0] * sign],
      endN: [b[1] * sign, -b[0] * sign],
    };
  });
  const miterK = (t, n, adjN) => {
    const dot = n[0] * adjN[0] + n[1] * adjN[1];
    if (dot > 0.9994) return 0;
    const denom = t[0] * adjN[0] + t[1] * adjN[1];
    if (Math.abs(denom) < 1e-4) return 0;
    return Math.max(-MITER_CLAMP, Math.min(MITER_CLAMP, (1 - dot) / denom));
  };
  const corners = [];
  const miters = segments.map((m, i) => {
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < count - 1;
    const prevN = hasPrev ? normals[(i - 1 + count) % count].endN : normals[i].startN;
    const nextN = hasNext ? normals[(i + 1) % count].startN : normals[i].endN;
    const startDot = normals[i].startN[0] * prevN[0] + normals[i].startN[1] * prevN[1];
    if (hasPrev && startDot < 0.9985) corners.push(m.offset);
    return {
      metric: m,
      kind: sampler.metrics.path.getSegment(m.id).kind,
      kStart: hasPrev ? miterK(normals[i].startT, normals[i].startN, prevN) : 0,
      kEnd: hasNext ? miterK(normals[i].endT, normals[i].endN, nextN) : 0,
    };
  });
  return { miters, corners };
}

export function createShapeWallSurface(plan) {
  const p = plan.primitive,
    length = plan.curve.length;
  const roofField = p.roof && !plan.roofReplaced && ['gable', 'shed'].includes(p.roof.family)
    ? createShapeRoofHeightField(p)
    : null;
  const ruinHeight = shapeRuinCeiling(p, length, plan.curve.closed, plan.ruinColumns);
  const sampler = createShapeCurveSampler(plan.curve.path),
    samples = new Map();
  const clockwise =
    plan.curve.closed &&
    plan.boundary.reduce((sum, point, i) => {
      const next = plan.boundary[(i + 1) % plan.boundary.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) < 0;
  const sign = clockwise ? -1 : 1;
  const { miters, corners } = buildSegmentMiters(sampler, plan.curve.closed, sign);
  function sample(distance) {
    const d = plan.curve.closed
      ? ((distance % length) + length) % length
      : Math.max(0, Math.min(length, distance));
    if (!samples.has(d)) {
      const m = miters.find((entry) => d <= entry.metric.end) ?? miters.at(-1);
      samples.set(d, { ...sampler.segmentPoint(m.metric.id, d - m.metric.offset), miter: m, d });
    }
    return samples.get(d);
  }
  function point(distance, y, offset = 0) {
    const s = sample(distance),
      scale = p.kind === 'curved-volume' ? 1 + ((p.taper - 1) * y) / p.height : 1;
    if (p.kind === 'curved-wall') offset *= 1 + ((p.taper - 1) * y) / p.height;
    // The vertical profile moves both faces of a shell, and each face of a freestanding wall.
    const out = shapeProfileOut(p, y);
    if (out) {
      offset += p.kind === 'curved-wall'
        ? (Math.abs(offset) >= p.thickness * 0.35 ? Math.sign(offset) * out : 0)
        : out;
    }
    let k = 0;
    const m = s.miter;
    if (offset && m.kind === 'line' && (m.kStart || m.kEnd) && m.metric.length > tolerance.length) {
      const zone = Math.min(m.metric.length * 0.45, Math.max(0.28, Math.abs(offset) * 1.4));
      const ds = s.d - m.metric.offset;
      const de = m.metric.end - s.d;
      if (ds < zone && m.kStart) k += (1 - ds / zone) * m.kStart;
      if (de < zone && m.kEnd) k += (1 - de / zone) * m.kEnd;
    }
    const nx = s.tangent[1] * sign + k * s.tangent[0];
    const nz = -s.tangent[0] * sign + k * s.tangent[1];
    const local = [
      s.point[0] * scale + nx * offset,
      s.point[1] * scale + nz * offset,
    ];
    const world = placeShapePoint(p, local);
    return [world[0], p.elevation + y, world[1]];
  }
  function ceiling(distance) {
    const ruinCap = ruinHeight(distance);
    if (!roofField) return ruinCap;
    const face = point(distance, p.height, p.thickness / 2);
    const roofCeiling = Math.max(p.height, roofField.heightAt(face[0], face[2]) - p.elevation - 0.02);
    return plan.ruinColumns?.length ? Math.min(ruinCap, roofCeiling) : roofCeiling;
  }
  function gaps(distance) {
    const cap = ceiling(distance);
    return (plan.openings ?? p.openings ?? []).flatMap((o) => {
      let dx = distance - o.at * length;
      if (plan.curve.closed) dx = ((((dx + length / 2) % length) + length) % length) - length / 2;
      if (Math.abs(dx) > o.width / 2 + tolerance.length) return [];
      const top = shapeOpeningTop(o, dx);
      return [{ bottom: o.bottom, top: Math.min(cap, top), opening: o }];
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
    ceiling,
    ruinHeight,
    corners,
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
  // Reveals, soffits and ends may belong to a different slot than the face (stone jambs in mortar).
  const textureUv = uv => caps.grainAlong === 'u' ? uv.map(([u, v]) => [v, u]) : uv;
  const face = (a, b, c, d, target = mesh, tone = color, uv) => {
    if (uv) uv = textureUv(uv);
    return surface.clockwise !== thickness < 0
      ? target.quad(a, b, c, d, tone, uv)
      : target.quad(d, c, b, a, tone, uv?.toReversed());
  };
  const side = (a, b, c, d, uv) => face(a, b, c, d, caps.sideMesh ?? mesh, caps.sideColor ?? color, uv);
  if (caps.bevel) addShapeWallBevel(mesh, surface, { u0, u1, low, high, offset, thickness, color, caps });
  else {
    const uv = textureUv([[u0, low[0]], [u1, low[1]], [u1, high[1]], [u0, high[0]]]);
    if (surface.clockwise !== thickness < 0) mesh.quad(a, b, c, d, color, uv);
    else mesh.quad(d, c, b, a, color, uv.toReversed());
  }
  if (Math.abs(thickness) > 0) {
    const ai = surface.point(u0, low[0], offset - thickness),
      bi = surface.point(u1, low[1], offset - thickness);
    const ci = surface.point(u1, high[1], offset - thickness),
      di = surface.point(u0, high[0], offset - thickness);
    const inner = offset - thickness;
    if (caps.back !== false) face(bi, ai, di, ci, mesh, color, [[u1, low[1]], [u0, low[0]], [u0, high[0]], [u1, high[1]]]);
    side(a, ai, bi, b, [[u0, offset], [u0, inner], [u1, inner], [u1, offset]]);
    side(d, c, ci, di, [[u0, offset], [u1, offset], [u1, inner], [u0, inner]]);
    if (caps.start !== false) side(a, d, di, ai, [[offset, low[0]], [offset, high[0]], [inner, high[0]], [inner, low[0]]]);
    if (caps.end !== false) side(b, bi, ci, c, [[offset, low[1]], [inner, low[1]], [inner, high[1]], [offset, high[1]]]);
  }
}
