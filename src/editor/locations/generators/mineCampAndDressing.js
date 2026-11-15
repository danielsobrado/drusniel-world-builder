import { angularRock, hewnBeam, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { createTimberBeam, createTimberBoard } from '../gen/timberGeometry.js';
import { barrel, crate, lantern } from './kits.js';
import { buildMiningTool } from './mineProps.js';

const P = (x, y, z) => ({ x, y, z });
const UP_DIR = P(0, 1, 0);

/** Burlap ore/grain sack with pinched neck and rope tie. */
export function buildOreSack(b, at, { scale = 1, yaw = 0, tint = 0x9b8665 } = {}) {
  const s = scale;
  b.prop('rock_debris', stoneBlock(0.38 * s, 0.42 * s, 0.34 * s, P(at.x, at.y, at.z), {
    yaw, bevel: 0.08 * s, batter: 0.28, irregular: 0.26,
  }), tint);
  b.prop('timber', rod(P(at.x, at.y + 0.38 * s, at.z), P(at.x, at.y + 0.43 * s, at.z), 0.1 * s, 0.11 * s, 8), 0xb89f78);
  b.prop('rock_debris', rod(P(at.x, at.y + 0.42 * s, at.z), P(at.x, at.y + 0.54 * s, at.z), 0.08 * s, 0.14 * s, 8), tint);
}

/** Planked wooden mine wheelbarrow with iron wheel, handles, legs, and optional ore load. */
export function buildWheelbarrow(b, at, { yaw = 0, loaded = true } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx, ly, lz) => P(at.x + c * lx + s * lz, at.y + ly, at.z - s * lx + c * lz);
  const tones = [0x9c7a53, 0x8e6d48];
  // Seeds include where the barrow stands, so two barrows never carry identical boards and ore.
  const placed = Math.round(Math.abs(at.x) * 31 + Math.abs(at.z) * 17);

  // Two long handles extending from front wheel axle to rear grip.
  for (const lx of [-0.26, 0.26]) {
    b.prop('timber', createTimberBeam(local(lx, 0.2, 0.72), local(lx * 1.15, 0.56, -0.78), 0.065, 0.06, {
      sideHint: UP_DIR, bevelRatio: 0.16, irregular: 0.14, wear: 0.5,
    }), 0x96754f);
  }
  // Rear support legs + cross-brace.
  for (const lx of [-0.27, 0.27]) {
    b.prop('timber', createTimberBeam(local(lx, 0, -0.38), local(lx, 0.42, -0.34), 0.06, 0.06, {
      sideHint: P(c, 0, -s), bevelRatio: 0.15, dampStart: 0.5, wear: 0.5,
    }), 0x886845);
  }
  b.prop('timber', createTimberBeam(local(-0.27, 0.18, -0.37), local(0.27, 0.18, -0.37), 0.05, 0.05, {
    sideHint: UP_DIR, bevelRatio: 0.14,
  }), 0x886845);

  // Front iron wheel + axle.
  b.prop('iron', rod(local(-0.24, 0.2, 0.68), local(0.24, 0.2, 0.68), 0.025, 0.025, 8), 0x7e8591);
  b.prop('iron', rod(local(-0.035, 0.2, 0.68), local(0.035, 0.2, 0.68), 0.2, 0.2, 12), 0x767d88);
  b.prop('iron', rod(local(-0.05, 0.2, 0.68), local(0.05, 0.2, 0.68), 0.055, 0.055, 8), 0x8f96a2);

  // Planked tray body.
  b.prop('timber', stoneBox(0.56, 0.06, 0.76, local(0, 0.38, 0.04), { yaw, bevel: 0.01 }), 0x7a5d3f);
  for (let row = 0; row < 2; row += 1) {
    const py = 0.44 + row * 0.14;
    const fx = 0.29 + row * 0.05;
    for (const sideSign of [-1, 1]) {
      b.prop('timber', createTimberBoard(
        local(sideSign * fx, py, -0.32), local(sideSign * fx, py, 0.42),
        UP_DIR, 0.13, 0.036, { irregular: 0.14, wear: 0.5, seed: 1300 + placed + row * 17 + sideSign },
      ), tones[row]);
    }
    b.prop('timber', createTimberBoard(
      local(-fx, py, 0.42), local(fx, py, 0.42),
      UP_DIR, 0.13, 0.036, { irregular: 0.14, wear: 0.5, seed: 1350 + placed + row * 17 },
    ), tones[1 - row]);
    b.prop('timber', createTimberBoard(
      local(-fx, py, -0.32), local(fx, py, -0.32),
      UP_DIR, 0.13, 0.036, { irregular: 0.14, wear: 0.5, seed: 1390 + placed + row * 17 },
    ), tones[row]);
  }
  if (loaded) {
    for (const [ox, oy, oz, sc] of [[0, 0.56, 0.06, 0.18], [-0.12, 0.52, -0.1, 0.14], [0.13, 0.53, 0.16, 0.15]]) {
      b.prop('ore', angularRock(sc, sc * 0.75, sc, local(ox, oy, oz), {
        yaw: yaw + ox * 4, irregular: 0.48, seed: Math.round((ox + oz) * 100) + 1400 + placed,
      }), 0xd4b68c);
    }
  }
  b.nav.block(at, 0.65, 1.5);
}

/** Miner's shovel leaning against a wall or rack. */
export function buildShovel(b, foot, tip, { yaw = 0 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  b.prop('timber', createTimberBeam(foot, tip, 0.044, 0.04, {
    sideHint: P(c, 0, -s), bevelRatio: 0.2, irregular: 0.15, wear: 0.5,
  }), 0x9c7b55);
  b.prop('timber', createTimberBeam(
    P(tip.x - c * 0.08, tip.y, tip.z + s * 0.08),
    P(tip.x + c * 0.08, tip.y, tip.z - s * 0.08),
    0.04, 0.04, { sideHint: UP_DIR, bevelRatio: 0.15 },
  ), 0xa6845b);
  b.prop('iron', stoneBox(0.24, 0.28, 0.028, P(foot.x, foot.y + 0.14, foot.z), { yaw, bevel: 0.008, batter: 0.18, irregular: 0.04 }), 0x828995);
}

/** A-frame timber tool rack holding pickaxes and a shovel, plus spare rail & sleeper stack. */
export function buildToolAndTrackStation(b, at, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx, ly, lz) => P(at.x + c * lx + s * lz, at.y + ly, at.z - s * lx + c * lz);

  // Timber A-frame rack.
  for (const lx of [-0.75, 0.75]) {
    b.prop('timber', createTimberBeam(local(lx, 0, -0.32), local(lx, 1.25, 0), 0.09, 0.09, {
      sideHint: P(c, 0, -s), bevelRatio: 0.15, dampStart: 0.4, wear: 0.5,
    }), 0x94734e);
    b.prop('timber', createTimberBeam(local(lx, 0, 0.32), local(lx, 1.25, 0), 0.09, 0.09, {
      sideHint: P(c, 0, -s), bevelRatio: 0.15, dampStart: 0.4, wear: 0.5,
    }), 0x94734e);
  }
  b.prop('timber', createTimberBeam(local(-0.88, 1.22, 0), local(0.88, 1.22, 0), 0.1, 0.1, {
    sideHint: UP_DIR, bevelRatio: 0.15, wear: 0.5,
  }), 0x9c7b54);
  b.prop('timber', createTimberBeam(local(-0.82, 0.32, 0.22), local(0.82, 0.32, 0.22), 0.08, 0.08, {
    sideHint: UP_DIR, bevelRatio: 0.14, wear: 0.5,
  }), 0x8c6b47);

  buildMiningTool(b, local(-0.42, 0.02, 0.26), local(-0.38, 1.18, 0.03), { head: 'pick', yaw });
  buildMiningTool(b, local(0.05, 0.02, 0.28), local(0.08, 1.18, 0.03), { head: 'sledge', yaw: yaw + 0.1 });
  buildShovel(b, local(0.45, 0.02, 0.26), local(0.42, 1.18, 0.03), { yaw });

  // Spare iron rail lengths & timber sleepers stacked beside the rack.
  for (const lz of [-0.62, -0.78]) {
    b.prop('iron', hewnBeam(local(-0.95, 0.06, lz), local(0.95, 0.06, lz), 0.07, 0.09, { bevel: 0.014, irregular: 0.04 }), 0x7e8591);
  }
  b.nav.block(at, 1.0, 1.6);
}

/**
 * Miner's underground break camp: stone-ringed glowing brazier firepit with iron tripod
 * & stew kettle, hewn log benches, rolled bedrolls, supply sacks, and ration table.
 */
export function buildMinerCamp(b, center, floorY, { lightSection = 'hub' } = {}) {
  const cx = center.x, cz = center.z;
  const fireY = b.probe(cx, floorY + 1.0, cz, -1, 2.5) ?? floorY;

  // Stone-ringed firepit + ash bed + glowing ember core.
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const rx = cx + Math.cos(a) * 0.56, rz = cz + Math.sin(a) * 0.56;
    b.prop('rock_debris', angularRock(0.18, 0.13, 0.16, P(rx, fireY + 0.06, rz), {
      yaw: a, irregular: 0.45, seed: 1500 + i * 17,
    }), i % 2 ? 0x9b9288 : 0x8a8178);
  }
  b.prop('rock_debris', rod(P(cx, fireY + 0.01, cz), P(cx, fireY + 0.06, cz), 0.44, 0.4, 10), 0x453f3a);
  b.prop('glow', angularRock(0.24, 0.09, 0.22, P(cx, fireY + 0.07, cz), { irregular: 0.4, seed: 1555 }), '#ff8b38', 0.92);
  b.light(P(cx, fireY + 0.42, cz), '#ff9c4a', 3.4, 10.5, {
    radius: 0.9, halo: 0.65, haloGain: 0.18, importance: 1.15, flicker: 0.18, section: lightSection,
  });

  // Iron tripod + hanging stew kettle over the brazier.
  const apex = P(cx, fireY + 1.18, cz);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.prop('iron', rod(P(cx + Math.cos(a) * 0.64, fireY, cz + Math.sin(a) * 0.64), apex, 0.022, 0.018, 6), 0x6f7682);
  }
  b.prop('iron', rod(apex, P(cx, fireY + 0.66, cz), 0.012, 0.012, 5), 0x7e8591);
  b.prop('iron', rod(P(cx, fireY + 0.42, cz), P(cx, fireY + 0.66, cz), 0.21, 0.18, 12), 0x5c626d);
  b.prop('iron', rod(P(cx, fireY + 0.66, cz), P(cx, fireY + 0.71, cz), 0.18, 0.14, 12), 0x6e7580);

  // Two hewn log benches beside the firepit + rolled bedroll on one bench.
  for (const [bx, bz, yaw] of [[cx - 1.35, cz + 0.15, 1.48], [cx + 0.2, cz - 1.32, 0.08]]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const by = b.probe(bx, floorY + 1.0, bz, -1, 2.5) ?? floorY;
    for (const d of [-0.62, 0.62]) {
      b.prop('timber', rod(P(bx + c * d, by, bz - s * d), P(bx + c * d, by + 0.24, bz - s * d), 0.12, 0.12, 8), 0x866644);
    }
    b.prop('timber', createTimberBeam(
      P(bx - c * 0.85, by + 0.3, bz + s * 0.85),
      P(bx + c * 0.85, by + 0.3, bz - s * 0.85),
      0.3, 0.14, { sideHint: UP_DIR, bevelRatio: 0.18, irregular: 0.22, wear: 0.5 },
    ), 0x9c7a53);
    b.nav.block(P(bx, by, bz), 0.75, 1.2);
  }

  // Rolled canvas bedroll + pack + ore/grain sacks near the west bench.
  const brY = (b.probe(cx - 1.55, floorY + 1.0, cz - 0.85, -1, 2.5) ?? floorY);
  b.prop('rock_debris', rod(P(cx - 1.85, brY + 0.14, cz - 0.95), P(cx - 1.25, brY + 0.14, cz - 0.75), 0.14, 0.14, 10), 0x7f684e);
  // Two leather ties around the roll (a thinner rod along its whole length would sit hidden inside it).
  for (const t of [0.22, 0.78]) {
    const sx = cx - 1.85 + 0.6 * t, sz = cz - 0.95 + 0.2 * t;
    b.prop('rock_debris', rod(P(sx - 0.02, brY + 0.14, sz - 0.007), P(sx + 0.02, brY + 0.14, sz + 0.007), 0.152, 0.152, 10), 0x9c5a3c);
  }
  buildOreSack(b, P(cx - 1.85, brY, cz + 0.95), { scale: 1.05, yaw: 0.4 });
  buildOreSack(b, P(cx - 1.42, brY, cz + 1.18), { scale: 0.9, yaw: 1.1, tint: 0xa8926e });

  // Camp ration crate & plank table with tin mugs and a warm camp lantern.
  const tx = cx + 1.35, tz = cz - 0.55;
  const ty = b.probe(tx, floorY + 1.0, tz, -1, 2.5) ?? floorY;
  crate(b, P(tx, ty, tz), 0.78, -0.35);
  barrel(b, P(tx + 0.78, ty, tz - 0.38), 0.32, 0.84);
  b.prop('iron', rod(P(tx - 0.14, ty + 0.64, tz + 0.08), P(tx - 0.14, ty + 0.76, tz + 0.08), 0.052, 0.056, 8), 0x9aa1ad);
  b.prop('iron', rod(P(tx + 0.12, ty + 0.64, tz - 0.12), P(tx + 0.12, ty + 0.76, tz - 0.12), 0.052, 0.056, 8), 0x9aa1ad);
  lantern(b, P(tx + 0.04, ty + 0.86, tz + 0.02), {
    tint: '#ffbe7a', intensity: 2.8, range: 10.5, halo: 0.6, importance: 1.0, section: lightSection,
  });
  b.nav.block(P(tx + 0.25, ty, tz - 0.15), 1.0, 1.5);
  b.nav.block(P(cx, fireY, cz), 0.7, 1.5);
}

/** Hand-cranked wooden bilge pump & spout on the flooded pier edge, plus mooring bollard. */
export function buildFloodedPierDressing(b, waterY) {
  const pierY = waterY + 0.18;
  // Wooden bilge pump box column on left-front pier corner.
  const px = -0.92, pz = -83.15;
  b.prop('timber', createTimberBeam(P(px, pierY - 0.4, pz), P(px, pierY + 1.05, pz), 0.24, 0.24, {
    sideHint: P(1, 0, 0), bevelRatio: 0.15, dampStart: 0.7, dampEnd: 0.3, wear: 0.55,
  }), 0x866848);
  b.prop('iron', stoneBox(0.28, 0.06, 0.28, P(px, pierY + 0.88, pz), { bevel: 0.01 }), 0x767d88);
  b.prop('timber', createTimberBeam(P(px - 0.08, pierY + 0.68, pz), P(px - 0.58, pierY + 0.56, pz), 0.12, 0.09, {
    sideHint: UP_DIR, bevelRatio: 0.14, dampStart: 0.5, dampEnd: 0.7,
  }), 0x7e6143);
  b.prop('iron', hewnBeam(P(px, pierY + 1.02, pz), P(px + 0.42, pierY + 1.32, pz), 0.04, 0.04, { bevel: 0.008 }), 0x848b97);
  b.prop('iron', rod(P(px, pierY + 0.96, pz), P(px, pierY + 1.16, pz), 0.025, 0.025, 6), 0x7e8591);

  // Mooring bollard + coiled rope + supply crate on right pier edge.
  b.prop('timber', rod(P(0.92, pierY, -82.85), P(0.92, pierY + 0.52, -82.85), 0.12, 0.11, 10), 0x846545);
  for (let i = 0; i < 3; i += 1) {
    b.prop('timber', rod(P(0.92, pierY + 0.12 + i * 0.06, -82.85), P(0.92, pierY + 0.17 + i * 0.06, -82.85), 0.155, 0.155, 10), 0xb89f78);
  }
  crate(b, P(0.76, pierY + 0.04, -80.85), 0.56, 0.25);

  // Rocky outcrops emerging from the flooded pool flanks so the water horizon feels natural.
  for (const [rx, ry, rz, sx, sy, sz, yaw] of [
    [-4.6, waterY - 0.05, -86.8, 0.95, 0.48, 0.85, 0.4],
    [4.4, waterY - 0.08, -85.6, 1.05, 0.42, 0.9, -0.6],
    [2.8, waterY - 0.1, -89.8, 1.2, 0.55, 1.0, 1.1],
  ]) {
    b.prop('rock_debris', angularRock(sx, sy, sz, P(rx, ry, rz), { yaw, irregular: 0.48 }), 0x8f877d);
  }
}
