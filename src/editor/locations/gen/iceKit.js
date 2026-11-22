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

const smin = (a, b, k) => {
  if (k <= 1e-4) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
};

/** 3-octave ridged noise for sharp alpine fracture crests and weathered rock ledges. */
function ridgedRock3(x, y, z, seed) {
  let sum = 0;
  let amp = 0.58;
  let freq = 1;
  let weight = 1;
  for (let oct = 0; oct < 3; oct += 1) {
    const n = fbm3(x * freq + oct * 4.3, y * freq - oct * 2.9, z * freq + oct * 3.7, seed + oct * 19, 1);
    let r = 1 - Math.abs(n * 2 - 1);
    r = r * r * weight;
    weight = Math.max(0.2, Math.min(1, r * 1.7));
    sum += r * amp;
    freq *= 2.15;
    amp *= 0.46;
  }
  return sum;
}

/**
 * A sculpted alpine boulder or fractured block of fallen ice resting on `at`,
 * bedded naturally into the ground. `blocky` runs from 0 (weathered glacial
 * erratic with multi-octave ridged crags, stratified ledges, and rounded wind-
 * worn shoulders) to 1 (freshly calved ice block with crisp fracture facets).
 */
export function boulder(at, rx, ry, rz, { seed = 1, blocky = 0, yaw = 0, maxDetail = 5 } = {}) {
  const rng = createRng(seed);
  const range = (lo, hi) => lo + rng() * (hi - lo);
  const size = Math.max(rx, ry, rz);
  // High welded subdivision on foreground erratics & cairns eliminates flat polygonal silhouettes.
  const detail = Math.min(maxDetail, size < 0.35 ? 2 : size < 0.85 ? 3 : size < 1.6 ? 4 : 5);
  // Oblique cleavage planes: softer polynomial smooth-min on rocks, crisp cuts on calved ice.
  const planes = [{ x: 0, y: -1, z: 0, d: BASE_CUT }];
  const facets = Math.round(ROCK_FACETS + (ICE_FACETS - ROCK_FACETS) * blocky);
  for (let index = 0; index < facets; index += 1) {
    const frame = index < 5;
    const azimuth = frame ? (index - 1) * Math.PI / 2 + range(-0.42, 0.42) : range(0, TAU);
    const rise = index === 0 ? range(0.84, 0.98) : frame ? range(-0.22, 0.32) : range(-0.14, 0.88);
    const across = Math.sqrt(Math.max(0, 1 - rise * rise));
    const deep = frame ? range(0.62, 0.82) : range(0.72, 0.92), shallow = range(0.84, 0.98);
    planes.push({
      x: Math.cos(azimuth) * across,
      y: rise,
      z: Math.sin(azimuth) * across,
      d: shallow + (deep - shallow) * blocky,
    });
  }
  const smoothK = (1 - blocky) * 0.14 + 0.012;
  const strataTiltX = range(-0.28, 0.28);
  const strataTiltZ = range(-0.28, 0.28);
  const strataFreq = range(4.2, 7.2);

  const sphere = new THREE.IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-4);
  sphere.dispose();

  const position = geometry.attributes.position;
  const tints = new Float32Array(position.count * 3);
  for (let v = 0; v < position.count; v += 1) {
    const x = position.getX(v), y = position.getY(v), z = position.getZ(v);
    // Macro organic rock asymmetry + ridged glacial crags + dipping cleavage strata.
    const macro = (fbm3(x * 1.15 + seed * 0.13, y * 1.15, z * 1.15, seed, 3) - 0.5) * 0.36 * (1 - blocky * 0.55);
    const crag = (ridgedRock3(x * 1.85 + 2.1, y * 1.85 - 1.4, z * 1.85 + 0.7, seed + 47) - 0.44)
      * (0.34 * (1 - blocky * 0.35));
    const bedCoord = (y + x * strataTiltX + z * strataTiltZ) * strataFreq;
    const strata = Math.sin(bedCoord + macro * 2.6) * 0.038 * (1 - blocky * 0.65);
    // Subtle basal flare so boulders bed heavily into the snowfield instead of hovering.
    const baseFlare = Math.max(0, -y - 0.05) * 0.14 * (1 - blocky * 0.5);

    let reach = 1 + macro + crag + strata + baseFlare;
    for (let pIdx = 0; pIdx < planes.length; pIdx += 1) {
      const plane = planes[pIdx];
      const facing = x * plane.x + y * plane.y + z * plane.z;
      if (facing > 1e-3) {
        const planeReach = plane.d / facing;
        reach = pIdx === 0 ? Math.min(reach, planeReach) : smin(reach, planeReach, smoothK);
      }
    }
    // Fine chipped surface grit on top of the smoothly cleaved silhouette.
    const fine = (fbm3(x * 5.2 + 7.1, y * 5.2, z * 5.2, seed + 83, 2) - 0.5) * 0.055 * (1 - blocky * 0.4);
    reach = Math.max(0.28, reach + fine);

    const px = x * reach * rx;
    const py = (y * reach + BASE_CUT) * ry;
    const pz = z * reach * rz;
    position.setXYZ(v, px, py, pz);

    // Bake natural crevice/shoulder cavity occlusion so carved crags read crisply in any light.
    const crevice = Math.max(0.7, Math.min(1.08, 0.88 + crag * 0.65 + y * 0.08 + fine * 1.2));
    tints[v * 3] = crevice;
    tints[v * 3 + 1] = crevice * (0.99 + Math.max(0, y) * 0.02);
    tints[v * 3 + 2] = crevice * (1.0 + Math.max(0, y) * 0.03);
  }
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.computeVertexNormals();
  // Keep weathered rocks smooth-welded so triplanar rock normals & ridged displacement read organically;
  // only freshly calved ice blocks (`blocky >= 0.65`) sharpen into planar fracture facets.
  const sharpAmount = blocky >= 0.65 ? (blocky - 0.5) * 1.15 : 0;
  const shaped = sharpAmount > 0.05 ? sharpen(geometry.toNonIndexed(), sharpAmount) : geometry;
  if (yaw) shaped.rotateY(yaw);
  return shaped.translate(at.x, at.y, at.z);
}

/**
 * Continuous contoured snow blanket conforming closely to a pitched timber roof
 * (`width` along X, `depth` along Z tilted by `pitchRad`), with wind-drifted
 * depth undulation and smoothly feathered eaves (no bulbous cloud-buns).
 */
export function roofSnowBlanket(at, width, depth, pitchRad, {
  seed = 1,
  thickness = 0.14,
  cols = 18,
  rows = 8,
} = {}) {
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const vCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vCount * 3);
  const indices = [];

  for (let c = 0; c <= cols; c += 1) {
    const u = c / cols;
    const x = (u - 0.5) * width;
    const edgeX = Math.min(u, 1 - u);
    const taperX = Math.min(1, edgeX / 0.14);
    const smoothX = taperX * taperX * (3 - 2 * taperX);

    for (let r = 0; r <= rows; r += 1) {
      const v = r / rows;
      const z = (v - 0.5) * depth;
      const edgeZ = Math.min(v, 1 - v);
      const taperZ = Math.min(1, edgeZ / 0.18);
      const smoothZ = taperZ * taperZ * (3 - 2 * taperZ);

      // Wind-drifted uneven snow accumulation across the roof deck, feathering cleanly down at eaves.
      const drift = fbm3(x * 0.9 + seed * 0.37, z * 1.1 - seed * 0.21, 0.5, seed + 17, 3);
      const ripple = fbm3(x * 2.4 + 4.1, z * 2.2, 0.8, seed + 53, 2) - 0.5;
      const overhang = (v > 0.85 ? (v - 0.85) * 0.36 : 0) + (v < 0.15 ? (0.15 - v) * 0.24 : 0);
      const h = (thickness * (0.45 + drift * 0.85) + ripple * 0.04) * smoothX * smoothZ - overhang * 0.18;
      // Subtle wavy eave profile along the front/back lips.
      const eaveJitter = (fbm3(u * 5.2 + seed, v * 3.1, 0.3, seed + 71, 2) - 0.5) * 0.11;
      const pz = z + (v > 0.5 ? 1 : -1) * eaveJitter * (1 - smoothZ);
      const px = x + (u > 0.5 ? 1 : -1) * eaveJitter * 0.6 * (1 - smoothX);

      const idx = c * (rows + 1) + r;
      positions[idx * 3] = Math.max(-halfW - 0.12, Math.min(halfW + 0.12, px));
      positions[idx * 3 + 1] = h;
      positions[idx * 3 + 2] = Math.max(-halfD - 0.12, Math.min(halfD + 0.12, pz));
    }
  }

  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const a = c * (rows + 1) + r;
      const b = a + 1;
      const d = (c + 1) * (rows + 1) + r;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (pitchRad) geometry.rotateX(pitchRad);
  return geometry.translate(at.x, at.y, at.z);
}

/**
 * Smooth wind-sculpted snow pillow / drifted cap resting on `at` (e.g. atop a
 * roof, woodpile, cairn, or grounding collar). Replaces boxy `stoneBlock` snow caps.
 */
export function snowPillow(at, rx, ry, rz, { seed = 1, yaw = 0, drape = 0.22, detail = 3 } = {}) {
  const sphere = new THREE.IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-4);
  sphere.dispose();

  const position = geometry.attributes.position;
  for (let v = 0; v < position.count; v += 1) {
    const x = position.getX(v), y = position.getY(v), z = position.getZ(v);
    const drift = (fbm3(x * 1.45 + seed * 0.31, y * 1.2, z * 1.45 - seed * 0.17, seed + 13, 3) - 0.5) * 0.26;
    const ripple = (fbm3(x * 3.6 + 5.1, z * 2.1, y * 2.0, seed + 59, 2) - 0.5) * 0.08;
    const radial = 1 + drift + ripple;
    const horiz = Math.hypot(x, z);
    // Flatten underside softly, pillow the dome, and drape overhanging edges smoothly down.
    let sy = y < 0 ? y * 0.26 : Math.pow(y, 0.84) * (1 + drift * 0.55);
    sy -= Math.pow(Math.max(0, horiz - 0.55), 1.6) * drape;
    position.setXYZ(v, x * radial * rx, (sy + 0.24) * ry, z * radial * rz);
  }
  geometry.computeVertexNormals();
  if (yaw) geometry.rotateY(yaw);
  return geometry.translate(at.x, at.y, at.z);
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

/**
 * A crisp faceted hexagonal (or n-sided) glacial crystal prism from `base` to `tip`,
 * with beveled shoulder facets and an asymmetric pyramidal termination so specular
 * highlights and chromatic refraction catch sharp planar crystal faces instead of
 * reading as smooth low-poly cylinders.
 *
 * @param {{x:number,y:number,z:number}} base
 * @param {{x:number,y:number,z:number}} tip
 * @param {number} radius base radius in metres
 * @param {{ sides?: number, taper?: number, tipRatio?: number, twist?: number, seed?: number, flare?: number }} [options]
 */
export function facetedCrystal(base, tip, radius, {
  sides = 6,
  taper = 0.72,
  tipRatio = 0.24,
  twist = 0.08,
  seed = 1,
  flare = 1.12,
} = {}) {
  const rng = createRng(seed * 7919 + Math.round(radius * 10007) + 13);
  const dx = tip.x - base.x, dy = tip.y - base.y, dz = tip.z - base.z;
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const ax = dx / len, ay = dy / len, az = dz / len;
  const ref = Math.abs(ay) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  // Orthonormal frame (u, v, axis)
  let ux = ay * ref.z - az * ref.y;
  let uy = az * ref.x - ax * ref.z;
  let uz = ax * ref.y - ay * ref.x;
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen; uy /= uLen; uz /= uLen;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;

  // Slightly irregular hexagonal facet radii & tip asymmetry for natural quartz/ice habit.
  const sideScale = Array.from({ length: sides }, () => 0.84 + rng() * 0.32);
  const shoulderShift = Array.from({ length: sides }, () => (rng() - 0.5) * tipRatio * 0.45);
  const roll = rng() * TAU;

  const ringPoint = (alongFrac, radScale, k, extraTwist = 0) => {
    const angle = roll + (k / sides) * TAU + extraTwist;
    const r = radius * radScale * sideScale[k % sides];
    const ca = Math.cos(angle) * r, sa = Math.sin(angle) * r;
    const h = alongFrac * len;
    return [
      base.x + ax * h + ux * ca + vx * sa,
      base.y + ay * h + uy * ca + vy * sa,
      base.z + az * h + uz * ca + vz * sa,
    ];
  };

  const positions = [];
  const pushTri = (p0, p1, p2) => {
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  };

  const baseCenter = [base.x, base.y, base.z];
  const tipOffU = (rng() - 0.5) * radius * 0.22;
  const tipOffV = (rng() - 0.5) * radius * 0.22;
  const apex = [
    tip.x + ux * tipOffU + vx * tipOffV,
    tip.y + uy * tipOffU + vy * tipOffV,
    tip.z + uz * tipOffU + vz * tipOffV,
  ];
  const midFrac = 0.44;
  const shoulderFrac = Math.max(0.55, 1 - tipRatio);

  for (let k = 0; k < sides; k += 1) {
    const k1 = (k + 1) % sides;
    const b0 = ringPoint(0, flare, k, 0);
    const b1 = ringPoint(0, flare, k1, 0);
    const m0 = ringPoint(midFrac, 0.5 * (1 + taper), k, twist * 0.5);
    const m1 = ringPoint(midFrac, 0.5 * (1 + taper), k1, twist * 0.5);
    const s0 = ringPoint(shoulderFrac + shoulderShift[k], taper, k, twist);
    const s1 = ringPoint(shoulderFrac + shoulderShift[k1], taper, k1, twist);

    // Lower prism facet
    pushTri(b0, b1, m1);
    pushTri(b0, m1, m0);
    // Upper prism facet
    pushTri(m0, m1, s1);
    pushTri(m0, s1, s0);
    // Pyramidal crystal termination facet
    pushTri(s0, s1, apex);
    // Base cap
    pushTri(baseCenter, b1, b0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a single local-space multi-crystal cluster (centred at origin, pointing +Y)
 * suitable for GPU-instanced crystal fields (`LocationCrystalField.js`).
 *
 * @param {{ prisms?: number, seed?: number, height?: number, radius?: number }} [options]
 */
export function crystalClusterUnit({ prisms = 4, seed = 17, height = 0.85, radius = 0.14 } = {}) {
  const rng = createRng(seed * 4999 + 31);
  const parts = [];
  for (let i = 0; i < prisms; i += 1) {
    const isHero = i === 0;
    const angle = (i / Math.max(1, prisms - 1)) * TAU + rng() * 0.55;
    const tilt = isHero ? 0.08 + rng() * 0.12 : 0.34 + rng() * 0.42;
    const h = height * (isHero ? 1.0 : 0.48 + rng() * 0.42);
    const r = radius * (isHero ? 1.0 : 0.56 + rng() * 0.32);
    const bx = isHero ? 0 : Math.cos(angle) * radius * 0.55;
    const bz = isHero ? 0 : Math.sin(angle) * radius * 0.55;
    const tx = bx + Math.cos(angle) * Math.sin(tilt) * h;
    const ty = Math.cos(tilt) * h;
    const tz = bz + Math.sin(angle) * Math.sin(tilt) * h;
    parts.push(facetedCrystal(
      { x: bx, y: -r * 0.55, z: bz },
      { x: tx, y: ty, z: tz },
      r,
      { sides: 6, taper: 0.68, tipRatio: 0.28, seed: seed + i * 29, flare: 1.08 },
    ));
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}
