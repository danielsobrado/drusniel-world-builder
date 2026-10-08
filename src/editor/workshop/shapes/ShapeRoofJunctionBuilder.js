import { createShapeRoofSurface } from './ShapeRoofSurface.js';

function face(mesh, points, normal, color) {
  const [a, b, c] = points, ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
  const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  mesh.quad(...(cross.reduce((sum, v, i) => sum + v * normal[i], 0) >= 0 ? points : points.toReversed()), color);
}

export function buildShapeRoofJunctions(plan, mesh, surface) {
  if (!mesh) return;
  const neighbors = new Map((plan.neighbors ?? []).map((n) => [n.id, createShapeRoofSurface(n)]));
  for (const junction of plan.roofJunctions ?? []) {
    const [a, b] = junction.points;
    if (junction.role === 'abutment') {
      const outer = junction.points.map((p, i) => {
        const [nx, nz] = junction.normals[i], x = p[0] + nx * 0.16, z = p[2] + nz * 0.16;
        return [x, surface.heightAt(x, z) + 0.055, z];
      });
      const inner = junction.points.map(([x, y, z]) => [x, y + 0.055, z]);
      face(mesh, [inner[0], outer[0], outer[1], inner[1]], [0, 1, 0], [0.65, 0.67, 0.7]);
      const top = inner.map(([x, y, z]) => [x, y + 0.12, z]);
      face(mesh, [inner[0], inner[1], top[1], top[0]], [junction.normals[0][0], 0, junction.normals[0][1]], [0.7, 0.72, 0.75]);
    } else {
      const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz), neighbor = neighbors.get(junction.otherId);
      const at = (p, side) => {
        const x = p[0] - dz / length * 0.065 * side, z = p[2] + dx / length * 0.065 * side;
        return [x, Math.max(surface.heightAt(x, z), neighbor.heightAt(x, z)) + 0.06, z];
      };
      for (const side of [-1, 1]) face(mesh, [at(a, 0), at(b, 0), at(b, side), at(a, side)], [0, 1, 0], [0.63, 0.66, 0.7]);
    }
  }
}
