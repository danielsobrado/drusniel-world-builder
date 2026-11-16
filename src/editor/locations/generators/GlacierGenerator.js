import { fbm3 } from '../gen/noise.js';
import { onTrail, planDistance } from '../gen/plan.js';
import { beam, box, rod } from '../gen/propKit.js';
import { chamber, column, crevasse, mound, slab } from '../gen/shapes.js';
import { DARK, LOG, torch } from './frostgardKit.js';
import { curtain, hollow, meltTube, pillar, plug, walkClearance } from './glacierCave.js';
import { fallFringe, frozenFall, icicleCluster, scatter } from './glacierKit.js';
import { cairnLamp, plankBridge, refugeCamp, sealedVault } from './glacierWorks.js';
import {
  buildBoneMooringAnchor,
  buildFrozenMeltMushroomColumn,
  buildHoarfrostRoseCluster,
  buildOrganPipeIceFormation,
  buildRunicIceLanternShrine,
} from './glacierExtraProps.js';

/**
 * A natural ice cave under a Frostgard glacier, and the refuge inside it.
 *
 * The cave follows how glaciers make them: a wind-scoured portal, a meltwater
 * tube whose stream cut a slot down through its floor, a squeeze that is all
 * slot, then a hall that melted out where channels met, split through roof and
 * floor by a crevasse that captured the stream. People came after — and built
 * on the bedrock at the glacier's side, because a hearth cannot stand on ice.
 */

export const bounds = { min: { x: -58, y: -16, z: -106 }, max: { x: 34, y: 36, z: 30 } };

const P = (x, y, z) => ({ x, y, z });
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const near = (p, q, radius) => Math.max(0, 1 - Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / radius);
const SKY = '#d6e8ff';

const MOUTH = P(0, 5, 22), HALL = P(-4, -2, -46), REFUGE = P(-38, -1, -72), VAULT = P(6, -3, -92);
const CHOKE = P(-27, -1.5, -56), FALL = P(17, -2, -55);
/** The stream's course, floor points from the portal's lip to where it ran out onto the hall floor. */
const STREAM = [P(0, 5.2, 24), P(0.2, 4.2, 17), P(0.6, 2.6, 10), P(1.6, 0.7, 3), P(1, 0.1, -2.5), P(-1.8, -0.4, -7.5),
  P(-4, -0.7, -11.5), P(-4.9, -1, -18), P(-5.1, -1.3, -24), P(-4.3, -1.7, -30), P(-4.6, -2, -35)];
/** South of this the tube has given way to the hall. */
const TUBE_END_Z = -33;
/** Metres along the tube: the moulin over the gallery, the blocks spalled from its roof, the last lamp before the squeeze. */
const MOULIN_AT = 24, BREAKDOWN_AT = [27, 29.5], PINCH_AT = 34;
/** The moulin stands this far to the side of the stream and drilled this high above the floor before it froze shut. */
const MOULIN_SIDE = 3.3, MOULIN_RISE = 14;
/** Where the squeeze's end and the hall's south wall leave a thin partition between them. */
const SQUEEZE_GLOW = P(-7.5, 1.5, -29.5);

/** Plan bearing of the crevasse, how far it runs either way of the hall's middle, how deep under the floor. */
const CREVASSE_YAW = 0.5, CREVASSE_REACH = 20, CREVASSE_DEPTH = 13;
const SLOT = { topY: 34, topWidth: 5.2, bottomWidth: 2.6, wander: 0.7 };
/** Drift has filled the crevasse's bottom up to this far under the hall floor. */
const PLUG_BELOW = 7;
/** Along the crevasse: a block wedged where it narrows, a snow bridge near the top, daylight lamps down it. */
const WEDGE_AT = -10, SNOW_BRIDGE_AT = 6.5, SLOT_LIGHTS = [-12, -2, 11];
/** Sun shafts down the crevasse: [along at the top, along and across where they land, width, strength]. */
const SHAFTS = [[3, 1, 1.5, 5, 0.06], [-6, -7, -1, 4, 0.045], [9, 10, -1.5, 3.5, 0.04]];
/** Hall coordinates below are [along the crevasse, across it (south positive)]. */
/** Domes the hall melted into where channels met: [along, across, centre over the floor, rx, ry, rz]. */
const DOMES = [[0, 2, 11, 21, 16, 20], [6, -7.8, 8, 12, 10, 11], [-16, 8, 4.5, 9, 6.5, 9], [5, 8, 21, 8, 9, 7]];
/** The floor that is walked either side of the crevasse: [along, across, half-length, half-width]. */
const HALL_FLOORS = [[0, 7.1, 9.5, 2.9], [0, -6.85, 8, 2.65]];
/** Where the squeeze lets out into the hall: [along, across, radius]. */
const LANDING = [3, 12.5, 3.2];
const BRIDGE_AT = 2, BRIDGE_HALF = 4.4;
/**
 * Pillars the melt left. `twin` fuses a second beside it (metres along), `lean` tips its head over
 * ([along, across] metres), `web` joins it to a wall and `drape` hangs a curtain from the roof beside it.
 */
const PILLARS = [
  { at: [-7, 10], base: 2.6, waist: 1.25, crown: 3.2, twin: 2.8 },
  { at: [9, 10], base: 2.4, waist: 1.5, crown: 2.8, lean: [2, -3.5] },
  { at: [7.5, -9], base: 3.1, waist: 1.9, crown: 3.8, web: [9, -17] },
  { at: [-9, -7], base: 2.2, waist: 1.1, crown: 2.8, drape: [-15.5, -3.5] },
];
/** Ice hanging where the roofs of two domes meet: [along, across, length, radius at the roof]. */
const PENDANTS = [[-13, 13, 5, 2.4], [13, -10, 4.5, 2.2], [-3, -11, 6, 2.6]];
/** No pendant or curtain hangs lower than this over the hall floor. */
const HANG_CLEAR = 5;
/** The meltwater pool by the fall, frozen clear: [along, across, radius]. */
const POOL = [11.5, -5.5, 1.8];
/** Snow tongues spilled from the crevasse's ends onto the floor: [along, side]. */
const TONGUES = [[-14, 1], [-15, -1], [13, 1], [12.5, -1]];
const HUMMOCK_TRIES = 12;
/** Snow drifted in at the mouth thins out over this many metres. */
const MOUTH_DRIFT = 18;
/** The bedrock knob under the refuge: its rise over the yard and its reach; the roof over it is ice. */
const BED_RISE = 2.5, BED_RADIUS = 18;

export function generate(b, params) {
  const cs = Math.sin(CREVASSE_YAW), cc = Math.cos(CREVASSE_YAW);
  const across = (along, offset, y = HALL.y) => P(HALL.x + 3 + cc * along - cs * offset, y, HALL.z - 4 + cs * along + cc * offset);
  const alongOf = (x, z) => (x - HALL.x - 3) * cc + (z - HALL.z + 4) * cs;
  const offsetOf = (x, z) => (z - HALL.z + 4) * cc - (x - HALL.x - 3) * cs;
  const slotNear = (x, z) => (Math.abs(alongOf(x, z)) < CREVASSE_REACH + 1 ? clamp01(1 - Math.abs(offsetOf(x, z)) / 5) : 0);
  const inTube = (z) => clamp01((z - TUBE_END_Z) / 3);

  // --- The hall, then the tube and squeeze that open into it.
  for (const [along, offset, rise, rx, ry, rz] of DOMES) {
    const at = across(along, offset);
    b.grid.carve(chamber(P(at.x, HALL.y + rise, at.z), { rx, ry, rz, floorY: HALL.y }), 2);
  }
  const tube = meltTube(STREAM, { ...params.tube, seed: b.seed });
  b.grid.carve(tube, 1);
  // Blending domes into one another also sinks the floor where they meet; the hall floor is put back level.
  b.grid.fill(slab(across(0, 2), { halfLength: 26, halfWidth: 24, thickness: 2, yaw: CREVASSE_YAW }));
  const st = tube.stations;
  for (let index = 0; index < st.length - 1; index += 1) b.nav.addSegment(st[index], st[index + 1], 2 * Math.min(st[index].walk, st[index + 1].walk));
  const stationAt = (s) => Math.max(1, st.findIndex((station) => station.s >= s));
  const beside = (index, u) => {
    const a = st[index - 1], c = st[Math.min(st.length - 1, index + 1)];
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    return P(st[index].x - (c.z - a.z) / length * u, st[index].y, st[index].z + (c.x - a.x) / length * u);
  };

  // The moulin: surface melt drilled down into the gallery's roof, and froze shut a few metres short of the sky.
  const moulin = stationAt(MOULIN_AT), moulinFoot = beside(moulin, MOULIN_SIDE);
  const bend = P(moulinFoot.x + 0.7, moulinFoot.y + 9, moulinFoot.z - 0.5);
  const moulinTop = P(moulinFoot.x + 0.3, moulinFoot.y + MOULIN_RISE, moulinFoot.z - 0.2);
  b.grid.carve(hollow(column(P(moulinFoot.x, moulinFoot.y + st[moulin].top, moulinFoot.z), bend, 2.2, 1.5)), 0.8);
  b.grid.carve(hollow(column(bend, moulinTop, 1.5, 0.9)), 0.8);
  b.grid.fill(mound(moulinFoot, 1.2, 1.1, 1.2), 0.8);
  const gallery = P(st[stationAt(26)].x, st[stationAt(26)].y + 5, st[stationAt(26)].z);
  for (const s of BREAKDOWN_AT) {
    const radius = b.range(1, 1.35), at = beside(stationAt(s), -(st[stationAt(s)].walk + 0.7 + radius));
    b.grid.fill(mound(P(at.x, at.y + radius * 0.25, at.z), radius, radius * 0.75, radius * 1.1), 0.4);
  }

  // The crevasse: a clean break through roof and floor, drift packed into its bottom.
  const lip = (along) => across(along, 0, HALL.y - CREVASSE_DEPTH);
  const slotShape = (overrides) => crevasse(lip(-CREVASSE_REACH), lip(CREVASSE_REACH), { ...SLOT, seed: b.seed, ...overrides });
  b.grid.carve(slotShape({}), 0.8);
  const plugRise = (CREVASSE_DEPTH - PLUG_BELOW) / (SLOT.topY - lip(0).y);
  b.grid.fill(plug(slotShape({ topY: HALL.y - PLUG_BELOW, topWidth: SLOT.bottomWidth * (1 + plugRise) + 0.8, bottomWidth: SLOT.bottomWidth + 0.8 })), 0.5);
  // The middle of the open slot at a height: the crevasse wanders, so it is found rather than assumed.
  const slotCentre = (along, y) => {
    let first = null, last = 0;
    for (let offset = -4; offset <= 4; offset += 0.25) {
      const p = across(along, offset, y);
      if (b.grid.sample(p.x, y, p.z) > 0) { first ??= offset; last = offset; }
    }
    return across(along, first === null ? 0 : (first + last) / 2, y);
  };
  const slotLights = SLOT_LIGHTS.map((along) => slotCentre(along, 24));
  const shaftTops = SHAFTS.map(([along]) => slotCentre(along, 31));
  const wedge = slotCentre(WEDGE_AT, HALL.y + 12), snowBridge = slotCentre(SNOW_BRIDGE_AT, 27);
  b.grid.fill(mound(wedge, 2.8, 1.8, 2.8), 0.5);
  b.grid.fill(slab(snowBridge, { halfLength: 1.6, halfWidth: 4.5, thickness: 1.1, yaw: CREVASSE_YAW }), 0.6);

  // Walked floors, and the ways on to the refuge and the vault.
  for (const [along, offset, halfLength, halfWidth] of HALL_FLOORS) b.nav.addRect(across(along, offset), halfLength, halfWidth, CREVASSE_YAW);
  b.nav.addDisc(across(LANDING[0], LANDING[1]), LANDING[2]);
  const wide = { width: 3.6, height: 3.8, arch: 0.8, smooth: 0.8 };
  b.passage(across(-9, 6), CHOKE, wide);
  b.passage(CHOKE, P(REFUGE.x + 8, REFUGE.y, REFUGE.z + 8), wide);
  b.room(P(REFUGE.x, 6, REFUGE.z), { rx: 16, ry: 11, rz: 16, floorY: REFUGE.y, smooth: 1.2, walkRadius: 11 });
  b.passage(across(2, -9), P(VAULT.x, VAULT.y, VAULT.z + 6), { width: 3, height: 3.8, arch: 0.9, smooth: 0.8 });
  b.room(P(VAULT.x, 3, VAULT.z), { rx: 9, ry: 8, rz: 9, floorY: VAULT.y, smooth: 1, walkRadius: 5.4 });

  // Frozen fall: meltwater from a chimney in the east wall, frozen as it ran; its plunge pool froze clear.
  const chimneyTop = P(FALL.x + 2.4, 20, FALL.z - 0.6);
  b.grid.carve(hollow(column(P(FALL.x + 1.6, 8, FALL.z), chimneyTop, 1.8, 0.9)), 0.8);
  const fall = frozenFall(b, P(FALL.x + 1.2, 13, FALL.z), P(FALL.x - 1.6, HALL.y, FALL.z), { x: 0, z: 1 });
  b.nav.block(FALL, 4.2, 6);
  const pool = across(POOL[0], POOL[1]);
  b.grid.carve(hollow(mound(pool, POOL[2], 0.5, POOL[2])), 0.3);
  const poolNear = (x, z) => clamp01(1.5 - Math.hypot(x - pool.x, z - pool.z) / (POOL[2] + 0.8));

  const feet = [];
  for (const spec of PILLARS) {
    const at = across(spec.at[0], spec.at[1]);
    const roof = pillar(b, at, spec, spec.lean && P(cc * spec.lean[0] - cs * spec.lean[1], 0, cs * spec.lean[0] + cc * spec.lean[1]));
    feet.push([at, spec.base]);
    if (spec.twin) {
      const twin = across(spec.at[0] + spec.twin, spec.at[1]);
      pillar(b, twin, { ...spec, waist: spec.waist * 0.85 });
      feet.push([twin, spec.base]);
    }
    if (spec.web) b.grid.fill(curtain(at, across(spec.web[0], spec.web[1]), { thickness: 1.8, bottom: HALL.y - 1, top: roof + 1 }), 1.2);
    if (spec.drape) {
      b.grid.fill(curtain(at, across(spec.drape[0], spec.drape[1]), { thickness: 1.5, bottom: HALL.y + HANG_CLEAR, top: roof + 1, festoon: 2.5, seed: b.seed }), 0.8);
    }
  }
  const pillarNear = (x, z) => {
    let nearest = 0;
    for (const [at, base] of feet) nearest = Math.max(nearest, clamp01(1 - (Math.hypot(x - at.x, z - at.z) - base) / 3));
    return nearest;
  };
  for (const [along, offset, length, radius] of PENDANTS) {
    const at = across(along, offset);
    const roof = b.probe(at.x, HALL.y + 3, at.z, 1, 40) ?? HALL.y + 20;
    const tip = Math.max(HALL.y + HANG_CLEAR + 2, roof - length);
    b.grid.fill(column(P(at.x, roof + 1.5, at.z), P(at.x + b.range(-0.6, 0.6), tip, at.z + b.range(-0.6, 0.6)), radius, 0.35), 1.2);
  }

  // --- What melt and breakage did to every face. Tube walls keep their scallops; the crevasse and the
  // pillars break in sheer columns, the hall's walls in steps along their layers.
  const hallWall = (x, y, z) => (1 - inTube(z)) * (1 - slotNear(x, z)) * (1 - pillarNear(x, z)) * (1 - poolNear(x, z));
  b.grid.roughen({ amp: 0.55, scale: 0.17, seed: b.seed, octaves: 2, floorAmp: 0.1,
    ampAt: (x, y, z) => (1 - slotNear(x, z)) * (1 - 0.7 * inTube(z)) * (1 - 0.5 * pillarNear(x, z)) * (1 - poolNear(x, z)) });
  b.grid.striate({ ...params.strata, seed: b.seed + 9, ampAt: hallWall });
  const [columnAmp, columnCell, columnTall] = params.fracture.columns;
  b.grid.fracture({ amp: columnAmp, cell: columnCell, stretchY: columnTall, seed: b.seed + 21,
    ampAt: (x, y, z) => Math.max(slotNear(x, z) * (1 - near(P(x, y, z), snowBridge, 5)), pillarNear(x, z) * 0.7) });
  const [layerAmp, layerCell, layerTall] = params.fracture.layers;
  b.grid.fracture({ amp: layerAmp, cell: layerCell, stretchY: layerTall, seed: b.seed + 23,
    ampAt: (x, y, z) => Math.max(hallWall(x, y, z), near(P(x, y, z), gallery, 7)) });
  b.grid.roughen({ amp: 0.16, scale: 0.7, seed: b.seed + 5, octaves: 2, floorAmp: 0.15,
    ampAt: (x, y, z) => (1 - 0.7 * slotNear(x, z)) * (1 - poolNear(x, z)) });

  // --- The bridge, found against the lips the breakage left.
  const lipFrom = (sign) => {
    for (let reach = 0; reach < BRIDGE_HALF - 1; reach += 0.1) {
      const p = across(BRIDGE_AT, sign * reach);
      if (b.grid.sample(p.x, HALL.y - 0.25, p.z) < 0) return reach;
    }
    return BRIDGE_HALF - 1;
  };
  plankBridge(b, across(BRIDGE_AT, BRIDGE_HALF), across(BRIDGE_AT, -BRIDGE_HALF), { lipA: lipFrom(1), lipC: lipFrom(-1) });

  // --- Drift, hummocks and snow, only where nobody walks.
  const free = walkClearance(b.nav, bounds);
  const floorAt = (x, z) => b.grid.sample(x, HALL.y - 0.5, z) < 0 && b.grid.sample(x, HALL.y + 0.6, z) > 0;
  const open = (at, radius) => [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]
    .every(([dx, dz]) => free(at.x + dx, HALL.y, at.z + dz) >= 1 && floorAt(at.x + dx, at.z + dz));
  const banks = [];
  for (const [along, side] of TONGUES) {
    for (let step = 0; step < 3; step += 1) {
      const at = across(along, side * (3.2 + step * 1.5)), radius = 1.5 * (1 - step * 0.22);
      if (!open(at, radius * 0.5)) break;
      b.grid.fill(mound(at, radius, 0.9 * (1 - step * 0.3), radius), 0.8);
      banks.push([at, radius]);
    }
  }
  for (let placed = 0, attempt = 0; placed < params.hummocks && attempt < params.hummocks * HUMMOCK_TRIES; attempt += 1) {
    const at = across(b.range(-18, 18), b.range(-15, 18));
    const rx = b.range(1.6, 3.2), rz = rx * b.range(0.6, 1.2), ry = b.range(0.6, 1.4), radius = Math.max(rx, rz) + 0.6;
    if (Math.abs(offsetOf(at.x, at.z)) < radius + 3 || pillarNear(at.x, at.z) > 0 || poolNear(at.x, at.z) > 0 || !open(at, radius)) continue;
    b.grid.fill(mound(P(at.x, HALL.y - ry * 0.4, at.z), rx, ry, rz), 1);
    placed += 1;
  }
  const snowLie = (x, y, z) => Math.max(clamp01(1 - Math.hypot(x - MOUTH.x, z - MOUTH.z) / MOUTH_DRIFT) * params.snow.mouth,
    slotNear(x, z) * params.snow.crevasse, near(P(x, y, z), moulinFoot, 4) * params.snow.moulin);
  b.grid.deposit({ depth: 1, seed: b.seed + 31, depthAt: (x, y, z) => snowLie(x, y, z) * free(x, y, z) });
  // After the volume's last change, so the icicles hang from the ledges as they finally are.
  fallFringe(b, fall);

  // --- Loose ice, where it fell and off the trail.
  const offTrail = (y) => (x, z) => (b.nav.surfaceAt(x, z, y + 0.6) === null ? b.terrainAt(x, y + 3, z) : null);
  scatter(b, beside(stationAt(BREAKDOWN_AT[0]), -st[stationAt(BREAKDOWN_AT[0])].walk - 1), 2.6, 8, offTrail(gallery.y - 5), { material: 'iceBlock', size: [0.25, 0.7], blocky: 0.85 });
  for (const at of [across(-15, 4), across(14.5, -3.5)]) scatter(b, at, 2.6, 9, offTrail(HALL.y), { material: 'iceBlock', size: [0.3, 1.2], blocky: 0.8 });
  b.prop('clearIce', rod(P(pool.x, HALL.y - 0.14, pool.z), P(pool.x, HALL.y - 0.06, pool.z), POOL[2] - 0.15, POOL[2] - 0.15, 20), 0xffffff);

  // --- Light: few sources, each with a reason; thick ice between them is left to go dark.
  b.prop('glow', box(15, 12, 0.3, P(MOUTH.x, MOUTH.y + 4, MOUTH.z + 4.6)), SKY, 3.2);
  b.light(P(MOUTH.x, MOUTH.y + 3.4, MOUTH.z + 1.5), SKY, ...params.daylight.mouth, { flat: true });
  b.shaft(P(MOUTH.x, MOUTH.y + 5, MOUTH.z + 3), P(0.5, 0.4, 4), 8, SKY, 0.07);
  b.anchor('mouth', P(MOUTH.x, MOUTH.y + 2, MOUTH.z - 4));
  // The crevasse is the hall's key light: daylight down its slot, the sky a white line at its top.
  for (const at of slotLights) b.light(at, SKY, ...params.daylight.crevasse, { flat: true });
  b.prop('glow', box(36, 0.3, 3.6, P(HALL.x + 3, 31.7, HALL.z - 4), -CREVASSE_YAW), SKY, 3.2);
  SHAFTS.forEach(([, along, offset, width, strength], index) => b.shaft(shaftTops[index], across(along, offset), width, SKY, strength));
  // Daylight through ice thinned from below: cyan where it is thin, nothing where it is thick.
  const glow = (at, [strength, reach]) => b.light(P(at.x, at.y + params.glow.ice, at.z), SKY, strength, reach, { flat: true });
  glow(moulinTop, params.glow.moulin);
  b.shaft(moulinTop, P(moulinFoot.x, moulinFoot.y + 1, moulinFoot.z), 1.6, '#bfe6ff', 0.03);
  glow(chimneyTop, params.glow.fall);
  b.light(SQUEEZE_GLOW, SKY, ...params.glow.squeeze, { flat: true });
  glow(P(REFUGE.x + 2, b.probe(REFUGE.x + 2, REFUGE.y + 3, REFUGE.z + 3, 1, 30) ?? REFUGE.y + 17, REFUGE.z + 3), params.glow.refuge);
  // Warm light only where people are: the last lamp before the squeeze, the bridge ends, the windbreak, the camp.
  const pinch = stationAt(PINCH_AT);
  torch(b, beside(pinch, st[pinch].walk + 0.2), { height: 1.4, intensity: 3, range: 11 });
  cairnLamp(b, across(BRIDGE_AT + 1.4, 5), { height: 1.05, intensity: 3.4, range: 12 });
  cairnLamp(b, across(BRIDGE_AT - 1.4, -5), { height: 1.05, intensity: 3, range: 12 });

  // Windbreak at the choke: a palisade of sharpened logs with a gap for one.
  for (let index = -3; index <= 3; index += 1) {
    if (index === 0 || index === 1) continue;
    const at = P(CHOKE.x - index * 0.3, CHOKE.y, CHOKE.z + index * 0.42);
    b.prop('timber', rod(at, P(at.x, at.y + b.range(2.3, 2.9), at.z), 0.2, 0.05, 7), LOG);
  }
  b.prop('timber', beam(P(CHOKE.x + 0.9, CHOKE.y + 1.5, CHOKE.z - 1.26), P(CHOKE.x - 0.9, CHOKE.y + 1.5, CHOKE.z + 1.26), 0.14), DARK);
  torch(b, P(CHOKE.x + 1.4, CHOKE.y, CHOKE.z + 1.1), { height: 1.6, intensity: 3, range: 12 });

  refugeCamp(b, REFUGE, params.longhall);
  sealedVault(b, VAULT);

  buildOrganPipeIceFormation(b, across(-13.5, 5.8), 1.05);
  buildHoarfrostRoseCluster(b, across(13.2, -5.8), 1.0);
  buildFrozenMeltMushroomColumn(b, across(-11.2, -6.2), 0.95);
  buildBoneMooringAnchor(b, across(3.8, 5.2), 0.5);
  buildRunicIceLanternShrine(b, P(REFUGE.x - 7.5, REFUGE.y, REFUGE.z + 4.5), 0.3);

  // Icicles wherever the roof hangs low enough to drip; over the refuge's warmth they do.
  for (let index = 0; index < params.icicles; index += 1) {
    const x = b.range(bounds.min.x + 6, bounds.max.x - 6), z = b.range(bounds.min.z + 6, bounds.max.z - 8);
    const floor = b.nav.surfaceAt(x, z, 40) ?? HALL.y;
    icicleCluster(b, P(x, floor + 1.9, z), { count: 4, length: [0.6, 2.8], reach: 17, drip: Math.hypot(x - REFUGE.x, z - REFUGE.z) < 13 });
  }

  // --- What each face is made of, for the ice shader and for light crossing it.
  const channel = [...STREAM.slice(2), across(-3, 2.5)], squeeze = STREAM.slice(6, 10);
  const trails = [STREAM, [across(LANDING[0], LANDING[1]), across(BRIDGE_AT, -BRIDGE_HALF), across(2, -9), P(VAULT.x, VAULT.y, VAULT.z + 6)],
    [across(1, 7), across(-9, 6), CHOKE, P(REFUGE.x + 8, REFUGE.y, REFUGE.z + 8)]];
  b.classify = (p, n, mask, mask2) => {
    const grain = fbm3(p.x * 0.11, p.y * 0.11, p.z * 0.11, b.seed + 3, 3);
    const up = clamp01((n.y - 0.25) / 0.45);
    // Bedrock: the knob the refuge stands on, a few metres high under an ice roof; the hall's low west
    // floor shows moraine, because the glacier carries its debris on the valley side.
    const bed = p.y < REFUGE.y + BED_RISE + (grain - 0.5) * 4 ? clamp01((1 - Math.hypot(p.x - REFUGE.x, p.z - REFUGE.z) / BED_RADIUS) * 2) : 0;
    const low = clamp01(1 - (p.y - HALL.y) / 4.5) * (1 - inTube(p.z));
    const west = clamp01((HALL.x + 8 - p.x) / 22);
    const rock = Math.min(1, Math.max(bed, Math.max(0, grain - 0.55) * 3 * low * west * (n.y > 0.5 ? 1 : 0.4)));
    const slot = slotNear(p.x, p.z);
    let snow = snowLie(p.x, p.y, p.z) * 1.2;
    for (const [at, radius] of banks) snow = Math.max(snow, near(p, at, radius * 1.6));
    snow = clamp01(snow) * up;
    mask[0] = rock;
    mask[1] = snow;
    mask[2] = clamp01(Math.max(near(p, MOUTH, 30), slot * clamp01((p.y - 12) / 10)) * 0.9 + Math.max(0, grain - 0.6) * 1.2);
    // Fresh breaks: the crevasse's walls, the block wedged in it, the gallery's spalled roof, the vault.
    mask[3] = clamp01(Math.max(slot * 0.7, near(p, wedge, 4.5), near(p, gallery, 7) * 0.6, near(p, VAULT, 13), pillarNear(p.x, p.z) * 0.25));
    // Dirty basal ice low down, cleaner eastward; bubbly ice high up, where firn became ice, and at the fall.
    mask2[0] = clamp01(low * (0.35 + grain) * (0.4 + west) + rock * 0.5);
    mask2[1] = clamp01(Math.max((p.y - 12) / 16, near(p, FALL, 8) * 1.4, near(p, MOUTH, 16) * 0.5, near(p, snowBridge, 5)));
    // The stream froze where it ran: a polished bed down the tube, a squeeze smoothed all round, the fall and its pool.
    const bedStream = clamp01(1 - planDistance(p, channel) / 1.5) * up * (1 - snow);
    mask2[2] = clamp01(bedStream + clamp01(1 - planDistance(p, squeeze) / 2.6) * 0.85 + near(p, FALL, 6) * 0.6 + poolNear(p.x, p.z));
    mask2[3] = onTrail(p, trails, 1.3) * up;
    return 1 - rock;
  };

  b.spawn('entry', P(0, 4.2, 17), 0);
  b.exit('mouth', P(MOUTH.x, MOUTH.y, MOUTH.z + 0.5), { radius: 3.4, label: 'Climb out onto the glacier' });
}
