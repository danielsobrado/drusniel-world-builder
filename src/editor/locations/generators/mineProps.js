import { angularRock, hewnBeam, rod, roughTimber, stoneBlock, stoneBox } from '../gen/propKit.js';
import { createTimberBeam, createTimberBoard } from '../gen/timberGeometry.js';
import { lantern } from './kits.js';

const P = (x, y, z) => ({ x, y, z });
const UP_DIR = P(0, 1, 0);

/** Miner's pickaxe or heavy sledgehammer leaning against a support or rock wall. */
export function buildMiningTool(b, foot, tip, { head = 'pick', yaw = 0 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  b.prop('timber', createTimberBeam(foot, tip, 0.052, 0.044, {
    sideHint: P(c, 0, -s), bevelRatio: 0.2, irregular: 0.2, bow: 0.012, dampStart: 0.3, dampEnd: 0.1, wear: 0.55,
  }), 0x9c7b55);
  b.prop('iron', stoneBox(0.085, 0.075, 0.085, P(tip.x, tip.y - 0.03, tip.z), { yaw, bevel: 0.014, irregular: 0.04 }), 0x7c838f);
  if (head === 'pick') {
    for (const dir of [-1, 1]) {
      const inner = P(tip.x + c * dir * 0.03, tip.y - 0.025, tip.z - s * dir * 0.03);
      const point = P(tip.x + c * dir * 0.31, tip.y - 0.065, tip.z - s * dir * 0.31);
      b.prop('iron', hewnBeam(inner, point, 0.046, 0.034, { bevel: 0.01, taper: 0.62, irregular: 0.08 }), 0x8a919d);
    }
  } else {
    b.prop('iron', stoneBox(0.27, 0.135, 0.135, P(tip.x, tip.y - 0.03, tip.z), { yaw, bevel: 0.026, irregular: 0.04 }), 0x7e8591);
    for (const dir of [-1, 1]) {
      b.prop('iron', stoneBox(0.03, 0.11, 0.11, P(tip.x + c * dir * 0.135, tip.y - 0.03, tip.z - s * dir * 0.135), {
        yaw, bevel: 0.012, irregular: 0.02,
      }), 0x9aa1ad);
    }
  }
}

/** Chamfered timber lantern pedestal seated on a beveled plinth with iron mounting collar. */
export function buildGroundedLanternPost(b, x, z, {
  probeStartY,
  fallbackFloorY,
  topY,
  width = 0.34,
  postTint = 0x96754f,
  navBlock = true,
  ...lanternOptions
}) {
  const floorY = b.probe(x, probeStartY, z, -1, 3.8) ?? fallbackFloorY;
  const baseY = floorY - 0.12;
  const plinthH = 0.24;
  const postW = Math.max(0.18, width * 0.62);
  // Beveled stone/iron-banded plinth base + chamfered timber shaft + timber cap plate + iron collar.
  b.prop('rock_debris', stoneBlock(width * 1.12, plinthH, width * 1.12, P(x, baseY, z), {
    bevel: 0.04, batter: 0.16, irregular: 0.2,
  }), 0x8e887f);
  b.prop('timber', createTimberBeam(
    P(x, baseY + plinthH * 0.85, z),
    P(x, topY - 0.05, z),
    postW, postW,
    { sideHint: P(1, 0, 0), bevelRatio: 0.16, irregular: 0.2, dampStart: 0.55, dampEnd: 0.18, wear: 0.5 },
  ), postTint);
  b.prop('timber', createTimberBoard(
    P(x - postW * 0.72, topY - 0.025, z),
    P(x + postW * 0.72, topY - 0.025, z),
    P(0, 0, 1), postW * 1.44, 0.05, { irregular: 0.12, wear: 0.52 },
  ), 0xa4825a);
  b.prop('iron', stoneBox(postW * 1.08, 0.045, postW * 1.08, P(x, topY - 0.12, z), { bevel: 0.008, irregular: 0.04 }), 0x6f7682);
  if (navBlock) b.nav.block(P(x, floorY, z), width * 0.95, Math.max(0.8, topY - baseY) + 0.5);
  lantern(b, P(x, topY + 0.215, z), lanternOptions);
}

/** Detailed rail ore cart with planked flared hopper, iron straps, flanged spoked wheels, and angular ore. */
export function buildOreCart(b, at, { loaded = true, yaw = 0 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx, ly, lz) => P(at.x + c * lx + s * lz, at.y + ly, at.z - s * lx + c * lz);
  const plankTones = [0x9c7a53, 0x8d6c47, 0xa6845b];

  // Heavy timber chassis rails + buffer blocks + iron axle bearing boxes.
  for (const sx of [-0.36, 0.36]) {
    b.prop('timber', createTimberBeam(local(sx, 0.23, -0.92), local(sx, 0.23, 0.92), 0.11, 0.1, {
      sideHint: P(c, 0, -s), bevelRatio: 0.14, irregular: 0.15, dampStart: 0.35, dampEnd: 0.35, wear: 0.5,
    }), 0x846545);
  }
  for (const sz of [-0.92, 0.92]) {
    b.prop('timber', createTimberBeam(local(-0.46, 0.23, sz), local(0.46, 0.23, sz), 0.12, 0.12, {
      sideHint: UP_DIR, bevelRatio: 0.14, irregular: 0.15, wear: 0.5,
    }), 0x8b6b49);
  }
  b.prop('iron', stoneBox(1.06, 0.05, 1.76, local(0, 0.29, 0), { yaw, bevel: 0.01 }), 0x6e7580);

  // Flanged iron wheels (outer tread, inner flange, 4 spokes, axle hub) + axles + bearing boxes.
  for (const dz of [-0.55, 0.55]) {
    b.prop('iron', rod(local(-0.56, 0.18, dz), local(0.56, 0.18, dz), 0.045, 0.045, 8), 0x767d88);
    for (const sx of [-0.45, 0.45]) {
      const signX = Math.sign(sx);
      b.prop('iron', stoneBox(0.11, 0.1, 0.13, local(sx - signX * 0.09, 0.2, dz), { yaw, bevel: 0.015 }), 0x686f7a);
      b.prop('iron', rod(local(sx - 0.042, 0.18, dz), local(sx + 0.042, 0.18, dz), 0.185, 0.185, 14), 0x7e8591);
      b.prop('iron', rod(local(sx - signX * 0.052, 0.18, dz), local(sx - signX * 0.032, 0.18, dz), 0.215, 0.215, 14), 0x8c939f);
      b.prop('iron', rod(local(sx - 0.068, 0.18, dz), local(sx + 0.068, 0.18, dz), 0.058, 0.058, 8), 0x9097a3);
      for (const [dy, fz] of [[0.14, 0], [0, 0.14]]) {
        b.prop('iron', rod(local(sx, 0.18 - dy, dz - fz), local(sx, 0.18 + dy, dz + fz), 0.022, 0.022, 6), 0x727984);
      }
    }
  }

  // Planked flared timber hopper: recessed floor, 3 courses of planks on sides/ends, vertical ribs, iron rim.
  b.prop('timber', stoneBox(0.92, 0.07, 1.56, local(0, 0.34, 0), { yaw, bevel: 0.01 }), 0x6b5036);
  for (let row = 0; row < 3; row += 1) {
    const t = (row + 0.5) / 3;
    const py = 0.33 + t * 0.55;
    const flareX = 0.47 + t * 0.1;
    const flareZ = 0.77 + t * 0.08;
    const tone = plankTones[row % plankTones.length];
    for (const sideSign of [-1, 1]) {
      b.prop('timber', createTimberBoard(
        local(sideSign * flareX, py, -flareZ),
        local(sideSign * flareX, py, flareZ),
        UP_DIR, 0.165, 0.045, { irregular: 0.14, damp: row === 0 ? 0.3 : 0.1, wear: 0.5, seed: 111 + row * 17 + sideSign },
      ), tone);
      b.prop('timber', createTimberBoard(
        local(-flareX, py, sideSign * flareZ),
        local(flareX, py, sideSign * flareZ),
        UP_DIR, 0.165, 0.045, { irregular: 0.14, damp: row === 0 ? 0.3 : 0.1, wear: 0.5, seed: 211 + row * 17 + sideSign },
      ), plankTones[(row + 1) % plankTones.length]);
    }
  }
  for (const dz of [-0.62, 0, 0.62]) {
    for (const sideSign of [-1, 1]) {
      b.prop('timber', createTimberBeam(
        local(sideSign * 0.49, 0.31, dz),
        local(sideSign * 0.59, 0.9, dz),
        0.075, 0.065, { sideHint: P(s, 0, c), bevelRatio: 0.14, irregular: 0.14, wear: 0.55 },
      ), 0x7e6041);
    }
  }
  // Iron top rim + corner angle straps + rear push handle bar.
  for (const sideSign of [-1, 1]) {
    b.prop('iron', hewnBeam(local(sideSign * 0.58, 0.9, -0.87), local(sideSign * 0.58, 0.9, 0.87), 0.065, 0.055, { bevel: 0.01 }), 0x7e8591);
    b.prop('iron', hewnBeam(local(-0.58, 0.9, sideSign * 0.86), local(0.58, 0.9, sideSign * 0.86), 0.065, 0.055, { bevel: 0.01 }), 0x7e8591);
    for (const endSign of [-1, 1]) {
      b.prop('iron', hewnBeam(
        local(sideSign * 0.49, 0.32, endSign * 0.78),
        local(sideSign * 0.59, 0.9, endSign * 0.86),
        0.06, 0.06, { bevel: 0.01 },
      ), 0x757c88);
    }
  }
  b.prop('iron', rod(local(-0.34, 0.92, 0.95), local(0.34, 0.92, 0.95), 0.022, 0.022, 8), 0x8b929e);
  for (const sx of [-0.32, 0.32]) {
    b.prop('iron', rod(local(sx, 0.88, 0.85), local(sx, 0.92, 0.95), 0.018, 0.018, 6), 0x787f8b);
  }

  if (loaded) {
    const chunks = [
      [0, 0.92, 0, 0.34, 0.24, 0.32],
      [-0.25, 0.88, 0.34, 0.24, 0.2, 0.25],
      [0.24, 0.9, -0.32, 0.26, 0.22, 0.24],
      [-0.2, 0.88, -0.36, 0.22, 0.19, 0.24],
      [0.21, 0.91, 0.32, 0.23, 0.2, 0.22],
      [0.02, 1.04, 0.14, 0.19, 0.16, 0.18],
      [-0.14, 0.98, -0.08, 0.18, 0.15, 0.19],
      [0.16, 0.96, 0.06, 0.17, 0.14, 0.16],
    ];
    for (let i = 0; i < chunks.length; i += 1) {
      const [ox, oy, oz, rx, ry, rz] = chunks[i];
      b.prop('ore', angularRock(rx, ry, rz, local(ox, oy, oz), {
        yaw: yaw + ox * 3.1 + oz * 1.7,
        irregular: 0.48,
        seed: 800 + i * 29,
      }), i % 2 ? 0xc7a679 : 0xd6b88e);
    }
  }
  b.nav.block(at, 1.0, 2);
}

/** Spoked iron headframe pulley sheave wheel with grooved flanges and pillow-block bearings. */
export function buildPulleySheave(b, center, radius = 0.52) {
  for (const dx of [-0.075, 0.075]) {
    b.prop('iron', rod(P(center.x + dx - 0.025, center.y, center.z), P(center.x + dx + 0.025, center.y, center.z), radius, radius, 16), 0x848b97);
  }
  b.prop('iron', rod(P(center.x - 0.055, center.y, center.z), P(center.x + 0.055, center.y, center.z), radius * 0.84, radius * 0.84, 16), 0x6f7682);
  b.prop('iron', rod(P(center.x - 0.24, center.y, center.z), P(center.x + 0.24, center.y, center.z), 0.11, 0.11, 10), 0x8b929e);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI;
    const dy = Math.sin(a) * radius * 0.84, dz = Math.cos(a) * radius * 0.84;
    b.prop('iron', rod(P(center.x, center.y - dy, center.z - dz), P(center.x, center.y + dy, center.z + dz), 0.026, 0.026, 6), 0x767d89);
  }
  for (const dx of [-0.24, 0.24]) {
    b.prop('iron', stoneBox(0.12, 0.16, 0.18, P(center.x + dx, center.y - 0.04, center.z), { bevel: 0.015 }), 0x6b727e);
  }
}

/** Braced A-frame manual hoist windlass with coiled rope drum, ratchet gear, and crank handle. */
export function buildWindlass(b, wx, floorY, wz) {
  for (const dz of [-0.66, 0.66]) {
    b.prop('timber', createTimberBeam(P(wx - 0.35, floorY, wz + dz), P(wx + 0.35, floorY, wz + dz), 0.16, 0.12, {
      sideHint: UP_DIR, bevelRatio: 0.14, irregular: 0.16, dampStart: 0.5, dampEnd: 0.5, wear: 0.5,
    }), 0x876746);
    b.prop('timber', createTimberBeam(P(wx - 0.22, floorY + 0.08, wz + dz), P(wx, floorY + 1.1, wz + dz), 0.14, 0.13, {
      sideHint: P(0, 0, 1), bevelRatio: 0.14, irregular: 0.16, wear: 0.5,
    }), 0x987751);
    b.prop('timber', createTimberBeam(P(wx + 0.22, floorY + 0.08, wz + dz), P(wx, floorY + 1.1, wz + dz), 0.14, 0.13, {
      sideHint: P(0, 0, 1), bevelRatio: 0.14, irregular: 0.16, wear: 0.5,
    }), 0x987751);
  }
  const axleY = floorY + 1.05;
  b.prop('timber', rod(P(wx, axleY, wz - 0.56), P(wx, axleY, wz + 0.56), 0.21, 0.21, 12), 0x9c7a53);
  for (let i = 0; i < 6; i += 1) {
    const rz = wz - 0.42 + i * 0.15;
    b.prop('timber', rod(P(wx, axleY, rz), P(wx, axleY, rz + 0.075), 0.235, 0.235, 12), i % 2 ? 0xc2a67d : 0xb3966e);
  }
  b.prop('iron', rod(P(wx, axleY, wz - 0.88), P(wx, axleY, wz + 0.94), 0.055, 0.055, 8), 0x7e8591);
  b.prop('iron', rod(P(wx, axleY, wz - 0.56), P(wx, axleY, wz - 0.51), 0.27, 0.27, 12), 0x6f7682);
  // Bent iron crank handle on +Z end.
  b.prop('iron', hewnBeam(P(wx, axleY, wz + 0.92), P(wx + 0.34, axleY + 0.18, wz + 0.92), 0.05, 0.045, { bevel: 0.008 }), 0x828995);
  b.prop('iron', rod(P(wx + 0.34, axleY + 0.18, wz + 0.92), P(wx + 0.34, axleY + 0.18, wz + 1.18), 0.028, 0.028, 8), 0x9aa1ad);
}

/** Planked timber sorting bench with raised tray lip, knee-braced legs, ore specimens, and assay pan. */
export function buildSortingBench(b, at, floorY, yaw = 0.3) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx, ly, lz) => P(at.x + c * lx + s * lz, at.y + ly, at.z - s * lx + c * lz);
  const plankTones = [0xa07e57, 0x92704b, 0xaa8860, 0x96744f];

  for (let i = 0; i < 4; i += 1) {
    const lz = -0.46 + i * 0.305;
    b.prop('timber', createTimberBoard(
      local(-1.58, -0.06, lz), local(1.58, -0.06, lz), P(-s, 0, c), 0.28, 0.075,
      { irregular: 0.14, damp: 0.15, wear: 0.52, seed: 310 + i * 19 },
    ), plankTones[i]);
  }
  for (const lz of [-0.62, 0.62]) {
    b.prop('timber', createTimberBeam(local(-1.62, -0.01, lz), local(1.62, -0.01, lz), 0.08, 0.09, {
      sideHint: UP_DIR, bevelRatio: 0.14, irregular: 0.15, wear: 0.5,
    }), 0x8c6b47);
  }
  for (const [lx, lz] of [[-1.3, -0.42], [1.3, -0.42], [-1.3, 0.42], [1.3, 0.42]]) {
    const foot = local(lx, floorY - at.y, lz);
    const top = local(lx, -0.1, lz);
    b.prop('timber', createTimberBeam(foot, top, 0.13, 0.13, {
      sideHint: P(c, 0, -s), bevelRatio: 0.15, irregular: 0.18, dampStart: 0.45, dampEnd: 0.15, wear: 0.5,
    }), 0x906f4b);
  }
  for (const lx of [-1.3, 1.3]) {
    b.prop('timber', createTimberBeam(local(lx, -0.58, -0.42), local(lx, -0.58, 0.42), 0.09, 0.09, {
      sideHint: UP_DIR, bevelRatio: 0.14, irregular: 0.15, wear: 0.5,
    }), 0x866644);
  }
  b.prop('timber', createTimberBeam(local(-1.3, -0.55, 0), local(1.3, -0.55, 0), 0.1, 0.09, {
    sideHint: UP_DIR, bevelRatio: 0.14, irregular: 0.15, wear: 0.5,
  }), 0x866644);

  // Ore specimens + forged iron assay pan.
  for (const [ox, oz, sc] of [[-0.85, 0.08, 0.15], [-0.45, -0.14, 0.18], [0.15, 0.18, 0.14], [0.95, -0.1, 0.13]]) {
    b.prop('ore', angularRock(sc * 1.15, sc * 0.85, sc, local(ox, 0.06, oz), {
      yaw: yaw + ox * 2.5, irregular: 0.46, seed: Math.round((ox + oz) * 100) + 911,
    }), 0xd6b88e);
  }
  b.prop('iron', rod(local(0.45, -0.02, -0.08), local(0.45, 0.04, -0.08), 0.18, 0.23, 12), 0x828995);
  buildMiningTool(b, local(-1.55, floorY - at.y, 0.72), local(-1.05, 0.24, 0.44), { head: 'sledge', yaw });
  b.nav.block(P(at.x, floorY, at.z), 1.7, 2);
}

/** Interlocking notched timber ore crib filled with fractured mineral ore chunks. */
export function buildOreCrib(b, crib, yaw = 0.25) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx, ly, lz) => P(crib.x + c * lx + s * lz, crib.y + ly, crib.z - s * lx + c * lz);
  for (let course = 0; course < 3; course += 1) {
    const y0 = 0.08 + course * 0.22;
    const tone = course % 2 ? 0x94734e : 0x866643;
    for (const lz of [-0.56, 0.56]) {
      b.prop('timber', createTimberBeam(local(-0.92, y0, lz), local(0.92, y0, lz), 0.15, 0.14, {
        sideHint: UP_DIR, bevelRatio: 0.15, irregular: 0.2, dampStart: course === 0 ? 0.45 : 0.15, dampEnd: course === 0 ? 0.45 : 0.15, wear: 0.5,
      }), tone);
    }
    for (const lx of [-0.8, 0.8]) {
      b.prop('timber', createTimberBeam(local(lx, y0 + 0.11, -0.68), local(lx, y0 + 0.11, 0.68), 0.15, 0.14, {
        sideHint: UP_DIR, bevelRatio: 0.15, irregular: 0.2, wear: 0.5,
      }), 0x9b7a54);
    }
  }
  b.prop('timber', stoneBox(1.52, 0.46, 1.04, local(0, 0.26, 0), { yaw, bevel: 0.02, irregular: 0.1 }), 0x6a5036);
  const chunks = [
    [0, 0.62, 0, 0.38, 0.26, 0.32],
    [-0.38, 0.58, 0.18, 0.28, 0.22, 0.26],
    [0.36, 0.6, -0.16, 0.3, 0.24, 0.24],
    [-0.22, 0.64, -0.24, 0.24, 0.19, 0.22],
    [0.24, 0.62, 0.22, 0.25, 0.2, 0.24],
    [0.04, 0.78, -0.04, 0.2, 0.16, 0.18],
  ];
  for (let i = 0; i < chunks.length; i += 1) {
    const [ox, oy, oz, rx, ry, rz] = chunks[i];
    b.prop('ore', angularRock(rx, ry, rz, local(ox, oy, oz), {
      yaw: yaw + ox * 2.4, irregular: 0.5, seed: 1020 + i * 31,
    }), i % 2 ? 0xd8ba90 : 0xc8a77a);
  }
}

/** Planked timber duckboard pier with stringer beams, piling posts, and edge kerbs over flooded water. */
export function buildDuckboardPier(b, waterY, startZ = -79.85, endZ = -83.65) {
  const pierY = waterY + 0.18;
  const plankTones = [0x91704d, 0x836443, 0x9a7854];
  for (const pz of [-80.4, -81.8, -83.2]) {
    for (const px of [-0.92, 0.92]) {
      b.prop('timber', createTimberBeam(P(px, pierY - 0.92, pz), P(px, pierY + 0.04, pz), 0.19, 0.19, {
        sideHint: P(1, 0, 0), bevelRatio: 0.15, irregular: 0.2, dampStart: 0.75, dampEnd: 0.35, wear: 0.5,
      }), 0x7e6143);
    }
  }
  for (const px of [-0.88, 0, 0.88]) {
    b.prop('timber', createTimberBeam(P(px, pierY - 0.08, startZ), P(px, pierY - 0.08, endZ), 0.14, 0.14, {
      sideHint: UP_DIR, bevelRatio: 0.14, irregular: 0.18, dampStart: 0.45, dampEnd: 0.45, wear: 0.5,
    }), 0x876848);
  }
  const plankCount = 12;
  const step = (endZ - startZ) / plankCount;
  for (let i = 0; i < plankCount; i += 1) {
    const pz = startZ + (i + 0.5) * step;
    b.prop('timber', createTimberBoard(
      P(-1.12, pierY + 0.015, pz), P(1.12, pierY + 0.015, pz),
      P(0, 0, 1), Math.abs(step) * 0.86, 0.065,
      { irregular: 0.16, damp: 0.42, wear: 0.55, seed: 1200 + i * 19 },
    ), plankTones[i % plankTones.length]);
  }
  for (const px of [-1.06, 1.06]) {
    b.prop('timber', createTimberBeam(P(px, pierY + 0.075, startZ), P(px, pierY + 0.075, endZ), 0.09, 0.075, {
      sideHint: UP_DIR, bevelRatio: 0.15, irregular: 0.16, dampStart: 0.3, dampEnd: 0.3, wear: 0.5,
    }), 0x8e6e4b);
  }
  b.nav.addSegment(P(0, pierY + 0.05, startZ + 0.05), P(0, pierY + 0.05, endZ + 0.15), 1.8);
}
