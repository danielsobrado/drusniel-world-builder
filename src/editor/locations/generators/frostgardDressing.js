import { collarRing, drapedHideMesh, hewnPole } from '../gen/clothKit.js';
import { roofSnowBlanket, snowPillow } from '../gen/iceKit.js';
import { block, box, hewnBeam, panel, rod, stoneBlock } from '../gen/propKit.js';
import { DARK, HEARTH, LOG, PALE, STONE, eaveIcicles, logWall } from './frostgardKit.js';
import { barrel, crate, lantern } from './kits.js';

/** What a Norths household leaves about a yard, and what stands inside its hall. */

const P = (x, y, z) => ({ x, y, z });
const FUR = [0x948777, 0x67584a, 0xb8ad9a];
const IRON = 0x3b404a;
/** Timber kept indoors: dry and smoke-greyed, paler than what stands in the weather. */
const HALL_LOG = 0xa3947e, HALL_BEAM = 0x65574a;
/** Metres between the frames that carry a hall's roof. */
const BAY = 4;

const WOOD_TONES = [0x765c41, 0x8d7150, 0x674f38, 0x977a58];

/** A stacked woodpile along X, `rows` high, with weathered varied logs, end stakes, and a sculpted snow pillow. */
export function woodpile(b, at, { length = 1.2, rows = 3, count = 5 } = {}) {
  const zSpan = (count - 1) * 0.36;
  const zMid = at.z + zSpan * 0.5;
  for (let row = 0; row < rows; row += 1) {
    for (let index = 0; index < count - row; index += 1) {
      const r0 = b.range(0.135, 0.185), r1 = b.range(0.13, 0.185);
      const y = at.y + 0.16 + row * 0.29 + b.range(-0.02, 0.02);
      const z = at.z + index * 0.36 + row * 0.18 + b.range(-0.025, 0.025);
      const half = length * b.range(0.42, 0.55);
      const shift = b.range(-0.08, 0.08);
      const tone = WOOD_TONES[Math.floor(b.range(0, WOOD_TONES.length))];
      b.prop('timber', rod(P(at.x - half + shift, y, z), P(at.x + half + shift, y + b.range(-0.02, 0.02), z + b.range(-0.03, 0.03)), r0, r1, 8), tone);
    }
  }
  // Driven spruce end-stakes bracing the stacked logs.
  for (const dz of [-0.14, zSpan + 0.14]) {
    for (const sx of [-1, 1]) {
      const sxPos = at.x + sx * (length * 0.36);
      b.prop('timber', hewnPole(
        P(sxPos, at.y - 0.18, at.z + dz),
        P(sxPos + sx * 0.04, at.y + rows * 0.32 + 0.22, at.z + dz + (dz < 0 ? -0.05 : 0.05)),
        0.048, 0.036, { seed: Math.round((at.x + dz) * 19 + sx * 7), segments: 4, sides: 7, bow: 0.03 },
      ), DARK);
    }
  }
  // Thin contoured snow cap nestled across the top logs (seated naturally in the terrain snowpack).
  b.prop('roof', snowPillow(P(at.x, at.y + 0.14 + rows * 0.27, zMid), length * 0.48, 0.14, Math.max(0.36, zSpan * 0.34),
    { seed: Math.round(at.x * 13 + at.z * 7) + 3, drape: 0.42, detail: 3 }), 0xffffff);
  b.nav.block(P(at.x, at.y, zMid), Math.max(length, count * 0.36) * 0.6, 2);
}

/** A hand-crafted Norths supply sled: steam-bent iron-shod runners, slatted deck, and lashed canvas cargo. */
export function sled(b, at, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (dx, dy, dz) => P(at.x + c * dx + s * dz, at.y + dy, at.z - s * dx + c * dz);
  // 7-segment curved steam-bent runner profile with graceful upturned prow.
  const runnerPts = [
    [-1.24, 0.12], [-0.88, 0.09], [-0.2, 0.09], [0.55, 0.095],
    [1.02, 0.14], [1.34, 0.28], [1.56, 0.48], [1.66, 0.66],
  ];
  for (const dx of [-0.44, 0.44]) {
    for (let i = 0; i < runnerPts.length - 1; i += 1) {
      const [z0, y0] = runnerPts[i];
      const [z1, y1] = runnerPts[i + 1];
      b.prop('timber', hewnBeam(L(dx, y0, z0), L(dx, y1, z1), 0.075, 0.095, { irregular: 0.22 }), DARK);
      // Forged iron wear shoe bolted along the underside of each runner.
      b.prop('iron', hewnBeam(L(dx, y0 - 0.048, z0), L(dx, y1 - 0.048, z1), 0.068, 0.022, { irregular: 0.08 }), IRON);
    }
    // Mortised stanchions + rawhide lashing collars rising to the deck rails.
    for (const dz of [-0.88, -0.28, 0.32, 0.86]) {
      b.prop('timber', hewnPole(L(dx, 0.12, dz), L(dx, 0.44, dz), 0.04, 0.035,
        { seed: Math.round(dz * 31 + dx * 17), segments: 3, sides: 7, bow: 0.015 }), PALE);
      b.prop('iron', collarRing(L(dx, 0.41, dz), P(0, 1, 0), 0.048, 0.036, 8), IRON);
    }
    // Side deck rail & rear push-handle upright.
    b.prop('timber', hewnBeam(L(dx, 0.44, -1.16), L(dx, 0.44, 1.05), 0.065, 0.06, { irregular: 0.25 }), DARK);
    b.prop('timber', hewnPole(L(dx, 0.44, -1.12), L(dx, 0.92, -1.36), 0.036, 0.03,
      { seed: Math.round(dx * 53), segments: 4, sides: 7, bow: 0.025 }), DARK);
  }
  // Curved front prow cross-bar & rear steering bar.
  b.prop('timber', hewnBeam(L(-0.46, 0.62, 1.62), L(0.46, 0.62, 1.62), 0.055, 0.055, { irregular: 0.2 }), PALE);
  b.prop('timber', hewnBeam(L(-0.46, 0.9, -1.35), L(0.46, 0.9, -1.35), 0.05, 0.05, { irregular: 0.2 }), PALE);
  // Slatted plank deck (individual weathered boards instead of a flat slab).
  for (let i = 0; i < 6; i += 1) {
    const dz = -0.98 + i * 0.38;
    b.prop('timber', hewnBeam(L(-0.48, 0.46, dz), L(0.48, 0.46, dz), 0.26, 0.048, { irregular: 0.3 }),
      WOOD_TONES[i % WOOD_TONES.length]);
  }
  // Rounded canvas-tarped supply bundle lashed down with criss-cross ropes + iron-banded crate.
  b.prop('cloth', snowPillow(L(0, 0.5, -0.44), 0.44, 0.42, 0.56,
    { seed: Math.round(at.x * 11 + at.z * 7) + 5, yaw, drape: 0.14, detail: 3 }), 0xb5a689);
  for (const dz of [-0.68, -0.22]) {
    b.prop('timber', hewnBeam(L(-0.44, 0.47, dz), L(0, 0.88, dz), 0.026, 0.026, { irregular: 0.1 }), PALE);
    b.prop('timber', hewnBeam(L(0, 0.88, dz), L(0.44, 0.47, dz), 0.026, 0.026, { irregular: 0.1 }), PALE);
  }
  crate(b, L(0, 0.48, 0.48), 0.58, yaw);
  b.nav.block(at, 1.3, 2);
}

/**
 * A hand-crafted Norths drying rack: crooked forked spruce posts, diagonal wind
 * braces, shingled lean-to roof topped with sculpted drifted snow pillows and
 * eave icicles, and contoured draped fur pelts or split fish on lashing rails.
 */
export function dryingRack(b, at, { width = 3.4, hides = false } = {}) {
  const L = (dx, dy, dz) => P(at.x + dx, at.y + dy, at.z + dz);
  const baseSeed = Math.round(at.x * 19 + at.z * 23) + 7;
  const backY = 2.48;
  const frontY = 1.98;
  const halfW = width * 0.5;
  const postsX = [-halfW, 0, halfW];

  // Crooked hand-barked posts with snow grounding skirts & forged/rawhide joint collars.
  for (let i = 0; i < postsX.length; i += 1) {
    const dx = postsX[i];
    const s = baseSeed + i * 17;
    b.prop('timber', hewnPole(L(dx, -0.26, -0.54), L(dx + (i - 1) * 0.03, backY, -0.52), 0.078, 0.062,
      { seed: s, segments: 5, sides: 8, bow: 0.045 }), DARK);
    b.prop('timber', hewnPole(L(dx, -0.26, 0.54), L(dx - (i - 1) * 0.02, frontY, 0.52), 0.076, 0.06,
      { seed: s + 5, segments: 5, sides: 8, bow: 0.04 }), DARK);
    // Side tie-beam connecting front & back post + diagonal wind knee brace.
    b.prop('timber', hewnBeam(L(dx, 1.72, -0.52), L(dx, 1.72, 0.52), 0.075, 0.08, { irregular: 0.3 }), LOG);
    b.prop('timber', hewnBeam(L(dx, 1.18, -0.52), L(dx, 1.74, -0.05), 0.06, 0.06, { irregular: 0.25 }), DARK);
    b.prop('iron', collarRing(L(dx, backY - 0.1, -0.52), P(0, 1, 0), 0.074, 0.055, 8), IRON);
    b.prop('iron', collarRing(L(dx, frontY - 0.08, 0.52), P(0, 1, 0), 0.072, 0.055, 8), IRON);
    b.nav.block(L(dx, 0, 0), 0.5, 2.4);
  }
  // Longitudinal diagonal wind-braces between outer posts & purlins.
  for (const sx of [-1, 1]) {
    b.prop('timber', hewnBeam(L(sx * halfW, 1.56, -0.52), L(sx * (halfW - 0.58), backY - 0.06, -0.52), 0.06, 0.06, { irregular: 0.2 }), DARK);
  }
  // Heavy ridge & eave purlins running along X with natural overhang.
  const roofHalf = halfW + 0.36;
  b.prop('timber', hewnBeam(L(-roofHalf, backY, -0.52), L(roofHalf, backY, -0.52), 0.11, 0.12, { irregular: 0.35 }), DARK);
  b.prop('timber', hewnBeam(L(-roofHalf, frontY, 0.52), L(roofHalf, frontY, 0.52), 0.1, 0.11, { irregular: 0.35 }), DARK);

  // Exposed pitched rafters & overlapping split roof planks (replaces the thin flat roof slab).
  const rafterCount = Math.max(5, Math.round(width / 0.72) + 1);
  const roofAtZ = (dz) => backY + ((dz + 0.52) / 1.04) * (frontY - backY);
  for (let r = 0; r < rafterCount; r += 1) {
    const rx = -roofHalf + 0.1 + ((roofHalf * 2 - 0.2) * r) / (rafterCount - 1);
    b.prop('timber', hewnBeam(L(rx, roofAtZ(-0.78) + 0.05, -0.78), L(rx, roofAtZ(0.8) + 0.05, 0.8), 0.075, 0.09, { irregular: 0.25 }), DARK);
  }
  for (let plank = 0; plank < 5; plank += 1) {
    const z0 = -0.68 + plank * 0.34;
    const py = roofAtZ(z0) + 0.11;
    b.prop('timber', hewnBeam(L(-roofHalf - 0.06, py, z0), L(roofHalf + 0.06, py, z0), 0.32, 0.055, { irregular: 0.32 }),
      WOOD_TONES[plank % WOOD_TONES.length]);
  }
  // Single continuous wind-drifted snow blanket hugging the pitched plank roof + delicate eave icicles.
  const roofPitch = Math.atan2(backY - frontY, 1.04);
  b.prop('roof', roofSnowBlanket(
    L(0, roofAtZ(0.02) + 0.15, 0.02),
    roofHalf * 2.04,
    1.76,
    roofPitch,
    { seed: baseSeed + 41, thickness: 0.18, cols: 20, rows: 9 },
  ), 0xffffff);
  eaveIcicles(b, L(-roofHalf + 0.08, roofAtZ(0.76) + 0.02, 0.76), L(roofHalf - 0.08, roofAtZ(0.76) + 0.02, 0.76),
    { spacing: 0.36, length: 0.58, cornice: false });

  // Horizontal drying poles with contoured draped pelts (or split fish).
  for (const y of [1.26, 1.76]) {
    b.prop('timber', hewnPole(L(-halfW - 0.12, y, 0), L(halfW + 0.12, y, 0), 0.036, 0.034,
      { seed: baseSeed + Math.round(y * 10), segments: 5, sides: 7, bow: 0.025 }), PALE);
  }
  if (hides) {
    let idx = 0;
    for (let dx = -halfW + 0.22; dx < halfW - 0.78; dx += 1.04) {
      const wHide = 0.86 + b.range(-0.06, 0.08);
      const drop = 1.08 + b.range(-0.1, 0.12);
      const railY = 1.77;
      const zOff = (idx % 2 === 0 ? 0.02 : -0.02);
      b.prop('pelt', drapedHideMesh(L(dx, railY, zOff), L(dx + wHide, railY, zOff), drop,
        { seed: baseSeed + 71 + idx * 19, cols: 12, rows: 10 }), FUR[idx % FUR.length]);
      // Rawhide tie wraps securing shoulder corners to the drying rail.
      b.prop('iron', collarRing(L(dx + 0.08, railY, zOff), P(1, 0, 0), 0.046, 0.03, 7), PALE);
      b.prop('iron', collarRing(L(dx + wHide - 0.08, railY, zOff), P(1, 0, 0), 0.046, 0.03, 7), PALE);
      idx += 1;
    }
  } else {
    for (let dx = -halfW + 0.28; dx < halfW - 0.22; dx += 0.32) {
      const len = b.range(0.32, 0.48);
      const topY = 1.74;
      b.prop('timber', hewnPole(L(dx, topY - len, 0), L(dx, topY, 0), 0.026, 0.052,
        { seed: baseSeed + Math.round(dx * 37), segments: 3, sides: 6, bow: 0.02 }), 0xbba88c);
    }
  }
}

/** A long fire in a stone kerb down the middle of a hall, `length` metres along Z. */
export function longHearth(b, at, length) {
  const L = (dx, dy, dz) => P(at.x + dx, at.y + dy, at.z + dz);
  for (let dz = -length / 2; dz <= length / 2 + 0.01; dz += 0.6) {
    for (const dx of [-0.62, 0.62]) b.prop('masonry', stoneBlock(0.3, 0.26, 0.56, L(dx, 0, dz), { irregular: 0.5 }), STONE);
    b.nav.block(L(0, 0, dz), 0.85, 2);
  }
  for (const dz of [-length / 2 - 0.3, length / 2 + 0.3]) b.prop('masonry', stoneBlock(1.5, 0.26, 0.3, L(0, 0, dz), { irregular: 0.5 }), STONE);
  // A bed of ash with the fire showing through it, not a slab of orange.
  b.prop('glow', box(0.95, 0.1, length, L(0, 0.09, 0)), '#3a1206', 1);
  for (let dz = -length / 2 + 0.3; dz < length / 2; dz += 0.45) {
    b.prop('glow', stoneBlock(b.range(0.16, 0.34), 0.07, b.range(0.14, 0.3), L(b.range(-0.3, 0.3), 0.11, dz),
      { irregular: 0.8, yaw: b.range(0, 3) }), '#ff6a1e', b.range(0.7, 1.7));
    b.prop('iron', rod(L(-0.4, 0.17, dz), L(0.4, 0.21, dz + b.range(-0.3, 0.3)), 0.07, 0.06, 6), 0x2a1f18);
  }
  for (const t of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const at = L(b.range(-0.15, 0.15), 0.15, t * length);
    b.flame(at, { width: b.range(0.45, 0.7), height: b.range(0.6, 1), core: '#fff1b4', outer: '#ff5810', speed: b.range(0.9, 1.3) });
    b.emit('ember', P(at.x, at.y + 0.3, at.z));
  }
  for (const t of [-0.34, 0, 0.34]) b.light(L(0, 1.1, t * length), HEARTH, 7.5, 17, { radius: 1.5, halo: 0.7 });
}

/**
 * The inside of an earth-sheltered hall: plank floor, log lining, a frame of
 * posts and tie beams under a boarded roof, the long hearth, sleeping benches
 * down both sides and the high seat at the far end. `at` is the middle of the
 * floor; the hall runs along Z with its door at +Z and a rear door at -Z.
 *
 * It is dressing for a cavity the generator has already cut: the rock around
 * it is what keeps the firelight in and the daylight out of the bake.
 */
export function hallInterior(b, at, { halfWidth, halfLength, wallHeight, ridge }) {
  const L = (dx, dy, dz) => P(at.x + dx, at.y + dy, at.z + dz);
  const wall = halfWidth - 0.2, aisle = halfWidth * 0.52, door = { from: halfWidth - 1.1, to: halfWidth + 1.1, height: 2.5 };
  b.prop('planks', panel(L(0, 0.02, -halfLength), L(0, 0.02, halfLength), P(1, 0, 0), halfWidth * 2, 0.06), 0xffffff);
  for (const sx of [-1, 1]) {
    logWall(b, L(sx * wall, 0, -halfLength), L(sx * wall, 0, halfLength), wallHeight, { overrun: 0, tint: HALL_LOG });
    // Roof boards on the rafters, so the vault above is timber and not bare rock.
    const rise = ridge - wallHeight;
    b.prop('timber', panel(L(sx * wall / 2, wallHeight + rise / 2 + 0.16, -halfLength), L(sx * wall / 2, wallHeight + rise / 2 + 0.16, halfLength),
      P(-sx * wall, rise, 0), Math.hypot(wall, rise) + 0.3, 0.08), 0x5c5046);
    for (const share of [0.36, 0.7]) {
      b.prop('timber', hewnBeam(L(sx * wall * (1 - share), wallHeight + rise * share, -halfLength), L(sx * wall * (1 - share), wallHeight + rise * share, halfLength), 0.2, 0.22), HALL_BEAM);
    }
    // Sleeping bench: a raised platform the length of the hall, furs thrown over it.
    const benchWidth = wall - aisle - 0.5;
    b.prop('planks', block(benchWidth, 0.5, halfLength * 2 - 3, L(sx * (wall - benchWidth / 2 - 0.15), 0, 0)), 0xcdbfae);
    for (let dz = -halfLength + 3; dz < halfLength - 3; dz += b.range(2.2, 3.4)) {
      b.prop('timber', stoneBlock(benchWidth * 0.8, 0.12, b.range(1.3, 1.9), L(sx * (wall - benchWidth / 2 - 0.15), 0.5, dz),
        { bevel: 0.05, irregular: 0.7 }), FUR[Math.floor(b.range(0, 3))]);
    }
  }
  for (const sz of [-1, 1]) {
    logWall(b, L(-halfWidth, 0, sz * (halfLength - 0.2)), L(halfWidth, 0, sz * (halfLength - 0.2)), ridge, { overrun: 0, gap: door, tint: HALL_LOG });
    for (const dx of [-1.2, 1.2]) b.prop('timber', hewnBeam(L(dx, 0, sz * (halfLength - 0.25)), L(dx, 2.6, sz * (halfLength - 0.25)), 0.26, 0.3), HALL_BEAM);
    b.prop('timber', hewnBeam(L(-1.5, 2.65, sz * (halfLength - 0.25)), L(1.5, 2.65, sz * (halfLength - 0.25)), 0.3, 0.3), HALL_BEAM);
  }
  b.prop('timber', hewnBeam(L(0, ridge - 0.1, -halfLength), L(0, ridge - 0.1, halfLength), 0.3, 0.34), HALL_BEAM);

  for (let dz = -halfLength + 2; dz <= halfLength - 2 + 0.01; dz += BAY) {
    for (const sx of [-1, 1]) {
      b.prop('timber', hewnBeam(L(sx * aisle, 0, dz), L(sx * aisle, wallHeight + 0.3, dz), 0.32, 0.32, { taper: 0.04 }), HALL_LOG);
      b.prop('timber', hewnBeam(L(sx * aisle, wallHeight - 0.7, dz), L(sx * (aisle - 0.9), wallHeight + 0.2, dz), 0.16, 0.18), HALL_BEAM);
      b.prop('timber', hewnBeam(L(sx * wall, wallHeight, dz), L(0, ridge - 0.15, dz), 0.2, 0.26), HALL_BEAM);
      b.nav.block(L(sx * aisle, 0, dz), 0.42, 3);
    }
    b.prop('timber', hewnBeam(L(-wall, wallHeight + 0.3, dz), L(wall, wallHeight + 0.3, dz), 0.28, 0.32), HALL_BEAM);
    b.prop('timber', hewnBeam(L(0, wallHeight + 0.45, dz), L(0, ridge - 0.25, dz), 0.2, 0.2), HALL_BEAM);
  }
  for (const dz of [-halfLength + 2 + BAY / 2, halfLength - 2 - BAY / 2]) {
    for (const sx of [-1, 1]) lantern(b, L(sx * aisle * 0.6, wallHeight - 0.35, dz), { intensity: 2.6, range: 9, halo: 1, hung: 0.5 });
  }

  longHearth(b, L(0, 0, 1), halfLength * 0.75);

  // The high seat on its dais, with a board for the household before it.
  const head = -halfLength + 1.7;
  b.prop('masonry', stoneBlock(4.4, 0.28, 2.2, L(0, 0, head), { irregular: 0.3 }), STONE);
  b.prop('timber', block(1, 0.5, 0.8, L(0, 0.28, head - 0.2)), HALL_LOG);
  b.prop('timber', hewnBeam(L(0, 0.78, head - 0.6), L(0, 2.5, head - 0.66), 0.14, 1.1), HALL_BEAM);
  for (const dx of [-0.6, 0.6]) b.prop('timber', hewnBeam(L(dx, 0.28, head - 0.6), L(dx, 2.8, head - 0.6), 0.16, 0.16, { taper: 0.2 }), HALL_BEAM);
  b.prop('timber', stoneBlock(1.1, 0.1, 0.9, L(0, 0.78, head - 0.15), { bevel: 0.04, irregular: 0.6 }), FUR[2]);
  for (const dx of [-1.7, 1.7]) {
    b.prop('timber', rod(L(dx, 0.28, head + 0.5), L(dx, 1.5, head + 0.5), 0.06, 0.05, 6), HALL_BEAM);
    lantern(b, L(dx, 1.7, head + 0.5), { intensity: 2.4, range: 8, halo: 1 });
  }
  b.nav.block(L(0, 0, head), 2.4, 3);
  const table = head + 3.2;
  b.prop('planks', block(3.2, 0.08, 0.9, L(0, 0.78, table)), 0xbfae98);
  for (const dx of [-1.2, 1.2]) b.prop('timber', hewnBeam(L(dx, 0, table), L(dx, 0.78, table), 0.14, 0.7), HALL_BEAM);
  for (const dz of [-0.75, 0.75]) b.prop('planks', block(3, 0.08, 0.32, L(0, 0.44, table + dz)), 0xa89680);
  b.nav.block(L(-0.9, 0, table), 1.1, 2);
  b.nav.block(L(0.9, 0, table), 1.1, 2);

  // Winter stores stacked inside the door, out of the frost.
  for (const [dx, dz] of [[aisle - 0.2, halfLength - 1.5], [aisle + 0.5, halfLength - 1.2], [-aisle, halfLength - 1.3]]) {
    barrel(b, L(dx, 0, dz));
    b.nav.block(L(dx, 0, dz), 0.5, 2);
  }
  crate(b, L(-aisle - 0.8, 0, halfLength - 1.4), 0.8, 0.3);
  b.nav.addRect(L(0, 0, 0), aisle + 0.35, halfLength - 0.6);
}

/**
 * A door hide: a heavy contoured fur curtain pegged to a lintel, drawn half aside,
 * across a passage running along Z at `at` — or along whatever `yaw` turns Z to.
 */
export function doorHide(b, at, { width = 2.2, height = 2.4, yaw = 0 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (dx, dy, dz) => P(at.x + c * dx + s * dz, at.y + dy, at.z - s * dx + c * dz);
  b.prop('timber', hewnBeam(L(-width / 2 - 0.2, height, 0), L(width / 2 + 0.2, height, 0), 0.2, 0.22), DARK);
  b.prop('pelt', drapedHideMesh(L(-width * 0.5, height - 0.06, 0.02), L(width * 0.05, height - 0.06, 0.02), height - 0.14,
    { seed: Math.round(at.x * 13 + at.z * 7) + 5, cols: 12, rows: 10 }), FUR[1]);
  b.prop('pelt', drapedHideMesh(L(width * 0.24, height - 0.06, 0.04), L(width * 0.54, height - 0.06, 0.04), height - 0.35,
    { seed: Math.round(at.x * 17 + at.z * 11) + 11, cols: 8, rows: 8 }), FUR[0]);
}

/**
 * A woodshed: a shingled lean-to roof on four crooked posts crowned with a
 * sculpted drifted snow pillow over stacked wood, high side toward `-Z`.
 */
export function woodShed(b, at, { width = 3.6, depth = 3, height = 2.4, fall = 0.5 } = {}) {
  const L = (dx, dy, dz) => P(at.x + dx, at.y + dy, at.z + dz);
  const eave = (dz) => height - fall * (dz + depth / 2) / depth;
  const seed = Math.round(at.x * 11 + at.z * 19) + 3;
  for (const dx of [-width / 2, width / 2]) {
    for (const dz of [-depth / 2, depth / 2]) {
      b.prop('timber', hewnPole(L(dx, -0.3, dz), L(dx, eave(dz), dz), 0.11, 0.095,
        { seed: seed + Math.round(dx * 7 + dz * 13), segments: 5, sides: 8, bow: 0.04 }), LOG);
      b.nav.block(L(dx, 0, dz), 0.3, 3);
    }
    b.prop('timber', hewnBeam(L(dx, eave(-depth / 2 - 0.3), -depth / 2 - 0.3), L(dx, eave(depth / 2 + 0.3), depth / 2 + 0.3), 0.14, 0.18), DARK);
  }
  const over = depth / 2 + 0.4;
  for (let i = 0; i < 6; i += 1) {
    const dz = -over + 0.24 + (i / 5) * (over * 2 - 0.48);
    b.prop('timber', hewnBeam(L(-width / 2 - 0.4, eave(dz) + 0.12, dz), L(width / 2 + 0.4, eave(dz) + 0.12, dz), 0.44, 0.07, { irregular: 0.28 }),
      WOOD_TONES[i % WOOD_TONES.length]);
  }
  const pitch = Math.atan2(fall, depth);
  b.prop('roof', roofSnowBlanket(
    L(0, eave(0) + 0.18, 0),
    width + 0.88,
    over * 2.08,
    pitch,
    { seed: seed + 37, thickness: 0.22, cols: 18, rows: 10 },
  ), 0xffffff);
}
