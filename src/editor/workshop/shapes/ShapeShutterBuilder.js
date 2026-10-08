import { shapeRandom } from './ShapeMesh.js';
import { addWallPatch } from './ShapeWallSurface.js';

/** Hinge pose is stable per opening; moving a window never rerolls its shutters. */
export function shapeShutterAngle(seed, hostId, opening, side) {
  const pose = opening.shutterPose ?? 'auto';
  const jitter = shapeRandom(seed, hostId, 'shutter-pose', `${opening.id}:${side}`);
  return pose === 'closed' ? 0 : pose === 'ajar' ? 0.45 + jitter * 0.22 :
    pose === 'open' ? Math.PI - 0.12 : Math.PI - 0.18 - jitter * 0.48;
}

function prism(mesh, front, back, tint) {
  mesh.quad(...front, tint); mesh.quad(...back.toReversed(), tint);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; mesh.quad(front[i], back[i], back[j], front[j], tint); }
}

function closedPanel(plan, opening, side, meshes, recipe, surface) {
  const center = opening.at * surface.length, half = opening.width / 2;
  const from = side < 0 ? center - half : center + 0.012, to = side < 0 ? center - 0.012 : center + half;
  const count = recipe.detail >= 2 ? Math.max(3, Math.ceil(half / 0.13)) : 1;
  const offset = plan.primitive.thickness / 2 + 0.19;
  for (let i = 0; i < count; i++) {
    const a = from + (to - from) * i / count + 0.003, b = from + (to - from) * (i + 1) / count - 0.003;
    const top = [a, b].map((u) => (surface.gaps(u).find((g) => g.opening.id === opening.id)?.top ?? opening.bottom + opening.height) - 0.045);
    const v = 0.69 + shapeRandom(recipe.seed, plan.id, 'shutter-planks', `${opening.id}:${side}:${i}`) * 0.22;
    addWallPatch(meshes.inserts, surface, a, b, opening.bottom + 0.045, top, offset + 0.027, 0.054, [v, v, v]);
  }
  if (recipe.detail < 2) return;
  const top = opening.bottom + opening.height - (opening.profile === 'arched' ? Math.min(half, opening.height * 0.4) : 0);
  for (const y of [opening.bottom + 0.19, Math.max(opening.bottom + 0.25, top - 0.14)]) {
    addWallPatch(meshes.inserts, surface, from, to, y - 0.025, y + 0.025, offset + 0.052, 0.028, [0.51, 0.51, 0.51]);
    const hinge = side < 0 ? from : to, end = hinge - side * Math.min(0.12, half);
    meshes.metal?.beam(surface.point(hinge, y, offset + 0.059), surface.point(end, y, offset + 0.059), 0.025, 0.018, [0.38, 0.39, 0.39]);
  }
}

export function buildShapeShutters(plan, meshes, recipe, surface) {
  const p = plan.primitive;
  if (!p.shutters) return;
  for (const opening of plan.openings ?? p.openings) {
    if (opening.role !== 'window') continue;
    const center = opening.at * surface.length, width = Math.max(0.08, opening.width / 2 - 0.015);
    const radius = opening.profile === 'square' ? 0 : Math.min(opening.width / 2, opening.height * 0.4);
    const top = (distance) => Math.min(p.height - 0.02, opening.bottom + opening.height - radius +
      radius * Math.sqrt(Math.max(0, 1 - (distance / (opening.width / 2)) ** 2))) - 0.045;
    for (const side of [-1, 1]) {
      const u = center + side * opening.width / 2;
      if (surface.neighborExcluded(u, opening.bottom + opening.height * 0.5)) continue;
      if (opening.shutterPose === 'closed') { closedPanel(plan, opening, side, meshes, recipe, surface); continue; }
      const a = surface.point(u - 0.01, opening.bottom), b = surface.point(u + 0.01, opening.bottom);
      const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const tangent = [(b[0] - a[0]) / length, 0, (b[2] - a[2]) / length];
      const sign = surface.clockwise ? -1 : 1, outward = [tangent[2] * sign, 0, -tangent[0] * sign];
      const angle = shapeShutterAngle(recipe.seed, plan.id, opening, side);
      const direction = tangent.map((v, k) => -side * v * Math.cos(angle) + outward[k] * Math.sin(angle));
      const normal = tangent.map((v, k) => side * v * Math.sin(angle) + outward[k] * Math.cos(angle));
      const point = (x, y, depth = 0) => surface.point(u, y, p.thickness / 2 + 0.19)
        .map((v, k) => v + direction[k] * x + normal[k] * depth);
      const tint = (i) => { const v = 0.69 + shapeRandom(recipe.seed, plan.id, 'shutter-planks', `${opening.id}:${side}:${i}`) * 0.22; return [v, v, v]; };
      const planks = recipe.detail >= 2 ? Math.max(3, Math.ceil(width / 0.13)) : 1;
      for (let i = 0; i < planks; i++) {
        const x0 = width * i / planks + 0.003, x1 = width * (i + 1) / planks - 0.003;
        const y0 = opening.bottom + 0.045, y1 = [x0, x1].map((x) => top(side * (opening.width / 2 - x)));
        if (Math.min(...y1) <= y0) continue;
        const front = [point(x0, y0, 0.027), point(x1, y0, 0.027), point(x1, y1[1], 0.027), point(x0, y1[0], 0.027)];
        const back = [point(x0, y0, -0.027), point(x1, y0, -0.027), point(x1, y1[1], -0.027), point(x0, y1[0], -0.027)];
        const winding = (direction[2] * normal[0] - direction[0] * normal[2]) < 0;
        prism(meshes.inserts, winding ? front : front.toReversed(), winding ? back : back.toReversed(), tint(i));
      }
      if (recipe.detail < 2) continue;
      const strapTop = top(side * opening.width / 2);
      for (const y of [opening.bottom + 0.19, Math.max(opening.bottom + 0.25, strapTop - 0.14)]) {
        meshes.inserts.beam(point(0.015, y, -0.046), point(width - 0.015, y, -0.046), 0.052, 0.035, [0.51, 0.51, 0.51]);
        meshes.metal?.beam(point(0.01, y, 0.035), point(Math.min(0.12, width), y, 0.035), 0.025, 0.018, [0.38, 0.39, 0.39]);
      }
      meshes.inserts.beam(point(0.035, opening.bottom + 0.21, -0.045), point(width - 0.035, Math.max(opening.bottom + 0.27, strapTop - 0.16), -0.045), 0.045, 0.03, [0.59, 0.59, 0.59]);
    }
  }
}
