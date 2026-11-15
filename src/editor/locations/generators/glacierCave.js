import * as THREE from 'three/webgpu';
import { fbm3, valueNoise3 } from '../gen/noise.js';
import { column } from '../gen/shapes.js';

/**
 * Openings and solids for a cave melted out of a glacier rather than cut from
 * rock. Water shapes it: a tube that ran full, the slot its stream cut down
 * through that tube's floor once it ran free, walls dished by eddies, blades
 * and curtains where melt ran down and froze. `walkClearance` tells drift and
 * debris where the walker's floor is, so they lie beside it and never on it.
 */

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const box = (minX, minY, minZ, maxX, maxY, maxZ) => ({
  min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ },
});

/** Metres between the stations a melt tube is swept through. */
const STATION_STEP = 1;
/** Per metre: how fast the bore drifts from its keyed size. Melt varies over metres, not stations. */
const WOBBLE_RATE = 0.13;
/** Per metre: how fast the slot's lean changes. A meander migrates over tens of metres. */
const LEAN_RATE = 0.05;
/** Share of its floor width the slot loses toward its top: the stream undercut most where it last ran. */
const SLOT_NARROWING = 0.35;
/** The older tube's centre sits this many of its half-heights above the slot's floor-to-top depth. */
const TUBE_SEAT = 0.75;
/** Head height, and how far the walker's feet and head keep from the walls, metres. */
const HEAD = 1.8, FOOT_CLEARANCE = 0.45, HEAD_CLEARANCE = 0.2;
/** The narrowest strip either side of a tube's line that stays walkable, metres. */
const MIN_WALK = 0.45;
/** Scallops stay off the floor the stream froze on: none below this height, full depth a metre above it. */
const SCALLOP_FLOOR = 0.4;
/** A scallop's rim lies nearer its centre upstream than downstream: eddies cut the steep side facing the flow. */
const SCALLOP_STEEP = 1.5, SCALLOP_GENTLE = 0.8;
/** Scallops are wider along the flow than across it. */
const SCALLOP_ACROSS = 0.7;
/** Festoons per metre along a curtain's lower edge, and the metres over which it thins toward that edge. */
const FESTOON_RATE = 1.3, CURTAIN_THINNING = 2.5;
/** How deep a pillar is rooted into floor and roof, how far it blends into them, and where its waist is. */
const PILLAR_ROOT = 1.5, PILLAR_BLEND = 1.6, WAIST_AT = 0.42;

/** The section keyed at `s` metres along: each value eased between the keys either side. */
function keyed(keys, s) {
  let index = 0;
  while (index < keys.length - 2 && keys[index + 1][0] < s) index += 1;
  const from = keys[index], to = keys[index + 1];
  const t = clamp((s - from[0]) / (to[0] - from[0]), 0, 1);
  const ease = t * t * (3 - 2 * t);
  return from.slice(1).map((value, column) => value + (to[column + 1] - value) * ease);
}

/** Depth (0..1) of the eddy dish at `s` metres along, `u` across and `v` up a tube; flow runs toward +s. */
function scallop(s, u, v, size, seed) {
  const ax = s / size, ay = u / (size * SCALLOP_ACROSS), az = v / (size * SCALLOP_ACROSS);
  const ix = Math.floor(ax), iy = Math.floor(ay), iz = Math.floor(az);
  let dish = 0;
  for (let k = iz - 1; k <= iz + 1; k += 1) {
    for (let j = iy - 1; j <= iy + 1; j += 1) {
      for (let i = ix - 1; i <= ix + 1; i += 1) {
        // One dish per cell, its centre jittered within it.
        const along = ax - i - valueNoise3(i, j, k, seed + 11);
        const dx = along * (along < 0 ? SCALLOP_STEEP : SCALLOP_GENTLE);
        const dy = ay - j - valueNoise3(i, j, k, seed + 12), dz = az - k - valueNoise3(i, j, k, seed + 13);
        const reach = dx * dx + dy * dy + dz * dz;
        if (reach < 1) dish = Math.max(dish, (1 - reach) * (1 - reach));
      }
    }
  }
  return dish;
}

/**
 * A meltwater tube along floor `points`, flowing from the first to the last:
 * the round tube the water melted while it ran full, and the slot its stream
 * cut down through that tube's floor once it ran free — a keyhole, or at a
 * squeeze little but slot. `keys` give the section by metres along,
 * `[metres, slot half-width at the floor, slot depth, tube half-width, tube
 * half-height, tube's offset to one side]`. `wobble` (0..1) lets the bore
 * drift from them over metres, `lean` (metres per metre) tilts the slot as its
 * meander migrated, and `scallops` (`{ size, depth }`, metres) dish the walls.
 * `trail` caps how far either side of the line the walker may go.
 *
 * Returns the shape for `DensityGrid.carve`, and its `stations`, each with
 * `walk`: the walkable half-width there.
 */
export function meltTube(points, { keys, trail, wobble, lean, scallops, seed }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
  const length = curve.getLength();
  const count = Math.max(2, Math.round(length / STATION_STEP));
  const swing = (s, rate, axis) => fbm3(s * rate, axis, 0.5, seed, 2) - 0.5;
  const stations = curve.getSpacedPoints(count).map(({ x, y, z }, index) => {
    const s = index * length / count;
    const [half, depth, rx, ry, offset] = keyed(keys, s);
    const bore = 1 + swing(s, WOBBLE_RATE, 0.5) * 2 * wobble;
    const station = {
      x, y, z, s, offset,
      half: half * bore,
      depth: depth * (1 + swing(s, WOBBLE_RATE, 7.5) * wobble),
      rx: rx * bore,
      ry: ry * (1 + (bore - 1) * 0.6),
      lean: clamp(swing(s, LEAN_RATE, 3.5) * 5 * lean, -lean, lean),
    };
    station.top = station.depth + station.ry * TUBE_SEAT;
    const head = station.half * (1 - SLOT_NARROWING * Math.min(1, HEAD / station.top))
      - Math.abs(station.lean) * HEAD - HEAD_CLEARANCE;
    station.walk = Math.max(MIN_WALK, Math.min(trail, station.half - FOOT_CLEARANCE, head));
    return station;
  });

  let reach = 0, ceiling = -Infinity;
  for (const station of stations) {
    reach = Math.max(reach, station.rx + Math.abs(station.offset), station.half);
    ceiling = Math.max(ceiling, station.y + station.top + station.ry);
  }
  reach += 1 + scallops.depth;
  const xs = stations.map((station) => station.x), zs = stations.map((station) => station.z);
  return {
    stations,
    box: box(Math.min(...xs) - reach, Math.min(...stations.map((station) => station.y)) - 1, Math.min(...zs) - reach,
      Math.max(...xs) + reach, ceiling + 1, Math.max(...zs) + reach),
    air(x, y, z) {
      // The nearest point of the course in plan; beyond a bend or an end that is the station itself.
      let best = Infinity, index = 0, t = 0, side = 1;
      for (let i = 0; i < stations.length - 1; i += 1) {
        const a = stations[i], c = stations[i + 1];
        const dx = c.x - a.x, dz = c.z - a.z;
        const f = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1e-6), 0, 1);
        const ex = x - a.x - dx * f, ez = z - a.z - dz * f;
        const distanceSq = ex * ex + ez * ez;
        if (distanceSq < best) { best = distanceSq; index = i; t = f; side = dx * ez - dz * ex < 0 ? -1 : 1; }
      }
      const a = stations[index], c = stations[index + 1];
      const at = (key) => a[key] + (c[key] - a[key]) * t;
      const u = side * Math.sqrt(best), v = y - at('y');
      const top = at('top'), rx = at('rx'), ry = at('ry');
      const slot = Math.min(at('half') * (1 - SLOT_NARROWING * clamp(v / top, 0, 1)) - Math.abs(u - at('lean') * v), top - v);
      const tube = (1 - Math.hypot((u - at('offset')) / rx, (v - top) / ry)) * Math.min(rx, ry);
      const air = Math.min(Math.max(slot, tube), v);
      if (Math.abs(air) > scallops.depth * 3) return air;
      return air + scallops.depth * clamp(v - SCALLOP_FLOOR, 0, 1) * scallop(at('s'), u, v, scallops.size, seed);
    },
  };
}

/**
 * A blade of ice between plan points `a` and `c`, from `bottom` up to `top`: a
 * web left between two melt channels, or a curtain where the roof's meltwater
 * ran down and froze. Its lower edge hangs in festoons up to `festoon` metres
 * above `bottom` (its lowest point), and it thins toward that edge, where it glows.
 */
export function curtain(a, c, { thickness, bottom, top, festoon = 0, seed = 0 }) {
  const dx = c.x - a.x, dz = c.z - a.z, length = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / length, uz = dz / length, pad = thickness + 1;
  return {
    box: box(Math.min(a.x, c.x) - pad, bottom - 1, Math.min(a.z, c.z) - pad, Math.max(a.x, c.x) + pad, top + 1, Math.max(a.z, c.z) + pad),
    solid(x, y, z) {
      const along = (x - a.x) * ux + (z - a.z) * uz;
      const side = (z - a.z) * ux - (x - a.x) * uz;
      const edge = bottom + festoon * (0.5 - 0.5 * Math.cos(along * FESTOON_RATE + seed));
      const half = thickness * 0.5 * clamp(0.5 + (y - edge) / CURTAIN_THINNING, 0.5, 1);
      return Math.max(Math.abs(side) - half, -along, along - length, edge - y, y - top);
    },
  };
}

/**
 * An ice pillar the melt left standing on floor point `at`: flared into floor and roof, pinched below
 * mid-height where the draught ran fastest past it. `lean` (world metres) tips its head over, as the
 * ice above crept on. Blocks the walker at its foot; returns the height of the roof it holds up.
 */
export function pillar(b, at, { base, waist, crown }, lean = { x: 0, z: 0 }) {
  const roof = b.probe(at.x, at.y + 2, at.z, 1, 40) ?? at.y + 20;
  const neck = { x: at.x + lean.x * WAIST_AT, y: at.y + (roof - at.y) * WAIST_AT, z: at.z + lean.z * WAIST_AT };
  b.grid.fill(column({ x: at.x, y: at.y - PILLAR_ROOT, z: at.z }, neck, base, waist), PILLAR_BLEND);
  b.grid.fill(column(neck, { x: at.x + lean.x, y: roof + PILLAR_ROOT, z: at.z + lean.z }, waist, crown), PILLAR_BLEND);
  // The blend flares the foot past the column's own radius.
  b.nav.block(at, base + PILLAR_BLEND * 0.5 + 0.3, 6);
  return roof;
}

/** The opening a solid would fill: bells, chimneys and basins cut with a solid's shape. */
export const hollow = (shape) => ({ box: shape.box, air: (x, y, z) => -shape.solid(x, y, z) });

/** The solid an opening would leave: drift that has filled the bottom of a crevasse. */
export const plug = (shape) => ({ box: shape.box, solid: (x, y, z) => -shape.air(x, y, z) });

/**
 * How free a point is of the walker's floor: 0 on a walked area and up to
 * `keep` metres beside it, rising to 1 at `reach` metres, and 1 anywhere more
 * than `above` metres over it. Drift, snow and debris are scaled by it, so the
 * floor stays where navigation says it is. Read once the walked areas are laid.
 */
export function walkClearance(nav, { min, max }, { cell = 0.5, keep = 0.5, reach = 2, above = 1.2 } = {}) {
  const nx = Math.ceil((max.x - min.x) / cell) + 1, nz = Math.ceil((max.z - min.z) / cell) + 1;
  const floor = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k += 1) {
    for (let i = 0; i < nx; i += 1) floor[i + k * nx] = nav.surfaceAt(min.x + i * cell, min.z + k * cell, Infinity) ?? NaN;
  }
  const span = Math.ceil(reach / cell);
  const distance = new Float32Array(nx * nz).fill(Infinity), height = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k += 1) {
    for (let i = 0; i < nx; i += 1) {
      const index = i + k * nx;
      for (let dk = -span; dk <= span; dk += 1) {
        for (let di = -span; di <= span; di += 1) {
          const ii = i + di, kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const y = floor[ii + kk * nx], d = Math.hypot(di, dk) * cell;
          if (y === y && d < distance[index]) { distance[index] = d; height[index] = y; }
        }
      }
    }
  }
  return (x, y, z) => {
    const i = Math.round((x - min.x) / cell), k = Math.round((z - min.z) / cell);
    if (i < 0 || k < 0 || i >= nx || k >= nz) return 1;
    const index = i + k * nx;
    if (distance[index] === Infinity || y > height[index] + above) return 1;
    return clamp((distance[index] - keep) / (reach - keep), 0, 1);
  };
}
