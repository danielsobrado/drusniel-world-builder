/**
 * Round-tower proportions from a recipe, shared by the generator, its stone
 * estimate and its opening layout so the three never disagree.
 *
 * For the castle archetypes `depth` is a factor, not metres. It is clamped so a
 * value carried over from a house (6 m) cannot turn every course into
 * 3.5 m-deep stones jutting out of the wall under a roof twice the tower's width.
 */
const ROUND_WALL_DEPTH = Object.freeze({ min: 0.5, max: 1.25 });

export function roundTowerDimensions(recipe) {
  const depth = Math.min(ROUND_WALL_DEPTH.max, Math.max(ROUND_WALL_DEPTH.min, recipe.depth * 0.58));
  const radius = Math.max(1, recipe.width / 2 - depth * 0.22);
  return { depth, radius };
}

/** The gatehouse's two flanking towers. */
export function gatehouseTowerDimensions(recipe) {
  return {
    depth: Math.min(1.2, Math.max(0.48, recipe.depth * 0.55)),
    radius: Math.min(2.6, Math.max(1.05, recipe.depth * 0.72)),
    height: recipe.height * 1.16,
  };
}
