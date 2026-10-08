import { createShapeWallSurface } from './ShapeWallSurface.js';
import { planShapeIvy } from './ShapeIvyLayout.js';

// Lobed, folded leaf fans avoid the old flat diamond lattice.
const outline = [
  [0, -1],
  [0.65, -0.3],
  [0.5, 0.1],
  [1, 0.4],
  [0.3, 0.6],
  [0, 1],
  [-0.3, 0.6],
  [-1, 0.4],
  [-0.5, 0.1],
  [-0.65, -0.3],
];

export function buildShapeIvy(plan, meshes, recipe) {
  if (!recipe.ivy) return;
  const surface = createShapeWallSurface(plan),
    p = plan.primitive;
  const offset = p.thickness / 2 + 0.11;
  const layout = planShapeIvy(plan, recipe.seed, recipe.detail);
  const clear = (u, y) =>
    y >= 0.03 &&
    y <= p.height - 0.05 &&
    (surface.closed || (u >= 0 && u <= surface.length)) &&
    !surface.excluded(u, y);
  for (const { a, b } of layout.stems) {
    if (![0, 0.5, 1].every((t) => clear(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)))
      continue;
    const points = [
      surface.point(a[0] - 0.009, a[1], offset),
      surface.point(b[0] - 0.009, b[1], offset),
      surface.point(b[0] + 0.009, b[1], offset),
      surface.point(a[0] + 0.009, a[1], offset),
    ];
    meshes.foliage.quad(...(surface.clockwise ? points.toReversed() : points), [0.1, 0.17, 0.055]);
  }
  for (const leaf of layout.leaves) {
    const cos = Math.cos(leaf.angle),
      sin = Math.sin(leaf.angle);
    const locals = outline.map(([x, y]) => [
      leaf.u + (x * cos - y * sin) * leaf.size,
      leaf.y + (x * sin + y * cos) * leaf.size,
    ]);
    if (!clear(leaf.u, leaf.y) || !locals.every(([u, y]) => clear(u, y))) continue;
    const points = locals.map(([u, y]) => surface.point(u, y, offset + leaf.lift));
    const center = surface.point(leaf.u, leaf.y + leaf.size * 0.15, offset + leaf.lift + 0.04);
    for (let i = 0; i < points.length; i++) {
      const color = leaf.shade * (i < points.length / 2 ? 1 : 0.82);
      const a = points[i],
        b = points[(i + 1) % points.length];
      meshes.foliage.triangle(center, ...(surface.clockwise ? [a, b] : [b, a]), [
        color * 0.16,
        color * 0.29,
        color * 0.085,
      ]);
    }
  }
}
