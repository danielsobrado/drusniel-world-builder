import { arch, beam, box, hewnBeam, panel, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { lantern } from './kits.js';
import { atFrame } from './propFrame.js';
import { bellCluster, shelfBrackets } from './umbraFungus.js';

const P = (x, y, z) => ({ x, y, z });
const IRON_DARK = 0x23262e;
const IRON_TRIM = 0x343947;
const BRONZE_ACCENT = 0x7a6850;
const BASALT_TRIM = 0xe8e4f2;

/**
 * Ornate Drow entry gate portal: stepped beveled plinths, fluted octagonal piers with
 * iron collar bands, pointed gothic arch voussoirs, wrought-iron spiderweb tympanum,
 * twin obsidian needle finials, and a suspended glowing amethyst beacon crystal.
 */
export function buildDrowGatePortal(b, at, crystalTint = '#9b7ef0') {
  const L = atFrame(at, 0);
  // Twin stepped plinths + fluted octagonal basalt piers + capitals + obsidian spires.
  for (const sx of [-3.6, 3.6]) {
    b.prop('masonry', stoneBlock(2.2, 0.52, 2.2, L(sx, 0, 0), { bevel: 0.05, batter: 0.08 }), BASALT_TRIM);
    b.prop('masonry', stoneBlock(1.86, 0.42, 1.86, L(sx, 0.5, 0), { bevel: 0.04, batter: 0.06 }), 0xffffff);
    b.prop('masonry', rod(L(sx, 0.88, 0), L(sx, 6.25, 0), 0.78, 0.68, 8), 0xffffff);
    // Corner vertical basalt ribs + iron collar bands.
    for (const [rx, rz] of [[-0.64, -0.64], [0.64, -0.64], [-0.64, 0.64], [0.64, 0.64]]) {
      b.prop('masonry', stoneBox(0.24, 5.1, 0.24, L(sx + rx, 3.55, rz), { bevel: 0.03 }), BASALT_TRIM);
    }
    for (const cy of [2.1, 4.2, 5.95]) {
      b.prop('iron', rod(L(sx, cy, 0), L(sx, cy + 0.14, 0), 0.82, 0.82, 8), IRON_TRIM);
    }
    // Stepped corbel capital + tapered drow needle spire finial.
    b.prop('masonry', stoneBox(2.05, 0.42, 2.05, L(sx, 6.45, 0), { bevel: 0.05 }), BASALT_TRIM);
    b.prop('masonry', stoneBox(2.28, 0.36, 2.28, L(sx, 6.84, 0), { bevel: 0.05 }), 0xffffff);
    b.prop('masonry', rod(L(sx, 7.02, 0), L(sx, 9.65, 0), 0.62, 0.08, 6), BASALT_TRIM);
    b.prop('iron', rod(L(sx, 9.5, 0), L(sx, 10.4, 0), 0.09, 0.018, 6), IRON_TRIM);
  }

  // Pointed gothic voussoir arch + beveled cornice entablature + cresting spikes.
  b.prop('masonry', arch(6.8, 2.4, 1.65, 0.62, L(0, 6.25, 0), { yaw: 0, segments: 12 }), BASALT_TRIM);
  b.prop('masonry', stoneBox(9.8, 0.68, 1.95, L(0, 7.12, 0), { bevel: 0.06 }), 0xffffff);
  b.prop('masonry', stoneBox(10.3, 0.38, 2.2, L(0, 7.62, 0), { bevel: 0.05 }), BASALT_TRIM);
  for (let x = -2.4; x <= 2.4; x += 0.8) {
    const h = 0.55 + (1 - Math.abs(x) / 2.6) * 0.65;
    b.prop('iron', rod(L(x, 7.8, 0), L(x, 7.8 + h, 0), 0.055, 0.015, 6), IRON_DARK);
  }

  // Wrought-iron spiderweb tympanum filigree & suspended crystal inside the arch.
  const webHub = L(0, 6.05, 0);
  for (const [wx, wy] of [[-2.7, 6.35], [2.7, 6.35], [-2.1, 7.05], [2.1, 7.05], [-1.1, 7.55], [1.1, 7.55], [0, 7.7]]) {
    b.prop('iron', beam(webHub, L(wx, wy, 0), 0.045, 0.045), IRON_DARK);
  }
  for (const r of [0.68, 1.32]) {
    for (let i = 0; i < 6; i += 1) {
      const a0 = (i / 6) * Math.PI;
      const a1 = ((i + 1) / 6) * Math.PI;
      b.prop('iron', beam(
        L(Math.cos(a0) * r, 6.05 + Math.sin(a0) * r * 0.72, 0),
        L(Math.cos(a1) * r, 6.05 + Math.sin(a1) * r * 0.72, 0),
        0.035, 0.035,
      ), IRON_TRIM);
    }
  }
  b.prop('iron', rod(L(0, 6.05, 0), L(0, 5.25, 0), 0.04, 0.04, 6), IRON_TRIM);
  b.prop('glow', rod(L(0, 5.32, 0), L(0, 4.48, 0), 0.24, 0.04, 6), crystalTint, 2.2);
}

/**
 * Gothic Drow spire crown atop the central market citadel: corbeled gallery,
 * corner turret pinnacles, flying buttress fins, fluted octagonal spire ribs,
 * and wrought-iron crystal beacon cage.
 */
export function buildDrowSpireCrown(b, market, crystalTint = '#9b7ef0') {
  const baseY = market.y + 12.6;
  const L = atFrame(P(market.x, baseY, market.z), 0);

  // Corbeled overhanging stone gallery deck + parapet crenellations.
  b.prop('masonry', stoneBox(8.4, 0.55, 8.4, L(0, 0.28, 0), { bevel: 0.06 }), BASALT_TRIM);
  for (const [cx, cz] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7], [3.7, 3.7]]) {
    b.prop('masonry', rod(L(cx, 0.5, cz), L(cx, 2.9, cz), 0.58, 0.44, 6), 0xffffff);
    b.prop('masonry', rod(L(cx, 2.9, cz), L(cx, 4.9, cz), 0.46, 0.06, 6), BASALT_TRIM);
    b.prop('iron', rod(L(cx, 4.8, cz), L(cx, 5.6, cz), 0.06, 0.015, 6), IRON_TRIM);
  }
  // Stepped central octagonal belfry drum + 4 buttress fins.
  b.prop('masonry', rod(L(0, 0.52, 0), L(0, 4.6, 0), 2.85, 2.35, 8), 0xffffff);
  b.prop('masonry', rod(L(0, 4.55, 0), L(0, 5.05, 0), 2.68, 2.52, 8), BASALT_TRIM);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const dx = Math.cos(a), dz = Math.sin(a);
    b.prop('masonry', hewnBeam(L(dx * 3.25, 0.55, dz * 3.25), L(dx * 2.15, 4.55, dz * 2.15), 0.46, 0.55, { bevel: 0.04 }), BASALT_TRIM);
    // Glowing lancet slit windows on each cardinal face.
    const wa = (i / 4) * Math.PI * 2;
    b.prop('glow', stoneBox(0.42, 2.1, 0.16, L(Math.cos(wa) * 2.52, 2.55, Math.sin(wa) * 2.52), { yaw: -wa + Math.PI / 2, bevel: 0.02 }), crystalTint, 1.8);
  }
  // Ribbed octagonal gothic needle spire + iron web cage beacon.
  b.prop('masonry', rod(L(0, 5.0, 0), L(0, 10.2, 0), 2.15, 0.32, 8), 0xffffff);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    b.prop('iron', beam(L(Math.cos(a) * 2.22, 5.0, Math.sin(a) * 2.22), L(Math.cos(a) * 0.34, 10.2, Math.sin(a) * 0.34), 0.08, 0.08), IRON_TRIM);
  }
  b.prop('glow', rod(L(0, 10.0, 0), L(0, 11.4, 0), 0.32, 0.05, 6), crystalTint, 2.5);
  b.prop('iron', rod(L(0, 11.2, 0), L(0, 12.2, 0), 0.06, 0.014, 6), IRON_DARK);
}

/**
 * Ornate Drow market stall: chamfered octagonal basalt posts with iron collars,
 * arched ribbed drow canopy roof with ridge finial, paneled display counter with
 * glowing crystal wares & crates, and a suspended filigree lantern.
 */
export function buildDrowMarketStall(b, at, facing, windowTint) {
  const L = atFrame(at, facing);
  // 4 stepped chamfered corner posts + iron collar rings + knee braces.
  for (const [dx, dz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
    b.prop('masonry', stoneBlock(0.48, 0.32, 0.48, L(dx, 0, dz), { yaw: facing, bevel: 0.03 }), BASALT_TRIM);
    b.prop('masonry', rod(L(dx, 0.3, dz), L(dx, 2.68, dz), 0.17, 0.14, 8), 0xffffff);
    b.prop('iron', rod(L(dx, 2.2, dz), L(dx, 2.3, dz), 0.17, 0.17, 8), IRON_TRIM);
    b.prop('iron', beam(L(dx, 2.12, dz), L(dx * 0.68, 2.66, dz), 0.045, 0.045), IRON_DARK);
  }
  // Pitched beveled canopy roof with arched timber/iron ribs & ridge finial.
  b.prop('masonry', stoneBox(4.0, 0.18, 3.1, L(0, 2.74, 0), { yaw: facing, bevel: 0.03 }), BASALT_TRIM);
  for (const side of [-1, 1]) {
    b.prop('loam', panel(
      L(-2.05, 2.78, side * 1.62), L(2.05, 2.78, side * 1.62),
      P(0, 0.48, -side * 0.88), 1.72, 0.08,
    ), 0x3a2c48);
  }
  b.prop('iron', hewnBeam(L(-2.15, 3.42, 0), L(2.15, 3.42, 0), 0.08, 0.09, { bevel: 0.015 }), IRON_TRIM);
  for (const sx of [-2.18, 2.18]) {
    b.prop('iron', rod(L(sx, 3.42, 0), L(sx, 3.88, 0), 0.045, 0.012, 6), BRONZE_ACCENT);
  }

  // Paneled trade counter with beveled top slab, display crystal jars & storage crates.
  b.prop('timber', stoneBox(2.7, 0.88, 0.96, L(0, 0.44, 0), { yaw: facing, bevel: 0.03 }), 0x4b3a2c);
  b.prop('masonry', stoneBox(2.86, 0.1, 1.12, L(0, 0.92, 0), { yaw: facing, bevel: 0.02 }), BASALT_TRIM);
  for (const [gx, gz, h] of [[-0.85, 0.12, 0.34], [-0.42, -0.1, 0.26], [0.68, 0.08, 0.38]]) {
    b.prop('glow', rod(L(gx, 0.97, gz), L(gx, 0.97 + h, gz), 0.075, 0.025, 6), '#79e3c4', 1.5);
  }
  b.prop('timber', stoneBox(0.58, 0.48, 0.52, L(-0.95, 0.24, -0.78), { yaw: facing + 0.2, bevel: 0.02 }), 0x5c4635);
  b.prop('timber', stoneBox(0.52, 0.42, 0.48, L(0.92, 0.21, -0.74), { yaw: facing - 0.15, bevel: 0.02 }), 0x544030);

  // Suspended filigree stall lantern.
  b.prop('iron', rod(L(0, 3.38, 0), L(0, 2.52, 0), 0.022, 0.022, 6), IRON_DARK);
  lantern(b, L(0, 2.28, 0), { tint: windowTint, intensity: 2.4, range: 9, halo: 1.1 });
  b.nav.block(at, 2.1, 3);
}

/**
 * Drow compound curtain wall with rhythmic buttress pilasters, beveled coping,
 * wrought-iron spear cresting, twin spire-capped gate piers, and spider-lattice portcullis.
 */
export function buildDrowCompoundWallAndGate(b, east) {
  const wallX = east.x - 3.5;
  const baseY = east.y;
  // Stepped beveled wall segments + rhythmic pilasters + iron spear cresting.
  for (let z = east.z - 20; z <= east.z + 7; z += 4.5) {
    b.prop('masonry', stoneBox(0.96, 3.1, 4.55, P(wallX, baseY + 1.55, z + 2.25), { bevel: 0.05 }), 0xffffff);
    b.prop('masonry', stoneBox(1.18, 0.28, 4.6, P(wallX, baseY + 3.2, z + 2.25), { bevel: 0.04 }), BASALT_TRIM);
    // Pilaster buttress + spire cap every 4.5 m.
    b.prop('masonry', stoneBlock(1.32, 3.45, 0.86, P(wallX, baseY, z), { bevel: 0.04, batter: 0.05 }), BASALT_TRIM);
    b.prop('masonry', rod(P(wallX, baseY + 3.45, z), P(wallX, baseY + 4.35, z), 0.36, 0.05, 6), BASALT_TRIM);
    // Wrought-iron fence spears along the coping.
    for (let sz = z + 0.75; sz < z + 4.2; sz += 0.65) {
      b.prop('iron', rod(P(wallX, baseY + 3.32, sz), P(wallX, baseY + 3.92, sz), 0.032, 0.01, 5), IRON_DARK);
    }
    b.prop('iron', hewnBeam(P(wallX, baseY + 3.68, z + 0.4), P(wallX, baseY + 3.68, z + 4.1), 0.04, 0.04), IRON_TRIM);
  }
  // Twin compound gatehouse piers + pointed spire caps + spider-lattice iron gate.
  for (const gz of [east.z + 9.8, east.z + 13.4]) {
    b.prop('masonry', stoneBlock(1.88, 0.48, 1.88, P(wallX, baseY, gz), { bevel: 0.05 }), BASALT_TRIM);
    b.prop('masonry', stoneBlock(1.62, 4.4, 1.62, P(wallX, baseY + 0.45, gz), { bevel: 0.04, batter: 0.04 }), 0xffffff);
    b.prop('masonry', stoneBox(1.86, 0.34, 1.86, P(wallX, baseY + 4.95, gz), { bevel: 0.04 }), BASALT_TRIM);
    b.prop('masonry', rod(P(wallX, baseY + 5.12, gz), P(wallX, baseY + 6.75, gz), 0.56, 0.06, 6), BASALT_TRIM);
  }
  b.prop('masonry', arch(3.6, 1.35, 1.25, 0.44, P(wallX, baseY + 4.65, east.z + 11.6), { yaw: Math.PI / 2, segments: 10 }), BASALT_TRIM);
  // Forged vertical spear bars + horizontal rails + central medallion ring.
  const gateZ = east.z + 11.6;
  for (let dz = -1.1; dz <= 1.1; dz += 0.275) {
    b.prop('iron', rod(P(wallX, baseY + 0.05, gateZ + dz), P(wallX, baseY + 3.45, gateZ + dz), 0.032, 0.018, 6), IRON_DARK);
  }
  for (const gy of [0.45, 1.65, 2.95]) {
    b.prop('iron', hewnBeam(P(wallX, baseY + gy, gateZ - 1.2), P(wallX, baseY + gy, gateZ + 1.2), 0.08, 0.08), IRON_TRIM);
  }
  b.prop('iron', rod(P(wallX - 0.08, baseY + 1.65, gateZ), P(wallX + 0.08, baseY + 1.65, gateZ), 0.38, 0.38, 10), BRONZE_ACCENT);

  for (let z = east.z - 20; z <= east.z + 7; z += 0.9) b.nav.block(P(wallX, baseY, z), 0.7, 4);
  b.nav.block(P(wallX, baseY, gateZ), 1.4, 4);
}

/** Ornate Drow street lamp post: beveled basalt plinth, fluted iron shaft, scroll bracket & lantern. */
export function buildDrowLampPost(b, at, windowTint) {
  b.prop('masonry', rod(P(at.x, at.y - 0.05, at.z), P(at.x, at.y + 0.42, at.z), 0.34, 0.24, 8), BASALT_TRIM);
  b.prop('iron', rod(P(at.x, at.y + 0.4, at.z), P(at.x, at.y + 2.92, at.z), 0.062, 0.042, 8), IRON_DARK);
  b.prop('iron', rod(P(at.x, at.y + 1.45, at.z), P(at.x, at.y + 1.56, at.z), 0.082, 0.082, 8), IRON_TRIM);
  b.prop('iron', hewnBeam(P(at.x, at.y + 2.42, at.z), P(at.x + 0.34, at.y + 2.86, at.z), 0.045, 0.05), IRON_TRIM);
  b.prop('iron', rod(P(at.x, at.y + 2.9, at.z), P(at.x, at.y + 3.25, at.z), 0.045, 0.012, 6), BRONZE_ACCENT);
  lantern(b, P(at.x + 0.32, at.y + 2.66, at.z), { tint: windowTint, intensity: 5, range: 14, halo: 1.4, hung: 0.14 });
  b.nav.block(at, 0.38, 3.2);
}

/**
 * Arched stone aqueduct feeding the fungus beds: stepped beveled piers with corbel caps,
 * masonry arches spanning between piers, channeled trough walls, and seepage fungus.
 */
export function buildDrowAqueduct(b, beds, range) {
  const aqZ = beds.z - 8.6;
  // Channeled stone trough (floor + twin side parapet walls) framing the glowing water.
  b.prop('masonry', stoneBox(46.2, 0.48, 1.42, P(beds.x, beds.y + 1.45, aqZ), { bevel: 0.04 }), 0xffffff);
  for (const dz of [-0.56, 0.56]) {
    b.prop('masonry', stoneBox(46.2, 0.56, 0.28, P(beds.x, beds.y + 1.92, aqZ + dz), { bevel: 0.03 }), BASALT_TRIM);
  }
  b.prop('water', box(45.6, 0.05, 0.82, P(beds.x, beds.y + 2.02, aqZ)));

  for (let x = -21; x <= 21; x += 6) {
    const px = beds.x + x;
    b.prop('masonry', stoneBlock(1.25, 0.32, 1.38, P(px, beds.y - 0.06, aqZ), { bevel: 0.04 }), BASALT_TRIM);
    b.prop('masonry', stoneBlock(0.96, 1.05, 1.12, P(px, beds.y + 0.24, aqZ), { bevel: 0.03, batter: 0.04 }), 0xffffff);
    b.prop('masonry', stoneBox(1.18, 0.2, 1.32, P(px, beds.y + 1.28, aqZ), { bevel: 0.03 }), BASALT_TRIM);
    if (x < 21) {
      b.prop('masonry', arch(5.4, 0.85, 1.08, 0.32, P(px + 3, beds.y + 0.88, aqZ), { yaw: 0, segments: 8 }), BASALT_TRIM);
    }
    // Carved overflow spout + wild seepage fungus.
    b.prop('masonry', stoneBox(0.28, 0.16, 0.48, P(px, beds.y + 1.88, aqZ + 0.78), { bevel: 0.02 }), BASALT_TRIM);
    b.prop('glow', shelfBrackets(P(px + b.range(-0.2, 0.2), beds.y + b.range(0.35, 0.7), beds.z - 8.02), 0, 2 + Math.floor(b.range(0, 3)), range), 0xffffff, 0.7);
    const fx = px + b.range(-0.6, 0.6), fz = beds.z - b.range(7.6, 7.85);
    const ground = b.terrainAt(fx, beds.y + 1, fz) ?? beds.y;
    b.prop('glow', bellCluster(P(fx, ground - 0.02, fz), 4 + Math.floor(b.range(0, 4)), range), 0xffffff, 0.8);
  }
}

/** Heavy Drow warden portcullis gate in the deep passage: basalt jambs, spiked lintel, iron bars & ward rune. */
export function buildDrowWardenGate(b, wardenGate) {
  const dirX = 0.3, dirZ = 0.56;
  const yaw = Math.atan2(-dirZ, dirX);
  // Flanking carved basalt jamb piers + beveled header lintel.
  for (const s of [-3.6, 3.6]) {
    const jAt = P(wardenGate.x + dirX * s, wardenGate.y, wardenGate.z + dirZ * s);
    b.prop('masonry', stoneBlock(0.95, 4.65, 0.95, jAt, { yaw, bevel: 0.04, batter: 0.04 }), BASALT_TRIM);
    b.prop('iron', rod(P(jAt.x, jAt.y + 1.2, jAt.z), P(jAt.x, jAt.y + 1.38, jAt.z), 0.56, 0.56, 6), IRON_TRIM);
  }
  b.prop('masonry', stoneBox(4.8, 0.52, 0.88, P(wardenGate.x, wardenGate.y + 4.48, wardenGate.z), { yaw, bevel: 0.04 }), BASALT_TRIM);

  // Heavy forged iron spear bars + triple riveted cross rails + glowing ward sigil.
  for (let index = -3; index <= 3; index += 1) {
    const at = P(wardenGate.x + index * dirX, wardenGate.y, wardenGate.z + index * dirZ);
    b.prop('iron', rod(at, P(at.x, at.y + 4.3, at.z), 0.055, 0.055, 6), IRON_DARK);
    b.prop('iron', rod(P(at.x, at.y + 0.08, at.z), P(at.x, at.y - 0.14, at.z), 0.055, 0.015, 5), IRON_TRIM);
  }
  for (const y of [0.55, 2.2, 3.85]) {
    b.prop('iron', hewnBeam(
      P(wardenGate.x - 1.05, wardenGate.y + y, wardenGate.z - 1.96),
      P(wardenGate.x + 1.05, wardenGate.y + y, wardenGate.z + 1.96),
      0.11, 0.12, { bevel: 0.015 },
    ), IRON_TRIM);
  }
  b.prop('glow', rod(P(wardenGate.x, wardenGate.y + 2.0, wardenGate.z), P(wardenGate.x, wardenGate.y + 2.55, wardenGate.z), 0.16, 0.04, 6), '#9b7ef0', 1.8);
  b.nav.block(wardenGate, 2.4, 5);
}
