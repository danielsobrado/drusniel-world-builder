import { shapeRandom } from './ShapeMesh.js';

const EXPOSURE = 0.34, TILE_WIDTH = 0.48, OVERLAP = 0.055;
const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));

function slope(surface, u) {
  const points = [{ t: 0, distance: 0 }]; let previous = surface.point(u, 0);
  for (let i = 1; i <= 40; i++) {
    const t = i / 40, p = surface.point(u, t);
    points.push({ t, distance: points.at(-1).distance + distance(p, previous) }); previous = p;
  }
  return points;
}

/** Courses are anchored in metres from the eave, with stable row/boundary keys. */
export function planShapeRoofTiles(plan, surface, seed) {
  const length = plan.curve.length;
  const slopes = Array.from({ length: 8 }, (_, i) => slope(surface, length * (i + 0.5) / 8));
  const reference = slopes.sort((a, b) => b.at(-1).distance - a.at(-1).distance)[0];
  const run = reference.at(-1).distance;
  const at = fromEave => {
    const d = Math.max(0, run - fromEave), i = Math.max(1, reference.findIndex(p => p.distance >= d));
    const a = reference[i - 1], b = reference[i];
    return a.t + (b.t - a.t) * (d - a.distance) / (b.distance - a.distance || 1);
  };
  const tiles = [], rows = Math.max(1, Math.ceil(run / EXPOSURE));
  for (let row = 0; row < rows; row++) {
    const t0 = at((row + 1) * EXPOSURE), t1 = row ? at(row * EXPOSURE - OVERLAP) : 1;
    const mid = (t0 + t1) / 2, ring = [{ u: 0, distance: 0 }];
    let previous = surface.point(0, mid);
    for (let i = 1; i <= 64; i++) {
      const u = length * i / 64, p = surface.point(u, mid);
      ring.push({ u, distance: ring.at(-1).distance + distance(p, previous) }); previous = p;
    }
    const perimeter = ring.at(-1).distance;
    if (perimeter < 0.36) continue;
    const cells = Math.max(3, Math.round(perimeter / TILE_WIDTH)), width = perimeter / cells;
    const uAt = d => {
      // The alternating half-course wraps seamlessly around closed roof outlines.
      d = ((d % perimeter) + perimeter) % perimeter;
      const i = Math.max(1, ring.findIndex(p => p.distance >= d)), a = ring[i - 1], b = ring[i];
      return a.u + (b.u - a.u) * (d - a.distance) / (b.distance - a.distance || 1);
    };
    const boundary = cell => (cell + (row % 2) * 0.5) * width +
      (shapeRandom(seed, plan.id, 'tile-joint', `${row}:${((cell % cells) + cells) % cells}`) - 0.5) * Math.min(0.045, width * 0.12);
    for (let cell = 0; cell < cells; cell++) {
      const left = boundary(cell), right = boundary(cell + 1);
      const u0 = uAt(left + 0.005), end = uAt(right - 0.005);
      const u1 = end <= u0 ? end + length : end;
      tiles.push({ key: `${row}:${cell}`, row, cell, u0, u1, t0, t1,
        exposed: Math.min(EXPOSURE, run - row * EXPOSURE), width: right - left });
    }
  }
  return tiles;
}
