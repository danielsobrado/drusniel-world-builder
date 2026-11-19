import { createShapeWallSurface, addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { buildShapeOpenings } from './ShapeOpeningBuilder.js';
import { buildShapeWeathering, shapeAgingSurface } from './ShapeWeathering.js';
import { buildShapePavilionInterior } from './ShapePavilionInterior.js';
import { buildShapeMasonryCourses, shapeStoneTint, shapeWallCoreMesh, SHAPE_MASONRY_CORE_TONE, SHAPE_ASHLAR_JOINT_TONE } from './ShapeMasonryCourses.js';
import { shapeBaseTop, shapeProfileBreaks } from './ShapeProfile.js';
import { buildShapePlinthWaterTable, buildShapeCornerQuoins, buildShapeBeltCourses } from './ShapeWallTrim.js';
import { hasShapeRuin } from './ShapeRuin.js';

export function buildShapeWalls(plan, meshes, recipe) {
  const surface = shapeAgingSurface(createShapeWallSurface(plan), plan, recipe.seed, plan.primitive.surface === 'planks'),
    p = plan.primitive;
  const boundaries = plan.curve.samples.map((s) => s.distance);
  for (const col of plan.ruinColumns ?? []) boundaries.push(col.u0, col.u1);
  const openingEdges = new Set();
  if (plan.curve.closed) boundaries.push(surface.length);
  for (const o of plan.openings ?? p.openings ?? []) {
    // Narrow loops need only a few cuts; 24 across an arrow slit would shred its stones into slivers.
    const steps = Math.max(2, Math.min(24, Math.ceil(o.width / 0.03)));
    for (let i = 0; i <= steps; i++) {
      const d = o.at * surface.length - o.width / 2 + (o.width * i) / steps;
      const distance = plan.curve.closed
        ? ((d % surface.length) + surface.length) % surface.length
        : Math.max(0, Math.min(surface.length, d));
      boundaries.push(distance);
      if (i === 0 || i === steps) openingEdges.add(distance);
    }
  }
  const distances = [...new Set(boundaries)].sort((a, b) => a - b);
  const core = shapeWallCoreMesh(plan, meshes, recipe);
  const sections = [0, ...shapeProfileBreaks(p), p.height];
  const coreTone = core !== meshes.walls ? SHAPE_MASONRY_CORE_TONE
    : p.surface === 'masonry' && p.stonework === 'ashlar' ? SHAPE_ASHLAR_JOINT_TONE : [1, 1, 1];
  const stoneTone = shapeStoneTint(recipe, plan).map((c) => c * 0.88);
  const ruined = hasShapeRuin(p);
  for (let i = 0; i < distances.length - 1; i++) {
    const u0 = distances[i],
      u1 = distances[i + 1];
    const mid = (u0 + u1) / 2;
    const ruinCap = ruined ? surface.ruinHeight(mid) : p.height;
    const prevCap = ruined ? surface.ruinHeight(u0 - 1e-4) : p.height;
    const nextCap = ruined ? surface.ruinHeight(u1 + 1e-4) : p.height;
    for (let s = 0; s < sections.length - 1; s++) {
      const secBottom = sections[s] + (s ? 1e-4 : 0);
      const secTop = Math.min(ruinCap, sections[s + 1] - (s < sections.length - 2 ? 1e-4 : 0));
      if (secTop <= secBottom + 1e-4) continue;
      for (const band of wallSolidBands(surface, u0, u1, secBottom, secTop, false)) {
        const stoneFooting = p.surface === 'masonry' || (p.base?.style !== 'none' && sections[s] < shapeBaseTop(p));
        addWallPatch(
          core,
          surface,
          u0,
          u1,
          band.bottom,
          band.top,
          p.thickness / 2,
          p.thickness,
          coreTone,
          {
            ...(stoneFooting ? { sideMesh: meshes.trim, sideColor: stoneTone } : {}),
            start: openingEdges.has(u0) || (!plan.curve.closed && i === 0) || (ruined && prevCap < ruinCap - 0.02),
            end: openingEdges.has(u1) || (!plan.curve.closed && i === distances.length - 2) || (ruined && nextCap < ruinCap - 0.02),
          },
        );
      }
    }
    if (ruined && ruinCap < p.height - 1e-4) {
      addWallPatch(
        meshes.trim,
        surface,
        u0,
        u1,
        Math.max(0.05, ruinCap - 0.08),
        ruinCap + 0.015,
        p.thickness / 2 + 0.045,
        p.thickness + 0.09,
        stoneTone,
        { bevel: recipe.detail >= 2, start: prevCap < ruinCap - 0.02, end: nextCap < ruinCap - 0.02 },
      );
    }
  }
  buildShapeMasonryCourses(plan, meshes, recipe, surface, distances, openingEdges);
  buildShapePlinthWaterTable(plan, meshes, recipe, surface, distances);
  buildShapeCornerQuoins(plan, meshes, recipe, surface);
  buildShapeBeltCourses(plan, meshes, recipe, surface, distances);
  // Continuous coping/eave band follows the same surface as the wall.
  for (
    let i = 0;
    i < distances.length - 1 && !plan.crown && (p.kind === 'curved-wall' || p.roof.family === 'flat');
    i++
  ) {
    const u0 = distances[i],
      u1 = distances[i + 1];
    if (ruined && surface.ruinHeight((u0 + u1) / 2) < p.height - 1e-4) continue;
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
  buildShapePavilionInterior(plan, meshes, recipe, surface, distances);
  buildShapeWeathering(plan, meshes, recipe, surface);
  return surface;
}
