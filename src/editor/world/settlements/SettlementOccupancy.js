import { PlanGrid, rect, rectContains, rectCorners, rectsOverlap, segmentDistance } from './SettlementGeometry.js';

/** Steepest ground a pad may sit on, as metres of fall across its corners. */
const MAX_PAD_FALL = 3.2;
/** Bucket size of the street index (m); street points are indexed at least this densely. */
const STREET_CELL = 16;

/**
 * Every street segment, bucketed by the cells it passes through (grown by its
 * street's half-width), so a footprint tests only the segments near it. The test is
 * the same one `rectHitsPolyline` makes, segment by segment, so plans are identical
 * to testing every street; a large city's plan stays near-linear in its building count.
 */
function indexStreets(streets) {
  const grid = new PlanGrid(STREET_CELL);
  for (const street of streets) {
    const halfWidth = street.width / 2;
    const { points } = street;
    for (let index = 1; index < points.length; index += 1) {
      const [ax, az] = points[index - 1];
      const [bx, bz] = points[index];
      const segment = { street, index, halfWidth, ax, az, bx, bz };
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (STREET_CELL / 2)));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        grid.insert(segment, ax + (bx - ax) * t, az + (bz - az) * t, halfWidth + STREET_CELL / 2);
      }
    }
  }
  return grid;
}

/** The sample points of one segment that rectHitsPolyline tests (its first point only on the first segment). */
function segmentSamplesHit(box, segment, reach) {
  const { ax, az, bx, bz } = segment;
  if (segment.index === 1 && rectContains(box, ax, az, reach)) return true;
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / Math.max(0.5, reach)));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    if (rectContains(box, ax + (bx - ax) * t, az + (bz - az) * t, reach)) return true;
  }
  return false;
}

/**
 * rectHitsPolyline over the indexed segments near a box, with its exact semantics: a
 * street can hit only if its centreline comes within box.radius + reach, and then any
 * of its sample points inside the box grown by reach is a hit. Samples that can lie in
 * the grown box are within box.radius + reach * sqrt 2, inside the queried segments.
 */
function rectHitsStreets(box, segments, clearance) {
  const close = new Set();
  for (const segment of segments) {
    const reach = segment.halfWidth + clearance;
    if (segmentDistance(box.x, box.z, segment.ax, segment.az, segment.bx, segment.bz) <= box.radius + reach) {
      close.add(segment.street);
    }
  }
  if (close.size === 0) return false;
  for (const segment of segments) {
    if (close.has(segment.street) && segmentSamplesHit(box, segment, segment.halfWidth + clearance)) return true;
  }
  return false;
}

/**
 * Everything already claimed in a plan: streets, the square and accepted
 * footprints. `fits` is the single rule every placement goes through, so
 * buildings, farms, fields, walls and props can never overlap one another or a
 * street, and nothing is put in water or on a cliff.
 */
export class SettlementOccupancy {
  constructor({ streets, squareRadius, isBuildable, sampleHeight, maxPadFall = MAX_PAD_FALL }) {
    this.streets = streets;
    this.squareRadius = squareRadius;
    this.isBuildable = isBuildable;
    this.sampleHeight = sampleHeight;
    this.maxPadFall = maxPadFall;
    this.grid = new PlanGrid(16);
    this.streetGrid = indexStreets(streets);
    /** Widest street's half-width: how far past a box a street centreline may still reach into it. */
    this.maxHalfStreet = streets.reduce((widest, street) => Math.max(widest, street.width / 2), 0);
    this.claimed = [];
  }

  /** Street segments that may come within `reach` of a point: a superset of the true hits. */
  segmentsNear(x, z, reach) {
    return this.streetGrid.near(x, z, reach);
  }

  /** Why `box` cannot be placed, or null when it can. */
  conflict(box, { clearance = 1.2, streetClearance = 0.8, ignoreStreets = false, ground = true } = {}) {
    // Nothing may reach into the square: its nearest edge must clear the rim.
    if (this.squareRadius > 0 && Math.hypot(box.x, box.z) < this.squareRadius + Math.min(box.halfWidth, box.halfDepth)) {
      return 'square';
    }
    for (const other of this.grid.near(box.x, box.z, box.radius + clearance + 4)) {
      if (rectsOverlap(box, other.box, other.soft ? 0.2 : clearance)) return 'occupied';
    }
    if (!ignoreStreets) {
      const near = this.segmentsNear(box.x, box.z, box.radius + (streetClearance + this.maxHalfStreet) * Math.SQRT2);
      if (rectHitsStreets(box, near, streetClearance)) return 'street';
    }
    if (!ground) return null;
    const samples = [...rectCorners(box), [box.x, box.z]];
    if (!samples.every(([x, z]) => this.isBuildable(x, z))) return 'water';
    const heights = samples.map(([x, z]) => this.sampleHeight(x, z));
    if (Math.max(...heights) - Math.min(...heights) > this.maxPadFall) return 'slope';
    return null;
  }

  fits(box, options) {
    return this.conflict(box, options) === null;
  }

  claim(box, { soft = false } = {}) {
    const entry = { box, soft };
    this.claimed.push(entry);
    this.grid.insert(entry, box.x, box.z, box.radius);
    return entry;
  }

  /**
   * A footprint whose front edge centre sits `setback` metres off a street at
   * (x, z), the street running along `along`, on `side` (+1 left, −1 right).
   */
  static frontage({ x, z, along, side, halfStreet, setback, width, depth }) {
    const normal = [Math.cos(along) * side, -Math.sin(along) * side];
    const offset = halfStreet + setback + depth / 2;
    // The front faces back toward the street.
    const yaw = Math.atan2(-normal[0], -normal[1]);
    return rect(x + normal[0] * offset, z + normal[1] * offset, width, depth, yaw);
  }
}
