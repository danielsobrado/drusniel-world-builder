/**
 * Which kit a resident town draws with.
 *
 * Close up a town uses the full medieval kit (carved jetty brackets, voussoirs,
 * chamfered timber, lantern finials). Past `farDistance` from the town's nearest
 * edge it swaps to the light far kit, which shares module names and materials
 * but none of the small detail.
 *
 * The switch is per town, not per building: measured in Wyle, splitting a town
 * into a near ring and a far remainder drew both kits' meshes at once (+230 draw
 * calls with the shadow passes) and cost more frames than the triangles it
 * saved. The hysteresis band keeps a viewer hovering at the threshold from
 * flipping a town every frame.
 */
export const TOWN_LOD_NEAR = 0;
export const TOWN_LOD_FAR = 1;

export const TOWN_LOD_DEFAULTS = Object.freeze({
  farDistance: 100,
  hysteresis: 20,
  /** Interiors (floors, stairs, furniture) draw only within this radius of the viewer. */
  interiorRadius: 36,
  /** Metres the viewer moves before a town re-picks its nearby interiors. */
  interiorRefresh: 6,
});

/**
 * @param {number} current TOWN_LOD_NEAR or TOWN_LOD_FAR
 * @param {number} edgeDistance metres from the viewer to the town's nearest edge
 * @param {{farDistance:number, hysteresis:number}} [options]
 */
export function selectTownLod(current, edgeDistance, options = TOWN_LOD_DEFAULTS) {
  const { farDistance, hysteresis } = options;
  if (current === TOWN_LOD_FAR) {
    return edgeDistance < farDistance - hysteresis ? TOWN_LOD_NEAR : TOWN_LOD_FAR;
  }
  return edgeDistance > farDistance + hysteresis ? TOWN_LOD_FAR : TOWN_LOD_NEAR;
}

/** Metres from (x, z) to the edge of a town of radius `reach` anchored at `anchor`. */
export function townEdgeDistance(anchor, reach, x, z) {
  return Math.max(0, Math.hypot(anchor.x - x, anchor.z - z) - reach);
}

/** Whether a viewer at (x, z) has moved `distance` metres from the last pick point. */
export function needsRefresh(last, x, z, distance) {
  return !last || Math.hypot(last.x - x, last.z - z) >= distance;
}

/**
 * Indices of packed [x, y, z, yaw] placements within `radius` of (x, z) on the
 * ground plane, written into `out`; returns how many.
 */
export function placementsWithin(values, x, z, radius, out) {
  const radiusSq = radius * radius;
  let count = 0;
  for (let i = 0, n = values.length / 4; i < n; i += 1) {
    const dx = values[i * 4] - x;
    const dz = values[i * 4 + 2] - z;
    if (dx * dx + dz * dz <= radiusSq) out[count++] = i;
  }
  return count;
}
