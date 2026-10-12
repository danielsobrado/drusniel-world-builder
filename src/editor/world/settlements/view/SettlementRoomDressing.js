/**
 * What fills a room behind an open settlement door, so that a glance through
 * the doorway finds a lived-in house rather than four plastered walls: a plank
 * floor, a stone base course, timber posts and ceiling joists, a hearth with
 * embers on the back wall, and its furniture (SettlementFurniture) placed
 * clear of the doorway's walk line.
 *
 * Boxes and quads only, in the room's own frame (x across, z toward the front
 * wall, y up from the floor), handed to `room.quad`. The doorway's walk line is
 * kept clear, so nothing stands where the player enters. Pure; no three.
 */

import { bed, cask, chest, shelf, stool, table } from './SettlementFurniture.js';
import { FIRELIT, WOOD } from './SettlementInteriorSurface.js';
import { EMBERS, FLAME, HEARTH_STONE, OAK, SOOT, STONE, box } from './SettlementRoomParts.js';

const PLANK = [0.17, 0.11, 0.065];
const PLANK_TONES = [1, 0.84, 1.12, 0.92, 1.05];
const PLANK_WIDTH = 0.24;
const BASE_COURSE = 0.55;
const JOIST_SPACING = 0.8;
/** Furniture keeps this far from the doorway's walk line. */
const WALK_CLEAR = 0.7;

function seeded(seed) {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function floorboards(room, random) {
  const { x0, x1, z0, z1 } = room;
  const p = (x, z) => room.point(x, 0.005, z);
  for (let x = x0; x < x1 - 1e-3; x += PLANK_WIDTH) {
    const right = Math.min(x1, x + PLANK_WIDTH - 0.012);
    const tone = PLANK_TONES[Math.floor(random() * PLANK_TONES.length)];
    room.quad([p(x, z0), p(right, z0), p(right, z1), p(x, z1)], [0, 1, 0], PLANK.map((channel) => channel * tone), WOOD);
  }
}

/** Stone footing round the walls, and a timber post at each corner. */
function frame(room) {
  const { x0, x1, z0, z1, height } = room;
  // The footing is a band on the plaster, one quad a wall: its thickness never shows.
  const p = (x, y, z) => room.point(x, y, z);
  const band = (ax, az, bx, bz, facing) => room.quad(
    [p(ax, 0, az), p(bx, 0, bz), p(bx, BASE_COURSE, bz), p(ax, BASE_COURSE, az)], room.toward(...facing), STONE);
  band(x0, z0 + 0.01, x1, z0 + 0.01, [0, 1]);
  band(x0 + 0.01, z0, x0 + 0.01, z1, [1, 0]);
  band(x1 - 0.01, z0, x1 - 0.01, z1, [-1, 0]);
  for (const [x, z] of [[x0, z0], [x1 - 0.18, z0], [x0, z1 - 0.18], [x1 - 0.18, z1 - 0.18]]) {
    box(room, [x, 0, z], [x + 0.18, height, z + 0.18], OAK);
  }
  // Ceiling joists across the short span, under the boards of the floor above.
  const across = x1 - x0 <= z1 - z0;
  const [from, to] = across ? [z0, z1] : [x0, x1];
  for (let s = from + JOIST_SPACING / 2; s < to; s += JOIST_SPACING) {
    if (across) box(room, [x0, height - 0.2, s - 0.07], [x1, height - 0.005, s + 0.07], OAK);
    else box(room, [s - 0.07, height - 0.2, z0], [s + 0.07, height - 0.005, z1], OAK);
  }
}

/**
 * How far the hearth stands out from the room's back line: the shell's own
 * stones stand proud of it, and a hearth set against the line is buried in them.
 */
const HEARTH_INSET = 0.45;

/** A stone hearth against the back wall with a sooty hood, logs, embers and flames. */
function hearth(room, centre) {
  const z0 = room.z0 + HEARTH_INSET;
  // The hearthstone and jambs take the fire's light after dark (SettlementInteriorMesh).
  box(room, [centre - 0.65, 0, z0], [centre + 0.65, 0.12, z0 + 0.6], HEARTH_STONE, FIRELIT);
  box(room, [centre - 0.65, 0.12, z0], [centre - 0.45, 1.05, z0 + 0.5], HEARTH_STONE, FIRELIT);
  box(room, [centre + 0.45, 0.12, z0], [centre + 0.65, 1.05, z0 + 0.5], HEARTH_STONE, FIRELIT);
  box(room, [centre - 0.7, 1.05, z0], [centre + 0.7, 1.2, z0 + 0.55], OAK);
  // The hood runs back into the wall over the gap the inset leaves.
  box(room, [centre - 0.55, 1.2, z0 - HEARTH_INSET], [centre + 0.55, room.height, z0 + 0.4], SOOT);
  box(room, [centre - 0.65, 0.12, z0 - HEARTH_INSET], [centre + 0.65, 1.05, z0], HEARTH_STONE);
  box(room, [centre - 0.45, 0.12, z0 + 0.04], [centre + 0.45, 1.05, z0 + 0.06], SOOT);
  box(room, [centre - 0.28, 0.12, z0 + 0.14], [centre + 0.28, 0.15, z0 + 0.4], EMBERS);
  for (const x of [-0.18, 0.06]) box(room, [centre + x - 0.07, 0.15, z0 + 0.16], [centre + x + 0.07, 0.24, z0 + 0.38], OAK);
  // Flames: two tapering tongues over the logs, the light of the room.
  const p = (x, y, z) => room.point(x, y, z);
  for (const [x, h] of [[-0.08, 0.42], [0.1, 0.32]]) {
    room.quad([p(centre + x - 0.1, 0.22, z0 + 0.28), p(centre + x + 0.1, 0.22, z0 + 0.28), p(centre + x + 0.02, 0.22 + h, z0 + 0.28), p(centre + x - 0.02, 0.22 + h, z0 + 0.28)],
      room.toward(0, 1), [FLAME, FLAME, EMBERS, EMBERS]);
  }
}

/**
 * @param {object} room the room in its own frame: `x0..x1` across, `z0..z1`
 *   back to front, `height` floor to ceiling, `doorLeft..doorRight` the doorway
 *   in the front wall, `point(x, y, z)` to settlement space, `toward(x, z)` a
 *   room direction in settlement space, and `quad(points, facing, colour)`.
 * @param {number} seed stable per house
 */
export function furnishRoom(room, seed) {
  const random = seeded(seed);
  floorboards(room, random);
  frame(room);
  const { x0, x1, z0, z1, doorLeft, doorRight } = room;
  const width = x1 - x0;
  const depth = z1 - z0;
  if (width < 2.4 || depth < 2) return;
  const walk = (doorLeft + doorRight) / 2;
  // The hearth faces the door when there is room either side of the walk line, else beside it.
  const hearthX = Math.abs(walk - (x0 + x1) / 2) > 1 ? (x0 + x1) / 2 : Math.max(x0 + 0.9, Math.min(x1 - 0.9, walk + (walk < (x0 + x1) / 2 ? 1.4 : -1.4)));
  hearth(room, hearthX);
  const stoolX = hearthX + (hearthX > walk ? -0.95 : 0.95);
  if (Math.abs(stoolX - walk) > WALK_CLEAR && stoolX - 0.2 > x0 && stoolX + 0.2 < x1) stool(room, stoolX, z0 + HEARTH_INSET + 0.9);
  if (depth < 3) return;
  const side = walk < (x0 + x1) / 2 ? 1 : -1;
  const tableX = walk + side * (WALK_CLEAR + 0.75);
  if (tableX - 0.75 > x0 && tableX + 0.75 < x1) table(room, tableX, z0 + depth * 0.55);
  const chestX = side > 0 ? x0 + 0.55 : x1 - 0.55;
  if (Math.abs(chestX - walk) > WALK_CLEAR + 0.4) chest(room, chestX, z1 - 0.6);
  // A bed along the wall away from the table, when the room is deep enough for it.
  const bedWall = side > 0 ? x0 + 0.02 : x1 - 0.02;
  if (depth >= 3.4 && Math.abs(bedWall - walk) > WALK_CLEAR + 1.0) bed(room, bedWall + (side > 0 ? 1.0 : -1.0) * 1, z0 + 0.4, side);
  // Crockery on the back wall beside the hearth, and a cask in the far corner.
  const shelfX = hearthX + (hearthX > (x0 + x1) / 2 ? -1.6 : 1.6);
  if (shelfX - 0.6 > x0 && shelfX + 0.6 < x1) shelf(room, shelfX, z0 + 0.45, random);
  const caskX = side > 0 ? x1 - 0.4 : x0 + 0.4;
  if (Math.abs(caskX - walk) > WALK_CLEAR + 0.3) cask(room, caskX, z0 + 0.75);
}
