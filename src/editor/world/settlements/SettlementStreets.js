import { FARM_BELT } from './SettlementProfile.js';
import { polylineDistance } from './SettlementGeometry.js';

/** A small deterministic generator; plans must not depend on Math.random. */
export function planRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STREET_WIDTH = Object.freeze({ main: 5.5, ring: 4.5, lane: 3.2, walk: 1.6 });
const MIN_ROAD_SEPARATION = 0.55;
/** Least angle, in radians, between two radial streets of one quarter. */
const SPOKE_SEPARATION = 0.5;

function angleGap(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/**
 * Main-street bearings: the Azgaar roads that leave the burg, deduplicated,
 * padded with seeded bearings so every class has at least its minimum.
 */
export function mainBearings(profile, routeBearings, random) {
  const minimum = [1, 2, 3, 3, 4][profile.rank];
  const maximum = [2, 3, 4, 5, 6][profile.rank];
  const bearings = [];
  for (const bearing of routeBearings) {
    if (bearings.length >= maximum) break;
    if (bearings.every((existing) => angleGap(existing, bearing) > MIN_ROAD_SEPARATION)) bearings.push(bearing);
  }
  let attempts = 0;
  while (bearings.length < minimum && attempts < 64) {
    attempts += 1;
    const candidate = random() * Math.PI * 2;
    if (bearings.every((existing) => angleGap(existing, candidate) > Math.PI / (minimum + 0.5))) bearings.push(candidate);
  }
  return bearings;
}

/** A gently meandering street out along a bearing, stopping at unbuildable ground. */
function walkStreet({ start, bearing, length, step, drift, random, isBuildable }) {
  const points = [start];
  let [x, z] = start;
  let heading = bearing;
  for (let travelled = 0; travelled < length; travelled += step) {
    heading += (random() - 0.5) * drift;
    // Pull back toward the bearing so the street keeps its general direction.
    heading += Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading)) * 0.25;
    x += Math.sin(heading) * step;
    z += Math.cos(heading) * step;
    if (!isBuildable(x, z)) break;
    points.push([x, z]);
  }
  return points;
}

/** Radius of the market square, by settlement rank. */
export function marketSquareRadius(profile) {
  return profile.square ? 11 + profile.rank * 3.5 : 0;
}

/** A ring street at roughly `ringRadius`, broken wherever the ground is unbuildable. */
function ringStreets({ ringRadius, random, isBuildable }) {
  const steps = Math.max(24, Math.round(Math.PI * 2 * ringRadius / 10));
  const phase = random() * Math.PI * 2;
  const sway = random() * Math.PI * 2;
  const ring = Array.from({ length: steps }, (_, index) => {
    const angle = phase + Math.PI * 2 * index / steps;
    // Two slow waves, not per-point noise: a ring street wanders, it does not jitter.
    const radius = ringRadius * (1 + Math.sin(angle * 3 + sway) * 0.045 + Math.sin(angle * 5 - sway * 1.7) * 0.025);
    return [Math.sin(angle) * radius, Math.cos(angle) * radius];
  });
  const streets = [];
  let current = [];
  // One step past the end repeats the first point, so an unbroken ring closes.
  for (let index = 0; index <= steps; index += 1) {
    const point = ring[index % steps];
    if (isBuildable(point[0], point[1])) current.push(point);
    else {
      if (current.length > 1) streets.push({ kind: 'ring', width: STREET_WIDTH.ring, points: current });
      current = [];
    }
  }
  if (current.length > 1) streets.push({ kind: 'ring', width: STREET_WIDTH.ring, points: current });
  return streets;
}

/** Side lanes off every main street, alternating sides, clipped at the next main. */
function sideLanes({ profile, mains, random, isBuildable }) {
  const lanes = [];
  const spacing = 44 - profile.rank * 4;
  for (const main of mains) {
    let side = random() < 0.5 ? -1 : 1;
    for (let index = 2; index < main.points.length - 1; index += Math.max(2, Math.round(spacing / 12))) {
      const [x, z] = main.points[index];
      const distance = Math.hypot(x, z);
      if (distance < profile.radius * 0.28 || distance > profile.radius * 0.95) continue;
      const [nx, nz] = main.points[index + 1];
      const along = Math.atan2(nx - x, nz - z);
      const bearing = along + side * Math.PI / 2 + (random() - 0.5) * 0.3;
      side = -side;
      const start = [x + Math.sin(bearing) * STREET_WIDTH.main / 2, z + Math.cos(bearing) * STREET_WIDTH.main / 2];
      const points = walkStreet({ start, bearing, length: profile.radius * (0.22 + random() * 0.16), step: 8, drift: 0.3, random, isBuildable });
      // A lane that runs into another main street is truncated there.
      const clipped = [points[0]];
      for (const point of points.slice(1)) {
        if (mains.some((other) => other !== main && polylineDistance(other.points, point[0], point[1]) < 12)) break;
        if (Math.hypot(point[0], point[1]) > profile.radius) break;
        clipped.push(point);
      }
      if (clipped.length > 2) lanes.push({ kind: 'lane', width: STREET_WIDTH.lane, points: clipped });
    }
  }
  return lanes;
}

/**
 * Radial lanes through the quarters no main street serves, from `inner` out to
 * `outer`, so the blocks between two rings are closed rather than open fields.
 */
function spokeLanes({ bearings, inner, outer, mains, random, isBuildable }) {
  const lanes = [];
  const sorted = [...bearings].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index];
    const to = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + Math.PI * 2;
    const gap = to - from;
    const count = Math.floor(gap / SPOKE_SEPARATION) - 1;
    for (let spoke = 1; spoke <= count; spoke += 1) {
      const bearing = from + gap * spoke / (count + 1) + (random() - 0.5) * 0.12;
      const start = [Math.sin(bearing) * inner, Math.cos(bearing) * inner];
      if (!isBuildable(start[0], start[1])) continue;
      const points = walkStreet({ start, bearing, length: outer - inner, step: 9, drift: 0.2, random, isBuildable });
      const clipped = [points[0]];
      for (const point of points.slice(1)) {
        if (mains.some((main) => polylineDistance(main.points, point[0], point[1]) < 10)) break;
        clipped.push(point);
      }
      if (clipped.length > 2) lanes.push({ kind: 'lane', width: STREET_WIDTH.lane, points: clipped });
    }
  }
  return lanes;
}

/**
 * The street network of one settlement, in plan space. Returns streets
 * ({ kind, width, points }) and the market square, if the class has one.
 *
 * Towns grow one ring street; cities and above a second near the wall, with
 * spoke lanes between them, so the plan is a web of closed blocks.
 */
export function planStreets({ profile, routeBearings, random, isBuildable }) {
  const squareRadius = marketSquareRadius(profile);
  const streets = [];
  const bearings = mainBearings(profile, routeBearings, random);
  const reach = profile.radius * FARM_BELT.outer;
  for (const bearing of bearings) {
    const start = [Math.sin(bearing) * squareRadius, Math.cos(bearing) * squareRadius];
    const points = walkStreet({ start, bearing, length: reach, step: 12, drift: 0.22, random, isBuildable });
    if (points.length > 1) streets.push({ kind: 'main', width: STREET_WIDTH.main, points, bearing });
  }
  const mains = streets.filter(({ kind }) => kind === 'main');

  if (profile.rank >= 2) {
    const inner = profile.radius * (0.44 + random() * 0.08);
    streets.push(...ringStreets({ ringRadius: inner, random, isBuildable }));
    const outer = profile.rank >= 3 ? profile.radius * (0.8 + random() * 0.06) : profile.radius * 0.92;
    if (profile.rank >= 3) streets.push(...ringStreets({ ringRadius: outer, random, isBuildable }));
    streets.push(...spokeLanes({ bearings, inner, outer, mains, random, isBuildable }));
  }
  if (profile.rank >= 1) streets.push(...sideLanes({ profile, mains, random, isBuildable }));
  return { streets, squareRadius, bearings };
}
