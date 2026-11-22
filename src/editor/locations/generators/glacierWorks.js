import { facetedCrystal } from '../gen/iceKit.js';
import { block, box, hewnBeam, rod, stoneBlock } from '../gen/propKit.js';
import { sled, woodpile } from './frostgardDressing.js';
import { DARK, LOG, PALE, STONE, longhall, storehouse, torch } from './frostgardKit.js';
import { barrel, crate } from './kits.js';

/**
 * What the Norths built inside the glacier. Nothing stands on the ice it
 * spans: the bridge beds on sills set back from the crevasse's lips, its rails
 * are guyed to stakes in the floor, and a lamp post that cannot be driven into
 * ice is bedded in a cairn of stones carried up from the moraine.
 */

const P = (x, y, z) => ({ x, y, z });
/** Sill, stringer and deck board depths, metres; the deck's top is their sum over the floor. */
const SILL = 0.18, STRINGER = 0.13, BOARD = 0.05;
/** Sills sit this far back from a lip, so the load bears on sound ice rather than the edge that calves. */
const SILL_SETBACK = 0.5;
/** Deck boards are laid at this pitch along the bridge. */
const BOARD_PITCH = 0.3;
/** Rope rails ride this high over the deck and sag this much at mid-span; guys reach this far back from the posts. */
const RAIL_HEIGHT = 1.05, ROPE_SAG = 0.22, GUY_REACH = 1.6;
/** Straight pieces a sagging rope is drawn with. */
const ROPE_PIECES = 8;

/**
 * A plank bridge from floor point `a` to floor point `c` over a gap whose lips
 * lie `lipA` and `lipC` metres from its middle. Sills bed on the floor behind
 * each lip and under each end, two stringers span them, the deck is planked
 * across; end posts carry sagging rope rails and are guyed back to stakes.
 * Makes the deck walkable and returns its height.
 */
export function plankBridge(b, a, c, { lipA, lipC, width = 1.4 }) {
  const length = Math.hypot(c.x - a.x, c.z - a.z);
  const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length;
  const mid = P((a.x + c.x) / 2, a.y, (a.z + c.z) / 2);
  // Along the bridge from its middle (toward `c` positive), across it, and up from the floor.
  const L = (along, side, up) => P(mid.x + ux * along - uz * side, mid.y + up, mid.z + uz * along + ux * side);
  const deck = SILL + STRINGER * 2 + BOARD;
  for (const along of [-(lipA + SILL_SETBACK), lipC + SILL_SETBACK, -length / 2 + 0.25, length / 2 - 0.25]) {
    b.prop('timber', hewnBeam(L(along, -width / 2 - 0.3, SILL / 2), L(along, width / 2 + 0.3, SILL / 2), 0.3, SILL), DARK);
  }
  for (const side of [-width / 2 + 0.22, width / 2 - 0.22]) {
    b.prop('timber', rod(L(-length / 2, side, SILL + STRINGER), L(length / 2, side, SILL + STRINGER), STRINGER, STRINGER * 0.9, 7), LOG);
  }
  for (let along = -length / 2 + BOARD_PITCH / 2; along < length / 2; along += BOARD_PITCH) {
    b.prop('timber', hewnBeam(L(along, -width / 2, deck - BOARD / 2), L(along, width / 2, deck - BOARD / 2), BOARD_PITCH - 0.04, BOARD, { irregular: 0.4 }), 0x8a6d4a);
  }
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const foot = L(end * (length / 2 - 0.45), side * (width / 2 + 0.14), 0);
      const head = P(foot.x, foot.y + deck + RAIL_HEIGHT, foot.z);
      b.prop('timber', rod(P(foot.x, foot.y - 0.1, foot.z), head, 0.07, 0.06, 6), DARK);
      b.nav.block(foot, 0.22, 2);
      // A guy back to a stake driven slantwise into the floor, so the rail pulls against the ice, not the deck.
      const stake = L(end * (length / 2 - 0.45 + GUY_REACH), side * (width / 2 + 0.6), 0);
      b.prop('timber', rod(P(stake.x - ux * end * 0.12, stake.y - 0.3, stake.z - uz * end * 0.12), P(stake.x, stake.y + 0.3, stake.z), 0.045, 0.035, 5), DARK);
      b.prop('timber', rod(head, P(stake.x, stake.y + 0.25, stake.z), 0.018, 0.018, 4), PALE);
    }
  }
  for (const side of [-1, 1]) {
    let last = null;
    for (let piece = 0; piece <= ROPE_PIECES; piece += 1) {
      const t = piece / ROPE_PIECES;
      const at = L(-(length / 2 - 0.45) + t * (length - 0.9), side * (width / 2 + 0.14), deck + RAIL_HEIGHT - ROPE_SAG * 4 * t * (1 - t));
      if (last) b.prop('timber', rod(last, at, 0.022, 0.022, 4), PALE);
      last = at;
    }
  }
  b.nav.addSegment(L(-length / 2, 0, deck), L(length / 2, 0, deck), width - 0.3);
  return mid.y + deck;
}

/**
 * The camp on the bedrock around `at` (the middle of its yard): the longhall with its door to the yard, the
 * store beside it and the sled that supplies it drawn up to the store's steps, firewood by the door, and
 * torches at the yard's entrance and the store.
 */
export function refugeCamp(b, at, hall) {
  const L = (dx, dz) => P(at.x + dx, at.y, at.z + dz);
  longhall(b, L(-2, -3), hall);
  storehouse(b, L(7.5, -3.5));
  sled(b, L(7.5, 1.6), Math.PI);
  woodpile(b, L(-6.5, 0.7), { length: 1.6 });
  barrel(b, L(4.6, -1.2));
  crate(b, L(4.9, -0.2), 0.8, 0.4);
  b.nav.block(L(4.8, -0.7), 0.9, 2);
  for (const [dx, dz] of [[8, 6], [5.6, -1.4]]) torch(b, L(dx, dz));
}

/** The sealed vault around `at`: black standing stones clasped by jagged refractive crystal spires. */
export function sealedVault(b, at) {
  const L = (dx, dy, dz) => P(at.x + dx, at.y + dy, at.z + dz);
  const stones = [[0, -6.6, 6.2, 0.3], [-2.3, -6, 4.2, -0.5], [2.1, -6.2, 3.4, 0.6]];
  stones.forEach(([dx, dz, tall, lean], idx) => {
    const foot = L(dx, -0.3, dz);
    b.prop('seal', rod(foot, P(foot.x + lean, foot.y + tall, foot.z - 0.4), 1.1, 0.25, 6), 0xffffff);
    // Clasp each obsidian monolith with a ring of jagged faceted refractive ice crystal spires.
    const count = idx === 0 ? 7 : 5;
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * Math.PI * 2 + idx * 0.7;
      const radial = 0.78 + (k % 2) * 0.28;
      const h = tall * (0.28 + ((k * 37) % 10) * 0.025);
      const sx = foot.x + Math.cos(angle) * radial;
      const sz = foot.z + Math.sin(angle) * radial;
      const splay = 0.35 + (k % 3) * 0.14;
      b.prop('clearIce', facetedCrystal(
        P(sx, foot.y - 0.15, sz),
        P(sx + Math.cos(angle) * splay + lean * 0.12, foot.y + h, sz + Math.sin(angle) * splay),
        0.34 + (k % 2) * 0.12,
        { sides: 6, taper: 0.56, tipRatio: 0.32, seed: idx * 31 + k + 7, flare: 1.18 },
      ), 0xffffff);
    }
    b.nav.block(foot, 1.6, 4);
  });
  b.light(L(0, 3, -3), '#8fd0ff', 2.2, 15);
  for (const dx of [-3.4, 3.4]) {
    b.prop('masonry', block(0.7, 1.5, 0.7, L(dx, 0, -5.6)), 0xb9b4ad);
    b.prop('glow', box(0.3, 0.3, 0.3, L(dx, 1.7, -5.6)), '#9fdcff', 2.5);
    b.light(L(dx, 1.9, -5.6), '#9fdcff', 1.6, 9, { halo: 1.4 });
    b.nav.block(L(dx, 0, -5.6), 0.7, 2);
  }
}

/** A lamp on a post bedded in a cairn of stones: a way-marker where the floor is too hard to drive a stake. */
export function cairnLamp(b, foot, lamp) {
  for (let index = 0; index < 6; index += 1) {
    const angle = index * 1.05 + b.range(-0.2, 0.2), size = b.range(0.32, 0.46);
    const at = P(foot.x + Math.cos(angle) * 0.34, foot.y - 0.06, foot.z + Math.sin(angle) * 0.34);
    b.prop('masonry', stoneBlock(size, size * 0.7, size * 0.85, at, { yaw: angle, irregular: 0.7, bevel: 0.08 }), STONE);
  }
  b.prop('masonry', stoneBlock(0.4, 0.26, 0.36, P(foot.x + 0.12, foot.y + 0.24, foot.z - 0.1), { yaw: 0.6, irregular: 0.7, bevel: 0.07 }), STONE);
  torch(b, foot, lamp);
}
