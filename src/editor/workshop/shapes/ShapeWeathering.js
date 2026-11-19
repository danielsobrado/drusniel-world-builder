import { shapeRandom } from './ShapeMesh.js';
import { addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { shapeStoneTint } from './ShapeMasonryCourses.js';

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

/** Small, irregular loss of finish, exposed rubble patches, and dampness use shared exclusions. */
export function buildShapeWeathering(plan, meshes, recipe, surface) {
  const p = plan.primitive, age = p.age;
  if (age <= 0 || recipe.detail < 2) return;
  const random = (domain, key) => shapeRandom(recipe.seed, p.id, domain, key);
  const dress = shapeStoneTint(recipe, plan);
  for (let cell = 0; cell * 0.65 < surface.length; cell++) {
    const u = cell * 0.65 + 0.12;
    const grounded = p.grounded !== false && p.elevation < 0.2;
    const a0 = surface.point(u, 0.1), n0 = surface.point(u, 0.1, 1);
    const shelter = 0.5 + 0.5 * Math.max(0, (n0[2] - a0[2]) * 0.8 - (n0[0] - a0[0]) * 0.6);
    const damp = grounded ? age * shelter * (0.1 + random('damp-height', cell) * 0.38) : 0;
    // Dampness stays near the foundation, with breaks at doors and neighboring shells.
    for (let strip = 0; strip < (grounded ? 3 : 0); strip++) {
      const a = u + strip * 0.19, b = Math.min(surface.length, a + 0.2);
      const y = damp * (0.55 + random('damp-edge', `${cell}:${strip}`) * 0.45);
      if ([a, b, (a + b) / 2].some((d) => [0.025, y].some((h) => surface.excluded(d, h)))) continue;
      const vertices = [[a, 0.02], [b, 0.02], [b, y * 0.88], [a, y]].map(([d, h]) => surface.point(d, h, p.thickness / 2 + 0.004));
      meshes.walls.quad(...(surface.clockwise ? vertices.toReversed() : vertices), [0.72, 0.76, 0.68]);
    }
    const exposedRubble = (p.surface === 'masonry' && p.stonework === 'ashlar') || p.surface === 'plaster';
    if (exposedRubble && meshes.trim && age >= 0.25 && random('rubble-patch', cell) < age * 0.42) {
      const baseY = 0.28 + random('rubble-y', cell) * Math.max(0.4, Math.min(p.height - 0.65, 1.6));
      const count = 3 + Math.floor(random('rubble-count', cell) * 4);
      for (let s = 0; s < count; s++) {
        const sw = 0.18 + random('rubble-w', `${cell}:${s}`) * 0.22;
        const sh = 0.14 + random('rubble-h', `${cell}:${s}`) * 0.14;
        const su = u + (random('rubble-du', `${cell}:${s}`) - 0.5) * 0.42;
        const sy = baseY + (s % 2) * 0.16 + (random('rubble-dy', `${cell}:${s}`) - 0.3) * 0.14;
        const a = Math.max(0.05, su - sw / 2), b = Math.min(surface.length - 0.05, su + sw / 2);
        if (b - a < 0.08 || sy < 0.08 || sy + sh > p.height - 0.12) continue;
        if ([a, b, (a + b) / 2].some((d) => [sy, sy + sh].some((h) => surface.excluded(d, h)))) continue;
        const bands = wallSolidBands(surface, a, b, sy, sy + sh, true);
        if (bands.length !== 1) continue;
        const proud = 0.048 + random('rubble-out', `${cell}:${s}`) * 0.032;
        const v = 0.78 + random('rubble-tone', `${cell}:${s}`) * 0.22;
        addWallPatch(meshes.trim, surface, a, b, sy, sy + sh, p.thickness / 2 + proud, proud + 0.01,
          dress.map((c) => c * v), { back: false, bevel: true, bevelSize: 0.022 });
      }
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
