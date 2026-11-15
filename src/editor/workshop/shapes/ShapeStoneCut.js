import { stoneJitter, stoneQuadCorners, irregularityAmount } from '../ProceduralWorkshopIrregularity.js';
import { shapeRandom } from './ShapeMesh.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Stone category for the shared irregularity budget: crowns and ashlar stay crisper than field stone. */
export function shapeStoneCategory(plan, domain) {
  if (domain === 'crown') return 'merlon';
  return plan.primitive.stonework === 'ashlar' ? 'ashlar' : 'field';
}

/**
 * The hand-cut shape of one course cell, drawn from `stoneJitter`/`stoneQuadCorners` so it shares
 * the recipe's irregularity budget (04-…md §8, §19). Everything stays inside the cell the course
 * packer assigned: corners only move inwards (uneven joints), the face only rises or sinks a
 * little, and the face is faceted around an off-centre crown rather than noise-displaced.
 *
 * Returns insets for the stone's edges, its protrusion, bevel size and a `relief(u, y)` lift.
 */
export function shapeStoneCut(recipe, plan, domain, key, left, right, y0, y1) {
  const category = shapeStoneCategory(plan, domain), amount = irregularityAmount(recipe, category);
  const index = Math.floor(shapeRandom(recipe.seed, plan.id, `${domain}-stone`, key) * 0x7fffffff);
  const width = right - left, height = y1 - y0, halfW = width / 2, halfH = height / 2;
  const shaped = stoneJitter(recipe, { width, height, depth: 0.22 }, index, category);
  const corners = stoneQuadCorners(recipe, {}, shaped, index, category);
  // Inward-only corner moves: [bottom-left, bottom-right, top-right, top-left] as (u, y) insets.
  // Field stone is rough-dressed: wider, more uneven joints and a fuller crown than cut ashlar.
  const rough = category === 'field' ? 1.45 : 1;
  const maxU = Math.min(0.05 * rough, width * 0.12 * rough), maxY = Math.min(0.035 * rough, height * 0.14 * rough);
  const inset = corners.map(([x, y], i) => [
    clamp((i === 0 || i === 3 ? x + halfW : halfW - x) * 1.6, 0, maxU),
    clamp((i < 2 ? y + halfH : halfH - y) * 1.6, 0, maxY),
  ]);
  const random = (lane) => shapeRandom(recipe.seed, plan.id, `${domain}-facet-${lane}`, key);
  // Off-centre crown of the face, a leaning face plane and a bulge proportional to the stone.
  const crownU = left + width * (0.32 + random('u') * 0.36), crownY = y0 + height * (0.3 + random('y') * 0.4);
  const bulge = Math.min(width, height) * (0.05 + random('bulge') * 0.09) * (0.35 + amount) * rough;
  const leanU = (random('lean-u') - 0.5) * 0.09 * amount, leanY = (random('lean-y') - 0.5) * 0.11 * amount;
  const relief = (u, y) => {
    const tu = 1 - Math.abs(u - crownU) / Math.max(1e-3, u < crownU ? crownU - left : right - crownU);
    const ty = 1 - Math.abs(y - crownY) / Math.max(1e-3, y < crownY ? crownY - y0 : y1 - crownY);
    // Bounded so a stone never reaches past the course ceiling's reach (ShapeMasonryCourses CELL_RELIEF).
    return clamp(bulge * clamp(Math.min(tu, ty), 0, 1) + leanU * (u - crownU) + leanY * (y - crownY), -0.01, 0.07);
  };
  return {
    inset,
    protrusion: clamp(shaped.protrusion * 1.4 * rough, -0.012, 0.03 * rough),
    bevel: clamp(shaped.bevelRatio * Math.min(width, height) * 0.55, 0.014, 0.045),
    relief,
    crown: [crownU, crownY],
  };
}
