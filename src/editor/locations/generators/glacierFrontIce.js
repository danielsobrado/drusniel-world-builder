import { cellNoise3 } from '../gen/noise.js';
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
 * A solid block standing on `base`, `width` across (local X), `depth` through
 * (local Z) and `height` tall, turned `yaw` about Y and tipped `lean` radians
 * toward local +Z. Its foot is sunk `bury` metres so a tipped block still meets the ground.
 */
export function tiltedBlock(base, { width, depth, height, yaw = 0, lean = 0, bury = 1 }) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cl = Math.cos(lean), sl = Math.sin(lean);
  const reach = Math.hypot(width / 2, depth / 2, height + bury) + 1;
  return {
    box: { min: P(base.x - reach, base.y - reach, base.z - reach), max: P(base.x + reach, base.y + reach, base.z + reach) },
    solid(x, y, z) {
      const dx = x - base.x, dy = y - base.y, dz = z - base.z;
      const u = dx * cy - dz * sy, v = dx * sy + dz * cy;
      const along = dy * cl + v * sl, across = v * cl - dy * sl;
      return Math.max(Math.abs(u) - width / 2, Math.abs(across) - depth / 2, -bury - along, along - height);
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
  // Seracs: towers and slabs between the crevasses, some leaning out over the face on their way down.
  for (const [x, back, width, thickness, height, lean] of seracs.towers) {
    const z = faceZ(x, front.height) - back;
    b.grid.fill(tiltedBlock(P(x, top(x, z), z), { width, depth: thickness, height, yaw: b.range(-0.35, 0.35), lean, bury: 3 }));
  }
  return front.bergs.map(([x, out, size, tilt]) => {
    const z = faceZ(x, 2) + out;
    // A block that fell flat lies with its long side up off the ground; one that landed upright is half buried.
    const rest = ground(x, z) + size * (Math.sin(tilt) * 0.5 - 0.3);
    b.grid.fill(tiltedBlock(P(x, rest, z), { width: size * 2.2, depth: size * 1.6, height: size * 1.7, yaw: b.range(-0.6, 0.6), lean: tilt, bury: size * 0.4 }));
    return { x, z, size };
  });
}

/**
 * The old wall's plan and profile: its line `z(x)`, its stepped crest, its half
 * thickness at height `y`, the pier the arch goes through, and its lee (south)
 * face `south(x)`, where the cornice hangs and the drift banks.
 */
export function ridgeLayout({ ridge, arch }, seed) {
  const z = (x) => arch.z + Math.sin((x - arch.x) * 0.07) * 3;
  const pier = (x) => Math.abs(x - arch.x) < arch.pier;
  // The crest broke away block by block, so it stands in steps; the oldest, west end has slumped lowest.
  const crest = (x) => {
    if (pier(x)) return arch.crown;
    const course = cellNoise3(x / ridge.block, 0.5, 0.5, seed + 7);
    const slumped = Math.min(1, 0.45 + 0.2 * Math.floor(Math.max(0, x - ridge.west) / 4));
    return ridge.height * (0.85 + 0.35 * course) * slumped;
  };
  const half = (y) => ridge.thickness / 2 + Math.max(0, RIDGE_FOOT - y) * 0.12;
  const south = (x) => Math.max(z(x) + half(crest(x)), pier(x) ? arch.z + arch.depth / 2 : -Infinity);
  return { z, crest, half, pier, south };
}

/** Raises the old wall: a narrow slab with sheer flanks and a flat crest, thickened into a pier round the arch. */
export function raiseRidge(b, wall, { ridge, arch }) {
  b.grid.fill({
    box: { min: P(ridge.west - 1, -4, arch.z - 14), max: P(ridge.east + 1, arch.crown + 1, arch.z + 14) },
    solid: (x, y, z) => Math.max(
      Math.min(Math.abs(z - wall.z(x)) - wall.half(y), wall.pier(x) ? Math.abs(z - arch.z) - arch.depth / 2 : Infinity),
      y - wall.crest(x), ridge.west - x, x - ridge.east),
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
  const reach = ridge.cornice;
  b.grid.fill({
    box: { min: P(ridge.west + 4, 4, arch.z - 8), max: P(ridge.east - 2, arch.crown + 2, arch.z + arch.depth / 2 + reach + 4) },
    solid(x, y, z) {
      const out = z - wall.south(x), lip = out / reach, crest = wall.crest(x);
      return Math.max(out - reach, -out - 2, y - (crest + 0.4 - lip * lip * 0.6), crest - 1.5 + lip * 1.2 - y);
    },
  }, 0.4);
}
