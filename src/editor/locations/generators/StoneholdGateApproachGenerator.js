import { emitRadialArch } from '../gen/dwarvenMasonry.js';
import { boulder, icicle } from '../gen/iceKit.js';
import { fbm3 } from '../gen/noise.js';
import { box, stoneBlock, stoneBox } from '../gen/propKit.js';
import {
  buildChasmViaduct,
  buildGateStaircase,
  buildLowerAbyssalArcades,
  buildUpperCitadelAndSwitchback,
  buildWatchtower,
} from './stoneholdApproachStructures.js';
import {
  buildAlpinePine,
  buildChamferedOctagonalPortal,
  buildHeraldicBanner,
  buildMonumentalBrazier,
  createWaterfallSheet,
} from './stoneholdDressing.js';
import {
  buildCliffBasRelief,
  buildFortressDoors,
  buildGateGuardianStatue,
  buildKingKeystoneMask,
  buildMountainColossus,
} from './stoneholdSculptures.js';

/**
 * Stonehold — The Mountain Gate Approach (open sky, Refs 1, 3, 4, 5, 6).
 *
 * A rocky alpine pass road winds past snow-dusted pines, runic boulders, banners,
 * and twin crenellated watchtowers onto a sweeping multi-arch stone viaduct spanning
 * a misty waterfall chasm. Beneath the bridge, lit subterranean Dwarven arcades glow
 * through the gorge mist; ahead, colossal armored warrior statues flank a chamfered
 * octagonal cliff-cut portal whose half-open gilded bronze doors spill roaring forge
 * firelight onto the grand staircase. High on the left spur sits the carved miner
 * bas-relief and upper royal citadel; on the right ridge stands the living-rock
 * Mountain Colossus beneath snow-capped alpine peaks.
 */

export const open = true;
export const bounds = { min: { x: -78, y: -34, z: -88 }, max: { x: 78, y: 70, z: 72 } };

const P = (x, y, z) => ({ x, y, z });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Height of the foreground alpine approach trail along `z = 68 .. 24`. */
function roadHeightAt(z) {
  const t = clamp((64 - z) / 40, 0, 1);
  return 3.4 + t * 4.1;
}

/** Precomputes `fn(x, z)` on a 2D voxel grid so `grid.fill` does bilinear lookups instead of 90x redundant 3D noise. */
function cachedHeight(fn, [x0, x1], [z0, z1], step) {
  const nx = Math.ceil((x1 - x0) / step) + 2;
  const nz = Math.ceil((z1 - z0) / step) + 2;
  const table = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k += 1) {
    for (let i = 0; i < nx; i += 1) {
      table[i + k * nx] = fn(x0 + i * step, z0 + k * step);
    }
  }
  return (x, z) => {
    const gx = clamp((x - x0) / step, 0, nx - 1.001);
    const gz = clamp((z - z0) / step, 0, nz - 1.001);
    const i = gx | 0;
    const k = gz | 0;
    const fx = gx - i;
    const fz = gz - k;
    const at = i + k * nx;
    const near = table[at] + (table[at + 1] - table[at]) * fx;
    const far = table[at + nx] + (table[at + nx + 1] - table[at + nx]) * fx;
    return near + (far - near) * fz;
  };
}

export function generate(b) {
  const seed = b.seed;
  const ridgeNoise = (x, z, sc, salt) => fbm3(x * sc, 0.5, z * sc, seed + salt, 3) - 0.5;

  // --- 1. Sculpt the Alpine Pass, Deep Waterfall Chasm & Towering Jagged Mountain Massif ---
  const ridgeSharp = (x, z, sc, salt) => 1 - Math.abs(fbm3(x * sc, 0.5, z * sc, seed + salt, 3) * 2 - 1);
  const heightAt = cachedHeight((x, z) => {
    const crag = ridgeNoise(x, z, 0.042, 11) * 10.5 + ridgeNoise(x, z, 0.11, 29) * 3.8;
    const sharpPeak = Math.pow(ridgeSharp(x, z, 0.036, 47), 1.8) * 18.0
      + Math.pow(ridgeSharp(x, z, 0.085, 61), 2.0) * 6.5;

    // Foreground approach ridge (z > 20) tapering steeply into the chasm (z = 18 .. -20).
    const foreFactor = smoothstep(14, 26, z);
    const foreGround = roadHeightAt(z)
      + Math.pow(Math.max(0, Math.abs(x) - 5.2), 1.38) * 0.24
      + (crag + sharpPeak * 0.35) * smoothstep(4.5, 16, Math.abs(x));

    // Deep gorge floor across the chasm (z = 16 .. -20).
    const gorgeFloor = -30.5 + crag * 0.35 + Math.pow(Math.max(0, Math.abs(x) - 24), 1.35) * 0.38;

    // Towering sheer jagged mountain massif wall behind the gate (z < -21), wrapping forward on flanks.
    const flankForward = smoothstep(14, 24, Math.abs(x)) * 5.0;
    const massifWall = smoothstep(-18 + flankForward, -31 + flankForward, z);
    const peakEnvelope = 46 + (1 - Math.min(1, Math.abs(x) / 70)) * 12 + sharpPeak * 1.15 + crag * 0.9;

    // Left cliff spur stepping up toward the bas-relief (x = -29) and upper citadel (x = -34).
    const leftSpur = smoothstep(-14, -26, x) * smoothstep(8, -16, z);
    const leftSpurY = 16.0 + smoothstep(-22, -42, x) * 16.5 + crag * 0.45 + sharpPeak * 0.35;

    // Right alpine spur rising solidly beneath the Mountain Colossus (x = +22 .. +72).
    const rightSpur = smoothstep(14, 28, x) * smoothstep(10, -14, z);
    const rightSpurY = 14.0 + smoothstep(26, 58, x) * 26.0 + crag * 0.65 + sharpPeak * 0.55;

    let h = gorgeFloor * (1 - foreFactor) + foreGround * foreFactor;
    h = Math.max(h, gorgeFloor + leftSpur * (leftSpurY - gorgeFloor));
    h = Math.max(h, gorgeFloor + rightSpur * (rightSpurY - gorgeFloor));
    h = h * (1 - massifWall) + Math.max(h, peakEnvelope) * massifWall;

    // Flatten the gate threshold plaza cleanly in front of the portal (z = -18 .. -28, |x| < 16).
    const plazaMask = smoothstep(-15, -19, z) * smoothstep(-32, -26, z) * smoothstep(19, 13, Math.abs(x));
    return h * (1 - plazaMask) + 14.55 * plazaMask;
  }, [bounds.min.x, bounds.max.x], [bounds.min.z, bounds.max.z], b.grid.voxel);

  b.grid.carve({
    box: bounds,
    air: (x, y, z) => {
      const h = heightAt(x, z);
      let air = y - h;
      // Carve the deep vaulted portal throat cavity straight into the mountain cliff behind the doors,
      // sinking the bedrock floor 1.2 m below the 14.6 m stone threshold so snow never peeks under the doors.
      if (z < -21.5 && z > -38 && Math.abs(x) < 8.5 && y >= 13.4 && y < 30.2) {
        const inside = Math.min(7.6 - Math.abs(x), 29.0 - y, y - 13.4, z + 36);
        if (inside > air) air = inside;
      }
      return air;
    },
  });
  // Fractured alpine granite cliffs & ridges outside the cleared gate plaza and foreground pass road.
  const onClearedFloor = (x, y, z) => (Math.abs(x) < 15 && z < -15 && z > -32 && Math.abs(y - 14.55) < 2.6)
    || (Math.abs(x) < 6.5 && z > 20 && Math.abs(y - roadHeightAt(z)) < 2.4);
  b.grid.fracture({
    amp: 2.35,
    cell: 7.4,
    stretchY: 1.85,
    seed: b.seed + 59,
    ampAt: (x, y, z) => (onClearedFloor(x, y, z) ? 0 : 1),
  });
  b.grid.roughen({
    amp: 1.95,
    scale: 0.16,
    seed: b.seed + 77,
    octaves: 3,
    floorAmp: 0.1,
    stretchY: 1.65,
    ampAt: (x, y, z) => (onClearedFloor(x, y, z) ? 0 : 1),
  });

  // Natural stratified alpine granite & snow-dusted crags; living rock everywhere except road/plaza.
  b.classify = (p, n, mask) => {
    const nearFalls = (Math.abs(p.x + 21) < 5.5 || Math.abs(p.x - 22) < 5.5) && p.z > -28 && p.z < 4;
    const chasmDamp = smoothstep(-14, -27, p.y);
    mask[1] = Math.min(1, (nearFalls ? 0.75 : 0) + chasmDamp * 0.7);
    mask[2] = 0;
    // Dressed stone on the carved threshold plaza; rugged alpine granite on all cliffs & ridges.
    const onPlaza = p.z < -17 && p.z > -32 && Math.abs(p.x) < 15 && Math.abs(p.y - 14.55) < 0.7;
    mask[3] = onPlaza ? 1 : 0;
    return 0;
  };

  // --- 2. Foreground Flagstone Approach Trail, Sculpted Runic Boulders, Pines & Draped Banners ---
  const roadTones = [0xb6bcc6, 0xa8aeb8, 0xc0c5ce, 0x9fa6b0];
  let roadIdx = 0;
  for (let z = 60; z >= 24; z -= 2.2) {
    const y = roadHeightAt(z);
    const sway = Math.sin(z * 0.08) * 1.4 * smoothstep(24, 42, z);
    const tone = roadTones[roadIdx % roadTones.length];
    b.prop('carved', stoneBox(7.2, 0.36, 2.35, P(sway, y - 0.08, z), { bevel: 0.06, irregular: 0.16 }), tone);
    for (const sign of [-1, 1]) {
      const curbH = 0.48 + ((roadIdx * 7 + (sign > 0 ? 3 : 1)) % 4) * 0.055;
      b.prop('masonry', stoneBlock(0.98, curbH, 2.22, P(sway + sign * 3.85, y - 0.16, z), {
        yaw: ((roadIdx % 5) - 2) * 0.015, bevel: 0.08, irregular: 0.32,
      }), roadTones[(roadIdx + (sign > 0 ? 1 : 2)) % roadTones.length]);
    }
    roadIdx += 1;
  }
  b.nav.addSegment(P(0, roadHeightAt(60), 60), P(0, roadHeightAt(24), 24), 6.2);

  // Sculpted craggy alpine granite runic boulders & flanking talus stones along the pass.
  const boulderSpecs = [[-7.2, 48, 1.3], [7.8, 44, 1.5], [-6.8, 36, 1.1], [8.2, 33, 1.2], [-10.5, 52, 1.8]];
  for (let i = 0; i < boulderSpecs.length; i += 1) {
    const [bx, bz, sc] = boulderSpecs[i];
    const by = roadHeightAt(bz);
    const bSeed = seed + 301 + i * 29;
    b.prop('rock', boulder(P(bx, by - 0.45 * sc, bz), 1.45 * sc, 1.05 * sc, 1.32 * sc, {
      seed: bSeed, blocky: 0.24, yaw: bx * 0.4, maxDetail: 4,
    }), 0x8a909a);
    // Flanking frost-shattered talus stones grounding each hero boulder.
    for (let k = 0; k < 4; k += 1) {
      const ang = (k / 4) * Math.PI * 2 + i * 0.7;
      const dist = (1.35 + (k % 2) * 0.45) * sc;
      const cr = (0.28 + (k % 3) * 0.12) * sc;
      b.prop('rock', boulder(P(bx + Math.cos(ang) * dist, by - 0.25, bz + Math.sin(ang) * dist), cr * 1.2, cr * 0.75, cr, {
        seed: bSeed + 17 + k * 11, blocky: 0.28, yaw: ang, maxDetail: 2,
      }), 0x828892);
    }
    if (Math.abs(bx) < 8.5) {
      b.prop('bronze', stoneBox(0.68 * sc, 0.68 * sc, 0.12, P(bx, by + 0.52 * sc, bz + 1.02 * sc), { yaw: Math.PI / 4, bevel: 0.02 }), 0xc8a05a);
    }
  }
  for (const [sx, sz, yaw] of [[-5.6, 46, 0.35], [5.8, 42, -0.35], [-5.4, 32, 0.25], [5.6, 32, -0.25]]) {
    const sy = roadHeightAt(sz);
    buildHeraldicBanner(b, P(sx, sy + 5.8, sz), { yaw, width: 1.35, height: 3.8, pole: true });
    buildMonumentalBrazier(b, P(sx * 0.88, sy, sz - 1.6), {
      scale: 0.68, flameScale: 0.9, intensity: 6.5, range: 18, halo: 1.3, importance: 0.9,
    });
  }

  // Twin crenellated watchtowers framing the bridgehead (Refs 4 & 6).
  buildWatchtower(b, P(-7.6, 7.5, 24.5), { height: 10.2, width: 4.5, brazier: true });
  buildWatchtower(b, P(7.6, 7.5, 24.5), { height: 10.2, width: 4.5, brazier: true });

  // --- 3. Multi-Arch Chasm Viaduct, Grand Gate Staircase & Lower Abyssal Arcades ---
  buildChasmViaduct(b, { zStart: 24, zEnd: -2, yStart: 7.5, yEnd: 9.0, chasmFloorY: -30, width: 10.4, spans: 3 });
  buildGateStaircase(b, { zStart: -2, zEnd: -18, yStart: 9.0, yEnd: 14.6, chasmFloorY: -30, width: 11.4, steps: 18 });
  buildLowerAbyssalArcades(b, { zWall: -21, bridgeZ: -8 });

  // Carved Gate Threshold Plaza deck + deep cyclopean foundations anchored to chasm bedrock (zero floating overhangs!).
  b.prop('masonry', stoneBlock(39.0, 44.5, 13.5, P(0, -30.5, -24.8), { bevel: 0.16, batter: 0.04 }), 0x7e838c);
  b.prop('carved', stoneBox(36.0, 1.4, 12.2, P(0, 13.9, -23.5), { bevel: 0.08 }), 0xbcc0c8);
  b.nav.addRect(P(0, 14.6, -23.0), 11.2, 5.4);
  for (const sign of [-1, 1]) {
    b.prop('masonry', stoneBlock(6.2, 45.0, 6.2, P(sign * 16.5, -30.5, -25.2), { bevel: 0.14, batter: 0.04 }), 0x828790);
    b.prop('carved', stoneBlock(4.6, 16.5, 4.4, P(sign * 16.5, 14.6, -25.2), { bevel: 0.14, batter: 0.06 }), 0xb2b7c0);
    b.prop('carved', stoneBox(5.2, 0.95, 5.0, P(sign * 16.5, 31.3, -25.2), { bevel: 0.08 }), 0xcad0d8);
    // Side parapet walls connecting the plaza edge to the cliff wings.
    b.prop('carved', stoneBlock(8.0, 1.35, 1.1, P(sign * 10.2, 14.6, -18.2), { bevel: 0.06 }), 0xc0c4cc);
  }

  // --- 4. Hero Cliff-Cut Mountain Gate, Flanking Guardian Colossi & Roaring Half-Open Doors ---
  buildChamferedOctagonalPortal(b, P(0, 14.6, -28.0), {
    yaw: 0, openingWidth: 11.4, openingHeight: 15.2, depth: 6.4, frameWidth: 3.4, bronzeInlay: true,
  });
  buildKingKeystoneMask(b, P(0, 32.8, -24.1), { yaw: 0, scale: 1.38 });
  buildFortressDoors(b, P(0, 14.6, -28.4), {
    yaw: 0, width: 11.0, height: 14.4, openAngle: 0.52, glowForge: true,
  });

  // Colossal armored Gate Guardian statues flanking the portal (Refs 4, 5, 6!).
  buildGateGuardianStatue(b, P(-10.8, 14.6, -24.0), { yaw: 0.10, scale: 1.18, handedness: -1 });
  buildGateGuardianStatue(b, P(10.8, 14.6, -24.0), { yaw: -0.10, scale: 1.18, handedness: 1 });

  // Tall crimson & gold heraldic banners framing the portal jambs + flanking gate braziers.
  for (const sign of [-1, 1]) {
    buildHeraldicBanner(b, P(sign * 6.8, 25.8, -24.4), { yaw: 0, width: 2.0, height: 6.2 });
    buildMonumentalBrazier(b, P(sign * 7.2, 14.6, -21.2), {
      scale: 1.18, flameScale: 1.32, intensity: 14, range: 28, emitEmbers: true, halo: 2.1, importance: 1.6,
    });
  }

  // --- 5. Left Cliff Bas-Relief, Glowing Forge Arches & Upper Royal Citadel (Refs 1 & 5) ---
  // Deep foundation cliff bastion anchoring the left forge arches cleanly down into the gorge.
  b.prop('masonry', stoneBlock(18.0, 46.0, 8.0, P(-28.7, -30.5, -24.0), { bevel: 0.14, batter: 0.05 }), 0x7c818a);
  // Triple recessed cliffside forge arches beneath the carved miner bas-relief.
  for (let i = 0; i < 3; i += 1) {
    const ax = -23.5 - i * 5.2;
    for (const sx of [-1, 1]) {
      b.prop('carved', stoneBlock(1.1, 6.2, 2.4, P(ax + sx * 2.1, 15.2, -23.2), { bevel: 0.06 }), 0xb4b8c0);
    }
    emitRadialArch(b, 'carved', P(ax - 2.0, 19.6, -22.8), P(ax + 2.0, 19.6, -22.8), 2.1, 0.9, 1.8, 9, {
      pointed: 0.16, tint: 0xc4c8d0, keystoneTint: 0xd8dce2,
    });
    b.prop('glow', box(3.0, 4.6, 0.35, P(ax, 18.2, -24.0)), '#ff9432', 2.2);
  }
  b.light(P(-28.7, 18.5, -20.5), '#ff9638', 11, 24, { radius: 2.2, halo: 2.0, haloGain: 0.28, importance: 1.0 });
  buildCliffBasRelief(b, P(-28.7, 26.8, -24.2), { yaw: 0.18, width: 15.0, height: 7.4 });
  buildUpperCitadelAndSwitchback(b, { at: P(-34, 31, -28) });

  // --- 6. Right Ridge Living-Rock Mountain Colossus (Ref 3!) ---
  b.prop('masonry', stoneBlock(22.0, 44.0, 15.0, P(38, -30.5, -28), { yaw: -0.36, bevel: 0.65, batter: 0.08, irregular: 0.32 }), 0x707680);
  buildMountainColossus(b, P(38, 12.0, -28), { yaw: -0.36, scale: 1.08 });

  // --- 7. Multi-Tier Cascading Waterfalls Framed by Recessed Dwarven Culvert Arches, Crags & Icicles ---
  const sluices = [
    [-21.0, 21.2, -16.2, 3.8],
    [23.0, 18.6, -22.6, 3.8],
    [-7.2, -2.6, -16.8, 3.2],
  ];
  for (let sIdx = 0; sIdx < sluices.length; sIdx += 1) {
    const [sx, sy, sz, sw] = sluices[sIdx];
    const hw = sw * 0.5;
    // Deep recessed wet spillway culvert throat + granite under-buttress anchored solidly into the mountain rock.
    b.prop('masonry', stoneBlock(sw + 4.4, 9.6, 10.2, P(sx, sy - 6.2, sz - 4.8), { bevel: 0.16, batter: 0.10, irregular: 0.24 }), 0x5c626c);
    b.prop('rock', boulder(P(sx, sy - 4.4, sz - 1.8), hw + 3.2, 3.6, 3.4, {
      seed: seed + 577 + sIdx * 23, blocky: 0.26, maxDetail: 3,
    }), 0x666d78);
    for (const side of [-1, 1]) {
      b.prop('carved', stoneBlock(1.25, 3.8, 3.8, P(sx + side * (hw + 0.55), sy - 0.8, sz - 1.4), {
        bevel: 0.09, batter: 0.06, irregular: 0.18,
      }), 0x828994);
      // Flanking sculpted alpine rock crags merging the carved spillway seamlessly into the cliff slope.
      b.prop('rock', boulder(P(sx + side * (hw + 1.95), sy - 1.0, sz - 1.2), 2.35, 3.1, 2.65, {
        seed: seed + 601 + sIdx * 31 + (side > 0 ? 7 : 0), blocky: 0.24, yaw: side * 0.4, maxDetail: 3,
      }), 0x6b727d);
    }
    // Rock crown boulder draping the culvert arch cleanly into the mountain slope above.
    b.prop('rock', boulder(P(sx, sy + 2.8, sz - 1.8), hw + 2.6, 1.8, 2.9, {
      seed: seed + 651 + sIdx * 19, blocky: 0.24, maxDetail: 3,
    }), 0x6b727d);
    // Radial voussoir spillway arch crowning the water mouth.
    emitRadialArch(b, 'carved', P(sx - hw - 0.25, sy + 1.85, sz - 0.1), P(sx + hw + 0.25, sy + 1.85, sz - 0.1),
      1.55, 0.88, 2.2, 11, { pointed: 0.15, tint: 0x949ba6, keystoneTint: 0xb0b7c2, irregular: 0.12 });
    b.prop('iron', stoneBox(sw + 0.6, 0.45, 2.8, P(sx, sy - 0.15, sz - 0.8), { bevel: 0.05 }), 0x2a3038);
    // Shimmering frozen spray icicles hanging off both cold shoulders of the spillway arch.
    for (let ic = -3; ic <= 3; ic += 1) {
      if (Math.abs(ic) < 2) continue;
      const ix = sx + ic * (hw * 0.48);
      const len = 0.85 + Math.abs(ic) * 0.35;
      b.prop('clearIce', icicle(P(ix, sy + 2.0, sz + 0.55), len, 0.08 + len * 0.04, { phase: sIdx * 7 + ic }), 0xe8f6ff);
    }
    b.emit('mist', P(sx, sy - 0.4, sz + 1.4));
  }
  // Left double-cascade beside the bridge and cliff flank.
  b.prop('waterfall', createWaterfallSheet(P(-21.0, 21.1, -15.6), P(-20.4, 3.5, -8.8), { widthTop: 3.4, widthBot: 4.9, bow: 2.3 }));
  b.prop('waterfall', createWaterfallSheet(P(-20.4, 3.5, -8.8), P(-19.6, -29.5, -3.5), { widthTop: 4.6, widthBot: 6.6, bow: 2.8 }));
  // Right cliffside cascade plunging cleanly out of its recessed mountain culvert beside the right bastion.
  b.prop('waterfall', createWaterfallSheet(P(23.0, 18.4, -22.0), P(21.4, -29.5, -13.0), { widthTop: 3.5, widthBot: 5.8, bow: 3.6 }));
  // Sub-bridge cascade tumbling past the lower abyssal arcades.
  b.prop('waterfall', createWaterfallSheet(P(-7.2, -2.7, -15.8), P(-6.8, -29.5, -11.5), { widthTop: 2.8, widthBot: 4.5, bow: 2.1 }));

  // Gorge mist plumes rising from every waterfall plunge pool and across the abyssal chasm.
  for (const mp of [
    P(-20.4, 4.0, -8.0), P(-19.5, -24.0, -3.0), P(21.4, -24.0, -12.5),
    P(-6.8, -24.0, -11.0), P(0, -18.0, -6.0), P(-12, -16.0, 2.0), P(12, -16.0, 0.0),
  ]) {
    b.emit('mist', mp);
  }

  // --- 8. Gnarled Drooping-Bough Alpine Pines Grounded into Crags & Colossus Shoulders ---
  const pines = [
    [-14.5, 50, 7.8], [-19.5, 42, 9.2], [-15.2, 33, 6.8], [-24.0, 26, 8.4],
    [13.8, 52, 8.2], [18.4, 40, 7.6], [15.5, 30, 6.4], [24.5, 24, 9.0],
    [-26.5, 14, 7.2], [27.0, 12, 7.5],
    [35.2, -28.0, 4.4, 31.5], [37.4, -27.2, 3.8, 32.8], [45.0, -29.5, 4.6, 30.2],
  ];
  for (let i = 0; i < pines.length; i += 1) {
    const [px, pz, ph, fixedY] = pines[i];
    const py = fixedY ?? (b.terrainAt(px, 34, pz, 38) ?? roadHeightAt(pz));
    buildAlpinePine(b, P(px, py - 0.35, pz), { height: ph, seed: seed + i * 31 });
    // Broad stepped granite cliff-ledge crag anchoring every pine's deep root trunk into steep slopes.
    b.prop('rock', boulder(P(px, py - 1.05, pz), ph * 0.26, ph * 0.20, ph * 0.26, {
      seed: seed + 701 + i * 17, blocky: 0.28, yaw: i * 1.1, maxDetail: 2,
    }), 0x767c86);
    b.prop('rock', boulder(P(px + (i % 2 ? 0.65 : -0.65), py - 2.15, pz + 0.35), ph * 0.32, ph * 0.24, ph * 0.30, {
      seed: seed + 757 + i * 23, blocky: 0.30, yaw: i * 1.9, maxDetail: 2,
    }), 0x676e78);
  }

  // --- 9. Spawn & Seamless Portal into Stonehold Mountain Hall ---
  b.spawn('entry', P(0, roadHeightAt(48), 48), 0);
  b.exit('hold', P(0, 14.6, -26.2), { radius: 3.8, label: 'Enter Stonehold Mountain Hall' });
}
