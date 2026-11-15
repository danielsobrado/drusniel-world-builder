import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, fbm3 } from './noise.js';

/** World-space natural forms too small for the volume: icicles, boulders, fallen ice. */

const TAU = Math.PI * 2;
const ROUND = (u) => [Math.cos(u), Math.sin(u)];

/** Share of an icicle's length taken by the flare where it grew out of the roof. */
const ROOT = 0.16;
/** How much wider than its body an icicle is where it meets the roof. */
const ROOT_FLARE = 0.9;
/** Metres between an icicle's rings: fine enough to carry its drip ripples, coarse enough to hang hundreds. */
const RING_SPACING = 0.26;
const MIN_RINGS = 3, MAX_RINGS = 14;
/** Thinnest an icicle gets short of its point, metres. */
const MIN_RADIUS = 0.004;
/** Share of icicles that have snapped (a blunt stump), and of long ones that split into two points. */
const BROKEN_SHARE = 0.14, FORKED_SHARE = 0.1;
/** A forked tip leans away from the main one by this much sideways per metre down. */
const FORK_SPLAY = 0.45;

/** Facets worn onto a rock (shallow), and fracture faces of a block of ice (deep). */
const ROCK_FACETS = 7, ICE_FACETS = 12;
/** Where the flat underside of a boulder is cut, as a share of its half height below the middle. */
const BASE_CUT = 0.35;

/**
 * A closed, smooth-shaded body through `stations` (top to bottom), each
 * `{ x, y, z, r }`. The first and last are single points that close it; every
 * other is a horizontal ring of `sides` vertices whose plan shape `shape(u, t)`
 * gives as `[dx, dz]` per unit of `r` (u: angle round the ring, t: 0 top .. 1
 * bottom). A third value lifts that vertex, which is how a sheet's edge arches.
 */
export function spindle(stations, sides, shape = ROUND) {
  const last = stations.length - 1;
  const positions = [stations[0].x, stations[0].y, stations[0].z];
  for (let s = 1; s < last; s += 1) {
    const { x, y, z, r } = stations[s];
    for (let k = 0; k < sides; k += 1) {
      const [dx, dz, dy = 0] = shape(k / sides * TAU, s / last);
      positions.push(x + dx * r, y + dy, z + dz * r);
    }
  }
  positions.push(stations[last].x, stations[last].y, stations[last].z);
  const tip = positions.length / 3 - 1;
  const ring = (s, k) => 1 + (s - 1) * sides + (k % sides);
  const index = [];
  for (let k = 0; k < sides; k += 1) {
    index.push(0, ring(1, k + 1), ring(1, k));
    for (let s = 1; s < last - 1; s += 1) {
      index.push(ring(s, k), ring(s, k + 1), ring(s + 1, k), ring(s, k + 1), ring(s + 1, k + 1), ring(s + 1, k));
    }
    index.push(ring(last - 1, k), ring(last - 1, k + 1), tip);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * An icicle hanging from `top`. Water freezing as it runs down builds a fat
 * upper third over a long thin point, ripples where the drip paused, and a
 * flattened, lobed section where it ran down one side more than another. It
 * widens into the surface it grew from, its root runs `sink` metres on into
 * it, and `lean` (metres at the tip) is the wind it froze in. Everything else —
 * taper, bow, ripples, a snapped or forked tip — follows from `phase` and
 * `length`, so no two neighbours match.
 *
 * @param {{x:number,y:number,z:number}} top where it meets the roof or eave
 * @param {number} length metres below `top`
 * @param {number} radius metres, at the base of the flare
 * @param {{ lean?: {x:number,z:number}, phase?: number, sink?: number, broken?: boolean }} [options]
 *   `broken`: true snaps the point off, false keeps it whole; by default about one in seven is snapped.
 */
export function icicle(top, length, radius, { lean = { x: 0, z: 0 }, phase = 0, sink = radius * 1.5, broken } = {}) {
  const rng = createRng(Math.round(phase * 7919) + Math.round(length * 104729) + 1);
  const range = (lo, hi) => lo + rng() * (hi - lo);
  const snapped = broken ?? rng() < BROKEN_SHARE;
  const forked = !snapped && length > 0.9 && rng() < FORKED_SHARE;
  const taper = range(1.15, 1.7), shoulder = range(0.08, 0.3), shoulderAt = range(0.12, 0.32);
  const flat = range(0.06, 0.22), flatAt = range(0, Math.PI), lobes = range(0, 0.07), lobeAt = range(0, TAU);
  const twist = range(-1, 1), bowAt = range(0, TAU), bow = length * range(0.01, 0.035);
  const rings = Math.min(MAX_RINGS, Math.max(MIN_RINGS, Math.round(length / RING_SPACING) + 2));
  // A ripple needs three rings to read; short icicles get fewer, never aliased ones.
  const ripples = Math.min(Math.floor(rings / 3), Math.round(length / range(0.3, 0.55)));
  const rippleAmp = range(0.05, 0.14), ripplePhase = range(0, TAU);
  const sides = length < 0.45 ? 5 : length < 1.4 ? 6 : length < 2.8 ? 7 : 8;
  const end = snapped ? range(0.5, 0.85) : 1;

  const axis = (s) => ({
    x: top.x + lean.x * s * s + Math.cos(bowAt) * bow * Math.sin(Math.PI * s),
    y: top.y - length * s,
    z: top.z + lean.z * s * s + Math.sin(bowAt) * bow * Math.sin(Math.PI * s),
  });
  const radiusAt = (s) => {
    const flare = s < ROOT ? 1 + ROOT_FLARE * ((ROOT - s) / ROOT) ** 2 : 1;
    const body = (1 - s) ** taper * (1 + shoulder * Math.exp(-(((s - shoulderAt) / 0.14) ** 2)));
    const ripple = 1 + rippleAmp * Math.sin(ripples * TAU * s + ripplePhase) * (1 - s);
    return Math.max(MIN_RADIUS, radius * body * flare * ripple);
  };
  const shape = (u, t) => {
    const scale = 1 + flat * Math.cos(2 * (u - flatAt - twist * t)) + lobes * Math.cos(3 * u + lobeAt);
    return [Math.cos(u) * scale, Math.sin(u) * scale];
  };

  // The root closes in a cone running up into what it hangs from.
  const stations = [{ ...axis(0), y: top.y + Math.max(sink, radiusAt(0) * 0.5), r: 0 }];
  // A whole icicle closes on its point; a snapped one on a blunt break just below its last ring.
  const step = snapped ? end / (rings - 1) : 1 / rings;
  for (let ring = 0; ring < rings; ring += 1) stations.push({ ...axis(ring * step), r: radiusAt(ring * step) });
  const point = axis(end);
  stations.push({ ...point, y: point.y - (snapped ? radiusAt(end) * 0.3 : 0), r: 0 });
  const body = spindle(stations, sides, shape);
  return forked ? mergeGeometries([body, fork(axis, radiusAt, length, taper, sides, shape, range)]) : body;
}

/** The second point of a forked icicle: it splits off partway down and splays aside. */
function fork(axis, radiusAt, length, taper, sides, shape, range) {
  const from = range(0.4, 0.65), heading = range(0, TAU);
  const start = axis(from), drop = (1 - from) * length * range(0.45, 0.75), girth = radiusAt(from) * 0.6;
  const rings = Math.max(3, Math.round(drop / RING_SPACING) + 1);
  const at = (d) => ({
    x: start.x + Math.cos(heading) * FORK_SPLAY * d, y: start.y - d, z: start.z + Math.sin(heading) * FORK_SPLAY * d,
  });
  const stations = [{ ...start, y: start.y + girth, r: 0 }];
  for (let ring = 0; ring < rings; ring += 1) {
    const s = ring / rings;
    stations.push({ ...at(drop * s), r: Math.max(MIN_RADIUS, girth * (1 - s) ** taper) });
  }
  stations.push({ ...at(drop), r: 0 });
  return spindle(stations, Math.max(4, sides - 2), shape);
}

/**
 * A boulder or a block of fallen ice resting on `at`, flat underneath.
 * `blocky` runs from 0, a weathered rock (a lumpy body with its corners worn
 * into shallow facets, shaded round), to 1, a calved block (cut by deep flat
 * fracture faces that meet in sharp edges).
 */
export function boulder(at, rx, ry, rz, { seed = 1, blocky = 0, yaw = 0 } = {}) {
  const rng = createRng(seed);
  const range = (lo, hi) => lo + rng() * (hi - lo);
  const size = Math.max(rx, ry, rz);
  const detail = size < 0.45 ? 1 : size < 1.1 ? 2 : 3;
  // Fracture planes in the unit body. The first five frame it (a top, four sides), as ice
  // calves along its layers and joints; the rest are chips off its corners.
  const planes = [{ x: 0, y: -1, z: 0, d: BASE_CUT }];
  const facets = Math.round(ROCK_FACETS + (ICE_FACETS - ROCK_FACETS) * blocky);
  for (let index = 0; index < facets; index += 1) {
    const frame = index < 5;
    const azimuth = frame ? (index - 1) * Math.PI / 2 + range(-0.35, 0.35) : range(0, TAU);
    const rise = index === 0 ? range(0.92, 1) : frame ? range(-0.2, 0.25) : range(-0.1, 0.9);
    const across = Math.sqrt(1 - rise * rise);
    const deep = frame ? range(0.58, 0.8) : range(0.7, 0.9), shallow = range(0.82, 0.96);
    planes.push({ x: Math.cos(azimuth) * across, y: rise, z: Math.sin(azimuth) * across, d: shallow + (deep - shallow) * blocky });
  }
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('uv').deleteAttribute('normal'));
  const position = geometry.attributes.position;
  for (let v = 0; v < position.count; v += 1) {
    const x = position.getX(v), y = position.getY(v), z = position.getZ(v);
    // Each vertex is pulled in along its own direction onto the nearest plane in its way, so
    // every face stays flat and the mesh keeps its even spacing.
    let reach = 1 + (fbm3(x * 1.3 + seed, y * 1.3, z * 1.3, seed, 3) - 0.5) * 0.5 * (1 - blocky);
    for (const plane of planes) {
      const facing = x * plane.x + y * plane.y + z * plane.z;
      if (facing > 1e-3) reach = Math.min(reach, plane.d / facing);
    }
    position.setXYZ(v, x * reach * rx, (y * reach + BASE_CUT) * ry, z * reach * rz);
  }
  geometry.computeVertexNormals();
  const shaped = blocky > 0 ? sharpen(geometry.toNonIndexed(), blocky) : geometry;
  if (yaw) shaped.rotateY(yaw);
  return shaped.translate(at.x, at.y, at.z);
}

/** Bends smooth normals toward their faces' by `amount`: fracture edges catch the light, worn ones roll it. */
function sharpen(geometry, amount) {
  const position = geometry.attributes.position.array, normal = geometry.attributes.normal.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < position.length; i += 9) {
    a.fromArray(position, i); b.fromArray(position, i + 3); c.fromArray(position, i + 6);
    const face = b.sub(a).cross(c.sub(a)).normalize();
    for (let corner = i; corner < i + 9; corner += 3) {
      n.fromArray(normal, corner).lerp(face, amount).normalize().toArray(normal, corner);
    }
  }
  return geometry;
}
