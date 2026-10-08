import { rect, rectHitsPolyline, rectsOverlap } from '../world/settlements/SettlementGeometry.js';
import { townHash as hash } from './townHash.js';

/**
 * Lived-in clutter round every house, and stone paving on town streets.
 *
 * The planner leaves generous plots; Skyrim's holds feel dense because every
 * gap is full — barrels by the door, a woodpile down the side, a fenced kitchen
 * garden behind. Each candidate is tested against every building, street and
 * piece already placed, so dressing never blocks a door or a road. Output is
 * plan-space props ({ kind, variant, x, z, yaw }) for TownLayout, so dressing
 * shares the prop clusters and colliders. Pure and deterministic.
 */

const PAVING_STEP = 1.9;
const YARD_DEPTH = 3.6;

class Occupancy {
  constructor(streets) {
    this.streets = streets.filter((street) => street.points?.length > 1);
    this.boxes = [];
  }

  claim(box) {
    this.boxes.push(box);
  }

  fits(box) {
    if (this.boxes.some((other) => rectsOverlap(box, other, 0.15))) return false;
    return !this.streets.some((street) => rectHitsPolyline(box, street.points, street.width / 2, 0.2));
  }
}

/** A point in a building's frame (local +z = front) carried to plan space. */
function toPlan(building, lx, lz) {
  const cos = Math.cos(building.yaw);
  const sin = Math.sin(building.yaw);
  return [building.x + lx * cos + lz * sin, building.z - lx * sin + lz * cos];
}

function tryProp(occupancy, out, building, prop) {
  const [x, z] = toPlan(building, prop.lx, prop.lz);
  const box = rect(x, z, prop.w, prop.d, building.yaw + prop.turn);
  if (!occupancy.fits(box)) return false;
  occupancy.claim(box);
  out.push({ kind: prop.kind, variant: prop.variant ?? 0, x, z, yaw: building.yaw + prop.turn });
  return true;
}

function yardFence(occupancy, out, building, size) {
  const [w, d] = size;
  const centre = [0, -d / 2 - YARD_DEPTH / 2 - 0.5];
  const [x, z] = toPlan(building, ...centre);
  const yard = rect(x, z, w + 1, YARD_DEPTH, building.yaw);
  if (!occupancy.fits(yard)) return;
  occupancy.claim(yard);
  const back = -d / 2 - YARD_DEPTH - 0.5;
  const half = (w + 1) / 2;
  for (let lx = -half + 2; lx <= half - 2 + 1e-6; lx += 4) {
    const [fx, fz] = toPlan(building, lx, back);
    out.push({ kind: 'fence', variant: 0, x: fx, z: fz, yaw: building.yaw });
  }
  for (const side of [-1, 1]) {
    const [fx, fz] = toPlan(building, side * half, -d / 2 - 0.5 - YARD_DEPTH / 2);
    out.push({ kind: 'fence', variant: 0, x: fx, z: fz, yaw: building.yaw + Math.PI / 2 });
  }
  const [bx, bz] = toPlan(building, half - 1.2, back + 1.2);
  out.push({ kind: 'bush', variant: 0, x: bx, z: bz, yaw: 0 });
}

/**
 * @param {object} options
 * @param {object} options.plan settlement plan
 * @param {number} options.seed per-town seed
 * @param {Array<{building:object, size:number[]}>} options.placed buildings with their prefab footprint
 */
export function planDressing({ plan, seed, placed }) {
  const occupancy = new Occupancy(plan.streets ?? []);
  for (const { building, size } of placed) {
    occupancy.claim(rect(building.x, building.z, size[0] + 0.6, size[1] + 0.6, building.yaw));
  }
  for (const prop of plan.props ?? []) occupancy.claim(rect(prop.x, prop.z, 1.6, 1.6, prop.yaw ?? 0));
  const out = [];
  placed.forEach(({ building, size }, index) => {
    if (!['house', 'townhouse', 'shop', 'tavern', 'smithy', 'bakery', 'farmhouse', 'warehouse']
      .includes(building.kind)) return;
    const [w, d] = size;
    const roll = (salt) => hash(seed, index, salt);
    // Offsets clear the house's own 0.3 m claim plus the 0.15 m fit clearance.
    const beside = (side, width) => side * (w / 2 + 0.5 + width / 2);
    const candidates = [
      { kind: 'barrels', variant: roll(1) < 0.5 ? 0 : 1, lx: beside(-1, 1.4), lz: d / 2 - 0.9, w: 1.4, d: 1.4, turn: 0 },
      { kind: 'planter', lx: beside(1, 1.0), lz: d / 2 - 0.4, w: 1.0, d: 0.4, turn: 0 },
      { kind: 'woodpile', lx: beside(1, 1.2), lz: -0.4, w: 1.3, d: 1.2, turn: Math.PI / 2 },
      { kind: 'barrels', variant: 1, lx: beside(-1, 1.0), lz: -d / 2 + 0.8, w: 1.0, d: 1.0, turn: 0.3 },
      { kind: 'bush', lx: beside(-1, 1.2), lz: 0.3, w: 1.2, d: 1.2, turn: 0 },
    ];
    for (const [salt, candidate] of candidates.entries()) {
      if (roll(10 + salt) < 0.62) tryProp(occupancy, out, building, candidate);
    }
    if (roll(20) < 0.55) yardFence(occupancy, out, building, size);
  });
  return out;
}

/** Paving tiles (2 m) along a town's streets and over its square, as plan-space placements. */
export function planPaving(plan) {
  const tiles = [];
  const rank = plan.profile?.rank ?? 0;
  if (rank < 1) return tiles;
  for (const street of plan.streets ?? []) {
    if (street.kind === 'walk' && rank < 2) continue;
    const across = Math.max(1, Math.ceil(street.width / 2));
    for (let i = 1; i < street.points.length; i += 1) {
      const [ax, az] = street.points[i - 1];
      const [bx, bz] = street.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.1) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);
      for (let s = 0; s < length; s += PAVING_STEP) {
        const t = s / length;
        for (let k = 0; k < across; k += 1) {
          const offset = (k - (across - 1) / 2) * 2;
          tiles.push({ x: ax + (bx - ax) * t + nx * offset, z: az + (bz - az) * t + nz * offset, yaw });
        }
      }
    }
  }
  const radius = plan.squareRadius ?? 0;
  for (let x = -radius; x <= radius; x += 2) {
    for (let z = -radius; z <= radius; z += 2) {
      if (Math.hypot(x, z) <= radius - 0.5) tiles.push({ x, z, yaw: 0 });
    }
  }
  return tiles;
}
