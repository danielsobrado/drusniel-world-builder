import { cellNoise3, fbm3 } from '../gen/noise.js';
import { crevasse, tunnel } from '../gen/shapes.js';

/**
 * The ice of the glacier front: the cliff's lip split into crevasses and
 * seracs, the bergs at its foot, and the old wall across the forefield with
 * its arch. Ice fails along planes, so everything here is built from flat
 * faces and sharp edges; the generator's fracture passes break them up after.
 */

const P = (x, y, z) => ({ x, y, z });
/** Crevasse floors stay above this height: the cave and the undercut run beneath the lip. */
const CREVASSE_FLOOR = 12;
/** Transverse crevasses open from this height up. */
const TRANSVERSE_FLOOR = 16;
/** Metres above the lip the crevasse slots stay full width, so they open at the surface even where it rises behind. */
const CREVASSE_HEADROOM = 10;
/** The arch is bored this far below its floor, so the stream bed it follows shapes the floor, not the bore. */
const BORE_SINK = 3;
/** Height of the window through the wall, and its half width. */
const WINDOW_HEIGHT = 3.8, WINDOW_HALF_WIDTH = 2.2;
/** Below this height the old wall batters out a little where it meets the ground. */
const RIDGE_FOOT = 6;

/**
 * A fractured, tapered glacial serac spire or sheared ice block standing on `base`,
 * `width` across (local X), `depth` through (local Z) and `height` tall, turned
 * `yaw` about Y and tipped `lean` radians toward local +Z. Oblique crown bevels,
 * upward taper, and multi-frequency fracture facets eliminate boxy block silhouettes.
 */
export function tiltedBlock(base, {
  width, depth, height, yaw = 0, lean = 0, bury = 1, taper = 0.28, crownSlope = 0.36, seed = 17,
}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cl = Math.cos(lean), sl = Math.sin(lean);
  const reach = Math.hypot(width / 2, depth / 2, height + bury) + 2;
  const bevelSign = ((Math.round(base.x * 7 + base.z * 13 + seed) & 1) ? 1 : -1);
  return {
    box: { min: P(base.x - reach, base.y - reach, base.z - reach), max: P(base.x + reach, base.y + reach, base.z + reach) },
    solid(x, y, z) {
      const dx = x - base.x, dy = y - base.y, dz = z - base.z;
      const u = dx * cy - dz * sy, v = dx * sy + dz * cy;
      const along = dy * cl + v * sl, across = v * cl - dy * sl;
      const hFrac = Math.max(0, Math.min(1, along / Math.max(0.5, height)));
      const halfW = (width * 0.5) * (1 - hFrac * taper);
      const halfD = (depth * 0.5) * (1 - hFrac * taper * 0.85);
      // Oblique sheared glacial crown & asymmetric spine instead of a flat horizontal top.
      const ridgePinch = Math.abs(u) * crownSlope * (0.45 + 0.55 * hFrac) + u * bevelSign * 0.22;
      const crack = (fbm3(x * 0.19 + seed * 0.3, y * 0.15, z * 0.19 - seed * 0.2, seed, 2) - 0.5) * 1.4;
      const topLimit = height - ridgePinch + crack * 0.65;
      const sideFlute = (fbm3(u * 0.35 + seed, along * 0.22, across * 0.35, seed + 31, 2) - 0.5) * 0.9;
      return Math.max(
        Math.abs(u) - halfW + sideFlute * 0.55,
        Math.abs(across) - halfD + sideFlute * 0.45,
        -bury - along,
        along - topLimit,
      );
    },
  };
}

/**
 * Flow pulls the lip apart: crevasses run back from the face, others cross
 * them, and what stands between is seracs. Bergs it has shed lie at its foot.
 * Returns the bergs as `{ x, z, size }` for the snow they gather.
 */
export function splitLip(b, { faceZ, top, ground }, { front, transverse, seracs }) {
  const seed = b.seed, rim = front.height + CREVASSE_HEADROOM;
  for (let index = 0; index < front.crevasses; index += 1) {
    const x = -52 + index * (104 / (front.crevasses - 1)) + b.range(-4, 4);
    const lipZ = faceZ(x, 30), floor = Math.max(CREVASSE_FLOOR, top(x, lipZ - 6) - b.range(14, 22));
    b.grid.carve(crevasse(P(x + b.range(-3, 3), floor, lipZ + 12), P(x + b.range(-5, 5), floor, lipZ - b.range(16, 26)),
      { topY: rim, topWidth: b.range(3, 5.5), bottomWidth: 1.2, wander: 1.2, seed: seed + index }));
  }
  for (const [from, to, back] of transverse) {
    b.grid.carve(crevasse(P(from, TRANSVERSE_FLOOR, faceZ(from, 30) - back), P(to, TRANSVERSE_FLOOR, faceZ(to, 30) - back),
      { topY: rim, topWidth: 3.4, bottomWidth: 1, wander: 2.5, seed: seed + from }));
  }
  // Seracs: tapered pressure-sheared glacial spires & fins between the crevasses.
  for (let i = 0; i < seracs.towers.length; i += 1) {
    const [x, back, width, thickness, height, lean] = seracs.towers[i];
    const z = faceZ(x, front.height) - back;
    b.grid.fill(tiltedBlock(P(x, top(x, z), z), {
      width,
      depth: thickness,
      height,
      yaw: b.range(-0.42, 0.42),
      lean,
      bury: 3,
      taper: b.range(0.32, 0.56),
      crownSlope: b.range(0.35, 0.72),
      seed: seed + 101 + i * 19,
    }));
  }
  return front.bergs.map(([x, out, size, tilt], idx) => {
    const z = faceZ(x, 2) + out;
    // A block that fell flat lies with its long side up off the ground; one that landed upright is half buried.
    const rest = ground(x, z) + size * (Math.sin(tilt) * 0.5 - 0.3);
    b.grid.fill(tiltedBlock(P(x, rest, z), {
      width: size * 2.2,
      depth: size * 1.6,
      height: size * 1.7,
      yaw: b.range(-0.6, 0.6),
      lean: tilt,
      bury: size * 0.4,
      taper: 0.22,
      crownSlope: 0.32,
      seed: seed + 211 + idx * 17,
    }));
    return { x, z, size };
  });
}

/**
 * The old wall's plan and profile: its line `z(x)`, its organically eroded
 * glacial crest (free of straight horizontal slab lines), its half thickness at
 * height `y`, the pier the arch goes through, and its lee (south) face `south(x)`.
 */
export function ridgeLayout({ ridge, arch }, seed) {
  const z = (x) => arch.z + Math.sin((x - arch.x) * 0.07) * 3 + (fbm3(x * 0.055, 0.5, 0.5, seed + 3, 2) - 0.5) * 2.2;
  const pier = (x) => Math.abs(x - arch.x) < arch.pier;
  // Sculpted weathered ridge crest: asymmetric ice shoulders, melt saddles, and serac teeth
  // while keeping safe arch headroom above the stream bore.
  const crest = (x) => {
    const broad = (fbm3(x * 0.055 + 4.1, 0.7, 0.3, seed + 17, 3) - 0.5) * 4.2;
    const serrate = (1 - Math.abs(fbm3(x * 0.16 - 2.3, 0.4, 0.8, seed + 37, 2) * 2 - 1) - 0.45) * 2.8;
    const saddle = Math.sin((x - arch.x) * 0.24 + 0.7) * 1.15;
    const pierDist = Math.abs(x - arch.x) / Math.max(1, arch.pier);
    const pierBlend = Math.max(0, Math.min(1, 1 - Math.max(0, pierDist - 0.65) / 0.55));
    const pierWeight = pierBlend * pierBlend * (3 - 2 * pierBlend);
    const course = cellNoise3(x / ridge.block, 0.5, 0.5, seed + 7);
    const slumped = Math.min(1, 0.42 + 0.58 * Math.min(1, Math.max(0, (x - ridge.west) / 22)));
    const wingH = ridge.height * (0.78 + 0.32 * course) * slumped + broad + serrate + saddle;
    // Crown rises organically above the arch with an asymmetric weathered peak instead of a flat slab roof.
    const archCrown = arch.crown + Math.cos(pierDist * 1.65) * 1.85 - Math.abs(pierDist) * 1.1
      + broad * 0.55 + serrate * 0.75 + Math.sin((x - arch.x) * 0.31) * 0.9;
    return Math.max(arch.height + 2.4 * pierWeight, wingH * (1 - pierWeight) + archCrown * pierWeight);
  };
  const half = (y) => ridge.thickness / 2 + Math.max(0, RIDGE_FOOT - y) * 0.14;
  const south = (x) => Math.max(z(x) + half(crest(x)), pier(x) ? arch.z + arch.depth / 2 : -Infinity);
  return { z, crest, half, pier, south };
}

/** Raises the old wall: an eroded glacial ice ridge thickened organically into a buttressed pier round the arch. */
export function raiseRidge(b, wall, { ridge, arch }) {
  const seed = b.seed;
  b.grid.fill({
    box: { min: P(ridge.west - 2, -4, arch.z - 16), max: P(ridge.east + 2, arch.crown + 6, arch.z + 16) },
    solid(x, y, z) {
      const crestY = wall.crest(x);
      // Taper ridge thickness near the upper crest so it forms a weathered glacial arête, not a square box edge.
      const nearTop = Math.max(0, (y - (crestY - 4.5)) / 4.5);
      const topPinch = nearTop * nearTop * 1.35;
      const flankWarp = (fbm3(x * 0.12 + 3.1, y * 0.14, z * 0.12, seed + 67, 2) - 0.5) * 1.6;
      const pierBlend = Math.max(0, Math.min(1, 1 - Math.max(0, Math.abs(x - arch.x) - arch.pier * 0.65) / (arch.pier * 0.55)));
      const smoothPier = pierBlend * pierBlend * (3 - 2 * pierBlend);
      const halfZ = wall.half(y) * (1 - smoothPier) + (arch.depth * 0.5) * smoothPier - topPinch;
      const zCenter = wall.z(x) * (1 - smoothPier) + arch.z * smoothPier;
      const crestZSlope = Math.abs(z - zCenter) * 0.24;
      const endSlopeW = ridge.west - x + Math.max(0, y - 4) * 0.18 + flankWarp * 0.5;
      const endSlopeE = x - ridge.east + Math.max(0, y - 5) * 0.22 - flankWarp * 0.5;
      return Math.max(
        Math.abs(z - zCenter) - Math.max(0.8, halfZ) + flankWarp * 0.45,
        y - (crestY - crestZSlope),
        endSlopeW,
        endSlopeE,
      );
    },
  });
}

/**
 * Opens the arch and the window and lays the blocks fallen from the broken
 * east end. Returns the arch floor, the fallen blocks as `{ x, z, size }` and
 * where the end broke.
 */
export function openRidge(b, wall, ground, { ridge, arch }) {
  const floor = ground(arch.x, arch.z) - 0.2;
  // The stream out of the pool bored the arch, so its floor is the stream's own bed.
  const bore = tunnel(P(arch.x, floor - BORE_SINK, arch.z + arch.depth), P(arch.x, floor - BORE_SINK, arch.z - arch.depth),
    { halfWidth: arch.width / 2, height: arch.height + BORE_SINK, arch: 0.95 });
  b.grid.carve({ box: bore.box, air: (x, y, z) => Math.min(bore.air(x, y, z), y - ground(x, z)) }, 0.6);
  const [windowX, windowY] = ridge.window;
  const sill = windowY - WINDOW_HEIGHT / 2, windowZ = wall.z(windowX);
  b.grid.carve(tunnel(P(windowX, sill, windowZ + 6), P(windowX, sill, windowZ - 6),
    { halfWidth: WINDOW_HALF_WIDTH, height: WINDOW_HEIGHT, arch: 0.6 }), 0.5);

  // The east end broke away: its blocks lie fanned across the forefield below the fresh face, the largest nearest.
  const end = P(ridge.east, 0, wall.z(ridge.east));
  const fallen = [];
  for (let index = 0; index < ridge.debris; index += 1) {
    const t = (index + b.random()) / ridge.debris;
    const angle = b.range(-0.3, 0.9), out = 2.5 + t * 10;
    const x = end.x + Math.cos(angle) * out, z = end.z + Math.sin(angle) * out;
    const size = (3.6 - t * 2.2) * b.range(0.8, 1.1);
    b.grid.fill(tiltedBlock(P(x, ground(x, z) - size * 0.25, z),
      { width: size * 1.3, depth: size, height: size * 0.9, yaw: b.range(0, Math.PI), lean: b.range(0.2, 0.8), bury: size * 0.3 }));
    fallen.push({ x, z, size });
  }
  return { floor, fallen, end };
}

/** Wind off the glacier packs snow over the wall's lee crest until it overhangs the south face by `cornice` metres. */
export function hangCornice(b, wall, { ridge, arch }) {
  const baseReach = ridge.cornice;
  const seed = b.seed + 89;
  b.grid.fill({
    box: { min: P(ridge.west + 4, 4, arch.z - 10), max: P(ridge.east - 2, arch.crown + 6, arch.z + arch.depth / 2 + baseReach + 5) },
    solid(x, y, z) {
      const waveReach = 0.65 + 0.55 * fbm3(x * 0.16, 0.4, 0.8, seed, 2);
      const reach = baseReach * waveReach;
      const out = z - wall.south(x), lip = out / Math.max(0.4, reach), crest = wall.crest(x);
      const thick = 1.2 + 0.5 * Math.sin(x * 0.33 + 1.1);
      return Math.max(out - reach, -out - 2.2, y - (crest + 0.48 - lip * lip * 0.72), crest - thick + lip * 1.15 - y);
    },
  }, 0.4);
}
