import { buildingEntry } from './SettlementBuildingCatalog.js';
import { pointAlong } from './SettlementDecor.js';
import { SETTLEMENT_GATE_PROFILES } from './SettlementGateProfiles.generated.js';
import { rect } from './SettlementGeometry.js';
import { isStoneKind, looseStone } from './SettlementStones.js';
import { trimPiece } from './SettlementTrim.js';

/** Metres of road in front of a gate that are kept open and worn. */
const APPROACH_LENGTH = 54;
const APPROACH_STEP = 9;
/** Half-width of the trodden ground at the gate and where it has narrowed to the road's shoulders. */
const APPROACH_HALF_WIDTH = Object.freeze([7.5, 4]);
/** A town's gate profile, by the kit family of the people who built it. */
export function gateProfileFor(profile) {
  const family = profile.hasRegionalIdentity ? profile.recipe?.architecture?.kitFamily : null;
  return SETTLEMENT_GATE_PROFILES.families[family] ?? SETTLEMENT_GATE_PROFILES.default;
}

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

/** One authored item of a scene (config/settlement-gates.yaml), on `hand`'s side of the road. */
function placeItem({ approach, occupancy, random }, props, item, hand) {
  const at = beside(approach, item.at, hand, approach.roadHalf + item.off);
  if (isStoneKind(item.kind)) {
    if (!occupancy.fits(rect(at.x, at.z, 1.2, 1.2, 0), { clearance: 0.1, streetClearance: 0.8 })) return false;
    props.push(looseStone(item.kind, at.x, at.z, random, 0.15));
    return true;
  }
  const turn = (random() * 2 - 1) * (item.turn ?? 0);
  const yaw = (item.facing === 'across' ? at.along + Math.PI / 2 * hand : at.along) + turn;
  if (item.size) return place(occupancy, props, trimPiece(item.kind, at.x, at.z, yaw, random), ...item.size);
  const [width, depth] = buildingEntry(item.kind, item.variant).footprint;
  return place(occupancy, props, { kind: item.kind, variant: item.variant, x: at.x, z: at.z, yaw }, width, depth);
}

function placeScene(scene, props, items, { needsFirst = false } = {}) {
  for (const [index, item] of items.entries()) {
    const hands = item.side === 'both' ? [-1, 1] : [item.side === 'watch' ? scene.side : -scene.side];
    const placed = hands.map((hand) => placeItem(scene, props, item, hand));
    if (needsFirst && index === 0 && !placed.some(Boolean)) return;
  }
}

/** The town's colours either side of the passage, hung on the gatehouse itself: no ground, no claim. */
function gateBanners({ gate, bannerVariant }, props) {
  const front = [Math.sin(gate.yaw), Math.cos(gate.yaw)];
  const across = [front[1], -front[0]];
  for (const hand of [-1, 1]) {
    props.push({
      kind: 'gateBanner',
      variant: bannerVariant,
      x: gate.x + front[0] * GATE_FACE + across[0] * hand * BANNER_OFFSET,
      z: gate.z + front[1] * GATE_FACE + across[1] * hand * BANNER_OFFSET,
      yaw: gate.yaw,
    });
  }
}

/** What falls from a wall and is never carted off: stone along its foot either side of the gate. */
function wallFootRubble({ gate, gateProfile, occupancy, random }, props) {
  const front = [Math.sin(gate.yaw), Math.cos(gate.yaw)];
  const across = [front[1], -front[0]];
  for (const hand of [-1, 1]) {
    for (let index = 0; index < gateProfile.rubblePerSide; index += 1) {
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
 * there — the watch at the gate, a trader at the roadside — never scattered;
 * which items, and how many, are the town's people's (`gateProfile`).
 */
export function planGateApproaches({ streets, defences, occupancy, gateProfile, random }) {
  const gates = defences.filter(({ kind }) => kind === 'gatehouse');
  const approaches = [];
  const props = [];
  const bannerVariant = gateProfile.banners[Math.floor(random() * gateProfile.banners.length)];
  for (const [index, gate] of gates.entries()) {
    const approach = gateApproach(gate, streets);
    approaches.push({ points: approach.points, halfWidths: approach.halfWidths });
    const scene = { gate, approach, side: random() < 0.5 ? -1 : 1, bannerVariant, gateProfile, occupancy, random };
    gateBanners(scene, props);
    placeScene(scene, props, gateProfile.checkpoint);
    // Not every gate has a trader waiting at it.
    if (index % gateProfile.merchantEvery === 0) placeScene(scene, props, gateProfile.merchantStop, { needsFirst: true });
    wallFootRubble(scene, props);
  }
  return { approaches, props };
}
