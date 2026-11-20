import {
  angularRock,
  beam,
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
const IRON_DARK = 0x2d3036;
const IRON_MID = 0x454952;
const IRON_BRIGHT = 0x686e7a;

/** 1. Heavy timbered ore loading hopper chute with iron gussets, guillotine gate lever & spilled ore apron. */
export function buildOreHopperChute(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Embedded sleeper footings + iron post shoes + 4 corner posts + X-bracing.
    p.prop('timber', stoneBox(1.62, 0.16, 1.44, L(0, -0.04, 0), { yaw, bevel: 0.02 }), 0x5c432b);
    for (const sx of [-0.65, 0.65]) {
      for (const sz of [-0.55, 0.55]) {
        p.prop('timber', roughTimber(L(sx, 0, sz), L(sx, 1.94, sz), 0.16, 0.15, { taper: 0.04 }), 0x7b5e3e);
        p.prop('iron', stoneBox(0.22, 0.14, 0.22, L(sx, 0.26, sz), { yaw, bevel: 0.014 }), 0x4a4641);
        p.prop('iron', stoneBox(0.20, 0.12, 0.20, L(sx, 1.72, sz), { yaw, bevel: 0.012 }), IRON_DARK);
      }
      // Diagonal timber X-bracing on both side frames.
      p.prop('timber', hewnBeam(L(sx, 0.35, -0.55), L(sx, 1.82, 0.55), 0.10, 0.10), 0x6b5034);
      p.prop('timber', hewnBeam(L(sx, 0.35, 0.55), L(sx, 1.82, -0.55), 0.09, 0.09), 0x644a30);
    }
    // Rear cross-tie + planked flared hopper bin + triple riveted iron straps.
    p.prop('timber', hewnBeam(L(-0.65, 0.62, -0.55), L(0.65, 0.62, -0.55), 0.11, 0.11), 0x6b5034);
    p.prop('timber', extrudedProfile([[-0.74, 0], [0.74, 0], [0.44, -0.70], [-0.44, -0.70]], 1.18, {
      yaw,
      rx: Math.PI / 2,
      at: L(0, 1.72, 0),
    }), 0x856643);
    for (const sy of [1.24, 1.54, 1.82]) {
      p.prop('iron', stoneBox(1.52, 0.065, 1.28, L(0, sy, 0), { yaw, bevel: 0.01 }), IRON_DARK);
    }
    // Slotted iron guillotine chute gate + guide rails + counterweighted ratchet lever + discharge lip.
    for (const gx of [-0.44, 0.44]) {
      p.prop('iron', stoneBox(0.08, 0.68, 0.09, L(gx, 1.12, 0.56), { yaw, bevel: 0.01 }), IRON_MID);
    }
    p.prop('iron', stoneBox(0.82, 0.42, 0.055, L(0, 1.16, 0.56), { yaw, bevel: 0.01 }), IRON_DARK);
    p.prop('iron', hewnBeam(L(0.44, 1.14, 0.56), L(0.96, 1.62, 0.56), 0.05, 0.05), IRON_MID);
    p.prop('iron', rod(L(0.96, 1.58, 0.56), L(0.96, 1.72, 0.56), 0.09, 0.09, 8), IRON_BRIGHT);
    p.prop('iron', stoneBox(0.92, 0.06, 0.66, L(0, 0.96, 0.58), { yaw, bevel: 0.012 }), 0x34373d);
    for (const gx of [-0.44, 0.44]) {
      p.prop('iron', stoneBox(0.05, 0.16, 0.64, L(gx, 1.04, 0.58), { yaw, bevel: 0.01 }), IRON_MID);
    }
    // Spilled angular ore mound + mine-rubble apron around footings.
    for (const [ox, oy, oz, rx, ry, rz, sd] of [
      [0, 0.20, 0.48, 0.46, 0.26, 0.40, 41],
      [-0.28, 0.14, 0.66, 0.26, 0.16, 0.24, 42],
      [0.26, 0.15, 0.62, 0.24, 0.18, 0.22, 43],
    ]) {
      p.prop('ore', angularRock(rx, ry, rz, L(ox, oy, oz), { seed: sd, yaw }), 0xc8a468);
    }
    for (const [rx, rz, sd] of [[-0.78, 0.62, 11], [0.76, -0.62, 12], [0.68, 0.64, 13]]) {
      p.prop('rock_debris', angularRock(0.32, 0.14, 0.28, L(rx, 0.02, rz), { seed: sd, yaw }), 0x7b7268);
    }
    p.nav.block(at, 0.95, 2.2);
  });
}

/** 2. Underground dewatering rocker-pump rig with bolted A-frame, flanged cylinder, sluice trough & spoked flywheel. */
export function buildDewateringPumpRig(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('timber', stoneBox(1.52, 0.18, 1.12, L(0, -0.05, 0), { yaw, bevel: 0.025 }), 0x5c432b);
    // Bolted A-frame timber legs + mid cross-ties + iron apex fulcrum saddle.
    for (const sz of [-0.38, 0.38]) {
      p.prop('timber', roughTimber(L(-0.58, 0, sz), L(0, 1.58, sz * 0.4), 0.13, 0.11), 0x785b3c);
      p.prop('timber', roughTimber(L(0.58, 0, sz), L(0, 1.58, sz * 0.4), 0.13, 0.11), 0x785b3c);
      p.prop('timber', hewnBeam(L(-0.34, 0.68, sz * 0.72), L(0.34, 0.68, sz * 0.72), 0.09, 0.09), 0x6b5034);
    }
    p.prop('iron', stoneBox(0.32, 0.22, 0.48, L(0, 1.52, 0), { yaw, bevel: 0.018 }), IRON_DARK);
    p.prop('timber', rod(L(0, 1.52, -0.38), L(0, 1.52, 0.38), 0.08, 0.08, 10), 0x5c442c);
    // Rocker beam with iron end clevises & reinforcement straps.
    p.prop('timber', hewnBeam(L(-1.14, 1.64, 0), L(1.08, 1.48, 0), 0.13, 0.17), 0x876745);
    for (const bx of [-0.78, 0, 0.85]) {
      p.prop('iron', stoneBox(0.14, 0.20, 0.18, L(bx, 1.56 - bx * 0.07, 0), { yaw, bevel: 0.01 }), IRON_MID);
    }
    // Flanged cast-iron pump cylinder with bolt-ring flanges, stuffing gland, piston rod & curved spout.
    p.prop('iron', rod(L(-0.78, 0.14, 0), L(-0.78, 1.58, 0), 0.048, 0.048, 8), 0x383b42);
    p.prop('iron', rod(L(-0.78, 0, 0), L(-0.78, 0.92, 0), 0.19, 0.17, 12), IRON_DARK);
    for (const fy of [0.10, 0.68, 0.88]) {
      p.prop('iron', rod(L(-0.78, fy - 0.04, 0), L(-0.78, fy + 0.04, 0), 0.25, 0.25, 12), IRON_MID);
    }
    p.prop('iron', rod(L(-0.78, 0.46, 0.10), L(-0.78, 0.42, 0.38), 0.088, 0.078, 10), IRON_BRIGHT);
    // Planked iron-strapped wooden discharge sluice trough.
    p.prop('timber', stoneBox(1.32, 0.08, 0.44, L(0.05, 0.20, 0.20), { yaw, bevel: 0.012 }), 0x6f5336);
    for (const dz of [-0.01, 0.40]) {
      p.prop('timber', stoneBox(1.32, 0.24, 0.06, L(0.05, 0.30, dz), { yaw, bevel: 0.01 }), 0x7a5c3d);
    }
    for (const sx of [-0.42, 0.48]) {
      p.prop('iron', stoneBox(0.06, 0.28, 0.48, L(sx, 0.28, 0.20), { yaw, bevel: 0.008 }), IRON_DARK);
    }
    // Connecting rod + spoked cast-iron flywheel + axle pillow block.
    p.prop('iron', rod(L(0.85, 1.48, 0), L(0.95, 0.48, 0), 0.036, 0.036, 8), IRON_MID);
    p.prop('iron', rod(L(0.95, 0.48, -0.10), L(0.95, 0.48, 0.10), 0.32, 0.32, 14), IRON_DARK);
    p.prop('iron', rod(L(0.95, 0.48, -0.16), L(0.95, 0.48, 0.16), 0.09, 0.09, 10), IRON_BRIGHT);
    for (let s = 0; s < 4; s += 1) {
      const a = (s / 4) * Math.PI;
      p.prop('iron', beam(
        L(0.95 + Math.cos(a) * 0.28, 0.48 + Math.sin(a) * 0.28, 0),
        L(0.95 - Math.cos(a) * 0.28, 0.48 - Math.sin(a) * 0.28, 0),
        0.04, 0.04,
      ), IRON_MID);
    }
    p.prop('rock_debris', angularRock(0.36, 0.12, 0.34, L(-0.72, 0.02, -0.45), { seed: 23, yaw }), 0x6f6860);
    p.nav.block(at, 1.0, 2.0);
  });
}

/** 3. Padlocked timber powder magazine locker under bracketed slate lean-to shed & twin hooped kegs. */
export function buildPowderMagazineLocker(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Heavy timber base skids + paneled locker carcass + corner vertical battens.
    p.prop('timber', stoneBox(1.58, 0.12, 0.90, L(0, 0.06, 0), { yaw, bevel: 0.015 }), 0x543c27);
    p.prop('timber', stoneBox(1.50, 1.22, 0.82, L(0, 0.68, 0), { yaw, bevel: 0.03 }), 0x6b4e34);
    for (const sx of [-0.72, 0, 0.72]) {
      p.prop('timber', stoneBox(0.10, 1.24, 0.86, L(sx, 0.68, 0), { yaw, bevel: 0.012 }), 0x7c5c3e);
    }
    // Triple forged iron straps + pintle hinges + heavy brass padlock & hasp.
    for (const dy of [0.30, 0.66, 1.02]) {
      p.prop('iron', stoneBox(1.56, 0.065, 0.88, L(0, dy, 0), { yaw, bevel: 0.01 }), IRON_DARK);
    }
    for (const y of [0.30, 1.02]) {
      p.prop('iron', rod(L(-0.56, y - 0.08, 0.44), L(-0.56, y + 0.08, 0.44), 0.036, 0.036, 8), IRON_BRIGHT);
    }
    p.prop('iron', stoneBox(0.12, 0.34, 0.08, L(0, 0.72, 0.44), { yaw, bevel: 0.01 }), IRON_MID);
    p.prop('iron', stoneBox(0.18, 0.24, 0.12, L(0, 0.60, 0.46), { yaw, bevel: 0.016 }), 0xb68d46);
    // Bracketed sloped lean-to roof with overlapping ridge cap & red powder warning pennant.
    for (const sx of [-0.72, 0.72]) {
      p.prop('timber', hewnBeam(L(sx, 1.12, 0.42), L(sx, 1.38, 0.58), 0.07, 0.07), 0x584029);
    }
    p.prop('timber', panel(L(-0.92, 1.46, -0.54), L(-0.92, 1.32, 0.58), P(1, 0, 0), 1.88, 0.10), 0x523b26);
    p.prop('iron', rod(L(0.76, 1.24, 0.44), L(0.76, 1.72, 0.44), 0.018, 0.016, 6), IRON_MID);
    p.prop('cloth', panel(L(0.76, 1.68, 0.44), L(0.76, 1.22, 0.44), P(1, 0, 0), 0.28, 0.02), 0xb83828);
    // Twin hooped powder kegs beside locker.
    for (const [kx, kz, kh, kr] of [[-0.48, 0.68, 0.56, 0.20], [0.46, 0.66, 0.46, 0.17]]) {
      p.prop('timber', rod(L(kx, 0, kz), L(kx, kh, kz), kr, kr * 0.94, 10), 0x80603e);
      for (const hf of [0.20, 0.78]) {
        p.prop('iron', rod(L(kx, kh * hf, kz), L(kx, kh * hf + 0.04, kz), kr + 0.014, kr + 0.014, 10), IRON_DARK);
      }
    }
    p.nav.block(at, 0.95, 1.8);
  });
}

/** 4. Flush spiked timber-and-iron mine rail turntable with center frog plate & counterweighted switch target vane. */
export function buildRailTurntableSwitch(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Circular timber pit curb + iron bearing race ring + 12 forged rim rivets + central pivot cap.
    p.prop('timber', rod(L(0, 0.01, 0), L(0, 0.06, 0), 1.12, 1.12, 16), 0x5b422a);
    p.prop('iron', rod(L(0, 0.06, 0), L(0, 0.11, 0), 0.98, 0.98, 16), 0x353840);
    p.prop('iron', rod(L(0, 0.10, 0), L(0, 0.15, 0), 0.20, 0.16, 10), IRON_BRIGHT);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const x = 0.86 * Math.cos(a), z = 0.86 * Math.sin(a);
      p.prop('iron', rod(L(x, 0.106, z), L(x, 0.14, z), 0.032, 0.034, 6), 0x656160);
    }
    // Crossed flanged steel rail tracks + tie-plates + inner guard rails.
    for (const dx of [-0.34, 0.34]) {
      p.prop('iron', hewnBeam(L(dx, 0.14, -0.94), L(dx, 0.14, 0.94), 0.065, 0.07, { bevel: 0.01 }), 0x585e6b);
      p.prop('iron', hewnBeam(L(-0.94, 0.14, dx), L(0.94, 0.14, dx), 0.065, 0.07, { bevel: 0.01 }), 0x585e6b);
    }
    // Cast-iron switch stand housing, notched quadrant, throw linkage rod, lever, target vane & counterweight ball.
    p.prop('iron', stoneBox(0.30, 0.24, 0.30, L(1.08, 0.12, 0.40), { yaw, bevel: 0.02 }), IRON_DARK);
    p.prop('iron', beam(L(0.92, 0.12, 0.40), L(1.08, 0.12, 0.40), 0.032, 0.032), IRON_MID);
    p.prop('iron', rod(L(1.08, 0.22, 0.40), L(1.08, 1.12, 0.40), 0.026, 0.024, 6), IRON_MID);
    p.prop('iron', stoneBox(0.24, 0.22, 0.03, L(1.08, 1.02, 0.40), { yaw, bevel: 0.008 }), 0xb63c2c);
    p.prop('iron', beam(L(1.08, 0.18, 0.40), L(1.38, 0.96, 0.40), 0.045, 0.045), 0x4a4e58);
    p.prop('iron', rod(L(1.38, 0.88, 0.40), L(1.38, 1.04, 0.40), 0.11, 0.11, 10), 0x9b3628);
  });
}

/** 5. Four-wheeled assaying furnace brazier trolley with firebrick hearth, perforated basket, crucible, tongs & spoked wheels. */
export function buildAssayingBrazierCart(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, MINE_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Riveted iron chassis frame + axle bearing blocks + 4 flanged spoked iron wheels.
    p.prop('iron', stoneBox(1.24, 0.14, 0.82, L(0, 0.34, 0), { yaw, bevel: 0.02 }), IRON_DARK);
    for (const wx of [-0.44, 0.44]) {
      p.prop('iron', rod(L(wx, 0.18, -0.46), L(wx, 0.18, 0.46), 0.036, 0.036, 8), IRON_MID);
      for (const wz of [-0.44, 0.44]) {
        p.prop('iron', rod(L(wx, 0.18, wz - 0.045), L(wx, 0.18, wz + 0.045), 0.19, 0.19, 12), IRON_MID);
        p.prop('iron', rod(L(wx, 0.18, wz - 0.068), L(wx, 0.18, wz + 0.068), 0.065, 0.065, 8), 0x69635a);
      }
    }
    // Firebrick-lined hearth with iron corner angles & ash cleanout door.
    p.prop('rock_debris', stoneBox(0.74, 0.50, 0.66, L(-0.14, 0.66, 0), { yaw, bevel: 0.04 }), 0x625a54);
    for (const [cx, cz] of [[-0.50, -0.32], [0.22, -0.32], [-0.50, 0.32], [0.22, 0.32]]) {
      p.prop('iron', stoneBox(0.07, 0.54, 0.07, L(cx, 0.66, cz), { yaw, bevel: 0.01 }), IRON_DARK);
    }
    p.prop('iron', stoneBox(0.06, 0.24, 0.28, L(0.24, 0.56, 0), { yaw, bevel: 0.01 }), IRON_MID);
    // Ribbed fire basket + glowing coke bed + graphite assay crucible + resting iron tongs.
    p.prop('iron', rod(L(-0.14, 0.90, 0), L(-0.14, 1.06, 0), 0.26, 0.30, 12), IRON_DARK);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      p.prop('iron', rod(L(-0.14 + Math.cos(a) * 0.28, 0.90, Math.sin(a) * 0.28), L(-0.14 + Math.cos(a) * 0.31, 1.10, Math.sin(a) * 0.31), 0.02, 0.02, 5), IRON_BRIGHT);
    }
    p.prop('glow', angularRock(0.26, 0.12, 0.26, L(-0.14, 1.06, 0), { seed: 77, yaw }), '#ff7828', 2.8);
    p.prop('iron', rod(L(-0.14, 1.06, 0), L(-0.14, 1.24, 0), 0.12, 0.15, 10), 0x3b3d44);
    p.prop('iron', beam(L(0.32, 0.42, 0.36), L(0.68, 0.98, 0.36), 0.022, 0.022), IRON_BRIGHT);
    p.light(L(-0.14, 1.28, 0), '#ff8836', 3.4, 13, { halo: 0.85, flicker: 0.18 });
    // Angled push-bar handle with turned wooden grip.
    for (const hz of [-0.34, 0.34]) {
      p.prop('iron', beam(L(0.46, 0.42, hz), L(0.88, 0.88, hz), 0.042, 0.042), 0x3d4048);
    }
    p.prop('timber', rod(L(0.88, 0.88, -0.38), L(0.88, 0.88, 0.38), 0.042, 0.042, 8), 0x7c5c3b);
    p.nav.block(at, 0.8, 1.4);
  });
}
