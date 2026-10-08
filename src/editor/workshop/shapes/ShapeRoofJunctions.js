import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { pointInShape } from './ShapeEnvelope.js';

function record(plan, otherId, role, cell, points, fields = {}) {
  const key = `roof-join:${plan.id}:${otherId}:${role}-${cell}`;
  if (plan.primitive.suppressed.includes(key)) return null;
  return { id: key, derivationKey: key, role, otherId, points, ...fields,
    provenance: { source: 'auto', ruleId: 'roof-junction', generatorVersion: 1,
      sourceEntityIds: [plan.id, otherId], derivationKey: key } };
}

function root(a, b, field) {
  let low = 0, high = 1;
  const sign = field(a) >= 0;
  for (let i = 0; i < 18; i++) {
    const t = (low + high) / 2, p = a.map((v, k) => v + (b[k] - v) * t);
    if ((field(p) >= 0) === sign) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return a.map((v, k) => v + (b[k] - v) * t);
}

function valleys(plan, other, a, b) {
  const outlineA = a.outline.map((v) => [v[0], v[2]]), outlineB = b.outline.map((v) => [v[0], v[2]]);
  const inside = (p) => pointInShape(p, outlineA) && pointInShape(p, outlineB);
  const low = [0, 1].map((k) => Math.max(Math.min(...outlineA.map((p) => p[k])), Math.min(...outlineB.map((p) => p[k]))));
  const high = [0, 1].map((k) => Math.min(Math.max(...outlineA.map((p) => p[k])), Math.max(...outlineB.map((p) => p[k]))));
  if (high.some((v, k) => v <= low[k])) return [];
  const nx = Math.min(64, Math.max(1, Math.ceil((high[0] - low[0]) / 0.3)));
  const nz = Math.min(64, Math.max(1, Math.ceil((high[1] - low[1]) / 0.3)));
  const difference = (p) => a.heightAt(...p) - b.heightAt(...p), result = [];
  const vertices = Array.from({ length: nx + 1 }, (_, x) => Array.from({ length: nz + 1 }, (_, z) => {
    const point = [low[0] + (high[0] - low[0]) * x / nx, low[1] + (high[1] - low[1]) * z / nz];
    return { point, value: difference(point) };
  }));
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
    const corners = [vertices[x][z], vertices[x + 1][z], vertices[x + 1][z + 1], vertices[x][z + 1]];
    for (const [half, indexes] of [[0, [0, 1, 2]], [1, [0, 2, 3]]]) {
      const triangle = indexes.map((i) => corners[i]);
      if (triangle.every((v) => Math.abs(v.value) < 1e-6)) continue;
      const crossings = triangle.flatMap((v, i) => {
        const next = triangle[(i + 1) % 3];
        if ((v.value >= 0) === (next.value >= 0)) return [];
        return [root(v.point, next.point, difference)];
      });
      if (crossings.length !== 2 || !inside(crossings[0]) || !inside(crossings[1])) continue;
      const points = crossings.map(([px, pz]) => [px, a.heightAt(px, pz), pz]);
      if (points[0][1] < Math.max(plan.primitive.elevation + plan.primitive.height, other.primitive.elevation + other.primitive.height)) continue;
      if (Math.hypot(points[0][0] - points[1][0], points[0][2] - points[1][2]) < 0.002) continue;
      result.push(record(plan, other.id, 'valley', `${x}-${z}-${half}`, points));
    }
  }
  return result.filter(Boolean);
}

function abutments(plan, other, roof, neighbor) {
  const outline = roof.outline.map((v) => [v[0], v[2]]), result = [];
  const count = Math.min(1024, Math.ceil(other.curve.length / 0.18)), wall = neighbor.wall;
  const point = (u) => {
    let y = Math.min(plan.primitive.elevation + plan.primitive.height, other.primitive.height / 2 + other.primitive.elevation);
    for (let i = 0; i < 6; i++) {
      const p = wall.point(u, y - other.primitive.elevation, other.primitive.thickness / 2 + 0.004);
      y = roof.heightAt(p[0], p[2]);
    }
    return wall.point(u, y - other.primitive.elevation, other.primitive.thickness / 2 + 0.004);
  };
  const valid = (p) => p[1] >= other.primitive.elevation + 0.05 &&
    p[1] < other.primitive.elevation + other.primitive.height - 0.025 && pointInShape([p[0], p[2]], outline);
  for (let cell = 0; cell < count; cell++) {
    let u0 = other.curve.length * cell / count, u1 = other.curve.length * (cell + 1) / count;
    const middle = (u0 + u1) / 2;
    if (!valid(point(middle))) continue;
    if (!valid(point(u0))) u0 = root([u0], [middle], ([u]) => valid(point(u)) ? 1 : -1)[0];
    if (!valid(point(u1))) u1 = root([middle], [u1], ([u]) => valid(point(u)) ? 1 : -1)[0];
    const points = [point(u0), point(u1)];
    const normals = [u0, u1].map((u, i) => {
      const outward = wall.point(u, points[i][1] - other.primitive.elevation, other.primitive.thickness / 2 + 0.104);
      const dx = outward[0] - points[i][0], dz = outward[2] - points[i][2], length = Math.hypot(dx, dz);
      return [dx / length, dz / length];
    });
    result.push(record(plan, other.id, 'abutment', cell, points, { normals }));
  }
  return result.filter(Boolean);
}

/** Roof contact curves and their provenance are shared resolved products. */
export function resolveShapeRoofJunctions(plans) {
  const surfaces = new Map(plans.filter((p) => p.primitive.roof).map((p) => [p.id, createShapeRoofSurface(p)]));
  return plans.map((plan) => {
    if (!plan.primitive.roof || plan.roofReplaced) return { ...plan, roofJunctions: [] };
    const roof = surfaces.get(plan.id), junctions = [];
    for (const other of plan.neighbors ?? []) {
      const neighbor = surfaces.get(other.id) ?? createShapeRoofSurface(other);
      if (!other.roofOnly) junctions.push(...abutments(plan, other, roof, neighbor));
      if (plan.id < other.id && !other.roofReplaced) junctions.push(...valleys(plan, other, roof, neighbor));
    }
    return { ...plan, roofJunctions: junctions };
  });
}
