import { shapeRandom } from './ShapeMesh.js';
import { irregularityAmount } from '../ProceduralWorkshopIrregularity.js';
import { shapeStoneCategory } from './ShapeStoneCut.js';

const SPLIT_GAP = 0.012;

/**
 * The stones of one masonry course, laid by bonding rules a mason would follow rather than a
 * uniform grid (04-…md §8, §19):
 * - lengths vary within a band set by the recipe irregularity, with occasional short headers;
 * - footing courses (the first two) use longer stones;
 * - every head joint laps the joints of the course below by at least `lap`;
 * - a closed course closes exactly on itself, so a tower has no seam;
 * - some short stones are split into two stacked half-height blocks;
 * - with age, some stones sit sunk back and, in field stone, a few have fallen out.
 *
 * Returns `{ stones: [{ left, right, index, layers: [[y0, y1, suffix]], sunk, missing }], joints }`,
 * where `joints` (wrapped onto the loop when closed) feeds the next course's lap rule.
 */
export function shapeCourseStones({ recipe, plan, domain, key, row, rows, length, closed, cellWidth, below, y0, y1 }) {
  // Even fine ashlar is cut by hand: stone lengths always vary a little, never a perfect grid.
  const category = shapeStoneCategory(plan, domain), amount = Math.max(0.3, irregularityAmount(recipe, category));
  const age = plan.primitive.age ?? 0.22, field = category === 'field';
  const random = (lane, i) => shapeRandom(recipe.seed, plan.id, `${domain}-bond-${lane}`, `${key}${row}:${i}`);
  const footing = row < 2 ? 1.22 : 1;
  const min = cellWidth * (0.72 - 0.22 * amount) * footing, max = cellWidth * (1.28 + 0.5 * amount) * footing;
  const lap = Math.min(0.16, cellWidth * 0.24);
  // Signed offset from x to a joint below; on a closed course measured the short way round the seam.
  const offset = (j, x) => {
    const d = j - x;
    return closed ? d - Math.round(d / length) * length : d;
  };
  const near = (x) => below.map((j) => offset(j, x)).find((d) => Math.abs(d) < lap);
  const start = closed ? random('start', 0) * cellWidth : -random('start', 0) * cellWidth * 0.9;
  const end = closed ? start + length : length + cellWidth;
  const stones = [];
  let x = start;
  for (let i = 0; x < end - 1e-6 && i < 400; i++) {
    const header = random('header', i) < 0.07 + 0.1 * amount;
    let right = x + (header ? cellWidth * (0.42 + random('w', i) * 0.14) : min + random('w', i) * (max - min));
    // Lap rule: never stack a head joint on the one below; prefer stretching, else shortening.
    const clash = near(right);
    if (clash !== undefined) {
      const longer = right + clash + lap, shorter = right + clash - lap;
      right = longer - x <= max * 1.25 ? longer : shorter - x >= cellWidth * 0.38 ? shorter : right;
    }
    if (closed && end - right < min * 0.55) right = end;
    stones.push({ left: x, right: Math.min(right, end), index: i });
    x = Math.min(right, end);
  }
  if (closed && stones.length > 1 && stones.at(-1).right - stones.at(-1).left < cellWidth * 0.3) {
    stones.at(-2).right = stones.pop().right;
  }
  const height = y1 - y0;
  for (const stone of stones) {
    const i = stone.index, short = stone.right - stone.left <= cellWidth * 1.05;
    const split = short && height >= 0.2 && random('split', i) < (field ? 0.06 + 0.12 * amount : 0.02 + 0.05 * amount);
    const at = y0 + height * (0.38 + random('split-at', i) * 0.24);
    stone.layers = split ? [[y0, at - SPLIT_GAP / 2, ':a'], [at + SPLIT_GAP / 2, y1, ':b']] : [[y0, y1, '']];
    stone.sunk = random('sunk', i) < (0.03 + 0.09 * age) * (0.4 + amount);
    // Only a masonry shell has a stone core to show; a plinth on plaster or boards never gapes.
    stone.missing = field && plan.primitive.surface === 'masonry' && row > 0 && row < rows - 1 && age >= 0.3
      && random('missing', i) < age * 0.045 * amount;
  }
  const joints = stones.map((s) => (closed ? ((s.left % length) + length) % length : s.left)).filter((j) => closed || j > 0);
  return { stones, joints };
}
