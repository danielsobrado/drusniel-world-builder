import { facetedCrystal } from '../gen/iceKit.js';
import { box, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { DARK, LOG, PALE, STONE } from './frostgardKit.js';
import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const GLACIER_SKIRT = Object.freeze({ skirtMat: 'iceBlock', skirtTint: 0xd8ecfc });

/** 1. Cathedral cluster of fluted clear-ice hexagonal organ pipes fused along a fractured basal lens. */
export function buildOrganPipeIceFormation(b, at, scale = 1.0) {
  emitDetailedUndergroundProp(b, at, GLACIER_SKIRT, (p) => {
    const s = scale;
    const pipes = [
      [0, 0, 3.8, 0.30, 0.04, 0.03], [-0.42, 0.25, 3.05, 0.21, -0.06, 0.05], [0.44, 0.2, 3.25, 0.23, 0.08, 0.04],
      [-0.3, -0.36, 2.6, 0.19, -0.05, -0.07], [0.32, -0.34, 2.8, 0.20, 0.06, -0.06], [-0.72, -0.05, 2.0, 0.16, -0.14, 0.0],
      [0.74, -0.08, 2.15, 0.17, 0.15, -0.02], [0.02, 0.56, 2.45, 0.18, 0.01, 0.12], [-0.04, -0.58, 2.25, 0.17, -0.02, -0.13],
    ];
    p.prop('iceBlock', rod(P(at.x, at.y - 0.32 * s, at.z), P(at.x, at.y + 0.14 * s, at.z), 1.48 * s, 1.12 * s, 8), 0xffffff);
    p.prop('iceBlock', rod(P(at.x, at.y - 0.18, at.z), P(at.x, at.y + 0.38 * s, at.z), 1.12 * s, 0.88 * s, 7), 0xffffff);
    pipes.forEach(([dx, dz, h, r, lx, lz], idx) => {
      const px = at.x + dx * s;
      const pz = at.z + dz * s;
      p.prop('clearIce', facetedCrystal(
        P(px, at.y - 0.08, pz),
        P(px + lx * s, at.y + h * s, pz + lz * s),
        r * s,
        { sides: 6, taper: 0.66, tipRatio: 0.22, twist: 0.06, seed: idx + 11, flare: 1.14 },
      ), 0xffffff);
    });
    p.nav.block(at, 1.1 * s, 3.8 * s);
  });
}

/** 2. Radial hoarfrost blue-ice hexagonal crystal rose bursting from a fractured basal lens. */
export function buildHoarfrostRoseCluster(b, at, scale = 1.0) {
  emitDetailedUndergroundProp(b, at, GLACIER_SKIRT, (p) => {
    const s = scale;
    p.prop('iceBlock', rod(P(at.x, at.y - 0.28 * s, at.z), P(at.x, at.y + 0.10 * s, at.z), 1.06 * s, 0.76 * s, 7), 0xffffff);
    p.prop('iceBlock', rod(P(at.x, at.y - 0.12, at.z), P(at.x, at.y + 0.26 * s, at.z), 0.76 * s, 0.58 * s, 6), 0xffffff);
    // Hero central hexagonal spire + outer radial faceted crystal blades.
    p.prop('clearIce', facetedCrystal(
      P(at.x, at.y + 0.06 * s, at.z),
      P(at.x + 0.06 * s, at.y + 1.85 * s, at.z - 0.05 * s),
      0.24 * s,
      { sides: 6, taper: 0.62, tipRatio: 0.30, seed: 3, flare: 1.15 },
    ), 0xffffff);
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      const len = (1.15 + (i % 3) * 0.42) * s;
      p.prop('clearIce', facetedCrystal(
        P(at.x + Math.cos(a) * 0.16 * s, at.y + 0.08 * s, at.z + Math.sin(a) * 0.16 * s),
        P(at.x + Math.cos(a) * (0.34 + len * 0.66), at.y + len * 0.88, at.z + Math.sin(a) * (0.34 + len * 0.66)),
        0.17 * s,
        { sides: 6, taper: 0.55, tipRatio: 0.34, seed: i * 17 + 5, flare: 1.12 },
      ), 0xffffff);
    }
    p.nav.block(at, 0.95 * s, 1.85 * s);
  });
}

/** 3. Sculpted hourglass meltwater drip-column capped by frozen umbrella shelves. */
export function buildFrozenMeltMushroomColumn(b, at, scale = 1.0) {
  emitDetailedUndergroundProp(b, at, GLACIER_SKIRT, (p) => {
    const s = scale;
    p.prop('clearIce', rod(P(at.x, at.y - 0.1, at.z), P(at.x, at.y + 1.4 * s, at.z), 0.62 * s, 0.28 * s, 10), 0xffffff);
    p.prop('clearIce', rod(P(at.x, at.y + 1.4 * s, at.z), P(at.x, at.y + 2.8 * s, at.z), 0.28 * s, 0.85 * s, 10), 0xffffff);
    p.prop('iceBlock', rod(P(at.x, at.y + 2.75 * s, at.z), P(at.x, at.y + 3.15 * s, at.z), 1.32 * s, 0.96 * s, 10), 0xffffff);
    p.nav.block(at, 0.72 * s, 3.2 * s);
  });
}

/** 4. Stone cairn ice-anchor mooring post braced with crossed timber stakes & rope coil. */
export function buildBoneMooringAnchor(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, { skirtMat: 'masonry', skirtTint: STONE }, (p) => {
    const L = atFrame(at, yaw);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      p.prop('masonry', stoneBlock(0.45, 0.36, 0.42, L(Math.cos(a) * 0.38, -0.04, Math.sin(a) * 0.38), { yaw: a, bevel: 0.06, irregular: 0.6 }), STONE);
    }
    p.prop('timber', rod(L(-0.22, -0.1, 0), L(0.26, 1.25, 0), 0.09, 0.075, 7), LOG);
    p.prop('timber', rod(L(0.28, -0.1, 0), L(-0.22, 1.15, 0), 0.085, 0.07, 7), DARK);
    p.prop('timber', rod(L(0, 0.56, -0.22), L(0, 0.62, 0.24), 0.22, 0.2, 8), PALE);
    p.nav.block(at, 0.7, 1.4);
  });
}

/** 5. Hollow cut ice-block sanctuary shrine sheltering a wind-shielded ember flame. */
export function buildRunicIceLanternShrine(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, { skirtMat: 'masonry', skirtTint: STONE }, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', stoneBox(1.15, 0.42, 1.15, L(0, 0.2, 0), { yaw, bevel: 0.05 }), STONE);
    for (const sx of [-0.36, 0.36]) {
      p.prop('clearIce', stoneBox(0.22, 0.88, 0.76, L(sx, 0.84, 0), { yaw, bevel: 0.03 }), 0xffffff);
    }
    p.prop('clearIce', stoneBox(0.96, 0.28, 0.88, L(0, 1.42, 0), { yaw, bevel: 0.04 }), 0xffffff);
    p.prop('roof', stoneBox(1.06, 0.14, 0.96, L(0, 1.62, 0), { yaw, bevel: 0.03 }), 0xffffff);
    p.prop('iron', rod(L(0, 0.42, 0), L(0, 0.66, 0), 0.18, 0.22, 8), 0x2b2e36);
    p.prop('glow', box(0.18, 0.2, 0.18, L(0, 0.72, 0), yaw), '#ffae52', 2.4);
    p.light(L(0, 0.88, 0), '#ffae52', 3.4, 13, { halo: 0.85, flicker: 0.12 });
    p.nav.block(at, 0.75, 1.8);
  });
}
