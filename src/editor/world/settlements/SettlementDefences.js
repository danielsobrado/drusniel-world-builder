import { buildingEntry } from './SettlementBuildingCatalog.js';
import { rect } from './SettlementGeometry.js';

const WALL_OFFSET = 7;
const TOWER_EVERY = 4;
/** How far the wall may swell beyond the town it encloses, as a share of its radius. */
const WALL_SWELL = 0.16;

function piece(kind, x, z, yaw) {
  const [width, depth] = buildingEntry(kind, 0).footprint;
  return { kind, variant: 0, x, z, yaw, width, depth, front: null };
}

/**
 * The line of a town wall: its distance from the centre at each bearing.
 *
 * A wall is built to the ground and the purse, not to a compass: it swells
 * round a suburb and pinches where building stopped. Three slow waves, only
 * ever outward of the town's own radius, so nothing built is left outside.
 */
export function wallLine(profile, random) {
  const base = profile.radius + WALL_OFFSET;
  const waves = [2, 3, 5].map((frequency) => ({ frequency, phase: random() * Math.PI * 2, weight: 0.3 + random() * 0.7 }));
  const total = waves.reduce((sum, { weight }) => sum + weight, 0);
  return (angle) => {
    let swell = 0;
    for (const { frequency, phase, weight } of waves) swell += (Math.sin(angle * frequency + phase) * 0.5 + 0.5) * weight;
    return base * (1 + WALL_SWELL * swell / total);
  };
}

/**
 * A curtain wall round a walled burg: straight 12 m lengths along the wall
 * line, a gatehouse wherever a main road crosses it and a round tower at every
 * few joints. Stretches over water or cliffs are left open. Pieces are workshop
 * castle archetypes, so they share the masonry pipeline.
 */
export function planDefences({ profile, occupancy, streets, random }) {
  if (!profile.walled) return [];
  const radiusAt = wallLine(profile, random);
  const point = (angle) => [Math.sin(angle) * radiusAt(angle), Math.cos(angle) * radiusAt(angle)];
  const segment = buildingEntry('wall', 0).width;
  // The wall line as joints one wall-length apart along it — by distance, not by
  // bearing, or the lengths would overlap where the line pinches and gap where it swells.
  const joints = [point(0)];
  let travelled = 0;
  let [lastX, lastZ] = joints[0];
  const samples = 1440;
  for (let index = 1; index <= samples; index += 1) {
    const [x, z] = point(Math.PI * 2 * index / samples);
    travelled += Math.hypot(x - lastX, z - lastZ);
    [lastX, lastZ] = [x, z];
    if (travelled >= segment) {
      joints.push([x, z]);
      travelled = 0;
    }
  }
  // The last length closes the ring; a short one would overlap the first.
  if (travelled < segment * 0.6) joints.pop();
  const gates = streets
    .filter(({ kind }) => kind === 'main')
    .map((street) => {
      const crossing = street.points.find(([x, z]) => Math.hypot(x, z) >= radiusAt(Math.atan2(x, z))) ?? street.points.at(-1);
      return point(Math.atan2(crossing[0], crossing[1]));
    });
  const pieces = [];
  for (const [x, z] of gates) {
    // The gate passage faces out along the road.
    const angle = Math.atan2(x, z);
    pieces.push(piece('gatehouse', x, z, angle));
    occupancy.claim(rect(x, z, ...buildingEntry('gatehouse', 0).footprint, angle));
  }
  const gateReach = buildingEntry('gatehouse', 0).footprint[0] / 2 + segment * 0.4;
  for (let index = 0; index < joints.length; index += 1) {
    const [ax, az] = joints[index];
    const [bx, bz] = joints[(index + 1) % joints.length];
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    if (gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < gateReach)) continue;
    // A wall's length runs along its local x, (cos yaw, −sin yaw): along this chord.
    const yaw = Math.atan2(-(bz - az), bx - ax);
    const box = rect(x, z, segment, buildingEntry('wall', 0).footprint[1], yaw);
    // Neighbouring lengths abut end to end; test a shorter box so a wall is
    // never refused for touching the length before it.
    const probe = rect(x, z, segment * 0.7, box.halfDepth * 2, yaw);
    if (occupancy.conflict(probe, { clearance: 0, ignoreStreets: true }) !== null) continue;
    occupancy.claim(probe, { soft: true });
    // Every third length or so is the overgrown variant; which, is fixed by its place in the ring.
    pieces.push({ ...piece('wall', x, z, yaw), variant: index % 3 === 1 ? 1 : 0 });
    if (index % TOWER_EVERY === 0) {
      const joint = Math.atan2(ax, az);
      const tower = rect(ax, az, ...buildingEntry('tower', 0).footprint, joint);
      if (occupancy.conflict(tower, { clearance: 0, ignoreStreets: true, ground: true }) === 'water') continue;
      occupancy.claim(rect(tower.x, tower.z, 1, 1, joint), { soft: true });
      pieces.push(piece('tower', tower.x, tower.z, joint));
    }
  }
  return pieces;
}
