/** grass-test RiverDetails' footprint seating, in canonical metres. */
export function fitRockToGround(placement, footprint, heightAt) {
  const reach = Math.max(0.4, footprint * placement.scale * 0.45);
  const heights = [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]]
    .map(([dx, dz]) => heightAt(placement.x + dx, placement.z + dz));
  if (!heights.every(Number.isFinite)) return null;
  const low = Math.min(...heights), high = Math.max(...heights);
  // A boulder spanning an unsupported cliff is rejected rather than buried
  // through the entire bank. Ordinary slopes seat toward the lowest support.
  if (high - low > reach * 2 * 1.2) return null;
  return { groundFitHeight: heights[0] - (heights[0] - low) * 0.7 };
}
