import { shapeRandom } from './ShapeMesh.js';

/** A continuous host-local field: splitting a patch never changes its wear. */
export function shapeAgingSurface(surface, plan, seed, timber = false) {
  const age = plan.primitive.age;
  const phase = shapeRandom(seed, plan.id, 'aging', 'phase') * Math.PI * 2;
  return {
    ...surface,
    point(u, y, offset = 0) {
      const bow = timber ? Math.sin(y * 0.76 + phase) * Math.sin(u * 1.2 + phase) * age * 0.025 : 0;
      return surface.point(u, y, offset + bow);
    },
  };
}

export function shapeCellWear(plan, seed, key) {
  const age = plan.primitive.age;
  return Array.from({ length: 4 }, (_, corner) =>
    shapeRandom(seed, plan.id, 'edge-wear', `${key}:${corner}`) < age * 0.45
      ? age * (0.016 + shapeRandom(seed, plan.id, 'chip-depth', `${key}:${corner}`) * 0.045) : 0);
}

/** Small, irregular loss of finish and dampness use the same exclusions as masonry. */
export function buildShapeWeathering(plan, meshes, recipe, surface) {
  const p = plan.primitive, age = p.age;
  if (age <= 0 || recipe.detail < 2) return;
  const random = (domain, key) => shapeRandom(recipe.seed, p.id, domain, key);
  for (let cell = 0; cell * 0.65 < surface.length; cell++) {
    const u = cell * 0.65 + 0.12;
    const damp = age * (0.1 + random('damp-height', cell) * 0.38);
    // Dampness stays near the foundation, with breaks at doors and neighboring shells.
    for (let strip = 0; strip < 3; strip++) {
      const a = u + strip * 0.19, b = Math.min(surface.length, a + 0.2);
      const y = damp * (0.55 + random('damp-edge', `${cell}:${strip}`) * 0.45);
      if ([a, b, (a + b) / 2].some((d) => [0.025, y].some((h) => surface.excluded(d, h)))) continue;
      const vertices = [[a, 0.02], [b, 0.02], [b, y * 0.88], [a, y]].map(([d, h]) => surface.point(d, h, p.thickness / 2 + 0.004));
      meshes.walls.quad(...(surface.clockwise ? vertices.toReversed() : vertices), [0.72, 0.76, 0.68]);
    }
    if (p.surface !== 'plaster' || random('plaster-present', cell) > age * 0.55) continue;
    const y = 0.5 + random('plaster-height', cell) * Math.min(p.height - 0.8, 2.1);
    const radius = 0.09 + random('plaster-radius', cell) * age * 0.19;
    const local = Array.from({ length: 9 }, (_, i) => {
      const angle = i / 9 * Math.PI * 2, r = radius * (0.6 + random('plaster-edge', `${cell}:${i}`) * 0.4);
      return [u + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.72];
    });
    if (local.some(([d, h]) => d < 0 || d > surface.length || h < 0 || h > p.height || surface.excluded(d, h))) continue;
    const center = surface.point(u, y, p.thickness / 2 + 0.008);
    const points = local.map(([d, h]) => surface.point(d, h, p.thickness / 2 + 0.008));
    for (let i = 0; i < points.length; i++) {
      const edge = [points[i], points[(i + 1) % points.length]];
      meshes.walls.triangle(center, ...(surface.clockwise ? edge.toReversed() : edge), [0.69, 0.68, 0.62]);
    }
  }
}
