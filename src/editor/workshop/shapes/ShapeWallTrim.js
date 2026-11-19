import { addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { shapeBaseTop, shapeProfileBreaks, shapeProfileOut } from './ShapeProfile.js';
import { shapeStoneTint, shapeStoneTone } from './ShapeMasonryCourses.js';
import { shapeRandom } from './ShapeMesh.js';

function cornerStations(plan, surface) {
  if (plan.curve.length < 1) return [];
  const count = Math.max(16, Math.ceil(plan.curve.length / 0.2));
  const step = plan.curve.length / count;
  const raw = [];
  for (let i = 0; i < count; i++) {
    const u = i * step;
    if (!surface.closed && (u < 0.2 || u > surface.length - 0.2)) continue;
    const prev = surface.point(u - 0.14, 0);
    const mid = surface.point(u, 0);
    const next = surface.point(u + 0.14, 0);
    const ax = mid[0] - prev[0], az = mid[2] - prev[2];
    const bx = next[0] - mid[0], bz = next[2] - mid[2];
    const len = Math.hypot(ax, az) * Math.hypot(bx, bz);
    if (len < 1e-8) continue;
    const dot = Math.max(-1, Math.min(1, (ax * bx + az * bz) / len));
    if (Math.acos(dot) > 0.34) raw.push(u);
  }
  const corners = [];
  for (const u of raw) {
    const close = corners.some((c) => {
      const d = Math.abs(u - c);
      return (surface.closed ? Math.min(d, surface.length - d) : d) < 0.55;
    });
    if (!close) corners.push(u);
  }
  return corners;
}

/** Dressed, sloped water-table coping along stepped or multi-tiered plinth ledges. */
export function buildShapePlinthWaterTable(plan, meshes, recipe, surface, distances) {
  const p = plan.primitive;
  if (!p.base || !['plinth', 'stepped-plinth', 'molded'].includes(p.base.style)) return;
  const dress = shapeStoneTint(recipe, plan);
  for (const breakY of shapeProfileBreaks(p)) {
    if (breakY > shapeBaseTop(p) + 1e-4) continue;
    const outBelow = shapeProfileOut(p, breakY - 1e-3);
    const outAbove = shapeProfileOut(p, breakY + 1e-3);
    if (outBelow - outAbove <= 0.02) continue;
    const outerOffset = p.thickness / 2 + outBelow + 0.032;
    const innerOffset = p.thickness / 2 + outAbove + 0.008;
    const lowY = breakY - 0.075;
    const highY = breakY + 0.055;
    for (let i = 0; i < distances.length - 1; i++) {
      const u0 = distances[i], u1 = distances[i + 1];
      const pieces = recipe.detail >= 2 ? Math.max(1, Math.ceil((u1 - u0) / 0.55)) : 1;
      for (let k = 0; k < pieces; k++) {
        const a = u0 + ((u1 - u0) * k) / pieces;
        const b = u0 + ((u1 - u0) * (k + 1)) / pieces;
        if (surface.excluded((a + b) / 2, breakY)) continue;
        const gap = recipe.detail >= 2 && pieces > 1 ? 0.006 : 0;
        const ua = a + gap, ub = b - gap;
        if (ub - ua < 0.02) continue;
        const v = recipe.detail >= 2 ? 0.88 + shapeRandom(recipe.seed, p.id, 'plinth-cap', `${Math.round(breakY * 100)}:${i}:${k}`) * 0.1 : 0.92;
        const tone = dress.map((c) => c * v);
        // Vertical drip face
        addWallPatch(meshes.trim, surface, ua, ub, lowY - 0.03, lowY, outerOffset, outerOffset - innerOffset, tone, {
          back: false, start: k === 0, end: k === pieces - 1,
        });
        // Sloped chamfered water-table top
        const p0 = surface.point(ua, lowY, outerOffset);
        const p1 = surface.point(ub, lowY, outerOffset);
        const p2 = surface.point(ub, highY, innerOffset);
        const p3 = surface.point(ua, highY, innerOffset);
        meshes.trim.quad(...(surface.clockwise ? [p0, p1, p2, p3] : [p3, p2, p1, p0]), tone.map((c) => c * 1.05));
      }
    }
  }
}

/** Alternating long-and-short dressed stone quoins at sharp/tight footprint corners. */
export function buildShapeCornerQuoins(plan, meshes, recipe, surface) {
  const p = plan.primitive;
  if (!p.quoins || recipe.detail < 2) return;
  const corners = cornerStations(plan, surface);
  if (!corners.length) return;
  const startY = shapeBaseTop(p);
  const course = 0.34;
  for (const [ci, uc] of corners.entries()) {
    const ceiling = surface.ceiling ? surface.ceiling(uc) : p.height;
    const rows = Math.floor((ceiling - startY - 0.08) / course);
    for (let row = 0; row < rows; row++) {
      const y0 = startY + row * course + 0.014;
      const y1 = Math.min(ceiling - 0.06, startY + (row + 1) * course - 0.014);
      if (y1 - y0 < 0.1) continue;
      const long = row % 2 === 0;
      const reachA = long ? 0.36 : 0.22;
      const reachB = long ? 0.22 : 0.36;
      const u0 = uc - reachA, u1 = uc + reachB;
      const tone = shapeStoneTone(recipe, plan, 'quoin', `${ci}:${row}`).map((v) => v * 1.04);
      for (const [sa, sb, startCap, endCap] of [[u0, uc, true, false], [uc, u1, false, true]]) {
        for (const band of wallSolidBands(surface, sa, sb, y0, y1, true)) {
          if (band.top[0] - band.bottom[0] < 0.08 || band.top[1] - band.bottom[1] < 0.08) continue;
          addWallPatch(meshes.trim, surface, sa, sb, band.bottom, band.top, p.thickness / 2 + 0.072, 0.08, tone, {
            back: false, bevel: true, bevelSize: 0.022, start: startCap, end: endCap,
          });
        }
      }
    }
  }
}

/** Projecting dressed stone string courses at floor boundaries and eaves. */
export function buildShapeBeltCourses(plan, meshes, recipe, surface, distances) {
  const p = plan.primitive;
  if (!p.beltCourses) return;
  const dress = shapeStoneTint(recipe, plan);
  const levels = [];
  for (let level = 1; level < p.levels; level++) levels.push((p.height * level) / p.levels);
  if (p.kind === 'curved-volume' && !p.crown?.style?.includes('corbel')) levels.push(p.height - 0.13);
  const bandH = 0.11;
  for (const y of levels) {
    if (y <= shapeBaseTop(p) + 0.15 || y >= p.height - 0.02) continue;
    for (let i = 0; i < distances.length - 1; i++) {
      const u0 = distances[i], u1 = distances[i + 1];
      for (const band of wallSolidBands(surface, u0, u1, y - bandH / 2, y + bandH / 2, true)) {
        const tone = dress.map((c) => c * (0.9 + shapeRandom(recipe.seed, p.id, 'belt', `${Math.round(y * 10)}:${i}`) * 0.08));
        addWallPatch(meshes.trim, surface, u0, u1, band.bottom, band.top, p.thickness / 2 + 0.068, 0.075, tone, {
          back: false, bevel: recipe.detail >= 2, bevelSize: 0.015, start: false, end: false,
        });
      }
    }
  }
}
