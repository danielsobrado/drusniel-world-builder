import {
  beam,
  box,
  extrudedProfile,
  hewnBeam,
  rod,
  stoneBlock,
  stoneBox,
} from '../gen/propKit.js';

import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const STONEHOLD_SKIRT = Object.freeze({ skirtMat: 'masonry', skirtTint: 0x9b968e });

/** 1. Stepped bronze-and-granite Dwemer steam drop-hammer forging press with twin steam domes & hot billet. */
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
      // Flanged bronze steam manifold pipes feeding the top cylinder dome.
      p.prop('bronze', rod(L(sx * 1.24, 0.42, 0), L(sx * 1.24, 3.04, 0), 0.11, 0.11, 8), 0xd4ae72);
      for (const fy of [0.95, 1.85, 2.65]) {
        p.prop('bronze', rod(L(sx * 1.24, fy - 0.05, 0), L(sx * 1.24, fy + 0.05, 0), 0.16, 0.16, 8), 0xe8d0a8);
      }
    }
    // Crosshead entablature + central Dwemer steam cylinder dome + pressure relief valve.
    p.prop('bronze', stoneBox(2.36, 0.42, 0.72, L(0, 3.04, 0), { yaw, bevel: 0.04 }), 0xffffff);
    p.prop('bronze', rod(L(0, 3.24, 0), L(0, 3.82, 0), 0.42, 0.34, 12), 0xd8b478);
    p.prop('bronze', rod(L(0, 3.80, 0), L(0, 4.02, 0), 0.34, 0.10, 10), 0xe8d0a8);
    p.prop('iron', rod(L(0.42, 3.55, 0), L(0.66, 3.55, 0), 0.05, 0.05, 6), 0x454952);
    p.prop('bronze', rod(L(0.66, 3.55, -0.04), L(0.66, 3.55, 0.04), 0.16, 0.16, 10), 0xd8b478);
    // Anvil die block + glowing white-hot forged billet + suspended drop ram & piston shaft.
    p.prop('iron', stoneBox(0.84, 0.62, 0.58, L(0, 0.74, 0), { yaw, bevel: 0.03 }), 0x5c606a);
    p.prop('glow', stoneBox(0.46, 0.10, 0.24, L(0, 1.08, 0), { yaw, bevel: 0.015 }), '#ff942e', 2.6);
    p.prop('iron', stoneBox(0.68, 0.72, 0.48, L(0, 1.98, 0), { yaw, bevel: 0.03 }), 0x454952);
    p.prop('bronze', rod(L(0, 2.34, 0), L(0, 3.05, 0), 0.14, 0.14, 10), 0xe8d0a8);
    p.prop('ore', stoneBox(0.28, 0.14, 0.38, L(-0.98, 0.48, 0.44), { yaw, bevel: 0.02 }), 0xd9a862);
    p.light(L(0, 1.38, 0.25), '#ff9438', 2.4, 9, { halo: 0.6, flicker: 0.14 });
    p.nav.block(at, 1.35, 3.2);
  });
}

/** 2. Tiered octagonal Dwemer granite-and-bronze brazier pedestal with 8 talon ribs & pierced crown ring. */
export function buildRunicBrazierPedestal(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', rod(L(0, -0.22, 0), L(0, 0.12, 0), 1.18, 1.02, 8), 0xdad6ce);
    p.prop('masonry', rod(L(0, 0.08, 0), L(0, 0.36, 0), 0.96, 0.84, 8), 0xe2dfd8);
    p.prop('carved', rod(L(0, 0.36, 0), L(0, 1.24, 0), 0.54, 0.46, 8), 0xedeae2);
    p.prop('bronze', rod(L(0, 1.24, 0), L(0, 1.62, 0), 0.48, 0.74, 12), 0xffffff);
    p.prop('bronze', rod(L(0, 1.56, 0), L(0, 1.66, 0), 0.74, 0.78, 12), 0xe2c390);
    // 4 stepped granite corner buttress fins + 8 radial bronze talon ribs clasping the fire bowl.
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const dx = Math.cos(a), dz = Math.sin(a);
      p.prop('carved', hewnBeam(L(dx * 0.92, 0.24, dz * 0.92), L(dx * 0.48, 1.18, dz * 0.48), 0.16, 0.20, { bevel: 0.02 }), 0xe8e4dc);
    }
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      p.prop('bronze', hewnBeam(L(dx * 0.48, 0.92, dz * 0.48), L(dx * 0.80, 1.68, dz * 0.80), 0.08, 0.10, { bevel: 0.015 }), 0xcfa86a);
      p.prop('bronze', rod(L(dx * 0.78, 1.66, dz * 0.78), L(dx * 0.84, 1.92, dz * 0.84), 0.045, 0.015, 6), 0xe8d0a8);
    }
    p.prop('glow', rod(L(0, 1.54, 0), L(0, 1.72, 0), 0.54, 0.22, 8), '#ff6818', 2.4);
    p.flame(L(0, 1.68, 0), { width: 0.42, height: 0.56, core: '#fff1b4', outer: '#ff520e', speed: 1.0 });
    p.light(L(0, 2.05, 0), '#ff9c4e', 3.8, 16, { halo: 0.9 });
    p.nav.block(at, 0.98, 2.1);
  });
}

/** 3. Geared granite pit-capstan winch with forged ratchet pawl, coiled haul rope & bronze-capped handspokes. */
export function buildGearedCapstanWinch(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', rod(L(0, 0, 0), L(0, 0.34, 0), 0.98, 0.92, 12), 0xdad6ce);
    p.prop('bronze', rod(L(0, 0.34, 0), L(0, 0.52, 0), 0.72, 0.72, 14), 0xe4c898);
    p.prop('iron', rod(L(0, 0.52, 0), L(0, 1.38, 0), 0.42, 0.38, 12), 0x52565e);
    // Coiled haul cable wraps around the barrel + top capstan head with bronze finial dome.
    for (let w = 0; w < 5; w += 1) {
      const wy = 0.62 + w * 0.13;
      p.prop('timber', rod(L(0, wy, 0), L(0, wy + 0.09, 0), 0.45, 0.45, 12), 0x7a6244);
    }
    p.prop('bronze', rod(L(0, 1.38, 0), L(0, 1.58, 0), 0.56, 0.50, 12), 0xffffff);
    p.prop('bronze', rod(L(0, 1.58, 0), L(0, 1.76, 0), 0.34, 0.10, 10), 0xe2c086);
    for (let i = 0; i < 12; i += 1) {
      const angle = i * Math.PI / 6;
      p.prop('iron', stoneBox(0.18, 0.14, 0.14, L(0.73 * Math.cos(angle), 0.43, 0.73 * Math.sin(angle)), {
        yaw: yaw - angle, bevel: 0.02,
      }), 0x6b6560);
    }
    // Forged iron ratchet pawl dog engaging the gear ring.
    p.prop('iron', stoneBox(0.24, 0.20, 0.18, L(0.92, 0.38, 0.22), { yaw, bevel: 0.02 }), 0x454952);
    p.prop('iron', hewnBeam(L(0.92, 0.44, 0.22), L(0.76, 0.43, 0.04), 0.07, 0.08), 0x6b6560);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI + yaw;
      const dx = Math.cos(a), dz = Math.sin(a);
      p.prop('timber', hewnBeam(
        P(at.x - dx * 1.15, at.y + 1.46, at.z - dz * 1.15),
        P(at.x + dx * 1.15, at.y + 1.46, at.z + dz * 1.15),
        0.08, 0.08,
      ), 0x6b4e34);
      for (const s of [-1, 1]) {
        p.prop('bronze', rod(
          P(at.x + s * dx * 1.08, at.y + 1.46, at.z + s * dz * 1.08),
          P(at.x + s * dx * 1.22, at.y + 1.46, at.z + s * dz * 1.22),
          0.055, 0.048, 8,
        ), 0xd8b478);
      }
    }
    p.nav.block(at, 1.15, 1.8);
  });
}

/** 4. Carved basalt & bronze Dwemer ancestor relief stele with chevron hood, fluted pilasters & votive lamps. */
export function buildAncestorReliefStele(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('masonry', stoneBlock(1.96, 0.45, 1.04, at, { yaw, bevel: 0.05 }));
    p.prop('carved', stoneBox(1.42, 2.35, 0.48, L(0, 1.62, 0), { yaw, bevel: 0.04 }), 0xe8e4dc);
    p.prop('bronze', stoneBox(1.58, 0.28, 0.56, L(0, 2.86, 0), { yaw, bevel: 0.03 }), 0xffffff);
    // Crowned Dwarf-chevron pediment hood + fluted bronze side pilasters.
    const hoodPts = [[-0.96, 0], [0, 0.58], [0.96, 0], [0.76, -0.14], [0, 0.34], [-0.76, -0.14]];
    p.prop('carved', extrudedProfile(hoodPts, 0.68, { bevel: 0.035, yaw, at: L(0, 3.0, 0) }), 0xdad7d1);
    for (const sx of [-0.74, 0.74]) {
      p.prop('bronze', rod(L(sx, 0.46, 0), L(sx, 2.74, 0), 0.11, 0.095, 8), 0xd4ae72);
    }
    p.prop('bronze', stoneBox(0.92, 1.45, 0.56, L(0, 1.66, 0), { yaw, bevel: 0.025 }), 0xd9b06e);
    for (const sign of [-1, 1]) {
      const right = L(0.33, 1.62, sign * 0.29);
      const top = L(0, 2.14, sign * 0.29);
      const left = L(-0.33, 1.62, sign * 0.29);
      const bottom = L(0, 1.1, sign * 0.29);
      for (const [a, c] of [[right, top], [top, left], [left, bottom], [bottom, right]]) {
        p.prop('iron', hewnBeam(a, c, 0.065, 0.072, { bevel: 0.01 }), 0x514941);
      }
      // Central raised bronze sunburst boss inside the diamond frame.
      p.prop('bronze', rod(L(0, 1.62, sign * 0.28), L(0, 1.62, sign * 0.38), 0.20, 0.12, 8), 0xe8c98a);
    }
    for (const sx of [-0.76, 0.76]) {
      p.prop('iron', rod(L(sx, 0.45, 0.36), L(sx, 0.88, 0.36), 0.14, 0.18, 8), 0x3b3d42);
      p.prop('glow', box(0.14, 0.12, 0.14, L(sx, 0.92, 0.36), yaw), '#ffae52', 2.0);
    }
    p.nav.block(at, 1.1, 3.4);
  });
}

/** 5. Pivoted Dwemer ingot-handling jib crane trolley with geared slewing ring, winch drum & lifting tongs. */
export function buildIngotCraneTrolley(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, STONEHOLD_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('iron', stoneBox(1.68, 0.2, 1.10, L(0, 0.38, 0), { yaw, bevel: 0.02 }), 0x3a3d45);
    for (const wx of [-0.58, 0.58]) {
      p.prop('iron', rod(L(wx, 0.20, -0.58), L(wx, 0.20, 0.58), 0.04, 0.04, 8), 0x3a3d45);
      for (const wz of [-0.56, 0.56]) {
        p.prop('iron', rod(L(wx, 0.2, wz - 0.05), L(wx, 0.2, wz + 0.05), 0.2, 0.2, 12), 0x4b505a);
        p.prop('bronze', rod(L(wx, 0.2, wz - 0.07), L(wx, 0.2, wz + 0.07), 0.07, 0.07, 8), 0xd8b478);
      }
    }
    // Geared bronze slewing ring base + mast + winch drum + jib boom + gusset brace.
    p.prop('bronze', rod(L(-0.46, 0.46, 0), L(-0.46, 0.64, 0), 0.28, 0.24, 12), 0xd4ae72);
    p.prop('bronze', rod(L(-0.46, 0.60, 0), L(-0.46, 2.32, 0), 0.11, 0.09, 10), 0xe0b878);
    p.prop('iron', rod(L(-0.46, 1.18, -0.18), L(-0.46, 1.18, 0.18), 0.15, 0.15, 10), 0x454952);
    p.prop('bronze', hewnBeam(L(-0.46, 1.18, 0.22), L(-0.46, 1.46, 0.22), 0.045, 0.045), 0xd8b478);
    p.prop('bronze', beam(L(-0.46, 2.05, 0), L(0.78, 2.40, 0), 0.085, 0.11), 0xe0b878);
    p.prop('iron', hewnBeam(L(-0.46, 1.73, 0), L(0.20, 2.22, 0), 0.095, 0.09), 0x4f535b);
    p.prop('iron', rod(L(0.68, 2.34, -0.09), L(0.68, 2.34, 0.09), 0.10, 0.10, 12), 0x5b5e63);
    p.prop('iron', rod(L(0.68, 1.38, 0), L(0.68, 2.34, 0), 0.025, 0.025, 6), 0x2e3038);
    // Forged lifting tongs clasping a suspended bronze ingot bar.
    for (const tz of [-0.14, 0.14]) {
      p.prop('iron', beam(L(0.68, 1.38, 0), L(0.68, 1.10, tz), 0.032, 0.032), 0x454952);
    }
    p.prop('bronze', stoneBox(0.30, 0.16, 0.54, L(0.68, 1.04, 0), { yaw, bevel: 0.015 }), 0xe8bd76);
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < 2 - row; k += 1) {
        p.prop('bronze', stoneBox(0.32, 0.16, 0.62, L(0.24 + k * 0.36 + row * 0.18, 0.56 + row * 0.17, 0), { yaw, bevel: 0.015 }), 0xe8bd76);
      }
    }
    p.nav.block(at, 1.1, 2.5);
  });
}
