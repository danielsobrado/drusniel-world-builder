import { createShapeWallSurface, addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { buildShapeOpenings } from './ShapeOpeningBuilder.js';

function shade(recipe, plan, domain, key) {
  const v = 0.84 + shapeRandom(recipe.seed, plan.id, domain, key) * 0.16;
  return [v, v, v];
}

export function buildShapeWalls(plan, meshes, recipe) {
  const surface = createShapeWallSurface(plan),
    p = plan.primitive;
  const boundaries = plan.curve.samples.map((s) => s.distance);
  const openingEdges = new Set();
  if (plan.curve.closed) boundaries.push(surface.length);
  for (const o of plan.openings ?? p.openings ?? []) {
    for (let i = 0; i <= 24; i++) {
      const d = o.at * surface.length - o.width / 2 + (o.width * i) / 24;
      const distance = plan.curve.closed
        ? ((d % surface.length) + surface.length) % surface.length
        : Math.max(0, Math.min(surface.length, d));
      boundaries.push(distance);
      if (i === 0 || i === 24) openingEdges.add(distance);
    }
  }
  const distances = [...new Set(boundaries)].sort((a, b) => a - b);
  for (let i = 0; i < distances.length - 1; i++) {
    const u0 = distances[i],
      u1 = distances[i + 1];
    for (const band of wallSolidBands(surface, u0, u1, 0, p.height)) {
      addWallPatch(
        meshes.walls,
        surface,
        u0,
        u1,
        band.bottom,
        band.top,
        p.thickness / 2,
        p.thickness,
        [1, 1, 1],
        {
          start: openingEdges.has(u0) || (!plan.curve.closed && i === 0),
          end: openingEdges.has(u1) || (!plan.curve.closed && i === distances.length - 2),
        },
      );
    }
  }
  const course = p.surface === 'planks' ? p.height : 0.34;
  const cellWidth = p.surface === 'planks' ? 0.24 : 0.62;
  const courseCount = Math.ceil(p.height / course);
  const detail = recipe.detail >= 2;
  for (let row = 0; row < courseCount; row++) {
    if (!detail && row > 0) continue;
    if (p.surface === 'plaster' && row > 1) continue;
    const y0 = row * course + 0.012,
      y1 = Math.min(p.height - 0.012, (row + 1) * course - 0.012);
    const shift = p.surface === 'planks' ? 0 : ((row % 2) * cellWidth) / 2;
    for (let cell = -1; cell < Math.ceil(surface.length / cellWidth); cell++) {
      const u0 = Math.max(0, cell * cellWidth + shift + 0.012),
        u1 = Math.min(surface.length, (cell + 1) * cellWidth + shift - 0.012);
      if (u1 - u0 < 0.08) continue;
      const mesh = p.surface === 'planks' ? meshes.inserts : meshes.trim;
      const count = Math.max(1, Math.ceil((u1 - u0) / 0.18));
      const color = shade(recipe, plan, p.surface, `${row}:${cell}`);
      const cuts = [u0, ...distances.filter((d) => d > u0 && d < u1), u1];
      for (let k = 1; k < count; k++) cuts.push(u0 + ((u1 - u0) * k) / count);
      cuts.sort((a, b) => a - b);
      for (let k = 0; k < cuts.length - 1; k++) {
        for (const band of wallSolidBands(surface, cuts[k], cuts[k + 1], y0, y1)) {
          for (const side of p.kind === 'curved-wall' ? [-1, 1] : [1]) {
            addWallPatch(
              mesh,
              surface,
              cuts[k],
              cuts[k + 1],
              band.bottom,
              band.top,
              side * (p.thickness / 2 + 0.045),
              side * 0.055,
              color,
              {
                back: false,
                start: k === 0 || openingEdges.has(cuts[k]),
                end: k === cuts.length - 2 || openingEdges.has(cuts[k + 1]),
              },
            );
          }
        }
      }
    }
  }
  // Continuous coping/eave band follows the same surface as the wall.
  for (
    let i = 0;
    i < distances.length - 1 && (p.kind === 'curved-wall' || p.roof.family === 'flat');
    i++
  ) {
    const u0 = distances[i],
      u1 = distances[i + 1];
    if (!surface.excluded((u0 + u1) / 2, p.height - 0.05))
      addWallPatch(
        meshes.trim,
        surface,
        u0,
        u1,
        p.height - 0.13,
        p.height + 0.06,
        p.thickness / 2 + 0.065,
        p.thickness + 0.13,
        [0.96, 0.96, 0.96],
      );
  }
  buildShapeOpenings(plan, meshes, recipe, surface);
  return surface;
}
