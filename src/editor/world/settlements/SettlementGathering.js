import { planToWorld } from './view/SettlementPlacements.js';

/** Places of trade whose doors draw a few people. */
const DOOR_KINDS = new Set(['tavern', 'shop', 'bakery', 'smithy', 'chapel']);

/**
 * Where a settlement's people are to be found, best first, in canonical metres:
 * in front of the market stalls, by the well, on the benches, at the doors of
 * the tavern and the shops, then out along the main streets.
 *
 * Residents used to stand on a ring round the burg's centre point, whatever was
 * there. These are the spots a plan actually gives them. Pure data. Each spot names
 * its `kind` (stall, square, bench, the building kind at a door, street), so the
 * simulator's named people can stand where their work is.
 */
export function gatheringSpots(settlement, plan, tileSize) {
  const spots = [];
  const add = (x, z, kind) => spots.push({ ...planToWorld(settlement, tileSize, x, z), kind });
  for (const prop of plan.props) {
    // A stall faces the middle of the square: its customers stand on that side.
    if (prop.kind === 'stall') add(prop.x + Math.sin(prop.yaw) * 1.9, prop.z + Math.cos(prop.yaw) * 1.9, 'stall');
  }
  for (const square of plan.squares ?? []) add(square.x + 2.6, square.z + 1.2, 'square');
  for (const prop of plan.props) {
    if (prop.kind === 'bench') add(prop.x + Math.sin(prop.yaw) * 0.9, prop.z + Math.cos(prop.yaw) * 0.9, 'bench');
  }
  for (const building of plan.buildings) {
    if (building.front && DOOR_KINDS.has(building.kind)) add(building.front[0], building.front[1], building.kind);
  }
  for (const street of plan.streets) {
    if (street.kind !== 'main') continue;
    for (let index = 1; index < street.points.length; index += 2) {
      const [x, z] = street.points[index];
      if (Math.hypot(x, z) < plan.profile.radius * 0.7) add(x, z, 'street');
    }
  }
  return spots;
}
