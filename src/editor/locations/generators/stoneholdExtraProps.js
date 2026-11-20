import {
  beam,
  box,
  hewnBeam,
  rod,
  stoneBlock,
  stoneBox,
} from '../gen/propKit.js';

import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const STONEHOLD_SKIRT = Object.freeze({ skirtMat: 'masonry', skirtTint: 0x9b968e });

/** 1. Stepped bronze-and-granite steam drop-hammer forging press & die anvil. */
export function buildDropHammerForgePress(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', stoneBlock(2.75, 0.38, 1.92, L(0, -0.18, 0), { yaw, bevel: 0.06 }));
    p.prop('masonry', stoneBlock(2.4, 0.42, 1.6, at, { yaw, bevel: 0.05 }));
    for (const sx of [-0.88, 0.88]) {
      p.prop('carved', stoneBox(0.42, 2.45, 0.56, L(sx, 1.64, 0), { yaw, bevel: 0.04 }), 0xe6e2da);
      p.prop('bronze', stoneBox(0.5, 0.18, 0.64, L(sx, 0.52, 0), { yaw, bevel: 0.02 }), 0xffffff);
      p.prop('iron', hewnBeam(L(sx * 0.79, 1.46, 0.19), L(sx * 0.79, 2.8, 0.19), 0.15, 0.13), 0x616471);
      for (const y of [0.53, 2.74]) {
        p.prop('iron', rod(L(sx, y, 0.26), L(sx, y, 0.34), 0.044, 0.05, 6), 0x62656b);
      }
    }
    p.prop('bronze', stoneBox(2.36, 0.42, 0.72, L(0, 3.04, 0), { yaw, bevel: 0.04 }), 0xffffff);
    p.prop('iron', stoneBox(0.84, 0.62, 0.58, L(0, 0.74, 0), { yaw, bevel: 0.03 }), 0x5c606a);
    p.prop('iron', stoneBox(0.68, 0.72, 0.48, L(0, 1.98, 0), { yaw, bevel: 0.03 }), 0x454952);
    p.prop('bronze', rod(L(0, 2.34, 0), L(0, 2.95, 0), 0.14, 0.14, 8), 0xe8d0a8);
    p.prop('ore', stoneBox(0.28, 0.14, 0.38, L(-0.98, 0.48, 0.44), { yaw, bevel: 0.02 }), 0xd9a862);
    p.nav.block(at, 1.35, 3.2);
  });
}

/** 2. Tiered octagonal granite-and-bronze ancestral brazier pedestal with live ember dome. */
export function buildRunicBrazierPedestal(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', rod(L(0, -0.22, 0), L(0, 0.12, 0), 1.18, 1.02, 8), 0xdad6ce);
    p.prop('masonry', rod(L(0, 0.08, 0), L(0, 0.36, 0), 0.96, 0.84, 8), 0xe2dfd8);
    p.prop('carved', rod(L(0, 0.36, 0), L(0, 1.24, 0), 0.54, 0.46, 8), 0xedeae2);
    p.prop('bronze', rod(L(0, 1.24, 0), L(0, 1.62, 0), 0.48, 0.74, 10), 0xffffff);
    p.prop('bronze', rod(L(0, 1.56, 0), L(0, 1.64, 0), 0.73, 0.76, 10), 0xe2c390);
    for (const dir of [-1, 1]) {
      p.prop('bronze', hewnBeam(L(dir * 0.48, 0.75, 0), L(dir * 0.58, 1.26, 0), 0.12, 0.12), 0xc7a57c);
    }
    p.prop('glow', rod(L(0, 1.54, 0), L(0, 1.72, 0), 0.54, 0.22, 8), '#ff6818', 2.4);
    p.flame(L(0, 1.68, 0), { width: 0.42, height: 0.56, core: '#fff1b4', outer: '#ff520e', speed: 1.0 });
    p.light(L(0, 2.05, 0), '#ff9c4e', 3.8, 16, { halo: 0.9 });
    p.nav.block(at, 0.98, 2.1);
  });
}

/** 3. Geared granite pit-capstan winch with radial handspokes & wound haul cable. */
export function buildGearedCapstanWinch(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', rod(L(0, 0, 0), L(0, 0.34, 0), 0.98, 0.92, 10), 0xdad6ce);
    p.prop('bronze', rod(L(0, 0.34, 0), L(0, 0.52, 0), 0.72, 0.72, 12), 0xe4c898);
    p.prop('iron', rod(L(0, 0.52, 0), L(0, 1.38, 0), 0.42, 0.38, 10), 0x52565e);
    p.prop('bronze', rod(L(0, 1.38, 0), L(0, 1.56, 0), 0.54, 0.48, 10), 0xffffff);
    for (let i = 0; i < 12; i += 1) {
      const angle = i * Math.PI / 6;
      p.prop('iron', stoneBox(0.18, 0.14, 0.14, L(0.73 * Math.cos(angle), 0.43, 0.73 * Math.sin(angle)), {
        yaw: yaw - angle, bevel: 0.02,
      }), 0x6b6560);
    }
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI + yaw;
      p.prop('timber', hewnBeam(
        P(at.x - Math.cos(a) * 1.15, at.y + 1.46, at.z - Math.sin(a) * 1.15),
        P(at.x + Math.cos(a) * 1.15, at.y + 1.46, at.z + Math.sin(a) * 1.15),
        0.08,
        0.08,
      ), 0x6b4e34);
    }
    p.nav.block(at, 1.15, 1.8);
  });
}

/** 4. Carved basalt & bronze ancestor relief stele on stepped pedestal with votive lamps. */
export function buildAncestorReliefStele(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', stoneBlock(1.85, 0.45, 0.96, at, { yaw, bevel: 0.05 }));
    p.prop('carved', stoneBox(1.42, 2.35, 0.48, L(0, 1.62, 0), { yaw, bevel: 0.04 }), 0xe8e4dc);
    p.prop('bronze', stoneBox(1.58, 0.28, 0.56, L(0, 2.86, 0), { yaw, bevel: 0.03 }), 0xffffff);
    p.prop('bronze', stoneBox(0.92, 1.45, 0.56, L(0, 1.66, 0), { yaw, bevel: 0.025 }), 0xd9b06e);
    for (const sign of [-1, 1]) {
      const right = L(0.33, 1.62, sign * 0.29);
      const top = L(0, 2.14, sign * 0.29);
      const left = L(-0.33, 1.62, sign * 0.29);
      const bottom = L(0, 1.1, sign * 0.29);
      for (const [a, c] of [[right, top], [top, left], [left, bottom], [bottom, right]]) {
        p.prop('iron', hewnBeam(a, c, 0.065, 0.072, { bevel: 0.01 }), 0x514941);
      }
    }
    for (const sx of [-0.72, 0.72]) {
      p.prop('iron', rod(L(sx, 0.45, 0.34), L(sx, 0.88, 0.34), 0.14, 0.18, 6), 0x3b3d42);
      p.prop('glow', box(0.14, 0.12, 0.14, L(sx, 0.92, 0.34), yaw), '#ffae52', 2.0);
    }
    p.nav.block(at, 1.1, 3.0);
  });
}

/** 5. Pivoted ingot-handling jib crane trolley loaded with stacked bronze ingots. */
export function buildIngotCraneTrolley(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('iron', stoneBox(1.65, 0.2, 1.08, L(0, 0.38, 0), { yaw, bevel: 0.02 }), 0x3a3d45);
    for (const wx of [-0.58, 0.58]) {
      for (const wz of [-0.56, 0.56]) {
        p.prop('iron', rod(L(wx, 0.2, wz - 0.05), L(wx, 0.2, wz + 0.05), 0.2, 0.2, 10), 0x4b505a);
      }
    }
    p.prop('bronze', rod(L(-0.46, 0.48, 0), L(-0.46, 2.25, 0), 0.11, 0.09, 8), 0xe0b878);
    p.prop('bronze', beam(L(-0.46, 2.05, 0), L(0.75, 2.38, 0), 0.08, 0.1), 0xe0b878);
    p.prop('iron', hewnBeam(L(-0.46, 1.73, 0), L(0.18, 2.21, 0), 0.095, 0.09), 0x4f535b);
    p.prop('iron', rod(L(0.68, 2.34, -0.08), L(0.68, 2.34, 0.08), 0.094, 0.094, 10), 0x5b5e63);
    p.prop('iron', rod(L(0.68, 1.38, 0), L(0.68, 2.34, 0), 0.025, 0.025, 6), 0x2e3038);
    p.prop('iron', rod(L(0.68, 0.96, 0), L(0.68, 1.38, 0), 0.22, 0.26, 8), 0x3b3e46);
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < 2 - row; k += 1) {
        p.prop('bronze', stoneBox(0.32, 0.16, 0.62, L(0.24 + k * 0.36 + row * 0.18, 0.56 + row * 0.17, 0), { yaw, bevel: 0.015 }), 0xe8bd76);
      }
    }
    p.nav.block(at, 1.1, 2.5);
  });
}
