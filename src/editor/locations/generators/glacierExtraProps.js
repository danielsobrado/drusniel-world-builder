import { box, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { DARK, LOG, PALE, STONE } from './frostgardKit.js';
import { atFrame } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });

/** 1. Cathedral cluster of fluted clear-ice organ pipes fused along frozen flow flutes. */
export function buildOrganPipeIceFormation(b, at, scale = 1.0) {
  const s = scale;
  const pipes = [
    [0, 0, 3.6, 0.28], [-0.42, 0.25, 2.9, 0.2], [0.44, 0.2, 3.1, 0.22],
    [-0.3, -0.36, 2.5, 0.18], [0.32, -0.34, 2.7, 0.19], [-0.72, -0.05, 1.9, 0.15],
    [0.74, -0.08, 2.05, 0.16], [0.02, 0.56, 2.35, 0.17], [-0.04, -0.58, 2.15, 0.16],
  ];
  b.prop('iceBlock', rod(P(at.x, at.y - 0.2, at.z), P(at.x, at.y + 0.35 * s, at.z), 1.15 * s, 0.92 * s, 9), 0xffffff);
  for (const [dx, dz, h, r] of pipes) {
    const px = at.x + dx * s;
    const pz = at.z + dz * s;
    b.prop('clearIce', rod(P(px, at.y, pz), P(px, at.y + h * s, pz), r * s, r * 0.45 * s, 8), 0xffffff);
  }
  b.nav.block(at, 1.1 * s, 3.6 * s);
}

/** 2. Radial hoarfrost blue-ice crystal rose bursting from a fractured basal lens. */
export function buildHoarfrostRoseCluster(b, at, scale = 1.0) {
  const s = scale;
  b.prop('iceBlock', rod(P(at.x, at.y - 0.12, at.z), P(at.x, at.y + 0.24 * s, at.z), 0.78 * s, 0.62 * s, 7), 0xffffff);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const len = (1.1 + (i % 3) * 0.4) * s;
    b.prop('clearIce', rod(
      P(at.x + Math.cos(a) * 0.18 * s, at.y + 0.1 * s, at.z + Math.sin(a) * 0.18 * s),
      P(at.x + Math.cos(a) * (0.35 + len * 0.65), at.y + len * 0.88, at.z + Math.sin(a) * (0.35 + len * 0.65)),
      0.16 * s,
      0.03 * s,
      6,
    ), 0xffffff);
  }
  b.nav.block(at, 0.95 * s, 1.6 * s);
}

/** 3. Sculpted hourglass meltwater drip-column capped by frozen umbrella shelves. */
export function buildFrozenMeltMushroomColumn(b, at, scale = 1.0) {
  const s = scale;
  b.prop('clearIce', rod(P(at.x, at.y - 0.1, at.z), P(at.x, at.y + 1.4 * s, at.z), 0.62 * s, 0.28 * s, 10), 0xffffff);
  b.prop('clearIce', rod(P(at.x, at.y + 1.4 * s, at.z), P(at.x, at.y + 2.8 * s, at.z), 0.28 * s, 0.85 * s, 10), 0xffffff);
  b.prop('iceBlock', rod(P(at.x, at.y + 2.75 * s, at.z), P(at.x, at.y + 3.15 * s, at.z), 1.32 * s, 0.96 * s, 10), 0xffffff);
  b.nav.block(at, 0.72 * s, 3.2 * s);
}

/** 4. Stone cairn ice-anchor mooring post braced with crossed timber stakes & rope coil. */
export function buildBoneMooringAnchor(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    b.prop('masonry', stoneBlock(0.45, 0.36, 0.42, L(Math.cos(a) * 0.38, -0.04, Math.sin(a) * 0.38), { yaw: a, bevel: 0.06, irregular: 0.6 }), STONE);
  }
  b.prop('timber', rod(L(-0.22, -0.1, 0), L(0.26, 1.25, 0), 0.09, 0.075, 7), LOG);
  b.prop('timber', rod(L(0.28, -0.1, 0), L(-0.22, 1.15, 0), 0.085, 0.07, 7), DARK);
  b.prop('timber', rod(L(0, 0.56, -0.22), L(0, 0.62, 0.24), 0.22, 0.2, 8), PALE);
  b.nav.block(at, 0.7, 1.4);
}

/** 5. Hollow cut ice-block sanctuary shrine sheltering a wind-shielded ember flame. */
export function buildRunicIceLanternShrine(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', stoneBox(1.15, 0.42, 1.15, L(0, 0.2, 0), { yaw, bevel: 0.05 }), STONE);
  for (const sx of [-0.36, 0.36]) {
    b.prop('clearIce', stoneBox(0.22, 0.88, 0.76, L(sx, 0.84, 0), { yaw, bevel: 0.03 }), 0xffffff);
  }
  b.prop('clearIce', stoneBox(0.96, 0.28, 0.88, L(0, 1.42, 0), { yaw, bevel: 0.04 }), 0xffffff);
  b.prop('roof', stoneBox(1.06, 0.14, 0.96, L(0, 1.62, 0), { yaw, bevel: 0.03 }), 0xffffff);
  b.prop('iron', rod(L(0, 0.42, 0), L(0, 0.66, 0), 0.18, 0.22, 8), 0x2b2e36);
  b.prop('glow', box(0.18, 0.2, 0.18, L(0, 0.72, 0), yaw), '#ffae52', 2.4);
  b.light(L(0, 0.88, 0), '#ffae52', 3.4, 13, { halo: 0.85, flicker: 0.12 });
  b.nav.block(at, 0.75, 1.8);
}
