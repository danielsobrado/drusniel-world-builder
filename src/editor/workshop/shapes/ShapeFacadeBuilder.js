import { createShapeWallSurface, addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { buildShapeWindowBoxes } from './ShapeWindowBoxes.js';
import { shapeAgingSurface } from './ShapeWeathering.js';
import { buildShapeShutters } from './ShapeShutterBuilder.js';

/** Timber and shutters share host frames and opening exclusions with the wall shell. */
export function buildShapeFacade(plan, meshes, recipe) {
  const p = plan.primitive,
    surface = shapeAgingSurface(createShapeWallSurface(plan), plan, recipe.seed, true),
    wood = meshes.inserts;
  const offset = p.thickness / 2 + 0.11;
  const roof = p.facade === 'timber' ? createShapeRoofSurface(plan) : null;
  const tint = (key) => {
    const v = 0.72 + shapeRandom(recipe.seed, p.id, 'timber-frame', key) * 0.22;
    return [v, v, v];
  };
  function patch(u0, u1, y0, y1, color) {
    const steps = Math.max(1, Math.ceil((u1 - u0) / 0.18));
    for (let i = 0; i < steps; i++) {
      const a = u0 + ((u1 - u0) * i) / steps,
        b = u0 + ((u1 - u0) * (i + 1)) / steps;
      for (const band of wallSolidBands(surface, a, b, y0, y1, false)) {
        const high = band.top.map((y, k) => {
          const base = surface.point(k ? b : a, p.height, offset);
          return roof ? Math.min(y, roof.heightAt(base[0], base[2]) - p.elevation - 0.06) : y;
        });
        if (high.some((y, k) => y <= band.bottom[k])) continue;
        addWallPatch(wood, surface, a, b, band.bottom, high, offset, 0.09, color, {
          start: i === 0,
          end: i === steps - 1,
          back: false,
          bevel: recipe.detail >= 2,
        });
      }
    }
  }
  if (p.facade === 'timber') {
    const belts = [0.8, p.height - 0.12];
    for (let level = 1; level < p.levels; level++) belts.push((p.height * level) / p.levels);
    for (const y of belts) patch(0, surface.length, y - 0.08, y + 0.08, tint(`belt:${y}`));
    const bays = Math.max(4, Math.round(surface.length / 2));
    for (let bay = 0; bay < bays; bay++) {
      const u = (surface.length * bay) / bays;
      patch(u - 0.065, u + 0.065, 0.7, p.height, tint(`post:${bay}`));
      const end = (surface.length * (bay + 1)) / bays;
      const startY = p.height - Math.min(1.15, p.height * 0.3),
        endY = p.height - 0.2;
      const count = Math.ceil((end - u) / 0.15);
      for (let i = 0; i < count; i++) {
        const a = u + ((end - u) * i) / count,
          b = u + ((end - u) * (i + 1)) / count;
        const y0 = startY + ((endY - startY) * i) / count,
          y1 = startY + ((endY - startY) * (i + 1)) / count;
        if ([a, b, (a + b) / 2].some((d, k) => surface.excluded(d, [y0, y1, (y0 + y1) / 2][k])))
          continue;
        wood.beam(
          surface.point(a, y0, offset - 0.03),
          surface.point(b, y1, offset - 0.03),
          0.085,
          0.09,
          tint(`brace:${bay}`),
        );
      }
    }
    // Gable posts follow the actual profiled roof rather than a guessed triangle.
    for (let bay = 0; bay < bays; bay++) {
      const u = (surface.length * bay) / bays;
      const base = surface.point(u, p.height, offset);
      const top = Math.max(p.height, roof.heightAt(base[0], base[2]) - p.elevation);
      if (!plan.roofReplaced && top - p.height > 0.1 && !surface.neighborExcluded(u, p.height - 0.01)) {
        const edge = surface.point(u, top - 0.05, offset);
        wood.beam(base, edge, 0.09, 0.09, tint('gable'));
      }
    }
  }
  buildShapeWindowBoxes(plan, meshes, recipe, surface);
  buildShapeShutters(plan, meshes, recipe, surface);
}
