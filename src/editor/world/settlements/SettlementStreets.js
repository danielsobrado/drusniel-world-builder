import { FARM_BELT } from './SettlementProfile.js';
import { polylineDistance, walkStreet } from './SettlementGeometry.js';
import { growLanes } from './SettlementLaneFill.js';

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

/** Street widths by rank in the hierarchy: a town's grand avenues, its avenues, then main road to footpath. */
export const STREET_WIDTH = Object.freeze({ market: 12, grand: 11, avenue: 9, main: 5.5, ring: 4.5, lane: 3.2, walk: 1.6 });
/** An avenue runs out to this share of the town's radius; beyond, it is a road again, through the gate. */
const AVENUE_REACH = 0.92;
/** A market street's wide stretch runs out to this share of the radius. */
const MARKET_STREET_REACH = 0.45;
const MIN_ROAD_SEPARATION = 0.55;
/** Least angle, in radians, between two radial streets of one quarter. */
const SPOKE_SEPARATION = 0.5;
/** Ring streets every this many metres out from the square, so blocks stay one lot-row deep at any size. */
const RING_SPACING = 80;
/** Spoke lanes between two rings stand about this far apart along the inner ring (m). */
const SPOKE_ARC = 70;
/** Towns of rank 1 grow rings once they are this wide (m): a big market town is not a village. */
const RING_TOWN_RADIUS = 200;

function angleGap(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/**
 * The bearing along which a port reaches its water: the direction in which
 * unbuildable ground lies nearest, looked for from the middle of the town out
 * past its edge. Null inland, or where the shore is too far to build to.
 */
export function waterBearing(profile, isBuildable) {
  let best = null;
  for (let index = 0; index < 24; index += 1) {
    const bearing = Math.PI * 2 * index / 24;
    for (let distance = profile.radius * 0.35; distance <= profile.radius * 1.5; distance += 6) {
      if (isBuildable(Math.sin(bearing) * distance, Math.cos(bearing) * distance)) continue;
      if (!best || distance < best.distance) best = { bearing, distance };
      break;
    }
  }
  return best?.bearing ?? null;
}

/**
 * Main-street bearings: the quay road of a port first, then the Azgaar roads
 * that leave the burg, deduplicated, padded with seeded bearings so every class
 * has at least its minimum.
 */
export function mainBearings(profile, routeBearings, random, quayBearing = null) {
  const minimum = [1, 2, 3, 3, 4][profile.rank];
  const maximum = [2, 3, 4, 5, 6][profile.rank];
  const bearings = quayBearing === null ? [] : [quayBearing];
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

/** Squares where every main street arrives as an avenue are this much wider, or the avenues eat their frontage. */
const GRAND_SQUARE = 1.5;

/** Radius of the market square, by settlement rank: a grand square where all its streets are avenues. */
export function marketSquareRadius(profile, signature = null) {
  if (!profile.square) return 0;
  return (11 + profile.rank * 3.5) * (signature?.avenues === 'all' ? GRAND_SQUARE : 1);
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

/**
 * Radii of the ring streets: the first a ring-spacing out from the square, then every
 * RING_SPACING (jittered) while it stays inside 0.95 of the radius. A regional recipe's
 * ringCount caps how many rings each 160 m of radius may have.
 */
function ringRadii(profile, squareRadius, random, streetConfig) {
  const radii = [];
  const cap = streetConfig ? streetConfig.ringCount * Math.max(1, Math.round(profile.radius / 160)) : Infinity;
  let ring = Math.max(squareRadius + RING_SPACING * 0.75, profile.radius * 0.44);
  if (profile.radius < 2.2 * RING_SPACING) ring = profile.radius * (0.44 + random() * 0.08);
  while (ring <= profile.radius * 0.95 && radii.length < cap) {
    radii.push(ring);
    ring += RING_SPACING * (0.9 + random() * 0.2);
  }
  if (radii.length === 0) radii.push(profile.radius * (0.44 + random() * 0.08));
  return radii;
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
function spokeLanes({ bearings, inner, outer, mains, random, isBuildable, separation = SPOKE_SEPARATION }) {
  const lanes = [];
  const sorted = [...bearings].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index];
    const to = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + Math.PI * 2;
    const gap = to - from;
    const count = Math.floor(gap / separation) - 1;
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

/** Grid towns lay their block streets this far apart (m). */
const GRID_SPACING = 70;

/**
 * Every street of a radial town after its main streets: rings, spokes and side
 * lanes — and, in a town too small for rings, lanes grown until it has frontage
 * for its population (SettlementLaneFill).
 */
function radialStreets({ profile, mains, bearings, squareRadius, streetConfig, tag, random, isBuildable }) {
  const streets = [];
  const allowRings = !streetConfig || streetConfig.ringCount > 0;
  const ringed = (profile.rank >= 2 || profile.radius >= RING_TOWN_RADIUS) && allowRings;
  if (ringed) {
    const radii = ringRadii(profile, squareRadius, random, streetConfig);
    for (const ringRadius of radii) {
      streets.push(...ringStreets({ ringRadius, random, isBuildable }).map(tag));
    }
    // Spoke lanes between the square and the first ring and between every pair of rings.
    const bounds = [Math.max(squareRadius + 8, radii[0] - RING_SPACING), ...radii, profile.radius * 0.97];
    for (let index = 1; index < bounds.length; index += 1) {
      const inner = bounds[index - 1];
      const outer = bounds[index];
      if (outer - inner < 30) continue;
      const separation = Math.min(SPOKE_SEPARATION, SPOKE_ARC / Math.max(inner, 1));
      streets.push(...spokeLanes({ bearings, inner, outer, mains, random, isBuildable, separation }).map(tag));
    }
  }
  if (profile.rank >= 1) streets.push(...sideLanes({ profile, mains, random, isBuildable }).map(tag));
  if (!ringed) {
    streets.push(...growLanes({ profile, streets: [...mains, ...streets], squareRadius, width: STREET_WIDTH.lane, random, isBuildable }).map(tag));
  }
  return streets;
}

/**
 * The block streets of a planned grid: straight lines GRID_SPACING apart both
 * ways across the town, broken at the square and on unbuildable ground. They are
 * planned as kind 'ring' — the through streets of the block web, paved and lit
 * like a radial town's rings.
 */
function gridStreets({ profile, axis, squareRadius, random, isBuildable }) {
  const streets = [];
  const limit = profile.radius * 0.97;
  for (const along of [axis, axis + Math.PI / 2]) {
    const [ux, uz] = [Math.sin(along), Math.cos(along)];
    const [vx, vz] = [uz, -ux];
    for (let line = 1; line * GRID_SPACING < limit; line += 1) {
      for (const side of [-1, 1]) {
        const offset = side * line * GRID_SPACING * (0.95 + random() * 0.1);
        const half = Math.sqrt(Math.max(0, limit * limit - offset * offset));
        if (half < 20) continue;
        let current = [];
        for (let t = -half; t <= half; t += 10) {
          const x = ux * t + vx * offset;
          const z = uz * t + vz * offset;
          if (isBuildable(x, z) && Math.hypot(x, z) > squareRadius + 4) {
            current.push([x, z]);
          } else {
            if (current.length > 2) streets.push({ kind: 'ring', width: STREET_WIDTH.ring, points: current });
            current = [];
          }
        }
        if (current.length > 2) streets.push({ kind: 'ring', width: STREET_WIDTH.ring, points: current });
      }
    }
  }
  return streets;
}

/**
 * A main street as its avenue — the stretch inside the town, at avenue width —
 * and the road on beyond it at main width, which is the one a gatehouse is
 * planned on. The two share the vertex where they meet.
 */
function asAvenue(main, limit, width) {
  const cut = main.points.findIndex(([x, z]) => Math.hypot(x, z) > limit);
  if (cut === 0 || cut === 1) return [main];
  const avenue = { ...main, width, avenue: true, points: cut < 0 ? main.points : main.points.slice(0, cut) };
  return cut < 0 ? [avenue] : [avenue, { ...main, points: main.points.slice(cut - 1) }];
}

/**
 * Main-street bearings by layout: a radial town's from its roads and quay; a grid
 * town's four half-axes, turned to its strongest road; a street village's one
 * road through, both ways — along the shore for a port.
 */
function layoutBearings(grammar, profile, routeBearings, random, quayBearing) {
  if (grammar === 'grid') {
    const axis = routeBearings[0] ?? quayBearing ?? random() * Math.PI * 2;
    return [0, 1, 2, 3].map((quarter) => axis + quarter * Math.PI / 2);
  }
  if (grammar === 'linear') {
    const axis = quayBearing !== null ? quayBearing + Math.PI / 2 : (routeBearings[0] ?? random() * Math.PI * 2);
    return [axis, axis + Math.PI];
  }
  return mainBearings(profile, routeBearings, random, quayBearing);
}

/**
 * The street network of one settlement, in plan space. Returns streets
 * ({ kind, width, points }) and the market square, if the class has one.
 *
 * The town's layout grammar (SettlementSignature) shapes it:
 * - radial: towns of rank 2 and up (and wide rank-1 towns) grow ring streets every
 *   RING_SPACING metres out to the wall, with spoke lanes SPOKE_ARC apart between
 *   each pair of rings, so the plan stays a web of closed blocks however large it grows;
 * - grid: two straight axes through the square and block streets GRID_SPACING apart;
 * - linear: one street through the square, both ways, with side lanes off it.
 *
 * Towns of rank 2 and up widen some main streets into avenues inside the town
 * (signature.avenues): the first — the quay or busiest road — or, in a capital or
 * a grid, every one.
 */
export function planStreets({ profile, signature = null, routeBearings, random, isBuildable }) {
  const grammar = signature?.grammar ?? 'radial';
  const squareRadius = marketSquareRadius(profile, signature);
  const streets = [];
  const regional = Boolean(profile.hasRegionalIdentity && profile.recipe?.streetConfig);
  const streetConfig = regional ? profile.recipe.streetConfig : null;
  // A planned grid is laid out with a line: its axes do not meander.
  const mainDrift = grammar === 'grid' ? 0.02 : (streetConfig ? streetConfig.drift : 0.22);
  const surfaceRole = streetConfig?.hasBoardwalkNetwork
    ? 'boardwalk'
    : (streetConfig?.grammar === 'contour-switchback-terrace'
      ? 'switchback'
      : (streetConfig?.grammar === 'fortified-forge-axis' ? 'forge-track' : 'street'));
  const tag = (street) => (regional ? { ...street, surfaceRole } : street);

  // A port is planned from its water: the quay road is the first street it has.
  const quayBearing = profile.port ? waterBearing(profile, isBuildable) : null;
  const bearings = layoutBearings(grammar, profile, routeBearings, random, quayBearing);
  const reach = profile.radius * FARM_BELT.outer;
  for (const bearing of bearings) {
    const start = [Math.sin(bearing) * squareRadius, Math.cos(bearing) * squareRadius];
    const points = walkStreet({ start, bearing, length: reach, step: 12, drift: mainDrift, random, isBuildable });
    if (points.length > 1) {
      streets.push({
        kind: 'main',
        width: STREET_WIDTH.main,
        points,
        bearing,
        ...(regional ? { surfaceRole } : {}),
      });
    }
  }
  const mains = streets.filter(({ kind }) => kind === 'main');

  if (grammar === 'grid') {
    streets.push(...gridStreets({ profile, axis: bearings[0], squareRadius, random, isBuildable }).map(tag));
  } else if (grammar === 'linear') {
    streets.push(...sideLanes({ profile, mains, random, isBuildable }).map(tag));
    streets.push(...growLanes({ profile, streets, squareRadius, width: STREET_WIDTH.lane, random, isBuildable }).map(tag));
  } else {
    streets.push(...radialStreets({ profile, mains, bearings, squareRadius, streetConfig, tag, random, isBuildable }));
  }
  // Last, so lanes are planned off whole mains: which of them are avenues inside the town.
  const avenues = new Set(signature?.avenues === 'all' ? mains : (signature?.avenues === 'first' ? mains.slice(0, 1) : []));
  const avenueWidth = signature?.grandAvenue ? STREET_WIDTH.grand : STREET_WIDTH.avenue;
  // A street village's market is its street: the first stretch out of the square, wide enough for a row of stalls.
  const marketStreet = signature?.markets?.[0]?.kind === 'street-market' ? mains[0] : null;
  const planned = streets.flatMap((street) => {
    if (avenues.has(street)) return asAvenue(street, profile.radius * AVENUE_REACH, avenueWidth);
    if (street !== marketStreet) return [street];
    return asAvenue(street, profile.radius * MARKET_STREET_REACH, STREET_WIDTH.market)
      .map((piece) => (piece.avenue ? { ...piece, market: true } : piece));
  });
  return { streets: planned, squareRadius, bearings, quayBearing };
}
