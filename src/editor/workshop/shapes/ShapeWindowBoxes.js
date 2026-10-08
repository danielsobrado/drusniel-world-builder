import { addWallPatch } from './ShapeWallSurface.js';
import { buildShapeWindowGarden } from './ShapeWindowGarden.js';

export function buildShapeWindowBoxes(plan, meshes, recipe, surface) {
  const p = plan.primitive;
  for (const decoration of plan.decorations ?? []) {
    if (decoration.role !== 'window-box') continue;
    const source = plan.openings.find((o) => o.id === decoration.openingId);
    if (!source) continue;
    const opening = { ...source, at: decoration.at ?? source.at, bottom: decoration.bottom ?? source.bottom };
    const center = opening.at * surface.length, width = opening.width + 0.16;
    const a = center - width / 2, b = center + width / 2;
    const bottom = opening.bottom - 0.28, top = opening.bottom - 0.08;
    if ([a, center, b].some((u) => surface.excluded(u, bottom) || surface.excluded(u, top))) continue;
    const offset = p.thickness / 2 + 0.38;
    const divisions = Math.max(1, Math.ceil(width / 0.12));
    for (let segment = 0; segment < divisions; segment++) {
      const u0 = a + width * segment / divisions, u1 = a + width * (segment + 1) / divisions;
      const caps = { start: segment === 0, end: segment === divisions - 1 };
      addWallPatch(meshes.inserts, surface, u0, u1, bottom, top, offset, 0.05, [0.84, 0.85, 0.83],
        { ...caps, bevel: recipe.detail >= 2 });
      addWallPatch(meshes.inserts, surface, u0, u1, bottom, bottom + 0.04, offset, 0.33, [0.66, 0.65, 0.59], caps);
      if (recipe.detail < 2) continue;
      const left = Math.max(a + 0.06, u0), right = Math.min(b - 0.06, u1);
      if (left >= right) continue;
      const soil = [surface.point(left, top - 0.015, offset - 0.04), surface.point(right, top - 0.015, offset - 0.04),
        surface.point(right, top - 0.015, offset - 0.28), surface.point(left, top - 0.015, offset - 0.28)];
      meshes.inserts.quad(...(surface.clockwise ? soil : soil.toReversed()), [0.27, 0.26, 0.21]);
    }
    for (const edge of [a, b - 0.05])
      addWallPatch(meshes.inserts, surface, edge, edge + 0.05, bottom, top, offset, 0.33, [0.79, 0.78, 0.72]);
    for (const u of [center - width * 0.28, center + width * 0.28])
      meshes.inserts.beam(surface.point(u, bottom + 0.015, offset + 0.025), surface.point(u, top - 0.015, offset + 0.025),
        0.03, 0.025, [0.25, 0.27, 0.24]);
    if (recipe.detail < 2) continue;
    buildShapeWindowGarden(meshes.foliage, surface, { seed: recipe.seed, id: p.id, opening, a, width, top, offset });
  }
}
