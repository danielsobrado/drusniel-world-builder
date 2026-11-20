import {
  angularRock,
  beam,
  box,
  extrudedProfile,
  hewnBeam,
  panel,
  rod,
  roughTimber,
  stoneBox,
} from '../gen/propKit.js';

import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const MINE_SKIRT = Object.freeze({ skirtMat: 'rock_debris', skirtTint: 0x6f6860 });

/** 1. Heavy timbered ore loading hopper chute over spilled ore gravel & gate lever. */
export function buildOreHopperChute(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    for (const sx of [-0.65, 0.65]) {
      for (const sz of [-0.55, 0.55]) {
        p.prop('timber', roughTimber(L(sx, 0, sz), L(sx, 1.9, sz), 0.16, 0.16, { taper: 0.04 }), 0x7b5e3e);
        p.prop('iron', stoneBox(0.2, 0.12, 0.2, L(sx, 0.28, sz), { yaw, bevel: 0.013 }), 0x4a4641);
      }
      p.prop('timber', hewnBeam(L(sx, 0.9, -0.55), L(sx, 1.85, 0.55), 0.1, 0.1), 0x6b5034);
    }
    p.prop('timber', extrudedProfile([[-0.7, 0], [0.7, 0], [0.42, -0.65], [-0.42, -0.65]], 1.15, {
      yaw,
      rx: Math.PI / 2,
      at: L(0, 1.65, 0),
    }), 0x856643);
    for (const sy of [1.25, 1.65]) {
      p.prop('iron', stoneBox(1.48, 0.07, 1.24, L(0, sy, 0), { yaw, bevel: 0.01 }), 0x2d3036);
    }
    p.prop('iron', hewnBeam(L(0.42, 1.1, 0), L(0.86, 1.55, 0), 0.05, 0.05), 0x3b3e45);
    p.prop('iron', stoneBox(0.84, 0.06, 0.55, L(0, 1.0, 0.48), { yaw, bevel: 0.01 }), 0x34373d);
    p.prop('ore', angularRock(0.42, 0.24, 0.38, L(0, 0.18, 0.42), { seed: 41, yaw }), 0xc8a468);
    // Embedded sleeper footings and mine-rubble transition apron so post bases lock naturally into rock floor.
    p.prop('timber', stoneBox(1.56, 0.16, 1.38, L(0, -0.04, 0), { yaw, bevel: 0.02 }), 0x5c432b);
    for (const [rx, rz, sd] of [[-0.78, 0.62, 11], [0.76, -0.62, 12], [0.68, 0.64, 13]]) {
      p.prop('rock_debris', angularRock(0.32, 0.14, 0.28, L(rx, 0.02, rz), { seed: sd, yaw }), 0x7b7268);
    }
    p.nav.block(at, 0.95, 2.2);
  });
}

/** 2. Underground dewatering rocker-pump rig with iron cylinder & wooden trough. */
export function buildDewateringPumpRig(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('timber', stoneBox(1.42, 0.18, 1.04, L(0, -0.05, 0), { yaw, bevel: 0.025 }), 0x5c432b);
    for (const sz of [-0.36, 0.36]) {
      p.prop('timber', roughTimber(L(-0.55, 0, sz), L(0, 1.55, sz * 0.4), 0.13, 0.11), 0x785b3c);
      p.prop('timber', roughTimber(L(0.55, 0, sz), L(0, 1.55, sz * 0.4), 0.13, 0.11), 0x785b3c);
    }
    p.prop('timber', rod(L(0, 1.5, -0.35), L(0, 1.5, 0.35), 0.075, 0.075, 8), 0x5c442c);
    p.prop('timber', hewnBeam(L(-1.1, 1.62, 0), L(1.05, 1.48, 0), 0.12, 0.16), 0x876745);
    p.prop('iron', rod(L(-0.78, 0.12, 0), L(-0.78, 1.56, 0), 0.045, 0.045, 7), 0x383b42);
    p.prop('iron', rod(L(-0.78, 0, 0), L(-0.78, 0.85, 0), 0.18, 0.16, 10), 0x2e3138);
    p.prop('iron', rod(L(-0.78, 0.08, 0), L(-0.78, 0.14, 0), 0.25, 0.25, 10), 0x3e424b);
    p.prop('iron', rod(L(-0.78, 0.63, 0), L(-0.78, 0.73, 0), 0.20, 0.20, 10), 0x565158);
    p.prop('iron', rod(L(-0.78, 0.42, 0.09), L(-0.78, 0.42, 0.32), 0.085, 0.081, 8), 0x4d4a4b);
    p.prop('timber', box(1.25, 0.22, 0.42, L(0.05, 0.28, 0.18), yaw), 0x6f5336);
    p.prop('iron', rod(L(0.85, 1.48, 0), L(0.95, 0.45, 0), 0.03, 0.03, 6), 0x454952);
    // Pump flywheel & crank flange.
    p.prop('iron', rod(L(0.95, 0.45, -0.14), L(0.95, 0.45, 0.14), 0.26, 0.26, 10), 0x3a3d45);
    p.prop('rock_debris', angularRock(0.36, 0.12, 0.34, L(-0.72, 0.02, -0.45), { seed: 23, yaw }), 0x6f6860);
    p.nav.block(at, 1.0, 2.0);
  });
}

/** 3. Padlocked timber powder magazine locker under lean-to slate shed & stacked kegs. */
export function buildPowderMagazineLocker(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('timber', stoneBox(1.5, 1.25, 0.82, L(0, 0.62, 0), { yaw, bevel: 0.03 }), 0x6b4e34);
    for (const dy of [0.28, 0.62, 0.96]) {
      p.prop('iron', stoneBox(1.54, 0.06, 0.86, L(0, dy, 0), { yaw, bevel: 0.01 }), 0x2a2d33);
    }
    p.prop('timber', panel(L(-0.88, 1.38, -0.52), L(-0.88, 1.32, 0.54), P(1, 0, 0), 1.85, 0.09), 0x584029);
    p.prop('iron', stoneBox(0.18, 0.24, 0.12, L(0, 0.64, 0.44), { yaw, bevel: 0.015 }), 0xb68d46);
    for (const y of [0.28, 0.96]) {
      p.prop('iron', rod(L(-0.52, y - 0.07, 0.433), L(-0.52, y + 0.07, 0.433), 0.034, 0.034, 8), 0x505159);
    }
    p.prop('cloth', panel(L(0.68, 1.22, 0.42), L(0.68, 0.72, 0.42), P(1, 0, 0), 0.24, 0.02), 0xb83828);
    p.prop('timber', rod(L(-0.48, 0, 0.65), L(-0.48, 0.56, 0.65), 0.2, 0.19, 9), 0x80603e);
    p.nav.block(at, 0.95, 1.8);
  });
}

/** 4. Flush spiked timber-and-iron mine rail turntable & counterweighted throw switch. */
export function buildRailTurntableSwitch(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('timber', rod(L(0, 0.02, 0), L(0, 0.06, 0), 1.08, 1.08, 12), 0x5b422a);
    p.prop('iron', rod(L(0, 0.06, 0), L(0, 0.11, 0), 0.94, 0.94, 14), 0x353840);
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      const x = 0.83 * Math.cos(a), z = 0.83 * Math.sin(a);
      p.prop('iron', rod(L(x, 0.106, z), L(x, 0.136, z), 0.036, 0.038, 6), 0x656160);
    }
    for (const dx of [-0.34, 0.34]) {
      p.prop('iron', beam(L(dx, 0.13, -0.92), L(dx, 0.13, 0.92), 0.06, 0.06), 0x4b505c);
      p.prop('iron', beam(L(-0.92, 0.13, dx), L(0.92, 0.13, dx), 0.06, 0.06), 0x4b505c);
    }
    p.prop('iron', box(0.24, 0.22, 0.24, L(1.05, 0.11, 0.4), yaw), 0x2b2e34);
    p.prop('iron', beam(L(1.05, 0.16, 0.4), L(1.32, 0.92, 0.4), 0.045, 0.045), 0x4a4e58);
    p.prop('iron', rod(L(1.32, 0.88, 0.4), L(1.32, 1.0, 0.4), 0.1, 0.1, 8), 0x9b3628);
  });
}

/** 5. Four-wheeled assaying furnace brazier trolley with glowing coke crucible & tongs. */
export function buildAssayingBrazierCart(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('iron', stoneBox(1.18, 0.14, 0.78, L(0, 0.34, 0), { yaw, bevel: 0.02 }), 0x30333a);
    for (const wx of [-0.42, 0.42]) {
      for (const wz of [-0.42, 0.42]) {
        p.prop('iron', rod(L(wx, 0.18, wz - 0.05), L(wx, 0.18, wz + 0.05), 0.18, 0.18, 10), 0x454952);
        p.prop('iron', rod(L(wx, 0.18, wz - 0.065), L(wx, 0.18, wz + 0.065), 0.065, 0.065, 8), 0x69635a);
      }
    }
    p.prop('rock_debris', stoneBox(0.68, 0.48, 0.62, L(-0.14, 0.64, 0), { yaw, bevel: 0.04 }), 0x625a54);
    p.prop('iron', rod(L(-0.14, 0.88, 0), L(-0.14, 1.02, 0), 0.24, 0.28, 10), 0x2e3138);
    p.prop('glow', box(0.28, 0.14, 0.28, L(-0.14, 1.04, 0), yaw), '#ff7828', 2.8);
    p.light(L(-0.14, 1.24, 0), '#ff8836', 3.4, 13, { halo: 0.85, flicker: 0.18 });
    p.prop('iron', beam(L(0.45, 0.42, -0.32), L(0.84, 0.86, -0.32), 0.04, 0.04), 0x3d4048);
    p.prop('iron', beam(L(0.45, 0.42, 0.32), L(0.84, 0.86, 0.32), 0.04, 0.04), 0x3d4048);
    p.prop('timber', rod(L(0.84, 0.86, -0.34), L(0.84, 0.86, 0.34), 0.04, 0.04, 7), 0x7c5c3b);
    p.nav.block(at, 0.8, 1.4);
  });
}
