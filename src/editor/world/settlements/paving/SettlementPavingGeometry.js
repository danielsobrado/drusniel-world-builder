/**
 * Paving draped over a settlement's ground: a ribbon along every street and
 * walk, and a disc for the market square.
 *
 * The terrain itself can only say "road tile here" on a 2 m grid, which gives a
 * town blobby dirt. These meshes carry the real surface — setts on the streets,
 * flags on the square and the door walks, packed earth on country lanes — with
 * an `edge` attribute the material uses to break the border up stone by stone.
 *
 * Pure geometry in settlement-local space: x is plan x, z is *minus* plan z
 * (canonical world orientation), y is the absolute ground height. No three.
 */

/** Metres between cross-sections along a ribbon, and between rings of a disc. */
const STEP = 1.6;
/** Extra half-width, in metres, that the ragged border is allowed to occupy. */
const BORDER = 0.55;
/** Cross-section stations, as a fraction of the half-width, and their `edge`. */
const STATIONS = Object.freeze([[-1, 1], [-0.62, 0.18], [0, 0], [0.62, 0.18], [1, 1]]);
/**
 * Height above the ground, per surface. Surfaces overlap at every junction, so
 * each rides its own level: the higher one wins cleanly instead of z-fighting.
 */
const LIFT = Object.freeze({ earth: 0.045, cobble: 0.06, flagstone: 0.075 });
export const PAVING_LAYERS = Object.freeze(Object.keys(LIFT));

/** Which surface each street kind is laid in, by settlement rank. */
function surfaceFor(streetKind, rank) {
  if (rank === 0) return 'earth';
  if (streetKind === 'walk') return rank >= 2 ? 'flagstone' : 'earth';
  if (streetKind === 'lane') return rank >= 2 ? 'cobble' : 'earth';
  return 'cobble';
}

function hash2(x, z) {
  let hash = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
}

/** Smooth value noise in plan space, for wear and width that drift over metres. */
function drift(x, z, scale) {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const top = hash2(ix, iz) + (hash2(ix + 1, iz) - hash2(ix, iz)) * sx;
  const bottom = hash2(ix, iz + 1) + (hash2(ix + 1, iz + 1) - hash2(ix, iz + 1)) * sx;
  return top + (bottom - top) * sz;
}

/** A polyline resampled along a Catmull-Rom curve at roughly `STEP` metres. */
export function smoothPath(points, closed = false) {
  if (points.length < 3) {
    const [[ax, az], [bx, bz]] = points;
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    return Array.from({ length: count + 1 }, (_, index) => [ax + (bx - ax) * index / count, az + (bz - az) * index / count]);
  }
  const at = (index) => (closed
    ? points[((index % (points.length - 1)) + points.length - 1) % (points.length - 1)]
    : points[Math.max(0, Math.min(points.length - 1, index))]);
  const result = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    const count = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / STEP));
    for (let step = 0; step < count; step += 1) {
      const t = step / count;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push([0, 1].map((axis) => 0.5 * (2 * p1[axis] + (p2[axis] - p0[axis]) * t
        + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2
        + (3 * p1[axis] - p0[axis] - 3 * p2[axis] + p3[axis]) * t3)));
    }
  }
  result.push([...points.at(-1)]);
  return result;
}

class SurfaceBuffer {
  constructor(kind, tileMetres) {
    this.kind = kind;
    this.tile = tileMetres;
    this.positions = [];
    this.uvs = [];
    this.colors = [];
    this.edges = [];
    this.indices = [];
  }

  /** Adds a vertex at plan (x, z) and returns its index. */
  vertex(x, z, edge, heightAt, tone) {
    const wear = 1.04 - edge * 0.2 + (drift(x, z, 9) - 0.5) * 0.22 + (drift(x, z, 2.3) - 0.5) * 0.08;
    const shade = wear * tone;
    this.positions.push(x, heightAt(x, z) + LIFT[this.kind], -z);
    this.uvs.push(x / this.tile, z / this.tile);
    // Edges run a touch warmer and darker, where soil washes over the stone.
    this.colors.push(shade, shade * (1 - edge * 0.03), shade * (1 - edge * 0.08));
    this.edges.push(edge);
    return this.positions.length / 3 - 1;
  }

  /** Two triangles over a quad given in plan-space counter-clockwise order, facing up. */
  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  arrays() {
    return {
      kind: this.kind,
      positions: new Float32Array(this.positions),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      edges: new Float32Array(this.edges),
      indices: new Uint32Array(this.indices),
    };
  }
}

function addRibbon(buffer, path, width, { closed, fadeStart, fadeEnd, tone }, heightAt) {
  const half = width / 2 + BORDER;
  let previous = null;
  const last = path.length - 1;
  for (let index = 0; index <= last; index += 1) {
    const [x, z] = path[index];
    const [bx, bz] = path[Math.max(0, index - 1)];
    const [ax, az] = path[Math.min(last, index + 1)];
    const length = Math.hypot(ax - bx, az - bz) || 1;
    // Left of travel in plan space.
    const nx = -(az - bz) / length;
    const nz = (ax - bx) / length;
    const swell = half * (1 + (drift(x, z, 14) - 0.5) * 0.16);
    const cap = !closed && ((index === 0 && fadeStart) || (index === last && fadeEnd));
    const row = STATIONS.map(([offset, edge]) => buffer.vertex(x + nx * offset * swell, z + nz * offset * swell, cap ? 1 : edge, heightAt, tone));
    if (previous) {
      for (let station = 0; station < row.length - 1; station += 1) {
        buffer.quad(previous[station], row[station], row[station + 1], previous[station + 1]);
      }
    }
    previous = row;
  }
}

function addDisc(buffer, radius, heightAt, tone) {
  const outer = radius + BORDER * 1.6;
  const rings = Math.max(2, Math.ceil(outer / STEP));
  const centre = buffer.vertex(0, 0, 0, heightAt, tone);
  let previous = null;
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = outer * ring / rings;
    const segments = Math.max(12, Math.ceil(Math.PI * 2 * r / STEP));
    const edge = Math.max(0, Math.min(1, (r - (radius - 0.4)) / (outer - radius + 0.4)));
    const row = Array.from({ length: segments }, (_, index) => {
      const angle = Math.PI * 2 * index / segments;
      return buffer.vertex(Math.sin(angle) * r, Math.cos(angle) * r, edge, heightAt, tone);
    });
    if (!previous) {
      for (let index = 0; index < segments; index += 1) buffer.indices.push(centre, row[(index + 1) % segments], row[index]);
    } else {
      // Rings hold different vertex counts; walk both and stitch the nearer step.
      let inner = 0;
      let out = 0;
      while (inner < previous.length || out < segments) {
        const innerNext = (inner + 1) / previous.length;
        const outNext = (out + 1) / segments;
        if (out < segments && (inner >= previous.length || outNext <= innerNext)) {
          buffer.indices.push(previous[inner % previous.length], row[(out + 1) % segments], row[out]);
          out += 1;
        } else {
          buffer.indices.push(previous[inner % previous.length], previous[(inner + 1) % previous.length], row[out % segments]);
          inner += 1;
        }
      }
    }
    previous = row;
  }
}

/** Metres of trodden ground round a footprint, and how far it tucks under the wall. */
const APRON = Object.freeze({ reach: 1.5, tuck: 0.35 });
/** Rings of an apron, from under the wall outward: `[offset, edge, tone]`. */
const APRON_RINGS = Object.freeze([[-APRON.tuck, 0, 0.62], [0.25, 0.08, 0.74], [APRON.reach * 0.6, 0.45, 0.9], [APRON.reach, 1, 1]]);

/** The perimeter of a footprint grown by `offset`, `perSide` points to a side. */
function footprintRing(building, offset, perSide) {
  const sin = Math.sin(building.yaw);
  const cos = Math.cos(building.yaw);
  const halfWidth = building.width / 2 + offset;
  const halfDepth = building.depth / 2 + offset;
  const corners = [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]];
  const ring = [];
  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    for (let step = 0; step < perSide; step += 1) {
      const localX = ax + (bx - ax) * step / perSide;
      const localZ = az + (bz - az) * step / perSide;
      // Local +x is (cos, −sin) and local +z is (sin, cos) in plan space.
      ring.push([building.x + cos * localX + sin * localZ, building.z - sin * localX + cos * localZ]);
    }
  }
  return ring;
}

/**
 * The worn ground a building stands in: bare earth from under its walls out to
 * a ragged rim, darkest against the wall where damp and shadow gather. Without
 * it a house meets the meadow in a ruled line and reads as set down on the
 * grass rather than built into the town.
 */
function addApron(buffer, building, heightAt) {
  const perSide = Math.max(2, Math.ceil(Math.max(building.width, building.depth) / STEP));
  let previous = null;
  for (const [offset, edge, tone] of APRON_RINGS) {
    const row = footprintRing(building, offset, perSide).map(([x, z]) => buffer.vertex(x, z, edge, heightAt, tone));
    if (previous) {
      for (let index = 0; index < row.length; index += 1) {
        const next = (index + 1) % row.length;
        buffer.quad(previous[index], row[index], row[next], previous[next]);
      }
    }
    previous = row;
  }
}

/** Split a main street where it leaves the town: setts inside, earth beyond. */
function splitAtRadius(points, radius) {
  const index = points.findIndex(([x, z]) => Math.hypot(x, z) > radius);
  if (index <= 0) return index === 0 ? [null, points] : [points, null];
  return [points.slice(0, index + 1), points.slice(index)];
}

/**
 * Builds the paving of one settlement plan. A generator: it yields between
 * streets, because every vertex costs a terrain height sample. Returns one
 * buffer set per surface that has any geometry.
 *
 * @param {object} plan a settlement plan
 * @param {(x: number, z: number) => number} heightAt ground height at plan (x, z)
 * @param {Record<string, number>} tileMetres metres one texture repeat spans, per layer
 */
export function* settlementPavingJob(plan, heightAt, tileMetres) {
  const { rank, radius } = plan.profile;
  const buffers = new Map(PAVING_LAYERS.map((kind) => [kind, new SurfaceBuffer(kind, tileMetres[kind])]));
  for (const street of plan.streets) {
    const closed = street.points.length > 3
      && street.points[0][0] === street.points.at(-1)[0] && street.points[0][1] === street.points.at(-1)[1];
    const surface = surfaceFor(street.kind, rank);
    const pieces = street.kind === 'main' && surface !== 'earth'
      ? splitAtRadius(street.points, radius * 1.06)
      : [street.points, null];
    pieces.forEach((points, piece) => {
      if (!points || points.length < 2) return;
      const kind = piece === 0 ? surface : 'earth';
      addRibbon(buffers.get(kind), smoothPath(points, closed), street.width, {
        closed,
        // A street that springs from another one starts under it; only its free end frays.
        fadeStart: piece === 1 ? false : street.kind === 'walk',
        fadeEnd: !(piece === 0 && pieces[1]),
        tone: street.kind === 'walk' ? 0.94 : 1,
      }, heightAt);
    });
    yield;
  }
  if (plan.squareRadius > 0) {
    // Out to the house fronts that wall the square (see `squareFrontage`).
    addDisc(buffers.get(rank >= 1 ? 'flagstone' : 'earth'), plan.squareRadius + 2.2, heightAt, 1.03);
    yield;
  }
  for (const [index, building] of plan.buildings.entries()) {
    addApron(buffers.get('earth'), building, heightAt);
    if (index % 12 === 11) yield;
  }
  return [...buffers.values()].filter((buffer) => buffer.indices.length > 0).map((buffer) => buffer.arrays());
}
