import * as THREE from 'three/webgpu';
import { spindle } from '../gen/iceKit.js';
import { fbm3 } from '../gen/noise.js';

/**
 * Umbra'kor's fungus crop, grown on the shelf by the lake. Three species, each
 * a shaped body of revolution whose glow is painted per vertex, because a
 * bioluminescent fungus is read by where it glows: bright gill ridges and rim,
 * a dim speckled cap, a stem that fades from the light above it to the soil.
 *
 *  - lantern caps: the tall crop, a convex parasol over gills, ringed stem, swollen foot;
 *  - bell clusters: slender fruit bodies in a tuft, conical striate caps, a colder light;
 *  - shelf brackets: violet half-discs stacked on the damp kerb stone, banded by growth.
 *
 * Every body carries its own `tint`, which `LocationBuilder.prop` keeps.
 */

const TAU = Math.PI * 2;
const P = (x, y, z) => ({ x, y, z });
const linear = (hex) => new THREE.Color(hex).toArray();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

const LANTERN = linear('#79e3c4');
const BELL = linear('#b5f2ff');
const BRACKET = linear('#b08cff');
const DUSK = linear('#3a2d6b');
const PALE = linear('#e6fff6');
const LOAM = linear('#3b2e28');
const MYCELIUM = linear('#9d98ad');

/** Paints a spindle per (station, side): `paint(station, side, x, y, z)` → linear rgb. */
function painted(geometry, stations, sides, paint) {
  const position = geometry.attributes.position;
  const last = stations.length - 1;
  const tint = new Float32Array(position.count * 3);
  const put = (v, s, k) => tint.set(paint(s, k, position.getX(v), position.getY(v), position.getZ(v)), v * 3);
  put(0, 0, 0);
  for (let s = 1; s < last; s += 1) for (let k = 0; k < sides; k += 1) put(1 + (s - 1) * sides + k, s, k);
  put(position.count - 1, last, 0);
  geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  return geometry;
}

/**
 * The loam a bed is filled with: a low, lumpy mound `hx` by `hz` over `at`,
 * threaded with pale mycelium. Returns the mesh and `groundAt(x, z)`, the
 * height of its surface, so what grows from it stands on it.
 */
export function loamMound(at, hx, hz, peak, seed) {
  const bump = (x, z) => (fbm3(x * 1.4, 0, z * 1.4, seed, 3) - 0.5) * peak * 0.9;
  // [radial share, height share]: a domed top that rolls over at the boards.
  const profile = [[0.45, 0.88], [0.8, 0.55], [0.95, 0.18], [1, 0]];
  const sides = 20;
  const stations = [{ ...at, y: at.y + peak, r: 1 }];
  for (const [, rise] of profile) stations.push({ ...at, y: at.y + peak * rise, r: 1 });
  stations.push({ ...at, y: at.y - 0.06, r: 0 });
  const shape = (u, t) => {
    const s = Math.round(t * (stations.length - 1));
    const share = profile[s - 1]?.[0] ?? 0;
    const dx = Math.cos(u) * hx * share, dz = Math.sin(u) * hz * share;
    return [dx, dz, s <= profile.length - 1 ? bump(at.x + dx, at.z + dz) : 0];
  };
  const geometry = painted(spindle(stations, sides, shape), stations, sides, (s, k, x, y, z) => {
    const threads = fbm3(x * 3.1, y * 3.1, z * 3.1, seed + 3, 3);
    const grain = 0.8 + fbm3(x * 9, y * 9, z * 9, seed + 5, 2) * 0.4;
    return scale(mix(LOAM, MYCELIUM, Math.max(0, Math.min(1, (threads - 0.56) * 4.5))), grain);
  });
  const groundAt = (x, z) => {
    const reach = Math.hypot((x - at.x) / hx, (z - at.z) / hz);
    let lo = [0, 1];
    for (const point of profile) {
      if (reach <= point[0]) {
        const t = (reach - lo[0]) / (point[0] - lo[0]);
        return at.y + peak * (lo[1] + (point[1] - lo[1]) * t) + bump(x, z);
      }
      lo = point;
    }
    return at.y;
  };
  return { geometry, groundAt };
}

/**
 * A lantern cap standing on `base`, `height` to the gills, cap `radius` wide.
 * The stem bends as it grew, rings under the cap and swells into its foot;
 * the cap is a convex parasol, tilted, its margin waved and turned under over
 * ridged gills.
 */
export function lanternCap(base, height, radius, range) {
  const lean = range(0, TAU), bend = height * range(0.04, 0.16), girth = radius * range(0.09, 0.13);
  const axis = (s) => P(base.x + Math.cos(lean) * bend * s * s, base.y + height * s, base.z + Math.sin(lean) * bend * s * s);

  // Stem, cap end first: the ring (annulus) a little under the gills, the swollen foot just above the soil.
  const stemRings = [[1.02, 0.95], [0.86, 1.0], [0.84, 1.75], [0.8, 1.05], [0.45, 1.12], [0.12, 1.55], [0.03, 1.4]];
  const stemSides = 7;
  const top = axis(1);
  const stem = [{ ...top, y: top.y + radius * 0.1, r: 0 }];
  for (const [s, swell] of stemRings) stem.push({ ...axis(s), r: girth * swell });
  stem.push({ ...base, y: base.y - 0.05, r: 0 });
  const fibres = (u) => [Math.cos(u) * (1 + 0.07 * Math.cos(5 * u)), Math.sin(u) * (1 + 0.07 * Math.cos(5 * u))];
  const stemBody = painted(spindle(stem, stemSides, fibres), stem, stemSides, (s, k) => {
    const along = Math.min(1, s / (stem.length - 2));
    const lit = 0.24 * (1 - along) ** 2.2 + 0.012;
    const skirt = s === 3 ? 0.2 : 0;
    return scale(mix(LANTERN, PALE, 0.5), (lit + skirt) * (k % 2 ? 0.82 : 1));
  });

  // Cap, apex first: dome, a rim turned under, gills rising back to the stem. [radius share, height share].
  const dome = radius * range(0.38, 0.62);
  const capRings = [[0.32, 0.93], [0.62, 0.74], [0.85, 0.44], [1, 0.08], [0.95, -0.07], [0.78, -0.02], [0.45, 0.06], [0.2, 0.1]];
  const RIM = 4, UNDER = 5, capSides = 16;
  const tiltAt = range(0, TAU), tilt = range(0, 0.18);
  const waves = 3 + Math.floor(range(0, 4)), wavePhase = range(0, TAU), wave = radius * range(0.03, 0.08);
  const cap = [{ ...top, y: top.y + dome * 1.06, r: 0 }];
  for (const [share, rise] of capRings) cap.push({ ...top, y: top.y + dome * rise, r: radius * share });
  cap.push({ ...top, y: top.y + dome * 0.12, r: 0 });
  const last = cap.length - 1;
  const capShape = (u, t) => {
    const s = Math.round(t * last);
    const share = capRings[s - 1]?.[0] ?? 0;
    const lobe = 1 + 0.06 * Math.sin(waves * u + wavePhase);
    const rim = s >= RIM - 1 ? Math.sin(waves * u + wavePhase) * wave * (s >= RIM && s <= UNDER ? 1 : 0.4) : 0;
    const gill = s > UNDER ? Math.cos(capSides / 2 * u) * radius * 0.025 : 0;
    const lift = Math.cos(u - tiltAt) * tilt * radius * share;
    return [Math.cos(u) * lobe, Math.sin(u) * lobe, rim + gill + lift];
  };
  const capBody = painted(spindle(cap, capSides, capShape), cap, capSides, (s, k, x, y, z) => {
    // Odd sides are the gill edges hanging lowest: the brightest thing on the fungus.
    if (s > UNDER) return scale(mix(LANTERN, PALE, 0.18), k % 2 ? 1.2 : 0.55);
    if (s >= RIM) return scale(mix(LANTERN, PALE, 0.2), 1.05);
    // The cap is the lantern: lit through, dimmer toward the umbo, freckled with dark scales.
    const share = capRings[s - 1]?.[0] ?? 0;
    const speckle = fbm3(x * 16, y * 16, z * 16, 11, 2) > 0.6 ? 1 : 0;
    const fibril = s >= 2 && k % 2 ? 0.88 : 1;
    return scale(mix(mix(LANTERN, PALE, 0.1), DUSK, 0.12 + speckle * 0.7), (0.5 + 0.38 * share - speckle * 0.25) * fibril);
  });
  return [stemBody, capBody];
}

/**
 * A tuft of `count` slender bell caps growing from one point, leaning out
 * from it and curving back up. Caps are conical, darker at the point, ribbed
 * where the gills show through.
 */
export function bellCluster(at, count, range) {
  const bodies = [];
  for (let index = 0; index < count; index += 1) {
    const heading = index / count * TAU + range(-0.4, 0.4), splay = range(0.03, 0.09);
    const height = range(0.1, 0.32), girth = range(0.008, 0.015), radius = range(0.025, 0.055);
    const axis = (s) => {
      const out = splay * Math.sin(s * Math.PI * 0.6);
      return P(at.x + Math.cos(heading) * out, at.y + height * s, at.z + Math.sin(heading) * out);
    };
    const top = axis(1);
    const stem = [{ ...top, y: top.y + radius * 0.3, r: 0 }];
    for (const s of [1, 0.6, 0.25, 0]) stem.push({ ...axis(s), r: girth * (1 + (1 - s) * 0.35) });
    stem.push({ ...at, y: at.y - 0.03, r: 0 });
    bodies.push(painted(spindle(stem, 5), stem, 5, (s) => scale(BELL, 0.28 - s * 0.04)));

    const bell = radius * range(1, 1.5);
    const rings = [[0.42, 0.78], [0.8, 0.38], [1, 0.02], [0.82, 0.08]];
    const cap = [{ ...top, y: top.y + bell, r: 0 }];
    for (const [share, rise] of rings) cap.push({ ...top, y: top.y + bell * rise, r: radius * share });
    cap.push({ ...top, y: top.y + bell * 0.18, r: 0 });
    const sides = 8;
    bodies.push(painted(spindle(cap, sides), cap, sides, (s, k) => {
      if (s === 0) return scale(BELL, 0.45);
      if (s >= 4) return scale(mix(BELL, PALE, 0.3), 1.15);
      return scale(BELL, (0.35 + s * 0.2) * (k % 2 ? 0.75 : 1));
    }));
  }
  return bodies;
}

/**
 * Bracket fungi stacked up a wall at `at`, growing out along `facing` (yaw,
 * radians): flat against the stone behind, a lens in front with a waved,
 * bright margin and dim growth bands.
 */
export function shelfBrackets(at, facing, count, range) {
  const bodies = [];
  const out = { x: Math.sin(facing), z: Math.cos(facing) }, side = { x: Math.cos(facing), z: -Math.sin(facing) };
  for (let index = 0; index < count; index += 1) {
    const width = range(0.07, 0.16) * (1 - index * 0.18), thick = width * range(0.28, 0.4);
    const centre = P(at.x + side.x * range(-0.12, 0.12), at.y + index * range(0.06, 0.1), at.z + side.z * range(-0.12, 0.12));
    const rings = [[0.55, 0.85], [0.9, 0.35], [1, 0], [0.88, -0.35], [0.5, -0.6]];
    const stations = [{ ...centre, y: centre.y + thick, r: 0 }];
    for (const [share, rise] of rings) stations.push({ ...centre, y: centre.y + thick * rise, r: width * share });
    stations.push({ ...centre, y: centre.y - thick * 0.7, r: 0 });
    const phase = range(0, TAU);
    const shape = (u) => {
      const across = Math.cos(u), forward = Math.sin(u);
      const reach = (forward > 0 ? forward * 1.25 : forward * 0.08) * (1 + 0.08 * Math.sin(5 * u + phase));
      return [side.x * across + out.x * reach, side.z * across + out.z * reach];
    };
    const sides = 12;
    bodies.push(painted(spindle(stations, sides, shape), stations, sides, (s, k) => {
      if (s === 3) return scale(mix(BRACKET, PALE, 0.25), 0.95);
      if (s > 3) return scale(BRACKET, 0.62);
      return scale(mix(BRACKET, DUSK, 0.4), s % 2 ? 0.48 : 0.26);
    }));
  }
  return bodies;
}
