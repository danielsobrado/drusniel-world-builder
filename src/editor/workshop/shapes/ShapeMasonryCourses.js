import { addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { shapeCellWear } from './ShapeWeathering.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

const CELL_RELIEF = 0.1;
const ROOF_UNDERSIDE = 0.07;

function shade(recipe, plan, domain, key) {
  const v = 0.8 + shapeRandom(recipe.seed, plan.id, domain, key) * 0.2;
  const warm = shapeRandom(recipe.seed, plan.id, `${domain}-warmth`, key) - 0.5;
  return [v + warm * 0.04, v, v - warm * 0.04];
}

/** Masonry reads as stone at every detail level, so its uncoursed core is the stone slot. */
export function shapeWallCoreMesh(plan, meshes, recipe) {
  return plan.primitive.surface === 'masonry' && recipe.detail < 2 ? meshes.trim : meshes.walls;
}

export const SHAPE_COARSE_MASONRY_TONE = Object.freeze([0.9, 0.88, 0.84]);

/**
 * Local height of the roof underside above the outer face of a course, or the wall top
 * where the host has no pitched roof. Courses stop below it at eaves and climb into gables.
 */
export function shapeMasonryCeiling(plan, surface) {
  const p = plan.primitive;
  if (!p.roof || plan.roofReplaced || !['gable', 'hip'].includes(p.roof.family)) return () => p.height;
  const roof = createShapeRoofSurface(plan);
  return (distance) => {
    const face = surface.point(distance, p.height, p.thickness / 2 + CELL_RELIEF);
    return roof.heightAt(face[0], face[2]) - p.elevation - ROOF_UNDERSIDE;
  };
}

export function buildShapeMasonryCourses(plan, meshes, recipe, surface, distances, openingEdges) {
  const p = plan.primitive;
  const ceiling = p.surface === 'masonry' ? shapeMasonryCeiling(plan, surface) : () => p.height;
  const course = p.surface === 'planks' ? p.height : 0.34;
  const cellWidth = p.surface === 'planks' ? 0.24 : 0.62;
  const detail = recipe.detail >= 2;
  const peak = Math.max(p.height, ...distances.map(ceiling));
  const courseCount = Math.ceil(peak / course - tolerance.length);
  for (let row = 0; row < courseCount; row++) {
    if (!detail && row > 0) continue;
    if (p.surface === 'plaster' && row > 1) continue;
    const y0 = row * course + 0.012,
      y1 = Math.min(peak - 0.012, (row + 1) * course - 0.012);
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
        // Courses stop under the eave and climb a gable, following the roof underside.
        const roofed = [ceiling(cuts[k]) - 0.012, ceiling(cuts[k + 1]) - 0.012];
        for (const band of wallSolidBands(surface, cuts[k], cuts[k + 1], y0, y1, false)) {
          const top = band.top.map((value, i) => Math.min(value, roofed[i]));
          const bottom = band.bottom.map((value, i) => Math.min(value, top[i]));
          if (Math.max(top[0] - bottom[0], top[1] - bottom[1]) < 0.04) continue;
          for (const side of p.kind === 'curved-wall' ? [-1, 1] : [1]) {
            addWallPatch(mesh, surface, cuts[k], cuts[k + 1], bottom, top,
              side * (p.thickness / 2 + 0.045), side * 0.055, color, {
                back: false,
                bevel: detail,
                wear: shapeCellWear(plan, recipe.seed, `${row}:${cell}`),
                start: k === 0 || openingEdges.has(cuts[k]),
                end: k === cuts.length - 2 || openingEdges.has(cuts[k + 1]),
              });
          }
        }
      }
    }
  }
}
