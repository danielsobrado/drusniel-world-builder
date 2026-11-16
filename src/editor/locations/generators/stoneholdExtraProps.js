import {
  beam,
  box,
  hewnBeam,
  rod,
  stoneBlock,
  stoneBox,
} from '../gen/propKit.js';

import { atFrame } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });

/** 1. Stepped bronze-and-granite steam drop-hammer forging press & die anvil. */
export function buildDropHammerForgePress(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', stoneBlock(2.4, 0.42, 1.6, at, { yaw, bevel: 0.05 }));
  for (const sx of [-0.88, 0.88]) {
    b.prop('carved', stoneBox(0.42, 2.45, 0.56, L(sx, 1.64, 0), { yaw, bevel: 0.04 }), 0xe6e2da);
  }
  b.prop('bronze', stoneBox(2.36, 0.42, 0.72, L(0, 3.04, 0), { yaw, bevel: 0.04 }), 0xffffff);
  b.prop('iron', stoneBox(0.84, 0.62, 0.58, L(0, 0.74, 0), { yaw, bevel: 0.03 }), 0x5c606a);
  b.prop('iron', stoneBox(0.68, 0.72, 0.48, L(0, 1.98, 0), { yaw, bevel: 0.03 }), 0x454952);
  b.prop('bronze', rod(L(0, 2.34, 0), L(0, 2.95, 0), 0.14, 0.14, 8), 0xe8d0a8);
  b.nav.block(at, 1.35, 3.2);
}

/** 2. Tiered octagonal granite-and-bronze ancestral brazier pedestal with live ember dome. */
export function buildRunicBrazierPedestal(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', rod(L(0, 0, 0), L(0, 0.36, 0), 0.96, 0.84, 8), 0xe2dfd8);
  b.prop('carved', rod(L(0, 0.36, 0), L(0, 1.24, 0), 0.54, 0.46, 8), 0xedeae2);
  b.prop('bronze', rod(L(0, 1.24, 0), L(0, 1.62, 0), 0.48, 0.74, 10), 0xffffff);
  b.prop('glow', rod(L(0, 1.54, 0), L(0, 1.72, 0), 0.54, 0.22, 8), '#ff6818', 2.4);
  b.flame(L(0, 1.68, 0), { width: 0.42, height: 0.56, core: '#fff1b4', outer: '#ff520e', speed: 1.0 });
  b.light(L(0, 2.05, 0), '#ff9c4e', 3.8, 16, { halo: 0.9 });
  b.nav.block(at, 0.98, 2.1);
}

/** 3. Geared granite pit-capstan winch with radial handspokes & wound haul cable. */
export function buildGearedCapstanWinch(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', rod(L(0, 0, 0), L(0, 0.34, 0), 0.98, 0.92, 10), 0xdad6ce);
  b.prop('bronze', rod(L(0, 0.34, 0), L(0, 0.52, 0), 0.72, 0.72, 12), 0xe4c898);
  b.prop('iron', rod(L(0, 0.52, 0), L(0, 1.38, 0), 0.42, 0.38, 10), 0x52565e);
  b.prop('bronze', rod(L(0, 1.38, 0), L(0, 1.56, 0), 0.54, 0.48, 10), 0xffffff);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI + yaw;
    b.prop('timber', hewnBeam(
      P(at.x - Math.cos(a) * 1.15, at.y + 1.46, at.z - Math.sin(a) * 1.15),
      P(at.x + Math.cos(a) * 1.15, at.y + 1.46, at.z + Math.sin(a) * 1.15),
      0.08,
      0.08,
    ), 0x6b4e34);
  }
  b.nav.block(at, 1.15, 1.8);
}

/** 4. Carved basalt & bronze ancestor relief stele on stepped pedestal with votive lamps. */
export function buildAncestorReliefStele(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('masonry', stoneBlock(1.85, 0.45, 0.96, at, { yaw, bevel: 0.05 }));
  b.prop('carved', stoneBox(1.42, 2.35, 0.48, L(0, 1.62, 0), { yaw, bevel: 0.04 }), 0xe8e4dc);
  b.prop('bronze', stoneBox(1.58, 0.28, 0.56, L(0, 2.86, 0), { yaw, bevel: 0.03 }), 0xffffff);
  b.prop('bronze', stoneBox(0.92, 1.45, 0.56, L(0, 1.66, 0), { yaw, bevel: 0.025 }), 0xd9b06e);
  for (const sx of [-0.72, 0.72]) {
    b.prop('iron', rod(L(sx, 0.45, 0.34), L(sx, 0.88, 0.34), 0.14, 0.18, 6), 0x3b3d42);
    b.prop('glow', box(0.14, 0.12, 0.14, L(sx, 0.92, 0.34), yaw), '#ffae52', 2.0);
  }
  b.nav.block(at, 1.1, 3.0);
}

/** 5. Pivoted ingot-handling jib crane trolley loaded with stacked bronze ingots. */
export function buildIngotCraneTrolley(b, at, yaw = 0) {
  const L = atFrame(at, yaw);
  b.prop('iron', stoneBox(1.65, 0.2, 1.08, L(0, 0.38, 0), { yaw, bevel: 0.02 }), 0x3a3d45);
  for (const wx of [-0.58, 0.58]) {
    for (const wz of [-0.56, 0.56]) {
      b.prop('iron', rod(L(wx, 0.2, wz - 0.05), L(wx, 0.2, wz + 0.05), 0.2, 0.2, 10), 0x4b505a);
    }
  }
  b.prop('bronze', rod(L(-0.46, 0.48, 0), L(-0.46, 2.25, 0), 0.11, 0.09, 8), 0xe0b878);
  b.prop('bronze', beam(L(-0.46, 2.05, 0), L(0.75, 2.38, 0), 0.08, 0.1), 0xe0b878);
  b.prop('iron', rod(L(0.68, 1.38, 0), L(0.68, 2.34, 0), 0.025, 0.025, 6), 0x2e3038);
  b.prop('iron', rod(L(0.68, 0.96, 0), L(0.68, 1.38, 0), 0.22, 0.26, 8), 0x3b3e46);
  for (let row = 0; row < 2; row += 1) {
    for (let k = 0; k < 2 - row; k += 1) {
      b.prop('bronze', stoneBox(0.32, 0.16, 0.62, L(0.24 + k * 0.36 + row * 0.18, 0.56 + row * 0.17, 0), { yaw, bevel: 0.015 }), 0xe8bd76);
    }
  }
  b.nav.block(at, 1.1, 2.5);
}
