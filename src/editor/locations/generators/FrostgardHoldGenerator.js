import { boulder } from '../gen/iceKit.js';
import { fbm3 } from '../gen/noise.js';
import { onTrail } from '../gen/plan.js';
import { block, hewnBeam, stoneBlock } from '../gen/propKit.js';
import { crevasse, hall as hallShape, mound, shaft, tunnel } from '../gen/shapes.js';
import { DARK, STONE, beacon, gableFront, irregularSteps, longhall, palisade, storehouse, torch, watchGate } from './frostgardKit.js';
import { doorHide, dryingRack, hallInterior, sled, woodShed, woodpile } from './frostgardDressing.js';
import { airlock, cutIceStore, fitIceStore, storeFrame } from './frostgardIceStore.js';
import { COLD_POST } from './frostgardStoreKit.js';
import { barrel, crate, lantern, timberSet } from './kits.js';

/**
 * A Frostgard hold at the foot of a glacier.
 *
 * The Norths did not build in the ice. Where the glacier's edge rides over a
 * bluff of bedrock they cut a great hall into the rock, faced it in timber and
 * let the snow bury its roof: rock holds a fire's heat, and ice would melt
 * round it. A palisade and watch gate keep the wind off the yard; the beacon
 * answers the border. Only the store is in the glacier — a passage from the
 * back of the hall leaves the rock through an airlock of hides, enters the ice,
 * and ends in a cut chamber that has never been above freezing
 * (`frostgardIceStore.js`).
 */

export const open = true;
export const bounds = { min: { x: -56, y: -8, z: -84 }, max: { x: 56, y: 52, z: 48 } };

const P = (x, y, z) => ({ x, y, z });
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth01 = (value) => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, c, t) => a + (c - a) * t;
const HEADROOM = 2.2;
/** Half the width of the sled road and the yard's paths, metres. */
const TRAIL_HALF_WIDTH = 1.6;
/** Metres past the bend where the passage leaves the rock (the threshold), and the vestibule behind it. */
const THRESHOLD = 1.4, VESTIBULE = 1.8;
/** Within this many metres of the passage's middle the medium is what its cutters met: rock to the threshold, ice beyond. */
const PASSAGE_REACH = 3, PASSAGE_MID = 1.35;
/** How rough tool-cut faces stay, as a share of a natural face's roughness. */
const CUT_ROUGHNESS = 0.3;

/** Distance from a point to the passage's line from floor point `a` to `c`, taken at mid height. */
function fromPassage(x, y, z, a, c) {
  const dx = c.x - a.x, dz = c.z - a.z;
  const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
  return Math.hypot(x - a.x - dx * t, y - a.y - (c.y - a.y) * t - PASSAGE_MID, z - a.z - dz * t);
}

/** The floor point `metres` from `a` toward `c`. */
function toward(a, c, metres) {
  const k = metres / Math.hypot(c.x - a.x, c.z - a.z);
  return P(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
}

export function generate(b, params) {
  const seed = b.seed;
  const { hall, knoll, glacier, wall, rise, store } = params;
  const wave = (x, z, scale, salt, octaves = 3) => fbm3(x * scale, 0.5, z * scale, seed + salt, octaves) - 0.5;
  const floor = hall.floor;
  const hallAt = P(0, floor, knoll.front - 2.5 - hall.halfLength);

  // --- The land: yard, rock walls, the bluff, the glacier over it ------------
  const ground = (x, z) => 0.5 + wave(x, z, 0.05, 1) * 2.2 + wave(x, z, 0.15, 2, 2) * 0.5
    - 0.5 * Math.exp(-((x / 3.5) ** 2)) + rise.height * Math.exp(-(((z - rise.z) / rise.width) ** 2));
  const wallX = (y, z) => wall.x + wave(z, y, 0.05, 3) * 8 + y * wall.lean;
  // The front swings south along the west side, so ice walls the yard's north-west corner.
  const faceZ = (x, y) => glacier.z + glacier.swing * smooth01((-22 - x) / 24) - y * glacier.lean
    + (fbm3(x * 0.05, y * 0.05, 0.5, seed + 4, 3) - 0.5) * 12 + (fbm3(x * 0.17, y * 0.17, 0.5, seed + 5, 2) - 0.5) * 3;
  const top = (x, z) => glacier.height + (glacier.z - z) * 0.1 + wave(x, z, 0.06, 6) * 6;
  const bluff = (x, y, z) => Math.max(
    Math.abs(x) - (knoll.halfWidth - y * 0.25 + wave(z, y, 0.08, 7) * 3),
    z - (knoll.front - y * 0.1),
    y - (knoll.height + wave(x, z, 0.1, 8) * 3),
  );
  b.grid.carve({
    box: bounds,
    air: (x, y, z) => Math.min(y - ground(x, z), wallX(y, z) - Math.abs(x),
      Math.max(z - faceZ(x, y), y - top(x, z)), bluff(x, y, z)),
  });
  for (const [from, to, back] of glacier.crevasses) {
    b.grid.carve(crevasse(P(from, 22, faceZ(from, 30) - back), P(to, 22, faceZ(to, 30) - back - 6),
      { topY: 50, topWidth: 3.2, wander: 2, seed: seed + from }), 0.6);
  }

  // --- Cut into the bluff: the hall, its doors, the flue ---------------------
  b.grid.carve(hallShape(hallAt, { halfLength: hall.halfLength, halfWidth: hall.halfWidth, height: hall.wallHeight, vaultRise: hall.vaultRise, yaw: Math.PI / 2 }));
  const south = hallAt.z + hall.halfLength, north = hallAt.z - hall.halfLength;
  b.grid.carve(tunnel(P(0, floor, knoll.front + 2.5), P(0, floor, south - 0.5), { halfWidth: 1.15, height: 2.55, arch: 0.1 }));
  b.grid.carve(tunnel(P(0, floor, north + 0.5), P(0, floor, north - 4), { halfWidth: 1.1, height: 2.5, arch: 0.1 }));
  b.grid.carve(shaft(P(0, 0, hallAt.z + 1), { radius: 0.75, bottomY: floor + hall.wallHeight + hall.vaultRise - 0.5, topY: knoll.height + 5 }));
  // Behind the hall the passage leaves the rock for the ice, and runs straight down the store's aisle.
  const bend = P(-8, floor - 0.4, north - 8.5);
  const storeRoom = storeFrame(P(store.x, store.floor, store.z), bend, store);
  const passage = [P(0, floor, north - 3.5), bend, storeRoom.at(-store.halfLength, 0, 0)];
  for (let index = 0; index < passage.length - 1; index += 1) {
    b.passage(passage[index], passage[index + 1], { width: 2.5, height: 2.7, arch: 0.3, smooth: 0.5 });
  }
  cutIceStore(b, storeRoom);
  const threshold = toward(bend, passage[2], THRESHOLD);
  const iceward = toward(P(0, 0, 0), P(passage[2].x - bend.x, 0, passage[2].z - bend.z), 1);
  const pastThreshold = (p) => (p.x - threshold.x) * iceward.x + (p.z - threshold.z) * iceward.z;
  const nearPassage = (x, y, z) => clamp01(PASSAGE_REACH + 1
    - Math.min(fromPassage(x, y, z, passage[0], bend), fromPassage(x, y, z, bend, passage[2])));

  // Drifts where the wind drops its load: against the palisade, the bluff and the buildings.
  const gateZ = params.yard.gateZ;
  for (const [x, z, rx, rz] of [[-9, gateZ + 1.6, 6, 2.2], [12, gateZ + 1.4, 7, 2], [-25, gateZ + 1.2, 6, 2.4], [26, gateZ + 1.5, 6, 2],
    [-9, knoll.front + 1.5, 5, 2.4], [10, knoll.front + 1.2, 6, 2.2], [-20, 4, 3, 5],
    [-2.5, knoll.front + 3.0, 1.5, 1.8], [2.5, knoll.front + 3.0, 1.5, 1.8],
    [-hall.halfWidth - 0.85, knoll.front + 3.1, 1.3, 1.2], [hall.halfWidth + 0.85, knoll.front + 3.1, 1.3, 1.2],
    [-3.9, knoll.front + 0.8, 2.4, 1.3], [3.9, knoll.front + 0.8, 2.4, 1.3]]) {
    b.grid.fill(mound(P(x, ground(x, z) + 0.1, z), rx, 1, rz), 1);
  }

  // The hall's rock and timber stay true; the passage and the store keep a little of a tool-cut face; the rest is broken up.
  const built = (x, y, z) => {
    if (Math.abs(x) < hall.halfWidth + 2.5 && z < knoll.front + 3 && z > north - 5 && y < knoll.height - 1) return 0;
    return 1 - Math.max(nearPassage(x, y, z), storeRoom.inside(x, y, z)) * (1 - CUT_ROUGHNESS);
  };
  b.grid.roughen({ amp: 0.7, scale: 0.1, seed, octaves: 3, floorAmp: 0.08, ampAt: built });
  b.grid.striate({ ...params.strata, seed: seed + 9, ampAt: (x, y, z) => (z < faceZ(x, y) + 5 ? built(x, y, z) : 0) });
  b.grid.roughen({ amp: 0.2, scale: 0.5, seed: seed + 5, octaves: 2, floorAmp: 0.12, ampAt: built });

  // --- Where it can be walked ------------------------------------------------
  const footing = (x, z) => b.terrainAt(x, ground(x, z) + HEADROOM, z);
  const stand = (x, z) => P(x, footing(x, z) ?? ground(x, z), z);
  const stoopZ = knoll.front + 4.6;
  b.nav.addSurface((x, z) => footing(x, z) ?? NaN, (x, z) => z > stoopZ && z < rise.z - 5 && Math.abs(x) < wall.x - 6);
  b.nav.addRect(P(0, floor, knoll.front + 2.2), 1.7, 2.3);
  b.nav.addRect(P(0, floor * 0.66, stoopZ + 0.4), 1.4, 0.4);
  b.nav.addRect(P(0, floor * 0.33, stoopZ + 1.1), 1.4, 0.4);
  b.nav.addSegment(P(0, floor, knoll.front + 1), P(0, floor, south - 0.4), 1.7);
  b.nav.addSegment(P(0, floor, north + 0.6), passage[0], 1.6);

  // The sled road in through the gate to the door, and the paths the household has worn off it.
  const trails = [
    [P(0, 0, rise.z - 6), P(0, 0, gateZ), P(0, 0, stoopZ + 1)],
    [P(0, 0, 5), P(-10, 0, 6), P(-17, 0, 4.5)],
    [P(0, 0, 3), P(9, 0, 3), P(15, 0, 1.5)],
  ];

  // --- What the surface is made of ---------------------------------------------
  const near = (p, q, radius) => Math.max(0, 1 - Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / radius);
  const storeAt = P(store.x, store.floor + 2, store.z), storeDoor = P(passage[2].x, store.floor + 1.5, passage[2].z);
  b.classify = (p, n, mask, mask2) => {
    const grain = fbm3(p.x * 0.09, p.y * 0.09, p.z * 0.09, seed + 11, 3);
    const up = clamp01((n.y - 0.25) / 0.45);
    const into = faceZ(p.x, p.y) - p.z;
    // Ice is whatever lies behind the glacier's face; the contact with the rock is ragged, not a line —
    // except along the passage, which was cut through rock as far as the threshold and through ice beyond it.
    const contact = clamp01(0.5 - (into + (grain - 0.5) * 5) / 2.5);
    const rock = mix(contact, clamp01(0.5 - pastThreshold(p) / 0.6), nearPassage(p.x, p.y, p.z));
    const cold = near(p, storeAt, store.halfLength + 6);
    // The store's walls are tool-cut: clear and unfractured, rimed only where breath and lamps reach by the door.
    const cut = storeRoom.inside(p.x, p.y, p.z);
    mask[0] = rock;
    mask[1] = 0;
    mask[2] = mix(clamp01(cold * 0.3 + clamp01((p.y - glacier.height + 8) / 10) * 0.4), 0.1 + near(p, storeDoor, 4) * 0.7, cut);
    mask[3] = mix(clamp01(cold * 0.5 + Math.max(0, grain - 0.5) * 2.2), 0.08, cut);
    // The glacier's sole is dirty with what it rode over: it shows wherever the passage cuts it.
    mask2[0] = clamp01(Math.max(0, 1 - (p.y - ground(p.x, p.z)) / 6) * (0.5 + grain)) * (1 - cut * 0.6);
    mask2[1] = clamp01((p.y - 22) / 14);
    mask2[2] = clamp01(cold * up * 0.9);
    mask2[3] = onTrail(p, trails, TRAIL_HALF_WIDTH) * up;
    return 1 - rock;
  };

  // --- The hall ------------------------------------------------------------------
  const ridge = hall.wallHeight + hall.vaultRise - 0.35;
  hallInterior(b, hallAt, { halfWidth: hall.halfWidth, halfLength: hall.halfLength, wallHeight: hall.wallHeight, ridge });
  gableFront(b, P(0, floor, knoll.front + 0.35), { width: hall.halfWidth * 2 + 2.4, wallHeight: 4.2, roofRise: 4, footing: floor + 1 });
  // The stoop and its irregular stone-and-timber steps, and the door passages dressed in stone under timber lintels.
  b.prop('masonry', stoneBlock(3.4, floor + 0.96, 4.6, P(0, -1, knoll.front + 2.1), { irregular: 0.28, bevel: 0.08 }), STONE);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      const z = knoll.front + 0.4 + k * 1.15;
      b.prop('masonry', stoneBlock(0.55, floor + 0.98 + (k % 2 ? 0.03 : -0.02), 1.08, P(sx * 1.68, -1, z),
        { irregular: 0.55, bevel: 0.08, yaw: sx * ((k % 2 ? 1 : -1) * 0.04) }), k % 2 ? 0x97938b : STONE);
    }
    b.prop('roof', stoneBlock(0.75, 0.28, 3.6, P(sx * 1.82, -0.08, knoll.front + 2.2), { irregular: 0.72, bevel: 0.1 }), 0xffffff);
  }
  b.prop('timber', hewnBeam(P(-1.75, floor - 0.03, stoopZ - 0.05), P(1.75, floor - 0.02, stoopZ - 0.04), 0.16, 0.12, { irregular: 0.35 }), DARK);
  irregularSteps(b, P(0, 0, stoopZ + 0.04), { width: 3.1, height: floor, depth: 1.48, count: 2, dirZ: 1 });
  for (const [from, to] of [[knoll.front + 0.2, south], [north, north - 4]]) {
    for (const sx of [-1, 1]) {
      b.prop('masonry', stoneBlock(0.3, 2.5, Math.abs(to - from), P(sx * 1.25, floor, (from + to) / 2), { irregular: 0.2 }), STONE);
    }
    b.prop('timber', block(2.9, 0.25, Math.abs(to - from), P(0, floor + 2.5, (from + to) / 2)), DARK);
  }
  doorHide(b, P(0, floor, north - 1.2));
  doorHide(b, P(0, floor, north - 3.6));
  // The smoke turret on the bluff, over the hearth.
  const vent = P(0, b.probe(3, knoll.height + 6, hallAt.z + 1, -1, 12) ?? knoll.height, hallAt.z + 1);
  b.prop('masonry', stoneBlock(2.4, 1.6, 2.4, P(vent.x, vent.y - 0.5, vent.z), { batter: 0.15, irregular: 0.4 }), STONE);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.prop('timber', hewnBeam(P(vent.x + sx * 0.85, vent.y + 1, vent.z + sz * 0.85), P(vent.x + sx * 0.85, vent.y + 2, vent.z + sz * 0.85), 0.18, 0.18), DARK);
  }
  b.prop('roof', block(2.7, 0.3, 2.7, P(vent.x, vent.y + 2, vent.z)), 0xffffff);
  b.light(P(vent.x, vent.y + 1.6, vent.z), '#ff9a45', 2.2, 9, { halo: 1.6 });
  b.emit('smoke', P(vent.x, vent.y + 1.7, vent.z));

  // --- The passage and the store ---------------------------------------------------
  // A lamp at each turn: between the hall's door hides, at the bend, and (in the store's fittings) at the store door.
  lantern(b, P(0.7, floor + 2.1, north - 2.4), { intensity: 2.2, range: 8, halo: 0.8, hung: 0.3 });
  lantern(b, P(bend.x, bend.y + 2.05, bend.z), { intensity: 2.8, range: 9, halo: 1, hung: 0.45 });
  airlock(b, threshold, toward(bend, passage[2], THRESHOLD + VESTIBULE), passage[2]);
  // Ice creeps: a set holds the roof of the stretch cut through it.
  const set = toward(bend, passage[2], (THRESHOLD + VESTIBULE + Math.hypot(passage[2].x - bend.x, passage[2].z - bend.z)) / 2);
  timberSet(b, set, Math.atan2(iceward.x, iceward.z), 2.3, 2.45, COLD_POST);
  // A lamp behind the ice wall: past the threshold the walls glow cold, and the set stands dark against them.
  const { glow } = params.storeLight;
  b.light(P(set.x + iceward.z * 2.5, set.y + 1.6, set.z - iceward.x * 2.5), '#fff0d0', glow.intensity, glow.range, { radius: 1.4 });
  fitIceStore(b, storeRoom, { light: params.storeLight, icicles: params.icicles });

  // --- The yard --------------------------------------------------------------------
  palisade(b, P(-wall.x + 2, 0, gateZ), P(wall.x - 2, 0, gateZ), ground, { skip: [wall.x - 2 - 2.9, wall.x - 2 + 2.9] });
  watchGate(b, stand(0, gateZ));
  for (const sx of [-1, 1]) {
    torch(b, stand(sx * 3.6, gateZ + 2.2));
    torch(b, stand(sx * 3, stoopZ + 1.6), { height: 1.7 });
  }
  beacon(b, stand(11, gateZ - 6));
  longhall(b, stand(-17, 0), params.cottage, { icicles: true });
  storehouse(b, stand(15, -2), { icicles: true });
  woodpile(b, stand(-8, knoll.front + 4.6), { length: 1.3, rows: 4, count: 7 });
  woodpile(b, stand(-6.4, knoll.front + 4.6), { length: 1.3, rows: 3, count: 6 });
  woodShed(b, stand(-7.2, knoll.front + 5.9));
  sled(b, stand(5.5, 6), 0.5);
  dryingRack(b, stand(17, 6.5));
  dryingRack(b, stand(-27, 8), { hides: true });
  barrel(b, stand(12.2, 1.6));
  crate(b, stand(11.4, 0.6), 0.8, 0.4);
  b.nav.block(stand(11.8, 1.1), 0.9, 2);
  // Boulders the bluff has shed, half buried.
  for (const [x, z, size] of [[-13, knoll.front + 3, 1.5], [14, knoll.front + 2.4, 1.9], [24, 3, 1.3], [-30, -2, 1.7], [-34, gateZ + 9, 1.4], [30, gateZ + 12, 1.8]]) {
    const at = stand(x, z);
    b.prop('rock', boulder(P(at.x, at.y - size * 0.3, at.z), size, size * 0.75, size * 0.9, { seed: Math.round(x * 7 + z), blocky: 0.25 }), 0xb9bcc2);
    b.nav.block(at, size, 2);
  }

  b.anchor('gate', P(0, 3, gateZ + 8));
  b.spawn('entry', stand(0, rise.z - 11), 0);
  b.exit('road', stand(0, rise.z - 7), { radius: 2.6, label: 'Take the sled road down the valley' });
}
