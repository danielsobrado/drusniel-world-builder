import { beam, block, box, rod } from '../gen/propKit.js';
import { fbm3 } from '../gen/noise.js';
import { chamber, column, plateau, slab } from '../gen/shapes.js';
import { bridge, crystal, house, lantern } from './kits.js';
import { bellCluster, lanternCap, loamMound, shelfBrackets } from './umbraFungus.js';
import {
  buildCrystalResonatorObelisk,
  buildHangingCenserSpire,
  buildSpiderWebBalustradeShrine,
  buildTideGondolaSkiff,
  buildVeilFungusParasol,
} from './umbraExtraProps.js';

/**
 * An Umbra'kor cavern city. The cavern comes first — a void far larger than
 * anything built in it — then the places the rock allowed: an island of
 * standing stone for the market, ledges along the walls for the houses, a low
 * shelf by the water for the fungus beds. Bridges do the rest. Nothing is lit
 * that is not a road, a window or a crop.
 */

export const bounds = { min: { x: -72, y: -24, z: -138 }, max: { x: 72, y: 64, z: 16 } };

const P = (x, y, z) => ({ x, y, z });
const ALONG_Z = Math.PI / 2;
const LAKE = -16;

export function generate(b, params) {
  const { windowTint, crystalTint } = params;
  const gate = P(0, 16, 7), ledge = P(0, 16, -23);
  const market = P(0, 8, -72);
  const west = P(-41, 14, -72), east = P(41, 2, -78), beds = P(0, -6, -113);
  const lamp = (at, size = 1, power = 2.2) => crystal(b, at, size, { tint: crystalTint, intensity: power * 1.6, range: 16 * size, gain: 0.5 });

  // The void.
  b.grid.carve(chamber(P(0, 20, -72), { rx: 57, ry: 41, rz: 55, floorY: LAKE }));
  b.grid.carve(chamber(P(28, 24, -52), { rx: 31, ry: 31, rz: 31, floorY: LAKE }), 5);
  b.grid.carve(chamber(P(-30, 16, -96), { rx: 33, ry: 29, rz: 31, floorY: LAKE }), 5);
  b.passage(gate, P(0, 16, -14), { width: 5.5, height: 5.5, arch: 0.5 });

  // What the rock left standing.
  b.grid.fill(plateau(ledge, 9.5, 40), 2);
  b.grid.fill(plateau(market, 21.5, 30), 2.5);
  b.grid.fill(slab(west, { halfLength: 27, halfWidth: 10, thickness: 36, yaw: ALONG_Z }), 2);
  b.grid.fill(slab(east, { halfLength: 23, halfWidth: 10, thickness: 24, yaw: ALONG_Z }), 2);
  b.grid.fill(slab(beds, { halfLength: 25, halfWidth: 10, thickness: 14 }), 2);
  const perches = [[P(-46, 29, -58), 12], [P(46, 23, -50), 11], [P(30, 31, -104), 10], [P(-38, 33, -100), 9]];
  for (const [at, half] of perches) b.grid.fill(slab(at, { halfLength: half, halfWidth: 6.5, thickness: 6, yaw: ALONG_Z }), 2);
  b.grid.fill(column(P(27, LAKE - 2, -101), P(22, 62, -96), 6.5, 4.5), 3);
  b.grid.fill(column(P(-25, LAKE - 2, -43), P(-20, 62, -40), 5.5, 3.5), 3);
  // The Spindle: the great stalactite the city is named for, hanging over the market.
  const spindleTip = P(0, 29, -72);
  b.grid.fill(column(P(0, 64, -72), spindleTip, 13, 2.2), 3);
  for (let index = 0; index < params.stalactites; index += 1) {
    const x = b.range(-50, 50), z = b.range(-120, -24);
    if (b.grid.sample(x, 34, z) < 1) continue;
    const roof = b.probe(x, 34, z, 1, 34);
    if (roof === null) continue;
    const length = b.range(2, 9);
    b.grid.fill(column(P(x, roof + 2, z), P(x + b.range(-0.4, 0.4), roof - length, z), b.range(0.9, 2), 0.25), 1);
  }
  for (let index = 0; index < 14; index += 1) {
    const angle = b.range(0, Math.PI * 2), reach = b.range(26, 46);
    const x = Math.cos(angle) * reach, z = -72 + Math.sin(angle) * reach;
    b.grid.fill(column(P(x, LAKE - 1, z), P(x, LAKE + b.range(2, 7), z), b.range(1, 2.2), 0.3), 1);
  }
  b.grid.roughen({ amp: 1.5, scale: 0.075, seed: b.seed, octaves: 3, floorAmp: 0.06 });
  b.grid.roughen({ amp: 0.4, scale: 0.3, seed: b.seed + 7, octaves: 2, floorAmp: 0.1 });

  // Ground.
  b.nav.addDisc(ledge, 8);
  b.nav.addDisc(market, 19.6);
  b.nav.addRect(west, 8.2, 25.5);
  b.nav.addRect(east, 8.2, 21.5);
  b.nav.addRect(beds, 23.5, 8.2);
  const BASALT = 0xffffff;
  bridge(b, P(0, 16, -30), P(0, 8, -52.6), 5.2, { footY: LAKE, spans: 3, tint: BASALT, parapet: 1.1 });
  bridge(b, P(-19.4, 8, -72), P(-33.4, 14, -72), 3.6, { footY: LAKE, spans: 2, tint: BASALT, parapet: 1 });
  bridge(b, P(19.4, 8, -76), P(33.4, 2, -78), 3.6, { footY: LAKE, spans: 2, tint: BASALT, parapet: 1 });
  bridge(b, P(9, 8, -90.2), P(21.5, -6, -105.6), 3.2, { footY: LAKE, spans: 2, tint: BASALT, parapet: 1 });
  b.passage(P(-22, -6, -115), P(-48, -8, -129), { width: 4.2, height: 4.6, arch: 0.6 });

  b.classify = (p, n, mask) => {
    const seam = fbm3(p.x * 0.05, p.y * 0.05, p.z * 0.05, b.seed + 41, 3);
    // Crystal seams run in the walls and roof, never across a floor.
    mask[0] = Math.max(0, seam - 0.64) * 3 * (n.y > 0.4 ? 0 : 1);
    mask[1] = Math.min(1, Math.max(0, (LAKE + 7 - p.y) / 6));
    mask[2] = 0;
    // Where people walk, the floor is cut and flagged.
    const floor = n.y > 0.7 ? b.nav.surfaceAt(p.x, p.z, p.y + 0.5) : null;
    mask[3] = floor !== null && Math.abs(floor - p.y) < 1.2 ? 1 : 0;
    return 0;
  };

  // --- Water and the light that shows the void ------------------------------
  b.prop('water', box(140, 0.05, 140, P(0, LAKE + 2.6, -72)));
  // Doubled and leaning violet or teal by turns (was one #8496b8 at 1-1.6): at that
  // level the void, its walls and the city's silhouette all read as black.
  const VOID_TINTS = ['#7d8fd6', '#8a72cf', '#6fb0c8'];
  for (const [index, [x, y, z, power]] of [[32, LAKE + 6, -40, 1.6], [-36, LAKE + 6, -102, 1.6], [0, 46, -40, 1.5], [-30, 40, -80, 1.3], [34, 40, -92, 1.3], [0, 30, -110, 1.2], [-44, 20, -40, 1], [44, 14, -100, 1]].entries()) {
    b.light(P(x, y, z), VOID_TINTS[index % VOID_TINTS.length], power * 2.2, 80, { flat: true });
  }

  // Glowing growth along the roads: the beds' own fungus, seeded wherever people
  // walk, each patch with a small cold light, so streets, terraces and bridgeheads
  // read as lit paths through the dark (`roads` in the loading tip).
  const GROWTH_TINTS = ['#79e3c4', '#9b7ef0', '#6fd0ff'];
  const growthRange = (lo, hi) => b.range(lo, hi);
  const growth = (at, index) => {
    const ground = b.terrainAt(at.x, at.y + 1.5, at.z) ?? at.y;
    b.prop('glow', bellCluster(P(at.x, ground - 0.02, at.z), 4 + Math.floor(b.range(0, 4)), growthRange), 0xffffff, 0.85);
    const tall = b.range(0.4, 1.1);
    b.prop('glow', lanternCap(P(at.x + b.range(-0.6, 0.6), ground - 0.03, at.z + b.range(-0.6, 0.6)), tall, tall * b.range(0.24, 0.36), growthRange), 0xffffff, 0.9);
    b.light(P(at.x, ground + 1.1, at.z), GROWTH_TINTS[index % GROWTH_TINTS.length], 1.5, 10, { halo: 0.6 });
    b.nav.block(at, 0.8, 1.5);
  };

  // --- Gate ledge -------------------------------------------------------------
  b.prop('masonry', block(1.6, 6.5, 1.6, P(-3.6, 16, -14.5)));
  b.prop('masonry', block(1.6, 6.5, 1.6, P(3.6, 16, -14.5)));
  b.prop('masonry', box(9.4, 1.2, 1.8, P(0, 23, -14.5)));
  lamp(P(-5.5, 16, -19), 1.1);
  lamp(P(5.5, 16, -19), 1.1);
  lamp(P(-3.6, 16, -29.5), 0.9);
  lamp(P(3.6, 16, -29.5), 0.9);

  // --- Market island -----------------------------------------------------------
  house(b, market, 0, 7.5, 12.5, 7.5, { windowTint, windows: 3, floors: 4, light: 3.5 });
  b.prop('masonry', block(5, 4, 5, P(market.x, market.y + 13.4, market.z)));
  b.prop('masonry', rod(P(market.x, market.y + 17.4, market.z), P(market.x, market.y + 20.4, market.z), 1.6, 0.2, 4));
  for (let index = 0; index < 9; index += 1) {
    const angle = index / 9 * Math.PI * 2 + 0.35;
    const at = P(market.x + Math.cos(angle) * 14, market.y, market.z + Math.sin(angle) * 14);
    const facing = Math.atan2(-Math.cos(angle), -Math.sin(angle));
    if (index % 3 === 2) {
      // Open stalls: posts, a slab roof, goods under it.
      for (const [dx, dz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
        b.prop('masonry', block(0.35, 2.6, 0.35, P(at.x + dx, at.y, at.z + dz)));
      }
      b.prop('masonry', box(4.2, 0.3, 3.4, P(at.x, at.y + 2.75, at.z), facing));
      b.prop('timber', block(2.6, 0.9, 1, at, facing), 0x4b3a2c);
      b.prop('glow', box(0.25, 0.25, 0.25, P(at.x, at.y + 2.3, at.z)), windowTint, 3);
      b.light(P(at.x, at.y + 2.2, at.z), windowTint, 2.4, 9, { halo: 1.2 });
      b.nav.block(at, 2.1, 3);
    } else {
      house(b, at, facing, b.range(4.6, 5.8), b.range(4.2, 7.5), 4.4, { windowTint, windows: 2, floors: 2, light: 3 });
    }
  }
  for (let index = 0; index < 6; index += 1) {
    const angle = index / 6 * Math.PI * 2;
    lamp(P(market.x + Math.cos(angle) * 8.6, market.y, market.z + Math.sin(angle) * 8.6), 0.9, 2);
  }
  // Warm lamps where people trade and live: the only fire-coloured light in the city.
  for (const [x, y, z] of [[-6, 8, -62], [7, 8, -80], [-9, 8, -79], [10, 8, -66], [-36, 14, -58], [-36, 14, -84], [37, 2, -70]]) {
    b.prop('iron', rod(P(x, y, z), P(x, y + 2.6, z), 0.05, 0.04, 6), 0x23262d);
    lantern(b, P(x, y + 2.8, z), { tint: windowTint, intensity: 5, range: 14, halo: 1.4 });
    b.nav.block(P(x, y, z), 0.35, 3);
  }
  // The Spindle's lamp: a hanging mass of crystal over the market.
  for (let index = 0; index < 9; index += 1) {
    const angle = index / 9 * Math.PI * 2;
    b.prop('glow', rod(P(spindleTip.x + Math.cos(angle) * 1.2, spindleTip.y + 2.5, spindleTip.z + Math.sin(angle) * 1.2),
      P(spindleTip.x + Math.cos(angle) * b.range(0.3, 2.4), spindleTip.y - b.range(1.5, 5), spindleTip.z + Math.sin(angle) * b.range(0.3, 2.4)), 0.5, 0.03, 5), crystalTint, 0.6);
  }
  b.light(P(spindleTip.x, spindleTip.y - 3, spindleTip.z), crystalTint, 70, 70, { radius: 4, halo: 7 });

  // --- West terrace: houses cut back into the cliff -----------------------------
  for (let z = west.z - 22; z <= west.z + 22; z += 7.4) {
    const tall = b.range(5.5, 10);
    house(b, P(west.x - 5.4, west.y, z), ALONG_Z, 5.8, tall, 5, { windowTint, windows: 2, floors: 3, light: 3 });
    if (Math.round(z) % 2) lamp(P(west.x + 7, west.y, z + 3.6), 0.8, 1.8);
  }
  // --- East tier: a house compound behind its own wall ----------------------------
  b.prop('masonry', box(0.9, 3.2, 30, P(east.x - 3.5, east.y + 1.6, east.z - 6)));
  b.prop('masonry', block(1.6, 4.6, 1.6, P(east.x - 3.5, east.y, east.z + 9.8)));
  b.prop('masonry', block(1.6, 4.6, 1.6, P(east.x - 3.5, east.y, east.z + 13.4)));
  b.prop('iron', box(0.2, 3, 2.2, P(east.x - 3.5, east.y + 1.5, east.z + 11.6)), 0x23262d);
  for (let z = east.z - 20; z <= east.z + 7; z += 0.9) b.nav.block(P(east.x - 3.5, east.y, z), 0.7, 4);
  b.nav.block(P(east.x - 3.5, east.y, east.z + 11.6), 1.4, 4);
  for (const [dz, tall] of [[-15, 9], [-6, 12], [3, 7]]) {
    house(b, P(east.x + 3.6, east.y, east.z + dz), -ALONG_Z, 7, tall, 5.4, { windowTint, windows: 3, floors: 4, light: 3 });
  }
  lamp(P(east.x - 5.6, east.y, east.z + 9), 1, 2.4);
  lamp(P(east.x - 5.6, east.y, east.z + 14.4), 1, 2.4);
  lamp(P(east.x - 6.5, east.y, east.z - 14), 0.8, 1.8);

  // --- Perches: houses no bridge reaches, only seen ------------------------------
  for (const [at, half] of perches) {
    for (let offset = -half + 3.5; offset <= half - 3; offset += 6.2) {
      house(b, P(at.x + Math.sign(at.x) * 1.5, at.y, at.z + offset), -Math.sign(at.x) * ALONG_Z, 4.8, b.range(4, 8), 4.2, { windowTint, windows: 2, floors: 3, light: 3 });
    }
    lamp(P(at.x - Math.sign(at.x) * 4.5, at.y, at.z), 1, 2.2);
  }

  // --- Fungus beds by the water -----------------------------------------------------
  const TEAL = '#79e3c4';
  const range = (lo, hi) => b.range(lo, hi);
  for (let row = 0; row < 3; row += 1) {
    for (let x = -19; x <= 19; x += 7.6) {
      if (Math.abs(x - 19) < 4 && row === 0) continue;
      const at = P(beds.x + x, beds.y, beds.z - 5.4 + row * 4.6);
      b.prop('masonry', block(5.6, 0.5, 2.4, at));
      b.prop('timber', block(5.1, 0.62, 1.9, at), 0x2a211b);
      const loam = loamMound(P(at.x, at.y + 0.6, at.z), 2.42, 0.86, 0.17, Math.round(at.x * 13 + at.z * 7));
      b.prop('loam', loam.geometry);
      // The crop stands in a loose row down the bed; tufts and brackets take the gaps and the kerb.
      for (let cap = 0; cap < 7; cap += 1) {
        const cx = at.x - 2.05 + cap * 0.68 + b.range(-0.2, 0.2), cz = at.z + b.range(-0.45, 0.45), tall = b.range(0.3, 0.95);
        b.prop('glow', lanternCap(P(cx, loam.groundAt(cx, cz) - 0.03, cz), tall, tall * b.range(0.24, 0.36), range), 0xffffff, 0.9);
      }
      for (let tuft = 0; tuft < 3; tuft += 1) {
        const cx = at.x + b.range(-2.1, 2.1), cz = at.z + (tuft % 2 ? 1 : -1) * b.range(0.4, 0.7);
        b.prop('glow', bellCluster(P(cx, loam.groundAt(cx, cz) - 0.02, cz), 3 + Math.floor(b.range(0, 4)), range), 0xffffff, 0.8);
      }
      for (const side of [1, -1]) {
        const bx = at.x + b.range(-2.2, 2.2);
        b.prop('glow', shelfBrackets(P(bx, at.y + b.range(0.12, 0.26), at.z + side * 1.205), side > 0 ? 0 : Math.PI, 2 + Math.floor(b.range(0, 2)), range), 0xffffff, 0.7);
      }
      b.light(P(at.x, at.y + 1.3, at.z), TEAL, 0.9, 7, { halo: 0 });
      b.nav.block(P(at.x - 1.6, at.y, at.z), 1.3, 2);
      b.nav.block(P(at.x + 1.6, at.y, at.z), 1.3, 2);
    }
  }
  // Aqueduct along the back of the shelf, fed from the wall.
  b.prop('masonry', box(46, 0.9, 1.3, P(beds.x, beds.y + 1.6, beds.z - 8.6)));
  b.prop('water', box(45.6, 0.05, 0.7, P(beds.x, beds.y + 2.06, beds.z - 8.6)));
  for (let x = -21; x <= 21; x += 6) {
    b.prop('masonry', block(0.9, 1.2, 1.1, P(beds.x + x, beds.y, beds.z - 8.6)));
    // Wild growth where the aqueduct seeps: brackets up the post, a tuft at its foot.
    b.prop('glow', shelfBrackets(P(beds.x + x + b.range(-0.2, 0.2), beds.y + b.range(0.35, 0.7), beds.z - 8.04), 0, 2 + Math.floor(b.range(0, 3)), range), 0xffffff, 0.7);
    const fx = beds.x + x + b.range(-0.6, 0.6), fz = beds.z - b.range(7.6, 7.85);
    const ground = b.terrainAt(fx, beds.y + 1, fz) ?? beds.y;
    b.prop('glow', bellCluster(P(fx, ground - 0.02, fz), 4 + Math.floor(b.range(0, 4)), range), 0xffffff, 0.8);
  }
  lamp(P(beds.x - 21, beds.y, beds.z + 6.5), 0.8, 1.6);
  lamp(P(beds.x + 12, beds.y, beds.z + 6.8), 0.8, 1.6);

  // --- The deep passage and its warden gate ---------------------------------------
  const wardenGate = P(-33, -6.9, -121);
  for (let index = -3; index <= 3; index += 1) {
    const at = P(wardenGate.x + index * 0.3, wardenGate.y, wardenGate.z + index * 0.56);
    b.prop('iron', rod(at, P(at.x, at.y + 4.4, at.z), 0.05, 0.05, 6), 0x23262d);
  }
  for (const y of [0.5, 2.2, 3.9]) {
    b.prop('iron', beam(P(wardenGate.x - 0.9, wardenGate.y + y, wardenGate.z - 1.7), P(wardenGate.x + 0.9, wardenGate.y + y, wardenGate.z + 1.7), 0.09), 0x23262d);
  }
  b.nav.block(wardenGate, 2.4, 5);
  lamp(P(-27.5, -6.4, -116), 0.9, 2);
  b.light(P(-45, -6, -128), '#6b4fb0', 1.3, 14, { halo: 2.2 });

  // --- Lit roads -----------------------------------------------------------------------
  let growthIndex = 0;
  for (const side of [-1, 1]) growth(P(side * 6.4, ledge.y, ledge.z - 4), growthIndex++);
  for (let index = 0; index < 10; index += 1) {
    const angle = index / 10 * Math.PI * 2 + 0.2;
    growth(P(market.x + Math.cos(angle) * 18.2, market.y, market.z + Math.sin(angle) * 18.2), growthIndex++);
  }
  for (let z = west.z - 20; z <= west.z + 20; z += 8) growth(P(west.x + 6.8, west.y, z), growthIndex++);
  for (let z = east.z - 18; z <= east.z + 6; z += 8) growth(P(east.x - 6.6, east.y, z), growthIndex++);
  for (const [x, y, z] of [[-17.5, 8, -72], [-35.4, 14, -70], [17.5, 8, -76], [35.4, 2, -80], [8, 8, -88], [20, -6, -103]]) {
    growth(P(x, y, z), growthIndex++);
  }

  buildSpiderWebBalustradeShrine(b, P(-6.8, ledge.y, ledge.z - 1.5), 0.6);
  buildCrystalResonatorObelisk(b, P(market.x, market.y, market.z + 12.5), 0);
  buildHangingCenserSpire(b, P(market.x - 8.2, market.y, market.z + 3.5), 0.4);
  buildHangingCenserSpire(b, P(market.x + 8.2, market.y, market.z - 2.5), -2.6);
  buildVeilFungusParasol(b, P(beds.x - 13.5, beds.y, beds.z - 3.5), 1.15);
  buildVeilFungusParasol(b, P(beds.x + 13.5, beds.y, beds.z - 3.5), 1.1);
  buildTideGondolaSkiff(b, P(17.5, LAKE + 2.52, -96), 0.8);

  b.spawn('entry', P(0, 16, 2), 0);
  b.exit('gate', P(gate.x, gate.y, gate.z - 0.5), { radius: 2.8, label: 'Take the tunnel back to the surface' });
}
