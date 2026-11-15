import { hall as hallShape } from '../gen/shapes.js';
import { hewnBeam, stoneBlock } from '../gen/propKit.js';
import { STONE } from './frostgardKit.js';
import { doorHide } from './frostgardDressing.js';
import {
  COLD_POST, duckboard, fishRack, iceBlock, iceSaw, iceSkids, iceTongs, lampArm, lampPost, local, meatRail, poleRail, sack, shelving,
} from './frostgardStoreKit.js';
import { icicleCluster } from './glacierKit.js';
import { lantern } from './kits.js';

/**
 * The hold's cold store: a chamber cut square into the glacier and fitted out
 * as a working larder. One aisle of duckboards runs from the door to the face
 * where ice is still being cut; dry stores are shelved down one wall, meat and
 * fish hang down the other, and each place work is done has its own lamp.
 * Lamps set behind the walls make the ice glow without warming the room.
 *
 * Layout is in the chamber's frame: `u` metres along it from the middle (the
 * door at -halfLength, the face at +halfLength), `v` across it (+ to the right
 * walking in), `dy` above the floor.
 */

const P = (x, y, z) => ({ x, y, z });
const clamp01 = (value) => Math.min(1, Math.max(0, value));
/** Recesses cut in the side walls: `side` -1 left / +1 right; `u` from the door end; metres. */
const BENCH = { u: 1.4, side: -1, sill: 0.45, width: 1.8, depth: 0.9, height: 1.5 };
const DOOR_NICHE = { u: 1.1, side: 1, sill: 1.3, width: 1, depth: 0.8, height: 1 };
const RAIL_NICHE = { u: 9, side: -1, sill: 1.3, width: 1, depth: 0.8, height: 1 };
/** The working face: two courses cut back from the far wall, `v` from and to across it. */
const HARVEST = { from: -0.6, to: 2.6, courses: [[1.1, 1], [2, 0.45]] };
/** Where the summer's ice is stacked: blocks along the far right wall, `course`s high. */
const ICE_STACK = { blocks: 3, rows: 2, courses: 2 };
/** Where icicles may hang: only the door end, where warm air leaks in and refreezes. */
const ICICLE_REACH = 2.4, ICICLE_HEIGHT = 2.45;

/**
 * The chamber's frame from its middle at floor level and the point the passage
 * arrives from: `at(u, dy, v)` to the world, the `yaw` that turns props along
 * it, `cutYaw` for `hall` shapes and `nav.addRect`, and `inside(x, y, z)`: 1
 * within the chamber, 0 beyond `fade` metres of it.
 */
export function storeFrame(centre, from, { halfLength, halfWidth, wallHeight, vaultRise }) {
  const length = Math.hypot(centre.x - from.x, centre.z - from.z);
  const ax = (centre.x - from.x) / length, az = (centre.z - from.z) / length;
  const yaw = Math.atan2(-az, ax), top = centre.y + wallHeight + vaultRise;
  const toLocal = local(centre, yaw);
  return {
    centre, halfLength, halfWidth, wallHeight, vaultRise, yaw,
    cutYaw: Math.atan2(az, ax),
    side: P(-az, 0, ax),
    at: (u, dy, v) => toLocal(u, dy, v),
    inside(x, y, z, fade = 1.5) {
      const dx = x - centre.x, dz = z - centre.z;
      const beyond = Math.max(Math.abs(dx * ax + dz * az) - halfLength, Math.abs(dz * ax - dx * az) - halfWidth,
        y - top, centre.y - 0.5 - y, 0);
      return clamp01(1 - beyond / fade);
    },
  };
}

/** Cuts the chamber, its niches, the bench and the stepped working face, and makes its floor walkable. */
export function cutIceStore(b, frame) {
  const { halfLength, halfWidth, wallHeight, vaultRise, cutYaw } = frame;
  b.grid.carve(hallShape(frame.centre, { halfLength, halfWidth, height: wallHeight, vaultRise, yaw: cutYaw }), 0.3);
  for (const niche of [BENCH, DOOR_NICHE, RAIL_NICHE]) {
    const v = niche.side * (halfWidth + niche.depth / 2 - 0.1);
    b.grid.carve(hallShape(frame.at(-halfLength + niche.u, niche.sill, v), {
      halfLength: niche.width / 2, halfWidth: niche.depth / 2 + 0.1, height: niche.height - 0.25, vaultRise: 0.25, yaw: cutYaw,
    }));
  }
  const across = (HARVEST.from + HARVEST.to) / 2;
  for (const [height, depth] of HARVEST.courses) {
    b.grid.carve(hallShape(frame.at(halfLength + depth / 2 - 0.1, 0, across), {
      halfLength: depth / 2 + 0.1, halfWidth: (HARVEST.to - HARVEST.from) / 2, height, yaw: cutYaw,
    }));
  }
  b.nav.addRect(frame.centre, halfLength - 0.5, halfWidth - 0.5, cutYaw);
}

/**
 * Fits the chamber out: the aisle, the stores and the working places, their
 * lamps, and the lamps behind the ice. `light` is `{ lamp, glow }`, each
 * `{ intensity, range }`; `icicles` is how many clusters the door end grows.
 */
export function fitIceStore(b, frame, { light, icicles }) {
  const { at, yaw, halfLength: L, halfWidth: W } = frame;
  const lamp = light.lamp;
  duckboard(b, at(-L, 0, 0), at(L - 3.3, 0, 0));
  storeDoor(b, frame, lamp);

  // By the door: a seat cut in the ice where loads are set down.
  for (const du of [-0.45, 0.4]) sack(b, at(-L + BENCH.u + du, BENCH.sill, -(W + 0.35)), yaw + b.range(-0.4, 0.4));

  // Dry stores down the right wall, with a lamp off the shelving.
  const shelf = -L + 4.85;
  shelving(b, at(shelf, 0, W - 0.05), yaw + Math.PI);
  lampArm(b, at(shelf + 0.95, 2.05, W - 0.69), yaw + Math.PI, { reach: 0.5, lamp });

  // Meat on its rail and fish on their rack down the left, a lamp at the rail and one in the wall between.
  meatRail(b, at(-L + 5.7, 0, -W + 1), yaw);
  lampArm(b, at(-L + 3.1, 2.3, -W + 1), yaw, { reach: 0.55, lamp });
  lantern(b, at(-L + RAIL_NICHE.u, RAIL_NICHE.sill + 0.24, -(W + 0.3)), { ...lamp, halo: 0.8 });
  fishRack(b, at(-L + 11, 0, -W + 0.9), yaw);

  harvestCorner(b, frame, lamp);
  iceGlow(b, frame, light.glow);
  for (let index = 0; index < icicles; index += 1) {
    const side = index % 2 ? 1 : -1;
    icicleCluster(b, at(-L + b.range(0.4, ICICLE_REACH), ICICLE_HEIGHT, side * (W - b.range(0.3, 0.7))), { length: [0.25, 0.6], reach: 3 });
  }
}

/** The store's door frame where the passage comes in, a lamp off it lighting the way in, and one in the niche beside it. */
function storeDoor(b, frame, lamp) {
  const { at, yaw, halfLength: L, halfWidth: W } = frame;
  for (const v of [-1.05, 1.05]) b.prop('timber', hewnBeam(at(-L + 0.15, -0.1, v), at(-L + 0.15, 2.35, v), 0.2, 0.22), COLD_POST);
  b.prop('timber', hewnBeam(at(-L + 0.15, 2.35, -1.35), at(-L + 0.15, 2.35, 1.35), 0.22, 0.24), COLD_POST);
  lampArm(b, at(-L + 0.05, 2.1, 1.05), yaw - Math.PI / 2, { reach: 0.45, lamp });
  lantern(b, at(-L + DOOR_NICHE.u, DOOR_NICHE.sill + 0.24, W + 0.3), { ...lamp, halo: 0.8 });
}

/**
 * The far end, where the store is still being cut: the stepped face, a load
 * of blocks on skids ready to haul out, the summer's stock stacked along the
 * wall, the saw and tongs, and a lamp to cut by.
 */
function harvestCorner(b, frame, lamp) {
  const { at, yaw, side, halfLength: L, halfWidth: W } = frame;
  iceSkids(b, at(L - 2, 0, 0.9), yaw + Math.PI);
  for (let row = 0; row < ICE_STACK.rows; row += 1) {
    const v = W - 0.4 - row * 0.65;
    b.prop('timber', hewnBeam(at(L - 3.1, 0.04, v), at(L - 0.25, 0.04, v), 0.1, 0.08), COLD_POST);
    for (let course = 0; course < ICE_STACK.courses - row; course += 1) {
      for (let index = 0; index < ICE_STACK.blocks; index += 1) iceBlock(b, at(L - 0.7 - index * 0.95, 0.08 + course * 0.5, v), yaw);
    }
  }
  b.nav.block(at(L - 1.7, 0, W - 0.7), 1.5, 2);
  iceSaw(b, at(L - 0.6, 0, -1.3), at(L - 0.08, 1.45, -1.2), side);
  lampPost(b, at(L - 1.3, 0, -1.6), yaw, { lamp });
  iceTongs(b, at(L - 1.4, 1.6, -1.6), yaw - Math.PI / 2);
}

/** Lamps set in niches cut from behind the walls: a metre of ice glows cyan and lights the store without warming it. */
function iceGlow(b, frame, glow) {
  const { at, halfLength: L, halfWidth: W } = frame;
  for (const [u, dy, v] of [[-1.3, 2.7, -(W + 1.2)], [L - 1.6, 2.4, W + 1.2], [L + 1.3, 2.5, -2.4]]) {
    b.light(at(u, dy, v), '#fff0d0', glow.intensity, glow.range, { radius: 1.4 });
  }
}

/**
 * Where the passage leaves the rock for the ice, from floor point `outer` to
 * `inner`: stone jambs under a stone head round a timber frame hung with a
 * hide, then a vestibule and a second frame and hide on the ice side, so the
 * hall's warm air never reaches the store. The plank walk runs on from the
 * threshold to the store's `door`, with a hand rail beside it over the ice.
 */
export function airlock(b, outer, inner, door, { width = 2.5 } = {}) {
  const yaw = Math.atan2(-(inner.z - outer.z), inner.x - outer.x);
  const O = local(outer, yaw), I = local(inner, yaw), half = width / 2;
  for (const sideSign of [-1, 1]) {
    for (let course = 0, y = 0; y < 2.3; course += 1, y += 0.46) {
      const long = course % 2 ? 0.55 : 0.8;
      b.prop('masonry', stoneBlock(long, 0.44, 0.42, O(0.05, y, sideSign * (half - 0.15)), { yaw, irregular: 0.25 }), STONE);
    }
  }
  b.prop('masonry', stoneBlock(0.8, 0.42, width + 0.4, O(0.05, 2.3, 0), { yaw, irregular: 0.2 }), STONE);
  b.prop('timber', hewnBeam(O(0.3, 0.04, -0.85), O(0.3, 0.04, 0.85), 0.16, 0.1), COLD_POST);
  for (const frame of [O, I]) {
    for (const z of [-0.85, 0.85]) b.prop('timber', hewnBeam(frame(0.3, -0.1, z), frame(0.3, 2.2, z), 0.18, 0.2), COLD_POST);
    doorHide(b, frame(0.3, 0, 0), { width: 1.6, height: 2.2, yaw: yaw - Math.PI / 2 });
  }
  duckboard(b, outer, door, { width: 1.2 });
  const D = local(door, yaw);
  poleRail(b, I(0.6, 0, -0.95), D(-0.4, 0, -0.95));
}
