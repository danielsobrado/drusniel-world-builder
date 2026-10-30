import { buildingEntry } from './SettlementBuildingCatalog.js';
import { pointAlong } from './SettlementDecor.js';
import { rect } from './SettlementGeometry.js';
import { looseStone } from './SettlementStones.js';
import { SETTLEMENT_TRIM, trimPiece } from './SettlementTrim.js';

/** Metres of road in front of a gate that are kept open and worn. */
const APPROACH_LENGTH = 54;
const APPROACH_STEP = 9;
/** Half-width of the trodden ground at the gate and where it has narrowed to the road's shoulders. */
const APPROACH_HALF_WIDTH = Object.freeze([7.5, 4]);
/** Metres the outer face of a gatehouse stands from its centre (the piers' collider depth). */
const GATE_FACE = 3.4;
/** Metres either side of the passage centre that a gate's banners hang. */
const BANNER_OFFSET = 3.6;

/**
 * The road out of a gate as stations `[x, z]` every APPROACH_STEP metres, with
 * the half-width of the worn ground at each. A road that stops short runs on
 * straight, so a gate on a stub of street still gets its open ground.
 */
function gateApproach(gate, streets) {
  const mains = streets.filter(({ kind, avenue }) => kind === 'main' && !avenue);
  const distanceTo = (street) => Math.min(...street.points.map(([x, z]) => Math.hypot(x - gate.x, z - gate.z)));
  const street = mains.reduce((best, other) => (!best || distanceTo(other) < distanceTo(best) ? other : best), null);
  const gateRadius = Math.hypot(gate.x, gate.z);
  const road = [[gate.x, gate.z], ...(street?.points ?? []).filter(([x, z]) => Math.hypot(x, z) > gateRadius + 1)];
  const [lastX, lastZ] = road.at(-1);
  road.push([lastX + Math.sin(gate.yaw) * APPROACH_LENGTH, lastZ + Math.cos(gate.yaw) * APPROACH_LENGTH]);
  const points = [];
  const halfWidths = [];
  const stations = Math.round(APPROACH_LENGTH / APPROACH_STEP);
  for (let index = 0; index <= stations; index += 1) {
    const at = pointAlong(road, index * APPROACH_STEP);
    points.push([at.x, at.z]);
    const [wide, narrow] = APPROACH_HALF_WIDTH;
    halfWidths.push(wide + (narrow - wide) * (index / stations) ** 0.7);
  }
  return { points, halfWidths, roadHalf: (street?.width ?? 5.5) / 2 };
}

/** A point `offset` metres to `side` of the road, `distance` metres out from the gate. */
function beside(approach, distance, side, offset) {
  const at = pointAlong(approach.points, distance);
  return {
    x: at.x + Math.cos(at.along) * side * offset,
    z: at.z - Math.sin(at.along) * side * offset,
    along: at.along,
  };
}

/** Claims a spot and adds the prop, or leaves it out where the ground or a neighbour refuses it. */
function place(occupancy, props, prop, width, depth) {
  const box = rect(prop.x, prop.z, width, depth, prop.yaw);
  if (!occupancy.fits(box, { clearance: 0.3, streetClearance: 0.8 })) return false;
  occupancy.claim(box, { soft: true });
  props.push(prop);
  return true;
}

function catalogProp(occupancy, props, kind, variant, at, yaw) {
  const [width, depth] = buildingEntry(kind, variant).footprint;
  return place(occupancy, props, { kind, variant, x: at.x, z: at.z, yaw }, width, depth);
}

/**
 * `gate_checkpoint`: lit on both sides of the road, the town's colours either
 * side of the passage, and the watch's spears and stores on one side of it.
 */
function checkpoint({ gate, approach, side, bannerVariant, occupancy, random }, props) {
  const front = [Math.sin(gate.yaw), Math.cos(gate.yaw)];
  const across = [front[1], -front[0]];
  for (const hand of [-1, 1]) {
    // Hung on the gatehouse itself, so they answer to no ground and no claim.
    props.push({
      kind: 'gateBanner',
      variant: bannerVariant,
      x: gate.x + front[0] * GATE_FACE + across[0] * hand * BANNER_OFFSET,
      z: gate.z + front[1] * GATE_FACE + across[1] * hand * BANNER_OFFSET,
      yaw: gate.yaw,
    });
    const light = beside(approach, 7.5, hand, approach.roadHalf + 2.2);
    catalogProp(occupancy, props, 'lantern', 0, light, light.along);
  }
  const rack = beside(approach, 8.5, side, approach.roadHalf + 3.6);
  // Its long side to the road, spears within reach of whoever stands the gate.
  place(occupancy, props, { ...trimPiece('spearRack', rack.x, rack.z, rack.along + Math.PI / 2 * side, random) }, 2.2, 0.8);
  const stores = beside(approach, 12, side, approach.roadHalf + 3.2);
  catalogProp(occupancy, props, 'barrels', 1, stores, stores.along + (random() - 0.5) * 0.3);
}

/** `merchant_stop`: a cart drawn off the road to wait its turn, its load and a rail for the team. */
function merchantStop({ approach, side, occupancy, random }, props) {
  const cartAt = beside(approach, 18, -side, approach.roadHalf + 2.2);
  if (!catalogProp(occupancy, props, 'cart', 0, cartAt, cartAt.along + (random() - 0.5) * 0.12)) return;
  const load = beside(approach, 13.5, -side, approach.roadHalf + 2.6);
  catalogProp(occupancy, props, 'barrels', 0, load, load.along + (random() - 0.5) * 0.4);
  const rail = beside(approach, 24, -side, approach.roadHalf + 2);
  place(occupancy, props, { ...trimPiece('hitchPost', rail.x, rail.z, rail.along + Math.PI / 2, random) }, 2.2, 0.5);
}

/** What falls from a wall and is never carted off: stone along its foot either side of the gate. */
function wallFootRubble({ gate, occupancy, random }, props) {
  const front = [Math.sin(gate.yaw), Math.cos(gate.yaw)];
  const across = [front[1], -front[0]];
  for (const hand of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const along = 10 + random() * 16;
      const out = 3.2 + random() * 2.6;
      const x = gate.x + front[0] * out + across[0] * hand * along;
      const z = gate.z + front[1] * out + across[1] * hand * along;
      const kind = random() < 0.22 ? 'boulder' : 'fieldstone';
      if (occupancy.fits(rect(x, z, 0.9, 0.9, 0), { clearance: 0.1, streetClearance: 0.8 })) props.push(looseStone(kind, x, z, random, 0.4));
    }
  }
}

/**
 * The ground in front of each gatehouse and what stands on it.
 *
 * Works from the finished town on a stream of its own, so nothing here can move
 * a house. `approaches` are worn ground: the field paints them as road tile,
 * which is also what keeps the trees and grass off the line of sight to the
 * gate; the paving lays earth along them. `props` are grouped by what happens
 * there — the watch at the gate, a trader at the roadside — never scattered.
 */
export function planGateApproaches({ streets, defences, occupancy, random }) {
  const gates = defences.filter(({ kind }) => kind === 'gatehouse');
  const approaches = [];
  const props = [];
  const bannerVariant = Math.floor(random() * SETTLEMENT_TRIM.gateBanner.variants);
  for (const [index, gate] of gates.entries()) {
    const approach = gateApproach(gate, streets);
    approaches.push({ points: approach.points, halfWidths: approach.halfWidths });
    const scene = { gate, approach, side: random() < 0.5 ? -1 : 1, bannerVariant, occupancy, random };
    checkpoint(scene, props);
    // Not every gate has a trader waiting at it.
    if (index % 2 === 0) merchantStop(scene, props);
    wallFootRubble(scene, props);
  }
  return { approaches, props };
}
