import { boulder } from '../gen/iceKit.js';
import { beam, box, hewnBeam, panel, rod, stoneBlock } from '../gen/propKit.js';
import { lantern } from './kits.js';

/**
 * What a Norths cold store is fitted out with — shelving, the meat rail, fish
 * racks, the ice cutters' skids and tools, duckboards, lamps on posts — and the
 * stores themselves. A fitting is placed by a floor point and a `yaw`: its local
 * x runs along it and local z out from the wall it stands against, turned as
 * `box(…, yaw)` turns. Material keys: `timber`, `planks`, `iron`, `clearIce`.
 */

const P = (x, y, z) => ({ x, y, z });
/** Timber kept in the cold: dry, frost-silvered and pale, so one lamp is enough to show it. */
export const COLD_POST = 0xc6bba9, COLD_BOARD = 0xb5a892;
const HOOP = 0x8f939b, CASK = 0xbc9f7c, CRATE = 0xc2ac8c, FISH = 0xcdbfa6;
const SACKING = [0xd8ccb2, 0xcbbd9e, 0xc0b5a2];
/** Frozen meat: pale, its fat white with rime. */
const MEAT = [0xb07a6c, 0xbd9480, 0xc9bcab];
/** Shelf heights above the floor: sacks low, casks in the middle, crates on top. */
const SHELF_LEVELS = [0.18, 0.9, 1.6];
const SHELF_HEADROOM = 0.55;
/** A cut block of ice: one course of the harvest face high. */
const ICE_BLOCK = { length: 0.9, height: 0.5, width: 0.6 };
/** Duckboards: the sleepers' top and the boards' middle, metres above the floor they lie on. */
const SLEEPER_Y = -0.01, BOARD_Y = 0.048;
/** Lantern stem top above its centre (see `kits.lantern`). */
const LANTERN_STEM = 0.26;

const pick = (b, list) => list[Math.floor(b.range(0, list.length))];

/** Maps a fitting's local (x along, y up, z out) to the world, turned `yaw` about `at`. */
export function local(at, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (dx, dy, dz) => P(at.x + c * dx + s * dz, at.y + dy, at.z - s * dx + c * dz);
}

/** Keeps the walker out of a fitting standing from `a` to `c`: discs of `radius` along it. */
export function blockAlong(b, a, c, radius, height = 2.5) {
  const steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / radius));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    b.nav.block(P(a.x + (c.x - a.x) * t, a.y, a.z + (c.z - a.z) * t), radius, height);
  }
}

/** A sack of meal, slumped where it was set down, its neck tied. */
export function sack(b, at, yaw = 0) {
  const height = b.range(0.36, 0.46);
  b.prop('timber', stoneBlock(b.range(0.42, 0.5), height, b.range(0.32, 0.38), at, { yaw, bevel: 0.1, irregular: 0.8 }), pick(b, SACKING));
  b.prop('timber', rod(P(at.x, at.y + height - 0.03, at.z), P(at.x, at.y + height + 0.1, at.z), 0.06, 0.03, 6), SACKING[0]);
}

/** A small cask of salt fish or butter, hooped in iron. */
export function cask(b, at, radius = 0.2, height = 0.44) {
  const mid = P(at.x, at.y + height / 2, at.z);
  b.prop('timber', rod(at, mid, radius * 0.86, radius, 10), CASK);
  b.prop('timber', rod(mid, P(at.x, at.y + height, at.z), radius, radius * 0.86, 10), CASK);
  for (const t of [0.14, 0.8]) {
    b.prop('iron', rod(P(at.x, at.y + height * t, at.z), P(at.x, at.y + height * (t + 0.07), at.z), radius * 0.97, radius * 0.97, 10), HOOP);
  }
}

/** A lidded, banded crate. */
export function storeCrate(b, at, size = 0.5, yaw = 0) {
  const height = size * 0.8, depth = size * 0.8;
  b.prop('timber', stoneBlock(size, height, depth, at, { yaw, bevel: 0.02, irregular: 0.1 }), CRATE);
  b.prop('timber', stoneBlock(size + 0.03, 0.05, depth + 0.03, P(at.x, at.y + height, at.z), { yaw, bevel: 0.01, irregular: 0.1 }), COLD_BOARD);
  b.prop('iron', box(size + 0.02, 0.04, depth + 0.02, P(at.x, at.y + height * 0.5, at.z), yaw), HOOP);
}

/** A block of cut ice resting on `at`. */
export function iceBlock(b, at, yaw) {
  b.prop('clearIce', box(ICE_BLOCK.length, ICE_BLOCK.height, ICE_BLOCK.width, P(at.x, at.y + ICE_BLOCK.height / 2, at.z),
    yaw + b.range(-0.04, 0.04)), 0xffffff);
}

/**
 * A run of shelving bays against a wall: posts on sole plates that keep it off
 * the ice, plank shelves, braced end frames, and the stores on them. `at` is
 * the floor at the middle of the run, against the wall.
 */
export function shelving(b, at, yaw, { bays = 3, bay = 1.9, depth = 0.7 } = {}) {
  const L = local(at, yaw), half = bays * bay / 2, top = SHELF_LEVELS.at(-1) + SHELF_HEADROOM;
  for (const z of [0.08, depth - 0.06]) {
    b.prop('timber', hewnBeam(L(-half - 0.1, 0.05, z), L(half + 0.1, 0.05, z), 0.1, 0.1), COLD_POST);
    for (let index = 0; index <= bays; index += 1) {
      const x = -half + index * bay;
      b.prop('timber', hewnBeam(L(x, 0.1, z), L(x, top, z), 0.09, 0.09), COLD_POST);
    }
  }
  for (const x of [-half, half]) b.prop('timber', hewnBeam(L(x, 0.3, 0.08), L(x, top - 0.2, depth - 0.06), 0.06, 0.08), COLD_POST);
  for (const y of [...SHELF_LEVELS, top]) {
    for (const z of [depth * 0.27, depth * 0.73]) b.prop('timber', box(bays * bay + 0.1, 0.035, depth * 0.44, L(0, y, z), yaw), COLD_BOARD);
  }
  for (let index = 0; index < bays; index += 1) stockBay(b, L, -half + (index + 0.5) * bay, bay, depth, yaw);
  blockAlong(b, L(-half, 0, depth / 2), L(half, 0, depth / 2), depth * 0.7);
}

/** Fills one bay, what is heavy kept low. */
function stockBay(b, L, x, bay, depth, yaw) {
  const [low, middle, high] = SHELF_LEVELS.map((y) => y + 0.02);
  for (const dx of [-bay / 4, bay / 4]) {
    if (b.random() < 0.85) sack(b, L(x + dx + b.range(-0.08, 0.08), low, depth / 2), yaw + b.range(-0.3, 0.3));
    if (b.random() < 0.8) cask(b, L(x + dx, middle, depth / 2));
    if (b.random() < 0.7) storeCrate(b, L(x + dx, high, depth / 2), b.range(0.42, 0.5), yaw + b.range(-0.15, 0.15));
  }
}

/** A carcass or side of meat hung from a hook under `hook`, clear of the floor. */
function carcass(b, hook, long) {
  const end = P(hook.x, hook.y - 0.22, hook.z);
  b.prop('iron', rod(hook, end, 0.018, 0.012, 5), HOOP);
  b.prop('timber', boulder(P(end.x, end.y - long, end.z), b.range(0.17, 0.24), long * 0.72, b.range(0.13, 0.18),
    { seed: Math.round(hook.x * 31 + hook.z * 17), blocky: 0.15 }), pick(b, MEAT));
}

/**
 * A rail on three posts set into the floor, knee-braced, with carcasses hung
 * from it in two spans. `at` is the floor under the middle of the rail; it runs along local x.
 */
export function meatRail(b, at, yaw, { length = 5.2, height = 2.6 } = {}) {
  const L = local(at, yaw), half = length / 2;
  for (const x of [-half, 0, half]) b.prop('timber', hewnBeam(L(x, -0.2, 0), L(x, height + 0.1, 0), 0.2, 0.2), COLD_POST);
  b.prop('timber', hewnBeam(L(-half - 0.3, height, 0), L(half + 0.3, height, 0), 0.16, 0.22), COLD_POST);
  for (const [x, toward] of [[-half, 1], [0, -1], [0, 1], [half, -1]]) {
    b.prop('timber', hewnBeam(L(x, height - 0.6, 0), L(x + toward * 0.5, height - 0.08, 0), 0.1, 0.12), COLD_BOARD);
  }
  for (const start of [-half, 0]) {
    for (const share of [0.3, 0.5, 0.7]) carcass(b, L(start + share * half, height - 0.11, 0), b.range(0.8, 1.4));
  }
  blockAlong(b, L(-half, 0, 0), L(half, 0, 0), 0.5, 3);
}

/** Stockfish hung in pairs over the ridge and side poles of an A-frame rack. `at` is the floor under its ridge. */
export function fishRack(b, at, yaw, { length = 2.4, height = 2, splay = 0.45 } = {}) {
  const L = local(at, yaw), half = length / 2, rail = height * 0.55;
  const legZ = (y) => splay * (1 - (y + 0.1) / (height + 0.18));
  for (const x of [-half, half]) {
    for (const side of [-1, 1]) b.prop('timber', rod(L(x, -0.1, side * splay), L(x, height + 0.08, 0), 0.05, 0.04, 6), COLD_POST);
  }
  const poles = [[height, 0], [rail, -legZ(rail)], [rail, legZ(rail)]];
  for (const [y, z] of poles) {
    b.prop('timber', rod(L(-half - 0.15, y, z), L(half + 0.15, y, z), 0.04, 0.04, 6), COLD_POST);
    for (let x = -half + 0.2; x < half - 0.1; x += 0.24) {
      const long = b.range(0.3, 0.42);
      for (const over of [-0.035, 0.035]) b.prop('timber', box(0.09, long, 0.025, L(x, y - long / 2, z + over), yaw), FISH);
    }
  }
  blockAlong(b, L(-half, 0, 0), L(half, 0, 0), splay + 0.1);
}

/** A pair of skids loaded with cut blocks, ready to be hauled out. `at` is the floor at its middle; its nose is at +x. */
export function iceSkids(b, at, yaw, { length = 2.2 } = {}) {
  const L = local(at, yaw), half = length / 2;
  for (const z of [-0.4, 0.4]) {
    b.prop('timber', hewnBeam(L(-half, 0.07, z), L(half - 0.2, 0.07, z), 0.1, 0.14), COLD_POST);
    b.prop('timber', hewnBeam(L(half - 0.2, 0.07, z), L(half + 0.05, 0.32, z), 0.1, 0.12), COLD_POST);
  }
  for (const x of [-half + 0.25, 0, half - 0.45]) b.prop('timber', hewnBeam(L(x, 0.17, -0.55), L(x, 0.17, 0.55), 0.1, 0.07), COLD_BOARD);
  b.prop('timber', rod(L(half + 0.05, 0.32, -0.45), L(half + 0.05, 0.32, 0.45), 0.03, 0.03, 6), COLD_BOARD);
  const deck = 0.205;
  for (const [x, course, z] of [[-0.48, 0, -0.32], [0.48, 0, -0.32], [-0.48, 0, 0.32], [0.48, 0, 0.32], [0, 1, 0]]) {
    iceBlock(b, L(x, deck + course * ICE_BLOCK.height, z), yaw);
  }
  b.nav.block(at, half + 0.2, 2);
}

/** An ice saw, its long blade leant against the face from `foot` to `top`, the cross handle along `across`. */
export function iceSaw(b, foot, top, across) {
  b.prop('iron', panel(foot, top, across, 0.15, 0.012), 0xa2a8b0);
  const grip = (sign) => P(top.x + across.x * 0.28 * sign, top.y + 0.06, top.z + across.z * 0.28 * sign);
  b.prop('timber', rod(grip(-1), grip(1), 0.03, 0.03, 6), COLD_POST);
}

/** Ice tongs hung by their bows from a peg: two arms crossing at the pivot, their points turned in. */
export function iceTongs(b, peg, yaw) {
  const L = local(peg, yaw);
  for (const side of [-1, 1]) {
    const bow = L(side * 0.13, -0.05, 0), pivot = L(0, -0.32, 0), jaw = L(-side * 0.17, -0.58, 0);
    b.prop('iron', beam(bow, pivot, 0.025), HOOP);
    b.prop('iron', beam(pivot, jaw, 0.025), HOOP);
    b.prop('iron', beam(jaw, L(-side * 0.05, -0.68, 0), 0.022), HOOP);
  }
  b.prop('iron', beam(L(-0.13, -0.05, 0), L(0.13, -0.05, 0), 0.02), HOOP);
}

/** A lantern hung from an arm braced off a post: `root` is where the arm leaves the post; it reaches along local z. */
export function lampArm(b, root, yaw, { reach = 0.55, hung = 0.25, lamp }) {
  const L = local(root, yaw);
  b.prop('timber', hewnBeam(L(0, 0, -0.05), L(0, 0, reach + 0.08), 0.08, 0.1), COLD_POST);
  b.prop('timber', hewnBeam(L(0, -0.45, 0), L(0, -0.03, reach * 0.6), 0.06, 0.06), COLD_POST);
  lantern(b, L(0, -0.05 - LANTERN_STEM - hung, reach), { halo: 0.9, ...lamp, hung });
}

/** A lamp post set into the floor where work is done. `at` is its foot; the lamp hangs out along local z. */
export function lampPost(b, at, yaw, { height = 2.4, reach = 0.55, lamp }) {
  b.prop('timber', hewnBeam(P(at.x, at.y - 0.2, at.z), P(at.x, at.y + height + 0.1, at.z), 0.14, 0.14), COLD_POST);
  lampArm(b, P(at.x, at.y + height - 0.05, at.z), yaw, { reach, lamp });
  b.nav.block(at, 0.35, 3);
}

/** Duckboards from floor point `a` to `c`: planks along the way on sleepers across it, so feet and runners keep off the ice. */
export function duckboard(b, a, c, { width = 1.3, spacing = 1.1, boards = 5 } = {}) {
  const length = Math.hypot(c.x - a.x, c.z - a.z);
  const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length;
  const at = (along, across, dy) => P(a.x + ux * along - uz * across, a.y + (c.y - a.y) * along / length + dy, a.z + uz * along + ux * across);
  for (let along = 0.3; along < length; along += spacing) {
    b.prop('timber', hewnBeam(at(along, -width / 2 - 0.12, SLEEPER_Y), at(along, width / 2 + 0.12, SLEEPER_Y), 0.12, 0.08), COLD_POST);
  }
  const board = width / boards;
  for (let index = 0; index < boards; index += 1) {
    const across = -width / 2 + (index + 0.5) * board;
    b.prop('planks', panel(at(0, across, BOARD_Y), at(length, across, BOARD_Y), P(-uz, 0, ux), board - 0.03, 0.035), 0xffffff);
  }
}

/** A hand rail of poles on short posts from floor point `a` to `c`, for a sloping walk over ice. */
export function poleRail(b, a, c, { height = 0.95, spacing = 1.6 } = {}) {
  const length = Math.hypot(c.x - a.x, c.z - a.z), count = Math.max(1, Math.round(length / spacing));
  const at = (t, dy) => P(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t + dy, a.z + (c.z - a.z) * t);
  for (let index = 0; index <= count; index += 1) b.prop('timber', rod(at(index / count, -0.15), at(index / count, height + 0.06), 0.05, 0.045, 6), COLD_POST);
  b.prop('timber', rod(at(0, height), at(1, height), 0.035, 0.035, 6), COLD_BOARD);
  blockAlong(b, at(0, 0), at(1, 0), 0.2, 1.2);
}
