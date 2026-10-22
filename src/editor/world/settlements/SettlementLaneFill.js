/**
 * Lanes a small town grows until its houses have somewhere to stand.
 *
 * Every plot fronts a street, so how many houses a plan can place follows how
 * much street it has: towns with about FRONTAGE_PER_BUILDING metres of street
 * per building fill about four lots in five (the ring cities and grid towns),
 * while a village of a road or two had a third of that and housed a third of
 * its people. A town without rings therefore branches lanes off its streets —
 * each roughly square to its parent, meandering a little, held a plot's depth
 * away from every other street — until it has the frontage its population
 * asks for. Pure data, safe in terrain workers.
 */

import { polylineDistance, walkStreet } from './SettlementGeometry.js';

/** Metres of street a town needs per building it plans. */
export const FRONTAGE_PER_BUILDING = 9.5;
/**
 * A new lane keeps this far, centreline to centreline, from every other street:
 * room for a house plot between, fronting one or the other. At 30 m (a plot
 * both sides) random branching packed so loosely that villages stopped at 6 m of
 * street a building and housed two in three; at 20 m they fill like the ring
 * cities, and occupancy still keeps any two plots apart.
 */
const LANE_GAP = 20;
/** The shortest lane worth laying (m). */
const SHORTEST_LANE = 18;

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return length;
}

/** Metres of street whose segments lie inside `radius` of the centre: the frontage plots may use. */
export function frontageWithin(streets, radius) {
  let length = 0;
  for (const { kind, points } of streets) {
    if (kind === 'walk') continue;
    for (let index = 1; index < points.length; index += 1) {
      const [ax, az] = points[index - 1];
      const [bx, bz] = points[index];
      if (Math.hypot((ax + bx) / 2, (az + bz) / 2) <= radius) length += Math.hypot(bx - ax, bz - az);
    }
  }
  return length;
}

/**
 * New lanes off `streets`, until the town has FRONTAGE_PER_BUILDING metres of
 * street per building or runs out of tries. Returns only the new lanes.
 */
export function growLanes({ profile, streets, squareRadius = 0, width, random, isBuildable }) {
  const limit = profile.radius * 0.97;
  let need = profile.buildings * FRONTAGE_PER_BUILDING - frontageWithin(streets, profile.radius);
  const network = streets.filter(({ kind, points }) => kind !== 'walk' && points.length > 1);
  const lanes = [];
  // A try costs a street walk and a distance test per point; bounded by the town's size.
  const tries = 24 + profile.buildings;
  for (let attempt = 0; attempt < tries && need > 0 && network.length > 0; attempt += 1) {
    const parent = network[Math.floor(random() * network.length)];
    const index = 1 + Math.floor(random() * (parent.points.length - 1));
    const [ax, az] = parent.points[index - 1];
    const [bx, bz] = parent.points[index];
    const t = random();
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const reach = Math.hypot(x, z);
    if (reach > profile.radius * 0.85 || reach < squareRadius + 10) continue;
    const bearing = Math.atan2(bx - ax, bz - az) + (random() < 0.5 ? -1 : 1) * Math.PI / 2 + (random() - 0.5) * 0.4;
    const start = [x + Math.sin(bearing) * parent.width / 2, z + Math.cos(bearing) * parent.width / 2];
    const points = walkStreet({ start, bearing, length: profile.radius, step: 8, drift: 0.3, random, isBuildable });
    const lane = [start];
    for (const point of points.slice(1)) {
      const [px, pz] = point;
      if (Math.hypot(px, pz) > limit || Math.hypot(px, pz) < squareRadius + 6) break;
      // Its parent is near it only where it leaves it; any other street this near leaves no room for plots between.
      const leftParent = Math.hypot(px - start[0], pz - start[1]) > LANE_GAP;
      if (network.some((other) => (other !== parent || leftParent) && polylineDistance(other.points, px, pz) < LANE_GAP)) break;
      lane.push(point);
    }
    const length = polylineLength(lane);
    if (length < SHORTEST_LANE) continue;
    const street = { kind: 'lane', width, points: lane };
    lanes.push(street);
    network.push(street);
    need -= length;
  }
  return lanes;
}
