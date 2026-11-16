import { box, hewnBeam, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { DARK, LOG, PALE, STONE, torch } from './frostgardKit.js';
import { atFrame } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });

/** 1. Carved Frostgard gate-totem post with horned wolf-skull finial & iron ember basket. */
export function buildWolfTotemPalisadePost(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', stoneBlock(0.78, 0.42, 0.78, L(0, -0.04, 0), { yaw, bevel: 0.06 }), STONE);
  b.prop('timber', rod(L(0, 0.36, 0), L(0, 2.75, 0), 0.16, 0.13, 8), LOG);
  b.prop('timber', stoneBox(0.42, 0.34, 0.62, L(0, 2.52, 0.18), { yaw, bevel: 0.03 }), PALE);
  for (const sx of [-1, 1]) {
    b.prop('timber', rod(L(sx * 0.18, 2.66, 0.06), L(sx * 0.48, 3.08, -0.08), 0.06, 0.015, 6), PALE);
  }
  torch(b, L(0.32, 0.0, 0.24), { height: 1.8, intensity: 2.8, range: 11 });
  b.nav.block(at, 0.65, 3.1);
}

/** 2. Braced tripod ice-block hoist lifting a strapped block of clear glacier ice onto sled. */
export function buildCutIceBlockHoist(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + yaw;
    b.prop('timber', rod(
      P(at.x + Math.cos(a) * 1.15, at.y - 0.05, at.z + Math.sin(a) * 1.15),
      P(at.x, at.y + 2.65, at.z),
      0.085,
      0.065,
      7,
    ), LOG);
  }
  b.prop('iron', rod(L(0, 1.28, 0), L(0, 2.6, 0), 0.025, 0.025, 6), 0x2e3138);
  b.prop('clearIce', stoneBox(0.76, 0.58, 0.76, L(0, 1.0, 0), { yaw, bevel: 0.03 }), 0xffffff);
  b.prop('iron', stoneBox(0.84, 0.1, 0.1, L(0, 1.0, 0), { yaw, bevel: 0.01 }), 0x3b3f48);
  b.prop('planks', stoneBox(1.28, 0.16, 1.18, L(0, 0.12, 0), { yaw, bevel: 0.02 }), DARK);
  b.nav.block(at, 1.25, 2.7);
}

/** 3. Heavy hall banquet trestle & trophy weapon crossbar with carved tankards & kettle. */
export function buildMeadHallTrophyStand(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  for (const sx of [-0.72, 0.72]) {
    b.prop('timber', stoneBox(0.16, 0.76, 0.78, L(sx, 0.38, 0), { yaw, bevel: 0.02 }), DARK);
  }
  b.prop('planks', stoneBox(1.88, 0.12, 0.88, L(0, 0.82, 0), { yaw, bevel: 0.02 }), LOG);
  for (const tx of [-0.52, 0.0, 0.56]) {
    b.prop('timber', rod(L(tx, 0.88, 0.14), L(tx, 1.1, 0.14), 0.075, 0.065, 7), PALE);
  }
  b.prop('iron', rod(L(0.24, 0.88, -0.14), L(0.24, 1.24, -0.14), 0.2, 0.18, 8), 0x383c44);
  b.nav.block(at, 1.05, 1.3);
}

/** 4. Tiered timber salt-brine curing cask rack under slatted snow-shed gable. */
export function buildSaltBrineCaskFrame(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  for (const sx of [-0.75, 0.75]) {
    for (const sz of [-0.42, 0.42]) {
      b.prop('timber', hewnBeam(L(sx, -0.05, sz), L(sx, 1.68, sz), 0.13, 0.13), DARK);
    }
  }
  b.prop('roof', stoneBox(1.92, 0.14, 1.18, L(0, 1.72, 0), { yaw, bevel: 0.03 }), 0xffffff);
  for (const cx of [-0.36, 0.36]) {
    b.prop('timber', rod(L(cx, 0.52, -0.36), L(cx, 0.52, 0.36), 0.25, 0.25, 9), LOG);
    b.prop('timber', rod(L(cx, 1.12, -0.36), L(cx, 1.12, 0.36), 0.24, 0.24, 9), LOG);
  }
  b.nav.block(at, 1.05, 1.8);
}

/** 5. Dual watchman iron fire-brazier posts flanking a lean-to shield rack & quiver bin. */
export function buildWatchmanBraziersGate(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', stoneBlock(1.85, 0.36, 0.74, L(0, -0.04, 0), { yaw, bevel: 0.04 }), STONE);
  b.prop('timber', stoneBox(1.1, 0.72, 0.46, L(0, 0.68, 0), { yaw, bevel: 0.02 }), DARK);
  for (const sx of [-0.76, 0.76]) {
    b.prop('iron', rod(L(sx, 0.32, 0), L(sx, 1.56, 0), 0.06, 0.06, 6), 0x2c3038);
    b.prop('iron', rod(L(sx, 1.54, 0), L(sx, 1.78, 0), 0.12, 0.26, 8), 0x2c3038);
    b.prop('glow', box(0.22, 0.18, 0.22, L(sx, 1.78, 0), yaw), '#ff923a', 2.4);
    b.light(L(sx, 1.94, 0), '#ff9c48', 3.0, 13, { halo: 0.75 });
  }
  b.nav.block(at, 1.05, 2.0);
}
