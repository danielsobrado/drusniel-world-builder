import { createShapeWallSurface } from './ShapeWallSurface.js';
import { shapeBounds } from './ShapePaths.js';

/** Sculpted stone heraldic shield/crest plaque anchored on any wall or gable face. */
export function resolveShapeCrest(host, intent, frame) {
  const wall = createShapeWallSurface(host);
  const p = host.primitive;
  const ceil = wall.ceiling ? wall.ceiling(frame.u) : p.height;
  const width = Math.min(intent.width, 2.4);
  const height = Math.min(intent.height, 2.8);
  const depth = Math.min(intent.depth, 0.45);
  const y = Math.min(intent.bottom, Math.max(0.4, ceil - height * 0.6));
  const origin = wall.point(frame.u, y, p.thickness / 2 + 0.085);
  const pt = (x, dy, z) => [
    origin[0] + frame.tangent[0] * x + frame.outward[0] * z,
    origin[1] + dy,
    origin[2] + frame.tangent[2] * x + frame.outward[2] * z,
  ];
  const corners = [[-width / 2, 0, 0], [width / 2, 0, 0], [width / 2, height, depth], [-width / 2, height, depth]]
    .map(([x, dy, z]) => { const v = pt(x, dy, z); return [v[0], v[2]]; });
  return {
    frame: { ...frame, origin },
    crest: { width, height, depth, bounds: shapeBounds(corners) },
  };
}

/** Faceted medieval heater shield with raised stone molding border and central emblem boss. */
export function buildShapeCrest(feature, mesh, tint = [0.95, 0.95, 0.95], detail = 2) {
  const { width, height, depth } = feature.crest;
  const { origin, tangent, outward } = feature.frame;
  // Right-handed check: (tangent × up) · outward = tx * oz - tz * ox > 0 means CCW outline faces outward.
  const ccw = tangent[0] * outward[2] - tangent[2] * outward[0] > 0;
  const pt = (x, y, z) => [
    origin[0] + tangent[0] * x + outward[0] * z,
    origin[1] + y,
    origin[2] + tangent[2] * x + outward[2] * z,
  ];
  // Classic Gothic heater shield outline (normalized x in -1..1, y in 0..1)
  const outline = [
    [0, 0],
    [0.64, 0.24],
    [0.95, 0.56],
    [1, 0.88],
    [0.52, 0.96],
    [0, 1],
    [-0.52, 0.96],
    [-1, 0.88],
    [-0.95, 0.56],
    [-0.64, 0.24],
  ];
  const hw = width / 2;
  const back = outline.map(([x, y]) => pt(x * hw, y * height, 0));
  const rim = outline.map(([x, y]) => pt(x * hw * 0.94, y * height * 0.96 + height * 0.02, depth));
  const inner = outline.map(([x, y]) => pt(x * hw * 0.7, y * height * 0.76 + height * 0.12, depth * 0.62));
  const center = pt(0, height * 0.52, depth * (detail >= 2 ? 1.05 : 0.82));
  const n = outline.length;
  const quad = (a, b, c, d, color) => mesh.quad(...(ccw ? [a, b, c, d] : [d, c, b, a]), color);
  const tri = (a, b, c, color) => mesh.triangle(...(ccw ? [a, b, c] : [c, b, a]), color);
  const rimTone = tint.map((c) => c * 1.08);
  const sideTone = tint.map((c) => c * 0.82);
  const fieldTone = tint.map((c) => c * 0.88);
  const bossTone = tint.map((c) => c * 1.12);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Outer chamfered stone edge
    quad(back[i], back[j], rim[j], rim[i], sideTone);
    // Raised molded shield border sloping into inner field
    quad(rim[i], rim[j], inner[j], inner[i], rimTone);
    // Inner carved shield face rising to central heraldic ridge
    tri(inner[i], inner[j], center, i % 2 === 0 ? fieldTone : bossTone);
  }
  // Carved heraldic diamond emblem boss in center of shield
  if (detail >= 2) {
    const eTop = pt(0, height * 0.78, depth * 0.88);
    const eBot = pt(0, height * 0.24, depth * 0.88);
    const eRight = pt(hw * 0.34, height * 0.52, depth * 0.88);
    const eLeft = pt(-hw * 0.34, height * 0.52, depth * 0.88);
    const ePeak = pt(0, height * 0.52, depth * 1.38);
    tri(eBot, eRight, ePeak, bossTone);
    tri(eRight, eTop, ePeak, rimTone);
    tri(eTop, eLeft, ePeak, bossTone);
    tri(eLeft, eBot, ePeak, sideTone);
  }
}
