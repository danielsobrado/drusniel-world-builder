import { boulder } from '../gen/iceKit.js';
import { cellNoise3, fbm3 } from '../gen/noise.js';
import { onTrail, planDistance } from '../gen/plan.js';
import { panel, rod } from '../gen/propKit.js';
import { chamber, tunnel } from '../gen/shapes.js';
import { DARK, torch } from './frostgardKit.js';
import { dryingRack, sled, woodpile } from './frostgardDressing.js';
import { hangCornice, openRidge, raiseRidge, ridgeLayout, splitLip } from './glacierFrontIce.js';
import { driftAround, leeBank, scourAt } from './glacierFrontSnow.js';
import { frozenFall, icicleCluster, icicleCurtain, scatter } from './glacierKit.js';

/**
 * The front of a Frostgard glacier, under the sky.
 *
 * A valley glacier ends between two rock walls in a cliff of ice. Flow has
 * split its lip into seracs and, where it is dragged over the edge, let it slump
 * in steps; meltwater has undercut its foot and opened a cave in it; a wall of
 * older ice the front left behind still stands across the forefield, holed
 * through by an arch the meltwater stream bored. Between that wall and the cliff
 * lies the frozen melt pool, and beyond the forefield the moraine the glacier
 * pushed up when it was longer. The way in runs moraine → arch → pool → cave.
 */

export const open = true;
export const bounds = { min: { x: -76, y: -8, z: -116 }, max: { x: 76, y: 66, z: 46 } };

const P = (x, y, z) => ({ x, y, z });
const clamp01 = (value) => Math.min(1, Math.max(0, value));
/** Clear headroom the walker's path is probed from, above the rough ground height. */
const HEADROOM = 2.2;
/** Half the width of the trodden line through the snow, metres. */
const TRAIL_HALF_WIDTH = 1.5;
/** Height above the ground at which a calving face starts to lean out over its undercut foot. */
const CALVING_FOOT = 6;
/** The fracture passes leave the lowest metres alone, so the ground the walker crosses keeps its shape. */
const FRACTURE_CLEARANCE = 1.2;
/** Surfaces higher than this above the forefield are tops and ledges, not the open ground. */
const OPEN_GROUND = 1.5;
/** Radius of each heap of boulders along the lateral moraines, metres. */
const LATERAL_SCATTER = 4;

/** `fn(a, c)` sampled once per voxel over `[a0, a1] × [c0, c1]` and read back bilinearly: the carve and every pass after it ask millions of times. */
function cached(fn, [a0, a1], [c0, c1], step) {
  const na = Math.ceil((a1 - a0) / step) + 2, nc = Math.ceil((c1 - c0) / step) + 2;
  const table = new Float32Array(na * nc);
  for (let k = 0; k < nc; k += 1) for (let i = 0; i < na; i += 1) table[i + k * na] = fn(a0 + i * step, c0 + k * step);
  return (a, c) => {
    const ga = Math.min(na - 1.001, Math.max(0, (a - a0) / step)), gc = Math.min(nc - 1.001, Math.max(0, (c - c0) / step));
    const i = ga | 0, k = gc | 0, fa = ga - i, at = i + k * na;
    const near = table[at] + (table[at + 1] - table[at]) * fa;
    return near + (table[at + na] + (table[at + na + 1] - table[at + na]) * fa - near) * (gc - k);
  };
}

export function generate(b, params) {
  const seed = b.seed, voxel = b.grid.voxel;
  const { front, seracs, wall, moraine, pool, arch, channel, snow } = params;
  const spanX = [bounds.min.x, bounds.max.x], spanY = [bounds.min.y, bounds.max.y], spanZ = [bounds.min.z, bounds.max.z];
  const wave = (x, z, scale, salt, octaves = 3) => fbm3(x * scale, 0.5, z * scale, seed + salt, octaves) - 0.5;

  // --- The valley: forefield, rock walls, the glacier ----------------------
  const basin = (x, z) => clamp01(1.6 - Math.hypot((x - pool.x) / pool.rx, (z - pool.z) / pool.rz) * 1.6);
  const stream = channel.path.map(([x, z]) => P(x, 0, z));
  // 1 in the bed of the frozen melt channel, easing to 0 up its banks.
  const bed = cached((x, z) => {
    const t = clamp01((channel.halfWidth + channel.bank - planDistance(P(x, 0, z), stream)) / channel.bank);
    return t * t * (3 - 2 * t);
  }, spanX, spanZ, voxel);
  const lateral = moraine.lateral;
  const ground = cached((x, z) => {
    const rolling = 0.6 + wave(x, z, 0.04, 1) * 3 + wave(x, z, 0.13, 2, 2) * 0.8
      + moraine.height * Math.exp(-(((z - moraine.z) / moraine.width) ** 2))
      // As the ice margin shrank back it left a sharp-crested ridge of debris along each wall foot.
      + lateral.height * Math.max(0, 1 - Math.abs(Math.abs(x) - lateral.x) / lateral.width);
    const cut = rolling - channel.depth * bed(x, z);
    return cut + (pool.y - cut) * basin(x, z);
  }, spanX, spanZ, voxel);
  // Jointed rock: bedding planes dip gently down-valley, and every `ledge` metres up the face steps back onto a bench.
  const wallX = cached((y, z) => {
    const bedding = y + z * wall.dip + wave(z, y, 0.03, 13) * wall.warp;
    return wall.x + wave(z, y * 0.25, 0.05, 3) * 9 + y * wall.lean + Math.floor(Math.max(0, bedding) / wall.ledge) * wall.bench;
  }, spanY, spanZ, voxel);
  // The face stands in facets between the crevasses: buttresses forward, re-entrants back, each one a plane.
  const facet = (x) => cellNoise3(x / front.facet, 0.5, 0.5, seed + 4);
  const calving = (x) => clamp01((x - front.calving[0]) / 5) * clamp01((front.calving[1] - x) / 5);
  const faceZ = cached((x, y) => front.z - (x / 60) ** 2 * front.bow + (facet(x) - 0.5) * front.setback - y * front.lean
    + calving(x) * Math.max(0, y - CALVING_FOOT) * front.overhang
    + (fbm3(x * 0.04, y * 0.04, 0.5, seed + 5, 2) - 0.5) * 6, spanX, spanY, voxel);
  const lipZ = (x) => front.z - (x / 60) ** 2 * front.bow - front.height * front.lean;
  // Where flow drags the lip over the edge it slumps toward the face in treads; elsewhere it stands to full height.
  const slump = (x, z) => (x < seracs.zone[0] || x > seracs.zone[1] ? 0
    : Math.max(0, seracs.steps - Math.floor(Math.max(0, lipZ(x) - z) / seracs.tread)) * seracs.rise);
  const top = cached((x, z) => front.height + (front.z - z) * 0.08 + wave(x, z, 0.06, 6) * 4 - (x / 70) ** 2 * 6 - slump(x, z),
    spanX, spanZ, voxel);
  b.grid.carve({
    box: bounds,
    air: (x, y, z) => Math.min(y - ground(x, z), wallX(y, z) - Math.abs(x), Math.max(z - faceZ(x, y), y - top(x, z))),
  });

  const ridge = ridgeLayout(params, seed);
  raiseRidge(b, ridge, params);
  const nearRidge = (x, z) => x > params.ridge.west - 16 && x < params.ridge.east + 16 && Math.abs(z - arch.z) < 14;
  const clear = (x, y, z) => y - ground(x, z) > FRACTURE_CLEARANCE;
  // Serac-scale blocks on the cliff and the joints of the rock walls. The old wall is too thin for blocks this size.
  const [blockCell, blockAmp, blockStretch] = params.fracture.blocks;
  b.grid.fracture({ amp: blockAmp, cell: blockCell, stretchY: blockStretch, seed: seed + 21,
    ampAt: (x, y, z) => (!clear(x, y, z) ? 0 : Math.abs(x) > wall.x - 14 ? 0.8 : z < lipZ(x) + 12 ? 1 : 0) });

  const bergs = splitLip(b, { faceZ, top, ground }, params);
  const { floor: archFloor, fallen, end: brokenEnd } = openRidge(b, ridge, ground, params);

  // Meltwater undercut the foot of the calving face, and bored the cave east of it.
  const [calveFrom, calveTo] = front.calving;
  const notch = [0, 1, 2, 3].map((index) => {
    const x = calveFrom - 2 + index * (calveTo - calveFrom + 5) / 3;
    return P(x, ground(x, faceZ(x, 2)), faceZ(x, 2) + 1);
  });
  for (let index = 0; index < notch.length - 1; index += 1) {
    b.grid.carve(tunnel(notch[index], notch[index + 1], { halfWidth: 5.5, height: 5, arch: 0.75 }), 2);
  }
  const caveZ = faceZ(front.caveX, 3), caveFloor = ground(front.caveX, caveZ);
  const cave = [P(front.caveX, caveFloor - 0.1, caveZ + 5), P(front.caveX + 1.5, caveFloor - 0.5, caveZ - 8),
    P(front.caveX - 1, caveFloor - 1.2, caveZ - 20), P(front.caveX - 4.5, caveFloor - 1.6, caveZ - 30)];
  b.grid.carve(chamber(P(front.caveX, caveFloor + 3, caveZ - 1), { rx: 7.5, ry: 6.5, rz: 7, floorY: caveFloor - 0.2 }), 2);
  b.tube(cave, { width: 6, height: 5.5, arch: 0.9, smooth: 1.2, pinch: 0.25 });

  // The fracture planes on every block; the arch's underside fails along the old ice's layers, in flat slabs.
  const [planeCell, planeAmp, planeStretch] = params.fracture.planes;
  b.grid.fracture({ amp: planeAmp, cell: planeCell, stretchY: planeStretch, seed: seed + 22,
    ampAt: (x, y, z) => (!clear(x, y, z) ? 0 : nearRidge(x, z) ? params.ridge.fracture : 1) });
  const [layerCell, layerAmp, layerStretch] = params.fracture.soffit;
  b.grid.fracture({ amp: layerAmp, cell: layerCell, stretchY: layerStretch, seed: seed + 23,
    ampAt: (x, y, z) => (Math.abs(x - arch.x) < arch.width && Math.abs(z - arch.z) < arch.depth && y > archFloor + 3 ? 1 : 0) });
  b.grid.roughen({ amp: 0.6, scale: 0.16, seed, octaves: 2, floorAmp: 0.1, ampAt: (x, y, z) => (Math.abs(x) > wallX(y, z) - 4 ? wall.crag : 0) });
  b.grid.striate({ ...params.strata, seed: seed + 9, ampAt: (x, y, z) => (z < faceZ(x, y) + 4 || nearRidge(x, z) ? 1 : 0) });

  // A frozen fall down the east wall, draped over its ledges.
  const fallZ = -14;
  const fallFoot = P(wallX(1, fallZ) - 2.5, ground(wallX(1, fallZ) - 2.5, fallZ), fallZ);
  frozenFall(b, P(wallX(34, fallZ) - 0.5, 34, fallZ), fallFoot, { x: 0, z: 1 }, { width: 8, columns: 11 });

  // Snow the wind has shaped: tails behind everything that stands in it, moats before it, a bank under the wall's lee.
  const wind = { x: snow.wind[0], z: snow.wind[1] };
  const erratics = params.erratics.map(([x, z, size]) => ({ x, z, size }));
  const obstacles = [...bergs, ...fallen, ...erratics];
  for (const { x, z, size } of obstacles) driftAround(b, ground, P(x, 0, z), size, { wind, tail: snow.tail, scour: snow.scour });
  leeBank(b, ground, ridge, params);
  hangCornice(b, ridge, params);
  b.grid.roughen({ amp: 0.22, scale: 0.5, seed: seed + 5, octaves: 2, floorAmp: 0.12 });

  const scour = scourAt(obstacles, wind);
  const crestScour = (x, z) => Math.max(Math.exp(-(((z - moraine.z) / 3) ** 2)), Math.max(0, 1 - Math.abs(Math.abs(x) - lateral.x) / 2));
  const sheltered = (x, y, z) => (Math.abs(x - arch.x) < arch.width && Math.abs(z - arch.z) < arch.depth && y < archFloor + arch.height + 1)
    || (z < faceZ(x, CALVING_FOOT) + 3 && y < ground(x, z) + CALVING_FOOT + 3);
  b.grid.deposit({ depth: snow.depth, seed: seed + 31, depthAt: (x, y, z) => {
    if (sheltered(x, y, z)) return 0;
    if (y - ground(x, z) > OPEN_GROUND) return 1;
    // The open forefield keeps a thin cover: none on the ice the wind polishes, little on the crests it scours.
    return snow.field / snow.depth * (1 - Math.max(basin(x, z), bed(x, z), scour(x, z))) * (1 - 0.8 * crestScour(x, z));
  } });

  // --- Where it can be walked ---------------------------------------------
  const footing = (x, z) => b.terrainAt(x, ground(x, z) + HEADROOM, z);
  const stand = (x, z) => P(x, footing(x, z) ?? ground(x, z), z);
  b.nav.addSurface((x, z) => footing(x, z) ?? NaN, (x, z) => z < moraine.z - 6 && Math.abs(x) < wall.x - 6);

  // The line the Norths walk and sledge: in by the stakes to the cave, and off east to the hold.
  const trails = [
    [P(0, 0, moraine.z - 8), ...params.stakes.map(([x, z]) => P(x - 1.6, 0, z)), cave[0], cave[1], cave[3]],
    [P(params.stakes[0][0] - 1.6, 0, params.stakes[0][1]), P(wall.x - 24, 0, 15), P(wall.x - 11, 0, 16)],
  ];

  // --- What the surface is made of ------------------------------------------
  const near = (p, q, radius) => Math.max(0, 1 - Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / radius);
  const archAt = P(arch.x, archFloor + 4, arch.z), mouthAt = P(front.caveX, caveFloor + 3, caveZ);
  const breakAt = P(brokenEnd.x, archFloor + params.ridge.height / 2, brokenEnd.z);
  b.classify = (p, n, mask, mask2) => {
    const grain = fbm3(p.x * 0.09, p.y * 0.09, p.z * 0.09, seed + 11, 3);
    const up = clamp01((n.y - 0.25) / 0.45);
    const height = p.y - ground(p.x, p.z), low = height < 1.2 ? 1 : 0;
    const margin = Math.abs(p.x) - wallX(p.y, p.z);
    const frozen = near(p, P(fallFoot.x + 2, p.y, fallFoot.z), 7);
    const lake = Math.max(basin(p.x, p.z), bed(p.x, p.z)) * up * low;
    const cliff = p.z < faceZ(p.x, p.y) + 2.5;
    // Whatever stands clear of the valley floor short of the rock is ice: the old wall, seracs, calved blocks.
    const glacier = cliff || (height > 0.6 && margin < -3);
    // Rock is the valley walls and the till under the forefield; along the margin, ice and rock interleave.
    const rock = glacier ? clamp01((margin + 4 + (grain - 0.5) * 9) / 3) : clamp01(1 - frozen * 2 - lake * 2);
    mask[0] = rock;
    // Negative snow: the wind scours the pool, the frozen channel, the moats before obstacles and the moraine crests.
    mask[1] = -Math.max(lake * (1.25 - grain), scour(p.x, p.z) * low, crestScour(p.x, p.z) * 0.7 * low);
    mask[2] = clamp01((p.y - front.height + 8) / 10) * 0.5;
    // Fresh breaks: the calving face, the wall's broken east end and whatever has just fallen at the cliff's foot.
    const fallenIce = !cliff && glacier && p.z < faceZ(p.x, 2) + 16 ? 0.7 : 0;
    const fresh = Math.max(calving(p.x) * (cliff ? 1 : 0), near(p, breakAt, 14), fallenIce) * clamp01(1 - Math.abs(n.y) / 0.6);
    mask[3] = clamp01(near(p, archAt, 13) * 0.8 + near(p, mouthAt, 15) * 0.7 + lake * 0.7 + fresh
      + (glacier ? Math.max(0, grain - 0.5) * 2.5 : 0));
    // Basal ice carries what the glacier scraped up, folded into bands through its lowest metres;
    // the high ice is young, white and full of air.
    const band = cliff ? clamp01((Math.sin((p.y + p.x * 0.06 + grain * 5) * 1.3) - 0.85) * 6) * clamp01(1 - height / 18) : 0;
    mask2[0] = glacier ? clamp01(Math.max(0, 1 - height / 7) * (0.4 + grain) + clamp01((margin + 9) / 6) * 0.7 + band * 0.8) : 0;
    mask2[1] = clamp01(Math.max(0, (p.y - 24) / 14) + frozen + lake * 0.45);
    mask2[2] = clamp01(lake + near(p, mouthAt, 9) * 0.6 + frozen * 0.5);
    mask2[3] = onTrail(p, trails, TRAIL_HALF_WIDTH) * up;
    return 1 - rock;
  };

  // --- Dressing -------------------------------------------------------------
  for (const berg of bergs) {
    scatter(b, P(berg.x, 0, berg.z + 2), berg.size * 3, 14, footing, { material: 'iceBlock', size: [0.3, 1.6], blocky: 0.8 });
  }
  scatter(b, P(brokenEnd.x + 6, 0, brokenEnd.z + 4), 9, 16, footing, { material: 'iceBlock', size: [0.3, 1.3], blocky: 0.85 });
  // Boulders the ice let fall: on the end moraine, along the lateral moraines, a few out on the forefield.
  for (const x of [-34, -8, 22, 44]) scatter(b, P(x, 0, moraine.z - 5), 9, 9, footing, { material: 'rock', size: [0.4, 2.4] });
  for (const side of [-1, 1]) {
    for (let z = front.z + 14; z < moraine.z - 6; z += 12) {
      const x = side * lateral.x;
      // The Norths cleared their line over the moraine.
      if (trails.some((trail) => planDistance(P(x, 0, z), trail) < LATERAL_SCATTER + 2)) continue;
      scatter(b, P(x, 0, z), LATERAL_SCATTER, 4, footing, { material: 'rock', size: [0.4, 1.8] });
    }
  }
  scatter(b, P(0, 0, 12), 30, 10, footing, { material: 'rock', size: [0.3, 1.2] });
  // Erratics: boulders carried down on the ice and set down where it melted, each with its drift and its moat.
  for (const { x, z, size } of erratics) {
    const at = P(x, ground(x, z), z);
    b.prop('rock', boulder(P(x, at.y - size * 0.3, z), size, size * 0.75, size * 0.9,
      { seed: Math.floor(b.range(1, 9999)), blocky: 0.45, yaw: b.range(0, Math.PI) }));
    b.nav.block(at, size * 0.95, size * 1.5);
  }

  // Icicles under every overhang: the undercut, the arch, the cave mouth, the cornice over the arch.
  const hang = (minX, maxX, minZ, maxZ, attempts, options) => {
    for (let index = 0; index < attempts; index += 1) {
      const x = b.range(minX, maxX), z = b.range(minZ, maxZ);
      icicleCluster(b, P(x, ground(x, z) + 1.6, z), options);
    }
  };
  hang(calveFrom - 4, calveTo + 5, front.z - 22, front.z + 6, params.icicles, { length: [0.8, 3.4], reach: 9 });
  hang(arch.x - 5, arch.x + 5, arch.z - 5, arch.z + 5, params.icicles / 4, { length: [0.6, 2.2], reach: 12 });
  hang(front.caveX - 8, front.caveX + 8, caveZ - 12, caveZ + 4, params.icicles / 2, { length: [0.8, 3], reach: 9 });
  const eave = arch.z + arch.depth / 2 + 0.6, eaveY = arch.crown - 3;
  icicleCurtain(b, P(arch.x - arch.pier + 1, eaveY, eave), P(arch.x + arch.pier - 1, eaveY, eave), { spacing: 1.1, length: [0.6, 2.4] });

  // Sun through the wall's two openings, standing in the cold air of the hollow behind it.
  const [windowX, windowY] = params.ridge.window;
  b.sunShaft(P(windowX, windowY, ridge.z(windowX)), 3.4, params.shafts);
  b.sunShaft(P(arch.x, archFloor + arch.height * 0.6, arch.z), arch.width * 0.6, params.shafts * 0.7);

  // Snow sifting off the lip, and the stakes the Norths set to mark the safe line to the cave.
  for (let x = -40; x <= 40; x += 16) b.emit('sift', P(x, top(x, faceZ(x, 36)) + 0.5, faceZ(x, 36) + 1));
  b.anchor('lip', P(0, front.height, front.z));
  for (const [x, z] of params.stakes) {
    const foot = stand(x, z);
    b.prop('timber', rod(P(foot.x, foot.y - 0.3, foot.z), P(foot.x + 0.06, foot.y + 2.3, foot.z), 0.06, 0.045, 6), DARK);
    b.prop('cloth', panel(P(foot.x + 0.06, foot.y + 2.05, foot.z), P(foot.x + 0.75, foot.y + 1.95, foot.z + 0.2), P(0, 1, 0), 0.34, 0.02), 0xd6402e);
    b.nav.block(foot, 0.3, 2.3);
  }
  torch(b, stand(cave[1].x + 2.2, cave[1].z + 3), { intensity: 4, range: 13 });
  // A Norths waystation before the arch: the sled pointed at the way through, wood stacked, hides on the rack.
  const way = params.waystation;
  sled(b, stand(way.x, way.z), Math.atan2(arch.x - way.x, arch.z - way.z));
  woodpile(b, stand(way.x + 3.2, way.z - 1.5), { length: 1.4, rows: 3, count: 5 });
  dryingRack(b, stand(way.x + 1.5, way.z + 3.5), { width: 3.4, hides: true });
  for (const [x, z] of way.torches) torch(b, stand(x, z), { intensity: 3, range: 11 });

  const entry = stand(0, moraine.z - 13);
  b.spawn('entry', entry, 0);
  b.spawn('cave', P(cave[1].x, cave[1].y, cave[1].z), Math.PI);
  b.spawn('hold', stand(wall.x - 16, 16), Math.PI / 2);
  b.exit('surface', stand(0, moraine.z - 8), { radius: 2.6, label: 'Leave the glacier' });
  b.exit('cave', cave[3], { radius: 3, label: 'Go down into the ice cave' });
  b.exit('hold', stand(wall.x - 11, 16), { radius: 3, label: 'Follow the stakes to the hold' });
}
