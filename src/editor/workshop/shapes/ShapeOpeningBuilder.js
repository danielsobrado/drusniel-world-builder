import { addWallPatch } from './ShapeWallSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { buildShapeOpeningCraft } from './ShapeOpeningCraft.js';

export function buildShapeOpenings(plan, meshes, recipe, surface) {
  const p = plan.primitive;
  const trim = (u0, u1, y0, y1, offset, thickness, color, caps) => {
    for (const side of p.kind === 'curved-wall' ? [-1, 1] : [1])
      addWallPatch(
        meshes.trim,
        surface,
        u0,
        u1,
        y0,
        y1,
        offset * side,
        thickness * side,
        color,
        { bevel: recipe.detail >= 2, ...caps },
      );
  };
  for (const o of plan.openings ?? p.openings ?? []) {
    const center = o.at * surface.length,
      half = o.width / 2;
    const radius = o.profile === 'square' ? 0 : Math.min(o.width / 2, o.height * 0.4);
    for (const side of [-1, 1])
      trim(
        center + side * half - 0.07,
        center + side * half + 0.07,
        o.bottom,
        Math.min(p.height, o.bottom + o.height - radius),
        p.thickness / 2 + 0.075,
        0.09,
        [1, 1, 1],
      );
    const steps = o.role === 'door' ? Math.max(8, Math.ceil(o.width / 0.12)) : 24;
    for (let i = 0; i < steps; i++) {
      const u0 = center - half + (o.width * i) / steps,
        u1 = center - half + (o.width * (i + 1)) / steps;
      const top = [u0, u1].map(
        (u) => surface.gaps(u).find((g) => g.opening.id === o.id)?.top ?? o.bottom + o.height,
      );
      if (!(o.profile === 'square' && o.bottom + o.height >= p.height))
        trim(
          u0 + (o.role === 'door' ? 0.004 : 0),
          u1 - (o.role === 'door' ? 0.004 : 0),
          top,
          top.map((y) => Math.min(p.height, y + 0.13)),
          p.thickness / 2 + 0.075,
          0.09,
          [1, 1, 1],
          { start: i === 0, end: i === steps - 1 },
        );
      if (o.role !== 'arch') {
        const mesh = o.role === 'door' ? meshes.inserts : meshes.glazing;
        const tint =
          o.role === 'door'
            ? 0.72 + shapeRandom(recipe.seed, plan.id, 'door-planks', `${o.id}:${i}`) * 0.2
            : 0.85;
        addWallPatch(
          mesh,
          surface,
          u0 + (o.role === 'door' ? 0.004 : 0),
          u1 - (o.role === 'door' ? 0.004 : 0),
          o.bottom + 0.03,
          top.map((y) => y - 0.04),
          0,
          0.025,
          [tint, tint, tint],
        );
      }
    }
    buildShapeOpeningCraft(o, meshes, surface, recipe);
    if (o.role === 'window') {
      trim(
        center - half - 0.16,
        center + half + 0.16,
        o.bottom - 0.08,
        o.bottom + 0.02,
        p.thickness / 2 + 0.16,
        0.23,
        [1, 1, 1],
      );
      meshes.inserts.beam(
        surface.point(center, o.bottom + 0.03, 0.045),
        surface.point(center, Math.min(p.height, o.bottom + o.height) - 0.04, 0.045),
        0.06,
        0.06,
        [1, 1, 1],
      );
      meshes.inserts.beam(
        surface.point(center - half, o.bottom + o.height * 0.5, 0.045),
        surface.point(center + half, o.bottom + o.height * 0.5, 0.045),
        0.055,
        0.055,
        [1, 1, 1],
      );
    }
  }
}
