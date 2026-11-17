import {
  beam,
  box,
  extrudedProfile,
  hewnBeam,
  rod,
  stoneBox,
} from '../gen/propKit.js';

import { atFrame } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });

/** 1. Giant sinuous segmented veil-fungus parasol with basal loam root collar & luminescent spores. */
export function buildVeilFungusParasol(b, at, scale = 1.0) {
  const s = scale;
  b.prop('loam', rod(P(at.x, at.y - 0.18 * s, at.z), P(at.x, at.y + 0.12 * s, at.z), 0.72 * s, 0.36 * s, 10), 0x2e2838);
  const segments = [
    P(at.x, at.y - 0.12, at.z),
    P(at.x + 0.14 * s, at.y + 1.1 * s, at.z + 0.08 * s),
    P(at.x - 0.08 * s, at.y + 2.2 * s, at.z - 0.1 * s),
    P(at.x, at.y + 3.1 * s, at.z),
  ];
  const radii = [0.24 * s, 0.17 * s, 0.14 * s, 0.18 * s];
  for (let i = 0; i < segments.length - 1; i += 1) {
    b.prop('loam', rod(segments[i], segments[i + 1], radii[i], radii[i + 1], 9), 0x3b3348);
  }
  // Collar ring & secondary sapling buds grounding the stalk smoothly into the cavern silt.
  b.prop('loam', rod(P(at.x + 0.34 * s, at.y - 0.06 * s, at.z + 0.2 * s), P(at.x + 0.42 * s, at.y + 0.56 * s, at.z + 0.24 * s), 0.1 * s, 0.05 * s, 7), 0x443a54);
  b.prop('glow', rod(P(at.x + 0.42 * s, at.y + 0.52 * s, at.z + 0.24 * s), P(at.x + 0.42 * s, at.y + 0.68 * s, at.z + 0.24 * s), 0.24 * s, 0.04 * s, 7), '#9b7ef0', 1.1);
  const capAt = segments[3];
  b.prop('masonry', rod(P(capAt.x, capAt.y - 0.12 * s, capAt.z), P(capAt.x, capAt.y + 0.35 * s, capAt.z), 1.45 * s, 0.72 * s, 12), 0x2c2440);
  b.prop('glow', rod(P(capAt.x, capAt.y + 0.34 * s, capAt.z), P(capAt.x, capAt.y + 0.62 * s, capAt.z), 0.72 * s, 0.12 * s, 10), '#79e3c4', 1.4);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const rx = Math.cos(a) * 1.15 * s;
    const rz = Math.sin(a) * 1.15 * s;
    b.prop('glow', rod(P(capAt.x + rx, capAt.y - 0.1 * s, capAt.z + rz), P(capAt.x + rx * 0.92, capAt.y - 0.95 * s, capAt.z + rz * 0.92), 0.035 * s, 0.01 * s, 5), '#9b7ef0', 1.1);
  }
  b.light(P(capAt.x, capAt.y - 0.3 * s, capAt.z), '#79e3c4', 2.4, 14, { halo: 1.0 });
  b.nav.block(at, 0.45 * s, 3.2 * s);
}

/** 2. Faceted dark-basalt crystal resonator obelisk ringed by forged tuning arcs & bedded plinth. */
export function buildCrystalResonatorObelisk(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', rod(L(0, -0.22, 0), L(0, 0.18, 0), 1.12, 0.96, 6), 0xffffff);
  b.prop('masonry', rod(L(0, 0.14, 0), L(0, 0.55, 0), 0.92, 0.68, 6), 0xffffff);
  b.prop('masonry', stoneBox(0.95, 0.28, 0.95, L(0, 0.68, 0), { yaw, bevel: 0.04 }), 0xffffff);
  b.prop('glow', rod(L(0, 1.05, 0), L(0, 2.85, 0), 0.32, 0.06, 6), '#9b7ef0', 2.2);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + yaw;
    b.prop('iron', beam(P(at.x + Math.cos(a) * 0.62, at.y + 0.72, at.z + Math.sin(a) * 0.62), P(at.x + Math.cos(a) * 0.34, at.y + 2.45, at.z + Math.sin(a) * 0.34), 0.07, 0.07), 0x252832);
    b.prop('glow', rod(P(at.x + Math.cos(a + 0.9) * 0.55, at.y + 0.2, at.z + Math.sin(a + 0.9) * 0.55), P(at.x + Math.cos(a + 0.9) * 0.62, at.y + 0.85, at.z + Math.sin(a + 0.9) * 0.62), 0.1, 0.02, 5), '#79e3c4', 1.6);
  }
  b.light(L(0, 2.1, 0), '#9b7ef0', 2.8, 16, { halo: 1.2 });
  b.nav.block(at, 0.95, 3.0);
}

/** 3. Ornate wrought-iron street gallows suspending a perforated glowing censer spire. */
export function buildHangingCenserSpire(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', rod(L(0, -0.04, 0), L(0, 0.48, 0), 0.42, 0.34, 6), 0xffffff);
  b.prop('iron', rod(L(0, 0.45, 0), L(0, 3.35, 0), 0.07, 0.045, 7), 0x23262e);
  b.prop('iron', hewnBeam(L(0, 2.75, 0), L(0.75, 3.38, 0), 0.065, 0.075), 0x23262e);
  b.prop('iron', rod(L(0.74, 2.55, 0), L(0.74, 3.36, 0), 0.02, 0.02, 5), 0x2c303a);
  b.prop('iron', rod(L(0.74, 2.15, 0), L(0.74, 2.56, 0), 0.04, 0.24, 6), 0x2b2f38);
  b.prop('glow', box(0.24, 0.28, 0.24, L(0.74, 2.38, 0), yaw), '#6fd0ff', 2.6);
  b.light(L(0.74, 2.38, 0), '#6fd0ff', 3.6, 15, { halo: 1.1 });
  b.nav.block(at, 0.48, 3.3);
}

/** 4. Crescent carved basalt spiderweb sanctuary arch around a silk-egg lantern altar. */
export function buildSpiderWebBalustradeShrine(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', rod(L(0, -0.04, 0), L(0, 0.42, 0), 1.35, 1.15, 8), 0xffffff);
  for (const sx of [-0.95, 0.95]) {
    b.prop('masonry', stoneBox(0.38, 2.25, 0.38, L(sx, 1.54, 0), { yaw, bevel: 0.04 }), 0xffffff);
  }
  b.prop('masonry', stoneBox(2.35, 0.32, 0.44, L(0, 2.75, 0), { yaw, bevel: 0.04 }), 0xffffff);
  for (const sp of [[-0.85, 2.6], [0.85, 2.6], [-0.85, 1.5], [0.85, 1.5]]) {
    b.prop('iron', beam(L(sp[0], sp[1], 0), L(0, 1.45, 0), 0.03, 0.03), 0x2e323c);
  }
  b.prop('masonry', stoneBox(0.54, 0.72, 0.54, L(0, 0.78, 0), { yaw, bevel: 0.03 }), 0xffffff);
  b.prop('glow', rod(L(0, 1.14, 0), L(0, 1.54, 0), 0.16, 0.06, 8), '#9b7ef0', 2.4);
  b.light(L(0, 1.45, 0), '#9b7ef0', 2.8, 14, { halo: 0.9 });
  b.nav.block(at, 1.35, 2.8);
}

/** 5. Slender curved dark-timber canal gondola moored beside dock bollard & bow lamp. */
export function buildTideGondolaSkiff(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  const hull = [[-1.9, 0.35], [-1.2, -0.25], [1.2, -0.25], [1.9, 0.35], [1.3, 0.1], [-1.3, 0.1]];
  b.prop('timber', extrudedProfile(hull, 0.95, { yaw, at: L(0, 0.35, 0), bevel: 0.03 }), 0x2e231c);
  b.prop('iron', rod(L(-1.82, 0.6, 0), L(-2.15, 1.38, 0), 0.06, 0.02, 6), 0x242730);
  b.prop('timber', stoneBox(0.95, 0.1, 0.72, L(0.0, 0.42, 0), { yaw, bevel: 0.015 }), 0x453528);
  b.prop('timber', rod(L(-1.1, 0.5, 0.45), L(1.35, 0.54, 0.52), 0.03, 0.025, 6), 0x5c4636);
  b.prop('glow', box(0.18, 0.22, 0.18, L(-1.95, 1.25, 0), yaw), '#79e3c4', 2.2);
  b.light(L(-1.95, 1.28, 0), '#79e3c4', 2.4, 12, { halo: 0.8 });
}
