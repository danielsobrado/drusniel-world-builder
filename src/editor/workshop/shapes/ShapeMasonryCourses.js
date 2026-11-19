import { addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { shapeCellWear } from './ShapeWeathering.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { SHAPE_COURSE_HEIGHT, shapeBaseTop } from './ShapeProfile.js';
import { SHAPE_CASTLE_CONFIG } from './config/ShapeCastleConfig.generated.js';
import { shapeStoneCut } from './ShapeStoneCut.js';
import { shapeCourseStones } from './ShapeCourseBond.js';
import { hasShapeRuin } from './ShapeRuin.js';
import { getWorkshopMaterialPreset } from '../ProceduralWorkshopMaterialConfig.js';

// Furthest a course stone reaches past the wall face (base relief, bevel, protrusion, crowned face).
const CELL_RELIEF = 0.09;
const ROOF_UNDERSIDE = 0.025;

// Cool grey ashlar is a vertex tint over the shared stone slot, so it never recolours other buildings.
// The multipliers are linear and sized against the slot's base colour for each recipe stone.
const ASHLAR_TINT = Object.freeze({ granite: [1.0, 1.08, 1.35], default: [0.54, 0.67, 1.06] });
const PLAIN = Object.freeze([1, 1, 1]);

function hasPbrStoneOverride(recipe, plan) {
  const regionId = `${plan.id}:trim`;
  const presetId = recipe?.materialAreaOverrides?.[regionId] ?? recipe?.materialDefaults?.stone;
  if (!presetId) return false;
  const preset = getWorkshopMaterialPreset(recipe, presetId);
  return Boolean(preset?.pbrAsset);
}

/** Multiplier every dressed-stone tone of a shape shares, so trim never drifts from its wall. */
export function shapeStoneTint(recipe, plan) {
  if (hasPbrStoneOverride(recipe, plan)) return PLAIN;
  return plan.primitive.stonework === 'ashlar' ? ASHLAR_TINT[recipe.style] ?? ASHLAR_TINT.default : PLAIN;
}
/** Mortar seen between ashlar stones: a dark recessed joint rather than a plaster-coloured gap. */
export const SHAPE_ASHLAR_JOINT_TONE = Object.freeze([0.17, 0.25, 0.5]);

export function shapeStoneTone(recipe, plan, domain, key) {
  const random = shapeRandom(recipe.seed, plan.id, domain, key);
  const warm = shapeRandom(recipe.seed, plan.id, `${domain}-warmth`, key) - 0.5;
  if (plan.primitive.stonework === 'ashlar') {
    // Mostly even stones with the occasional darker or paler block, as in weathered ashlar.
    const v = 0.74 + random * 0.16 + (random > 0.9 ? 0.07 : random < 0.08 ? -0.1 : 0);
    const tint = shapeStoneTint(recipe, plan);
    return [tint[0] * (v + warm * 0.035), tint[1] * v, tint[2] * (v - warm * 0.035)];
  }
  const v = 0.8 + random * 0.2;
  return [v + warm * 0.04, v, v - warm * 0.04];
}

/** Masonry reads as stone at every detail level, so its uncoursed core is the stone slot. */
export function shapeWallCoreMesh(plan, meshes, recipe) {
  return plan.primitive.surface === 'masonry' && recipe.detail < 2 ? meshes.trim : meshes.walls;
}

export const SHAPE_MASONRY_CORE_TONE = Object.freeze([0.9, 0.88, 0.84]);

/**
 * Local height of the roof underside above the outer face of a course, or the wall top
 * where the host has no pitched roof. Courses stop below it at eaves and climb into gables.
 */
export function shapeMasonryCeiling(plan, surface) {
  const p = plan.primitive;
  const ruinAt = surface.ruinHeight ?? (() => p.height);
  if (!p.roof || plan.roofReplaced || !['gable', 'hip', 'shed'].includes(p.roof.family)) return ruinAt;
  const roof = createShapeRoofSurface(plan);
  return (distance) => {
    const face = surface.point(distance, p.height, p.thickness / 2 + CELL_RELIEF);
    const ceiling = roof.heightAt(face[0], face[2]) - p.elevation - ROOF_UNDERSIDE;
    return plan.ruinColumns?.length ? Math.min(ruinAt(distance), ceiling) : ceiling;
  };
}

/**
 * Lay masonry courses over one band of a wall-like surface. Stone is laid as a rule-based bond
 * (ShapeCourseBond); boards and coarse detail keep regular staggered cells. Closed loops close
 * each course on itself, so the bond runs around a tower without a seam.
 */
export function buildShapeCourseBand(plan, mesh, recipe, surface, {
  bottom = 0, top, faces, spans = null, ceiling = null, distances = [], openingEdges = new Set(),
  course = SHAPE_COURSE_HEIGHT, cellWidth = SHAPE_CASTLE_CONFIG.masonry.ashlarLength, stagger = true,
  domain = 'masonry', key = '', rows = null,
}) {
  const detail = recipe.detail >= 2, ultra = recipe.detail >= 3, length = surface.length, closed = surface.closed;
  const cells = closed ? Math.max(2, Math.round(length / cellWidth)) : Math.ceil(length / cellWidth);
  const width = closed ? length / cells : cellWidth;
  const marks = closed ? [...distances, ...distances.map((d) => d + length)] : distances;
  const cornerMarks = closed
    ? [...(surface.corners ?? []), ...(surface.corners ?? []).map((d) => d + length)]
    : (surface.corners ?? []);
  const wrap = (d) => (closed ? ((d % length) + length) % length : d);
  const windows = !spans ? [[-Infinity, Infinity]]
    : closed ? spans.flatMap(([a, b]) => [[a - length, b - length], [a, b], [a + length, b + length]]) : spans;
  const count = Math.ceil((top - bottom) / course - tolerance.length);
  // Stone (not boards, not regular cells) is laid as a rule-based bond rather than a grid.
  const bonded = detail && stagger && domain !== 'planks';
  const curveStep = ultra ? 0.12 : 0.18;

  // How far the wall (or a raking roof line above it) departs from a straight chord over [a, b].
  const bend = (a, b) => {
    const pa = surface.point(a, 0, 0), pb = surface.point(b, 0, 0), pm = surface.point((a + b) / 2, 0, 0);
    const chord = Math.hypot(pm[0] - (pa[0] + pb[0]) / 2, pm[2] - (pa[2] + pb[2]) / 2);
    return ceiling ? Math.max(chord, Math.abs(ceiling((a + b) / 2) - (ceiling(a) + ceiling(b)) / 2) / 3) : chord;
  };
  // A stone is only cut at a mark where an opening actually crosses its own course; curvature is
  // followed by subdivision below. Cutting every course at every opening edge and curve sample
  // scored false joints and sliver bevels through whole stones.
  const needsCut = (d, y0, y1) => [-0.004, 0.004].some((s) => surface.gaps(wrap(d + s)).some((g) => g.bottom < y1 && g.top > y0));

  const layStone = (left, right, y0, y1, cellKey, sunk) => {
    const color = shapeStoneTone(recipe, plan, domain, cellKey);
    // Hand-cut stones: uneven joints, own protrusion, faceted crowned face.
    const stone = detail && domain !== 'planks' ? shapeStoneCut(recipe, plan, domain, cellKey, left, right, y0, y1) : null;
    const protrusion = sunk ? -0.022 : stone?.protrusion ?? 0;
    const along = (u) => Math.max(0, Math.min(1, (u - left) / (right - left)));
    const bedInset = (u) => (stone ? stone.inset[0][1] + (stone.inset[1][1] - stone.inset[0][1]) * along(u) : 0);
    const capInset = (u) => (stone ? stone.inset[3][1] + (stone.inset[2][1] - stone.inset[3][1]) * along(u) : 0);
    for (const [from, to] of windows) {
      const u0 = Math.max(closed ? left : Math.max(0, left), from),
        u1 = Math.min(closed ? right : Math.min(length, right), to);
      if (u1 - u0 < 0.08) continue;
      const marked = [
        u0,
        ...marks.filter((d) => d > u0 && d < u1 && needsCut(d, y0, y1)),
        ...cornerMarks.filter((d) => d > u0 + 1e-4 && d < u1 - 1e-4),
        u1,
      ].sort((a, b) => a - b);
      const cuts = [...marked];
      // Follow a curved wall or raking roof line with short pieces; a flat run stays one stone.
      for (let k = 0; k < marked.length - 1; k++) {
        const a = marked[k], b = marked[k + 1], pieces = bend(a, b) > 0.003 ? Math.ceil((b - a) / curveStep) : 1;
        for (let n = 1; n < pieces; n++) cuts.push(a + ((b - a) * n) / pieces);
      }
      cuts.sort((a, b) => a - b);
      const wear = shapeCellWear(plan, recipe.seed, cellKey);
      for (let k = 0; k < cuts.length - 1; k++) {
        // A stone is chipped at its own corners only, never along the cuts that bend it round a curve.
        const first = k === 0, last = k === cuts.length - 2;
        const chips = [first ? wear[0] : 0, last ? wear[1] : 0, last ? wear[2] : 0, first ? wear[3] : 0];
        // Head joints open by the stone's own corner insets; inner cuts that bend it round a curve stay put.
        const c0 = cuts[k] + (stone && first ? (stone.inset[0][0] + stone.inset[3][0]) / 2 : 0);
        const c1 = cuts[k + 1] - (stone && last ? (stone.inset[1][0] + stone.inset[2][0]) / 2 : 0);
        if (c1 - c0 < 1e-3) continue;
        // Courses stop under the eave and climb a gable, following the roof underside.
        const roofed = ceiling ? [ceiling(c0) - 0.012, ceiling(c1) - 0.012] : [y1, y1];
        for (const band of wallSolidBands(surface, c0, c1, y0, y1, false)) {
          const high = band.top.map((value, i) => Math.min(value, roofed[i]) - capInset(i ? c1 : c0));
          const low = band.bottom.map((value, i) => Math.min(value + bedInset(i ? c1 : c0), high[i]));
          if (Math.max(high[0] - low[0], high[1] - low[1]) < 0.04) continue;
          for (const face of faces) {
            addWallPatch(mesh, surface, c0, c1, low, high, face.offset + Math.sign(face.thickness) * protrusion, face.thickness, color, {
              back: false,
              bevel: detail,
              ...(stone ? { bevelSize: stone.bevel, relief: stone.relief, crown: stone.crown } : {}),
              wear: chips,
              start: k === 0 || openingEdges.has(wrap(cuts[k])),
              end: k === cuts.length - 2 || openingEdges.has(wrap(cuts[k + 1])),
            });
          }
        }
      }
    }
  };

  let below = [];
  for (let row = 0; row < count; row++) {
    if (rows && !rows(row)) continue;
    const y0 = bottom + row * course + 0.012,
      y1 = Math.min(top - 0.012, bottom + (row + 1) * course - 0.012);
    if (bonded) {
      const laid = shapeCourseStones({ recipe, plan, domain, key, row, rows: count, length, closed, cellWidth, below, y0, y1 });
      below = laid.joints;
      for (const stone of laid.stones) {
        if (stone.missing) continue;
        for (const [ly0, ly1, suffix] of stone.layers)
          layStone(stone.left + 0.012, stone.right - 0.012, ly0, ly1, `${key}${row}:${stone.index}${suffix}`, stone.sunk);
      }
      continue;
    }
    const shift = stagger ? ((row % 2) * width) / 2 : 0;
    for (let cell = closed ? 0 : -1; cell < cells; cell++)
      layStone(cell * width + shift + 0.012, (cell + 1) * width + shift - 0.012, y0, y1, `${key}${row}:${cell}`, false);
  }
}

export function buildShapeMasonryCourses(plan, meshes, recipe, surface, distances, openingEdges) {
  const p = plan.primitive, planks = p.surface === 'planks';
  const ceiling = p.surface === 'masonry' ? shapeMasonryCeiling(plan, surface) : () => p.height;
  const detail = recipe.detail >= 2;
  const baseRows = Math.max(2, Math.ceil(shapeBaseTop(p) / SHAPE_COURSE_HEIGHT));
  const twoSided = p.kind === 'curved-wall' || (p.surface === 'masonry' && hasShapeRuin(p));
  buildShapeCourseBand(plan, planks ? meshes.inserts : meshes.trim, recipe, surface, {
    top: Math.max(p.height, ...distances.map(ceiling)),
    faces: (twoSided ? [-1, 1] : [1]).map((side) => ({ offset: side * (p.thickness / 2 + 0.045), thickness: side * 0.055 })),
    ceiling, distances, openingEdges, domain: p.surface,
    course: planks ? p.height : SHAPE_COURSE_HEIGHT, cellWidth: planks ? 0.24 : undefined, stagger: !planks,
    rows: (row) => (detail || row === 0) && !(p.surface === 'plaster' && (row >= baseRows || p.grounded === false)),
  });
}
