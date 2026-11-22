import { hangingBannerMesh } from '../gen/clothKit.js';
import { coursedMasonryWall, emitRadialArch } from '../gen/dwarvenMasonry.js';
import { boulder } from '../gen/iceKit.js';
import { box, extrudedProfile, hewnBeam, stoneBlock, stoneBox } from '../gen/propKit.js';
import { hall } from '../gen/shapes.js';
import { buildHeraldicBanner, buildMonumentalBrazier } from './stoneholdDressing.js';

/**
 * Stonehold — The High King's Throne Hall (Ref 2).
 *
 * A towering dark-basalt vaulted sanctuary anchored by a cantilevered geometric
 * chevron rock wall, a broad stepped dais crowned by a monolithic angular stone
 * throne, twin roaring fire braziers, crimson-and-gold heraldic banners on carved
 * relief piers, flanking treasury hoards, and a real-time reflective veined stone
 * floor mirroring firelight across the entire nave.
 */

export const bounds = { min: { x: -24, y: -4, z: -42 }, max: { x: 24, y: 32, z: 22 } };

const P = (x, y, z) => ({ x, y, z });
const ALONG_Z = Math.PI / 2;

/** Builds a vertical carved geometric knotwork relief panel mounted on a column face. */
function buildColumnReliefPanel(b, at, yaw = 0, height = 8.4) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, ly, lz) => P(at.x + c * lx + s * lz, at.y + ly, at.z - s * lx + c * lz);
  const panelPts = [[-0.95, height * 0.5], [0.95, height * 0.5], [0.95, -height * 0.36], [0, -height * 0.5], [-0.95, -height * 0.36]];
  b.prop('carved', extrudedProfile(panelPts, 0.28, { bevel: 0.05, yaw, at: L(0, 0, 0) }), 0xb5aba0);
  const innerPts = panelPts.map(([px, py]) => [px * 0.82, py * 0.86]);
  b.prop('bronze', extrudedProfile(innerPts, 0.16, { bevel: 0.025, yaw, at: L(0, 0, 0.14) }), 0xc8a060);
  for (let i = -2; i <= 2; i += 1) {
    const cy = i * 1.45;
    const dPts = [[0, 0.56], [0.56, 0], [0, -0.56], [-0.56, 0]];
    b.prop('carved', extrudedProfile(dPts, 0.20, { bevel: 0.02, yaw, at: L(0, cy, 0.22) }), 0xd2c4b0);
  }
}

/** Builds a massive squared Dwarven sanctuary pier with molded base, relief panels, and corbelled capital. */
function buildThronePier(b, x, z, height = 17.5) {
  const inYaw = x < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const inDir = x < 0 ? 1 : -1;
  b.prop('masonry', stoneBlock(3.8, 1.35, 3.8, P(x, 0, z), { bevel: 0.10, batter: 0.10 }), 0x8d8882);
  b.prop('carved', stoneBlock(3.3, 0.65, 3.3, P(x, 1.35, z), { bevel: 0.08, batter: 0.06 }), 0xa49d94);
  b.prop('carved', stoneBlock(2.9, height - 3.6, 2.9, P(x, 2.0, z), { bevel: 0.09, irregular: 0.03 }), 0x9b958e);
  // Moulded corbelled entablature capital.
  b.prop('carved', stoneBlock(3.35, 0.72, 3.35, P(x, height - 1.6, z), { bevel: 0.08, batter: -0.10 }), 0xb0a89e);
  b.prop('bronze', stoneBox(3.45, 0.22, 3.45, P(x, height - 0.85, z), { bevel: 0.03 }), 0xd4aa62);
  b.prop('carved', stoneBlock(3.95, 0.85, 3.95, P(x, height - 0.75, z), { bevel: 0.09, batter: -0.08 }), 0xb8b0a5);
  // Inner-facing and front-facing carved relief plaques (Ref 2 foreground pillars).
  buildColumnReliefPanel(b, P(x + inDir * 1.48, 8.8, z), inYaw, 8.2);
  buildColumnReliefPanel(b, P(x, 8.8, z + 1.48), 0, 8.2);
}

/**
 * Towering cantilevered geometric chevron stone backdrop rising behind the throne (Ref 2).
 */
function buildChevronBackdrop(b, zWall) {
  // Deep recessed dark carved rear cliff slabs.
  b.prop('masonry', stoneBlock(28, 25, 2.4, P(0, 0, zWall - 3.6), { bevel: 0.12 }), 0x454448);

  // Stacked vertical geometric basalt monolith piers framing the central chevron recess,
  // separated by recessed warm amber forged-ember architectural light fissures (eliminates rear black void!).
  const stacks = [
    [-9.5, 0, 22, 3.4, 2.8, 0x625f60],
    [9.5, 0, 22, 3.4, 2.8, 0x625f60],
    [-6.2, 0, 19.5, 2.8, 3.2, 0x746f6c],
    [6.2, 0, 19.5, 2.8, 3.2, 0x746f6c],
    [-3.2, 1.5, 17.0, 2.2, 2.6, 0x827c76],
    [3.2, 1.5, 17.0, 2.2, 2.6, 0x827c76],
  ];
  for (const [sx, sy, sh, sw, sd, tint] of stacks) {
    b.prop('carved', stoneBlock(sw, sh, sd, P(sx, sy, zWall - 1.5), { bevel: 0.12, batter: 0.03, irregular: 0.14 }), tint);
    // Gilded bronze vertical runic inlay trim catching the warm dais firelight.
    b.prop('bronze', stoneBlock(0.24, sh * 0.72, 0.2, P(sx, sy + sh * 0.12, zWall - 1.5 + sd * 0.5 + 0.04), { bevel: 0.02 }), 0xc89e56);
  }
  // Hidden warm amber architectural uplights washing the towering basalt monoliths & chevrons (no glowing laser tubes!).
  for (const fx of [-7.8, -4.6, 4.6, 7.8]) {
    b.light(P(fx, 8.8, zWall - 0.6), '#ff9c42', 6.4, 22, { flat: true });
  }
  b.light(P(0, 11.2, zWall + 1.8), '#ffaa54', 8.5, 26, { flat: true });

  // Three monumental downward-pointing cantilevered V-chevron monoliths stepping up above the throne.
  const chevrons = [
    { y: 12.8, halfW: 5.2, drop: 3.6, thick: 1.45, depth: 2.8, zOff: 0.65, tint: 0x9b9286, bronze: true },
    { y: 17.4, halfW: 6.8, drop: 4.5, thick: 1.65, depth: 3.2, zOff: 1.05, tint: 0x867f78, bronze: true },
    { y: 22.6, halfW: 8.6, drop: 5.2, thick: 1.85, depth: 3.4, zOff: 1.35, tint: 0x6c6866, bronze: false },
  ];
  for (const ch of chevrons) {
    const pts = [
      [-ch.halfW, ch.drop],
      [0, 0],
      [ch.halfW, ch.drop],
      [ch.halfW, ch.drop + ch.thick],
      [0, ch.thick],
      [-ch.halfW, ch.drop + ch.thick],
    ];
    b.prop('carved', extrudedProfile(pts, ch.depth, { bevel: 0.12, at: P(0, ch.y, zWall + ch.zOff) }), ch.tint);
    if (ch.bronze) {
      const bPts = [
        [-ch.halfW * 0.92, ch.drop + 0.18],
        [0, 0.18],
        [ch.halfW * 0.92, ch.drop + 0.18],
        [ch.halfW * 0.92, ch.drop + 0.44],
        [0, 0.44],
        [-ch.halfW * 0.92, ch.drop + 0.44],
      ];
      b.prop('bronze', extrudedProfile(bPts, 0.24, { bevel: 0.03, at: P(0, ch.y, zWall + ch.zOff + ch.depth * 0.5 + 0.12) }), 0xcfa45a);
    }
  }
  // Vertical central faceted spine tying the chevrons into the vault crown.
  b.prop('carved', stoneBlock(2.4, 14.5, 2.2, P(0, 12.0, zWall - 0.4), { bevel: 0.12 }), 0x8c847a);
}

/**
 * Monumental angular Dwarven High King's Throne on a broad stepped stone dais (Ref 2).
 */
function buildRoyalThrone(b, at) {
  const x = at.x, y = at.y, z = at.z;

  // Stepped monolithic plinth directly under the throne seat.
  b.prop('carved', stoneBlock(5.4, 0.55, 4.4, P(x, y, z), { bevel: 0.08, batter: 0.06 }), 0xb5a896);

  // Towering geometric faceted throne backrest with shouldered wings (matching Ref 2 silhouette!).
  const backPts = [
    [-2.15, 0],
    [-2.15, 4.9],
    [-1.45, 5.85],
    [-0.85, 5.85],
    [-0.85, 6.45],
    [0, 7.25],
    [0.85, 6.45],
    [0.85, 5.85],
    [1.45, 5.85],
    [2.15, 4.9],
    [2.15, 0],
  ];
  b.prop('carved', extrudedProfile(backPts, 1.35, { bevel: 0.12, at: P(x, y + 0.55, z - 1.15) }), 0xc8b9a4);
  // Inner recessed carved niche & framed stone relief tablet on the backrest.
  const innerPts = [
    [-1.35, 0.6], [-1.35, 4.3], [-0.72, 5.1], [0, 5.75], [0.72, 5.1], [1.35, 4.3], [1.35, 0.6],
  ];
  b.prop('carved', extrudedProfile(innerPts, 0.45, { bevel: 0.06, at: P(x, y + 0.55, z - 0.42) }), 0x8a7d6c);
  b.prop('carved', stoneBox(0.88, 3.8, 0.22, P(x, y + 3.25, z - 0.20), { bevel: 0.04 }), 0xb5a48e);
  b.prop('bronze', stoneBox(1.06, 0.22, 0.28, P(x, y + 5.15, z - 0.18), { bevel: 0.03 }), 0xd8b064);

  // Heavy angled stone seat slab + crimson velvet royal seat drape & backrest tapestry.
  b.prop('carved', stoneBlock(2.85, 1.35, 2.35, P(x, y + 0.55, z + 0.15), { bevel: 0.09, batter: -0.06, irregular: 0.12 }), 0xc2b29c);
  b.prop('carved', stoneBox(3.1, 0.36, 2.55, P(x, y + 1.98, z + 0.22), { bevel: 0.06, irregular: 0.1 }), 0xd4c5ae);
  // Draped deep crimson velvet royal seat runner & backrest tapestry inset cleanly forward of the stone tablet.
  b.prop('cloth', hangingBannerMesh(P(x - 0.88, y + 4.98, z + 0.12), P(x + 0.88, y + 4.98, z + 0.12), 2.75, {
    style: 'heraldic', seed: 911, cols: 16, rows: 16, flutter: 0.04, primaryHex: 0x5c130e, paleHex: 0x1a1416, goldHex: 0xa6803a,
  }), 0xffffff);
  b.prop('cloth', stoneBox(2.25, 0.18, 1.85, P(x, y + 2.22, z + 0.28), { bevel: 0.06, irregular: 0.16 }), 0x5a130e);

  // Twin massive angular stepped arm piers with carved corbels & bronze trim.
  for (const sign of [-1, 1]) {
    const ax = x + sign * 1.72;
    b.prop('carved', stoneBlock(1.05, 2.85, 2.85, P(ax, y + 0.55, z + 0.35), { bevel: 0.10, batter: 0.05, irregular: 0.14 }), 0xcabaa4);
    b.prop('carved', hewnBeam(
      P(ax, y + 3.35, z - 0.95),
      P(ax + sign * 0.28, y + 3.85, z + 1.65),
      0.95, 0.48, { bevel: 0.07, irregular: 0.14 },
    ), 0xd8c9b4);
    b.prop('bronze', stoneBox(1.12, 0.18, 2.75, P(ax, y + 2.35, z + 0.35), { bevel: 0.025 }), 0xd4aa60);
  }

  // Warm golden key light modeling the throne + strong uplights washing the chevron backdrop (Ref 2!).
  b.light(P(x, y + 5.2, z + 3.4), '#ffb45c', 14.0, 26, { radius: 2.2, halo: 0, importance: 1.6 });
  b.light(P(x, y + 7.5, z - 2.2), '#ff9c3c', 16.0, 28, { flat: true });
  b.light(P(x, y + 15.5, z - 1.5), '#8c9eb8', 7.2, 26, { flat: true });
  b.nav.block(at, 3.0, 8.0);
}

/**
 * Gleaming sculpted Dwarven gold coin hills, stacked bullion ingots, gilded shields,
 * and iron-bound treasury coffers flanking the throne dais.
 */
function buildTreasuryHoards(b, daisY, zThrone) {
  for (const sign of [-1, 1]) {
    // Sculpted displaced metallic gold coin mounds (replaces blocky gold pyramids!).
    const clusters = [
      [3.4, 0.0, -0.3, 1.55, 1.35, 1.42],
      [5.2, 0.0, -0.7, 1.95, 1.85, 1.72],
      [7.0, 0.0, -0.1, 1.6, 1.25, 1.38],
      [4.4, 0.0, 1.2, 1.45, 0.92, 1.25],
      [6.2, 0.0, 1.4, 1.35, 0.78, 1.12],
    ];
    for (let idx = 0; idx < clusters.length; idx += 1) {
      const [dx, dy, dz, rx, ry, rz] = clusters[idx];
      b.prop('gold', boulder(P(sign * dx, daisY + dy - ry * 0.2, zThrone + dz), rx, ry, rz, {
        seed: 401 + idx * 31 + (sign > 0 ? 11 : 0),
        blocky: 0.14,
        yaw: sign * (dx * 0.4 + dz * 0.3),
        maxDetail: 4,
      }), 0xffdc78);
    }
    // Scattered gleaming gold bullion bars seated solidly across the gold coin mounds.
    for (let i = 0; i < 14; i += 1) {
      const gx = sign * (3.2 + (i % 4) * 1.15 + (i % 2) * 0.2);
      const gz = zThrone - 0.9 + Math.floor(i / 4) * 0.78 + (i % 3) * 0.18;
      const gy = daisY + 0.26 + (i % 3) * 0.22;
      b.prop('gold', stoneBox(0.56, 0.22, 0.30, P(gx, gy, gz), { yaw: i * 0.85, bevel: 0.035 }), 0xffea9a);
    }
    // Heavy iron-bound Dwarven treasury coffers nestled into the gold mounds.
    for (const [cx, cz, cyaw] of [[3.8, 2.0, 0.25], [5.8, 1.9, -0.35]]) {
      b.prop('timber', stoneBlock(1.42, 0.96, 0.98, P(sign * cx, daisY, zThrone + cz), { yaw: sign * cyaw, bevel: 0.05, irregular: 0.1 }), 0x5c3e26);
      b.prop('gold', stoneBox(1.48, 0.18, 1.04, P(sign * cx, daisY + 0.94, zThrone + cz), { yaw: sign * cyaw, bevel: 0.02 }), 0xffd268);
      b.prop('iron', stoneBox(1.46, 0.14, 1.02, P(sign * cx, daisY + 0.48, zThrone + cz), { yaw: sign * cyaw, bevel: 0.02 }), 0x3b3e45);
    }
    b.light(P(sign * 4.8, daisY + 2.4, zThrone + 1.4), '#ffc258', 14.5, 20, { radius: 2.0, halo: 0, importance: 1.4 });
    b.light(P(sign * 6.5, daisY + 7.2, zThrone - 2.4), '#ffa046', 8.5, 20, { flat: true });
    b.nav.block(P(sign * 5.2, daisY, zThrone + 0.4), 2.8, 2.8);
  }
}

export function generate(b) {
  const halfWidth = 15.5;
  const height = 17.5;
  const vaultRise = 9.0;
  const zFront = 15;
  const zBack = -32;
  const centerZ = (zFront + zBack) * 0.5;
  const halfLen = (zFront - zBack) * 0.5;

  // Carve the soaring cathedral-scale vaulted Throne Hall; sink rough bedrock floor to y = -0.65
  // so the polished real-time reflective ceremonial stone floor at y = 0.0 sits 100% unobstructed.
  b.grid.carve(hall(P(0, -0.65, centerZ), { halfLength: halfLen, halfWidth, height: height + 0.65, vaultRise, yaw: ALONG_Z }));
  b.grid.roughen({ amp: 0.35, scale: 0.38, seed: b.seed, octaves: 2, ampAt: (x, y) => (y < 0.8 ? 0 : 0.08) });

  b.classify = (p, n, mask) => {
    mask[1] = 0;
    mask[2] = Math.max(0, (p.y - 12) / 16) * 0.35;
    mask[3] = 1;
    return 0;
  };

  // --- Walkable Nave Floor & Real-Time Reflective Polished Stone Floor ---
  b.nav.addRect(P(0, 0, 2.5), halfWidth - 2.2, 11.5);
  // Real-time WebGPU reflector mirroring the roaring braziers, golden flames, banners, hoard, and throne!
  b.reflector({
    center: { x: 0, z: 2.0 },
    width: 30.5,
    depth: 28.0,
    y: 0.0,
    baseTint: '#121014',
    veinTint: '#8a6840',
    reflectivity: 0.88,
    resolutionScale: 0.5,
  });

  // --- Broad 6-Step Ceremonial Dais Rising from y = 0 to y = 2.4 m ---
  const stepCount = 6;
  const stepH = 0.40;
  const stepD = 1.05;
  const daisStartZ = -10.2;
  const daisTopY = stepCount * stepH;
  const daisStartTopZ = daisStartZ - stepCount * stepD;
  for (let i = 0; i < stepCount; i += 1) {
    const sy = i * stepH;
    const sz = daisStartZ - i * stepD;
    const sw = 18.6 - i * 0.45;
    b.prop('carved', stoneBlock(sw, stepH, stepD + 0.35, P(0, sy, sz - stepD * 0.5), { bevel: 0.045, irregular: 0.1 }), 0xa89f94);
    b.prop('bronze', stoneBox(sw - 0.6, 0.045, 0.09, P(0, sy + stepH - 0.015, sz - 0.04), { bevel: 0.01 }), 0xcba25e);
    // Draped crimson & gold-trimmed royal velvet carpet runner ascending the center of the dais stairs.
    b.prop('cloth', stoneBox(3.6, 0.04, stepD + 0.14, P(0, sy + stepH + 0.015, sz - stepD * 0.5), { bevel: 0.015, irregular: 0.04 }), 0x5c130e);
    b.prop('cloth', stoneBox(3.6, stepH + 0.04, 0.05, P(0, sy + stepH * 0.5, sz + 0.02), { bevel: 0.015, irregular: 0.04 }), 0x50100c);
    for (const bx of [-1.62, 1.62]) {
      b.prop('bronze', stoneBox(0.14, 0.05, stepD + 0.12, P(bx, sy + stepH + 0.02, sz - stepD * 0.5), { bevel: 0.01 }), 0xc6984a);
    }
  }
  // Upper dais stone deck + royal carpet runner extending cleanly up to the throne plinth.
  const deckDepth = daisStartTopZ - (zBack + 2.5);
  b.prop('carved', stoneBlock(19.5, daisTopY, deckDepth, P(0, 0, daisStartTopZ - deckDepth * 0.5), { bevel: 0.07, irregular: 0.08 }), 0x9b9286);
  b.prop('cloth', stoneBox(3.6, 0.04, 5.2, P(0, daisTopY + 0.02, daisStartTopZ - 2.6), { bevel: 0.015 }), 0x5c130e);
  for (const bx of [-1.62, 1.62]) {
    b.prop('bronze', stoneBox(0.14, 0.05, 5.2, P(bx, daisTopY + 0.025, daisStartTopZ - 2.6), { bevel: 0.01 }), 0xc6984a);
  }
  // Walkable stair ramp & upper dais platform.
  b.nav.addSegment(P(0, 0, daisStartZ + 0.6), P(0, daisTopY, daisStartTopZ - 0.4), 12.5);
  b.nav.addRect(P(0, daisTopY, daisStartTopZ - 5.2), 7.8, 5.6);

  // --- Towering Chevron Backdrop, High King's Throne & Flanking Treasury Hoards ---
  const throneZ = daisStartTopZ - 5.2;
  buildChevronBackdrop(b, zBack + 3.2);
  buildRoyalThrone(b, P(0, daisTopY, throneZ));
  buildTreasuryHoards(b, daisTopY, throneZ);

  // --- Twin Colossal Flaming Braziers Flanking the Dais Stairs (Ref 2!) ---
  for (const sign of [-1, 1]) {
    buildMonumentalBrazier(b, P(sign * 7.6, 0, daisStartZ - 2.6), {
      scale: 1.48,
      flameScale: 1.55,
      intensity: 19,
      range: 34,
      emitEmbers: true,
      halo: 2.8,
      importance: 2.0,
    });
    // Secondary nave braziers warming the reflective foreground floor.
    buildMonumentalBrazier(b, P(sign * 8.4, 0, 5.2), {
      scale: 1.08,
      flameScale: 1.15,
      intensity: 11,
      range: 24,
      emitEmbers: true,
      halo: 1.9,
      importance: 1.3,
    });
  }

  // --- Colossal Carved Relief Piers, Vaulted Ribs & Crimson-Gold Heraldic Banners ---
  const pierZs = [8.5, -3.5, -15.5];
  for (const pz of pierZs) {
    for (const sign of [-1, 1]) {
      buildThronePier(b, sign * 9.8, pz, height);
    }
    // Soaring radial voussoir transverse vault arches spanning the sanctuary.
    emitRadialArch(b, 'carved', P(-9.8, height - 0.2, pz), P(9.8, height - 0.2, pz), vaultRise - 0.8, 1.85, 2.65, 19, {
      pointed: 0.20, tint: 0xb2aaa0, keystoneTint: 0xcdc4b8, irregular: 0.04,
    });
    b.prop('bronze', stoneBox(1.8, 0.35, 2.2, P(0, height + vaultRise - 0.9, pz), { bevel: 0.04 }), 0xd4aa62);
  }
  // Longitudinal arcade arches & side wall coursed masonry lining.
  for (const sign of [-1, 1]) {
    for (let i = 0; i < pierZs.length - 1; i += 1) {
      emitRadialArch(b, 'carved', P(sign * 9.8, height - 4.4, pierZs[i] - 1.5), P(sign * 9.8, height - 4.4, pierZs[i + 1] + 1.5), 3.6, 1.15, 1.8, 13, {
        pointed: 0.18, tint: 0xa69f96, keystoneTint: 0xc2bab0, irregular: 0.04,
      });
    }
    coursedMasonryWall(b, P(sign * (halfWidth - 0.5), 0, zFront - 1), P(sign * (halfWidth - 0.5), 0, zBack + 2), height + 1, 0.9, {
      courseHeight: 0.92, baseTint: 0x7c7a7c, trimTint: 0x989490,
    });
    // Prominent crimson/black/gold heraldic banners flanking the throne backdrop (exact Ref 2 framing!).
    buildHeraldicBanner(b, P(sign * 6.4, 13.8, throneZ - 3.6), { yaw: 0, width: 2.35, height: 6.4 });
    // Flanking nave banners facing into the hall.
    buildHeraldicBanner(b, P(sign * 13.6, 11.8, -9.5), { yaw: sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, width: 2.0, height: 5.4 });
    buildHeraldicBanner(b, P(sign * 13.6, 11.8, 2.5), { yaw: sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, width: 2.0, height: 5.4 });
  }

  // --- Rear Royal Entry Portal (returning to Stonehold Mountain Hall) ---
  coursedMasonryWall(b, P(-halfWidth, 0, zFront - 0.6), P(halfWidth, 0, zFront - 0.6), height + 2, 1.4, {
    courseHeight: 0.92,
    openings: [{ s: halfWidth, sill: 0, width: 7.4, height: 9.8, profile: 'pointed', dressed: true }],
    baseTint: 0x8a8784,
    trimTint: 0xa8a29a,
  });
  b.prop('bronze', box(7.0, 9.4, 0.45, P(0, 4.7, zFront - 0.2)), 0x8e6b3a);

  // --- Balanced High-Vault Cool Fill Contrasting the Warm Firelight Dais ---
  for (const lz of [8, -2, -12, -21]) {
    b.light(P(0, height + vaultRise * 0.45, lz), '#7889a8', 1.8, 28, { flat: true });
  }
  b.light(P(0, 6.2, -16.0), '#ffaa54', 3.4, 24, { flat: true });

  b.spawn('entry', P(0, 0, 10.5), 0);
  b.exit('hall', P(0, 0, 13.4), { radius: 2.8, label: 'Return to the Mountain Hall' });
}
