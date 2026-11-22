import * as THREE from 'three/webgpu';
import { extrudedProfile, hewnBeam, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { atFrame } from './propFrame.js';

/**
 * Shared Dwarven architectural framing, heraldry, monumental braziers, alpine pines,
 * and curved waterfall ribbon geometry for Stonehold's exterior approach and royal halls.
 */

/**
 * Triple-stepped chamfered octagonal Dwarven portal frame (Refs 4, 5, 6):
 * battered side pylons, 45° chamfered haunches, massive monolithic crown lintel,
 * overhanging chevron cornice, and inlaid bronze geometric border channels.
 */
export function buildChamferedOctagonalPortal(b, at, {
  yaw = 0,
  openingWidth = 10.6,
  openingHeight = 13.8,
  depth = 5.4,
  frameWidth = 3.2,
  bronzeInlay = true,
} = {}) {
  const L = atFrame(at, yaw);
  const hw = openingWidth * 0.5;
  const chamfer = Math.min(3.4, openingWidth * 0.28);
  const shoulderY = openingHeight - chamfer;
  const outerHw = hw + frameWidth;
  const outerTop = openingHeight + frameWidth * 0.92;
  const outerShoulder = shoulderY + frameWidth * 0.35;

  // Outer monolithic octagonal arch ring (extruded cleanly with crisp 45° chamfers).
  const ringPts = [
    [-outerHw, 0],
    [-outerHw, outerShoulder],
    [-outerHw + chamfer * 1.15, outerTop],
    [outerHw - chamfer * 1.15, outerTop],
    [outerHw, outerShoulder],
    [outerHw, 0],
    [hw, 0],
    [hw, shoulderY],
    [hw - chamfer, openingHeight],
    [-hw + chamfer, openingHeight],
    [-hw, shoulderY],
    [-hw, 0],
  ];
  b.prop('carved', extrudedProfile(ringPts, depth, { bevel: 0.14, yaw, at: L(0, 0, 0) }), 0xc8ccd4);

  // Inner proud stepped arch reveal order (projecting forward in +Z).
  const innerHw = hw + frameWidth * 0.48;
  const innerTop = openingHeight + frameWidth * 0.48;
  const innerShoulder = shoulderY + frameWidth * 0.16;
  const innerRing = [
    [-innerHw, 0],
    [-innerHw, innerShoulder],
    [-innerHw + chamfer * 1.04, innerTop],
    [innerHw - chamfer * 1.04, innerTop],
    [innerHw, innerShoulder],
    [innerHw, 0],
    [hw - 0.1, 0],
    [hw - 0.1, shoulderY],
    [hw - chamfer, openingHeight - 0.1],
    [-hw + chamfer, openingHeight - 0.1],
    [-hw + 0.1, shoulderY],
    [-hw + 0.1, 0],
  ];
  b.prop('carved', extrudedProfile(innerRing, depth + 0.9, { bevel: 0.12, yaw, at: L(0, 0, 0.22) }), 0xd6dae0);

  // Heavy battered pylon bases flanking the opening.
  for (const sign of [-1, 1]) {
    b.prop('masonry', stoneBlock(frameWidth + 1.0, 2.2, depth + 1.4, L(sign * (hw + frameWidth * 0.52), 0, 0.25), {
      yaw, bevel: 0.12, batter: 0.12, irregular: 0.05,
    }), 0xb6bac2);
    // Outer bastion buttress piers rising above the shoulder line.
    b.prop('carved', stoneBlock(2.4, outerTop + 1.8, depth * 0.85, L(sign * (outerHw + 0.9), 0, -0.2), {
      yaw, bevel: 0.14, batter: 0.05,
    }), 0xc2c6ce);
  }

  // Stepped overhanging crown entablature & chevron frieze hood.
  b.prop('carved', stoneBox(outerHw * 2 + 3.8, 1.45, depth + 1.6, L(0, outerTop + 0.72, 0.35), { yaw, bevel: 0.12 }), 0xd2d6dc);
  b.prop('carved', stoneBox(outerHw * 2 + 5.2, 0.95, depth + 2.2, L(0, outerTop + 1.82, 0.52), { yaw, bevel: 0.10 }), 0xdce0e6);

  if (bronzeInlay) {
    // Recessed gilded bronze runic frieze across crown & jamb channels.
    b.prop('bronze', stoneBox(outerHw * 1.85, 0.42, 0.36, L(0, outerTop + 0.72, depth * 0.5 + 1.02), { yaw, bevel: 0.03 }), 0xdcb46a);
    for (const sign of [-1, 1]) {
      b.prop('bronze', stoneBlock(0.36, shoulderY - 0.8, 0.32, L(sign * (hw + frameWidth * 0.62), 1.4, depth * 0.5 + 0.45), { yaw, bevel: 0.025 }), 0xd6ae64);
      // Angled bronze inlay paralleling the 45° chamfer haunch.
      b.prop('bronze', hewnBeam(
        L(sign * (hw + frameWidth * 0.62), shoulderY + 0.55, depth * 0.5 + 0.48),
        L(sign * (hw - chamfer + frameWidth * 0.35), openingHeight + frameWidth * 0.6, depth * 0.5 + 0.48),
        0.34, 0.36, { bevel: 0.025 },
      ), 0xdcb46a);
    }
  }
}

/**
 * Hanging crimson, charcoal & gilded gold Dwarven heraldic banner (Refs 2 & 5).
 */
export function buildHeraldicBanner(b, at, {
  yaw = 0,
  width = 1.65,
  height = 4.6,
  pole = false,
} = {}) {
  const L = atFrame(at, yaw);
  const hw = width * 0.5;

  // Forged iron horizontal crossbar + bronze end finials.
  b.prop('iron', rod(L(-hw - 0.28, 0, 0), L(hw + 0.28, 0, 0), 0.065, 0.065, 8), 0x3b3f48);
  for (const sx of [-1, 1]) {
    b.prop('bronze', rod(L(sx * (hw + 0.26), 0, 0), L(sx * (hw + 0.44), 0, 0), 0.11, 0.03, 8), 0xdcb46a);
  }
  if (pole) {
    b.prop('iron', rod(L(0, -height - 1.6, -0.06), L(0, 0.72, -0.06), 0.07, 0.055, 8), 0x3a3e46);
    b.prop('bronze', rod(L(0, 0.72, -0.06), L(0, 1.12, -0.06), 0.12, 0.015, 6), 0xe0ba72);
  }

  // Tapered V-pointed crimson cloth field.
  const clothPts = [
    [-hw, 0],
    [hw, 0],
    [hw * 0.94, -height * 0.76],
    [0, -height],
    [-hw * 0.94, -height * 0.76],
  ];
  b.prop('cloth', extrudedProfile(clothPts, 0.055, { bevel: 0.008, yaw, at: L(0, -0.04, 0) }), 0x7c1c16);

  // Dark charcoal vertical center pale + gilded border strips + diamond mountain crest.
  const palePts = [
    [-hw * 0.44, -height * 0.24],
    [hw * 0.44, -height * 0.24],
    [hw * 0.40, -height * 0.74],
    [0, -height * 0.90],
    [-hw * 0.40, -height * 0.74],
  ];
  b.prop('cloth', extrudedProfile(palePts, 0.08, { bevel: 0.006, yaw, at: L(0, -0.04, 0) }), 0x1e1d20);
  for (const sx of [-1, 1]) {
    b.prop('bronze', stoneBox(0.08, height * 0.74, 0.085, L(sx * (hw - 0.10), -height * 0.39, 0), { yaw, bevel: 0.008 }), 0xd8b068);
  }
  const crestPts = [[0, 0.56], [0.44, 0], [0, -0.44], [-0.44, 0]];
  b.prop('bronze', extrudedProfile(crestPts, 0.10, { bevel: 0.015, yaw, at: L(0, -height * 0.34, 0) }), 0xe6c278);
}

/**
 * Monumental stepped stone & fluted bronze-iron fire brazier with tall layered flames,
 * glowing ember bed, flickering warm light, and optional rising ember emitter.
 */
export function buildMonumentalBrazier(b, at, {
  scale = 1,
  flameScale = 1,
  intensity = 10,
  range = 28,
  emitEmbers = false,
  halo = 1.6,
  importance = 1.35,
} = {}) {
  const s = scale;
  const fs = flameScale * s;
  const P = (dx, dy, dz) => ({ x: at.x + dx, y: at.y + dy, z: at.z + dz });

  // Stepped square carved stone pedestal with recessed bronze inlay band.
  b.prop('masonry', stoneBlock(1.95 * s, 0.45 * s, 1.95 * s, P(0, 0, 0), { bevel: 0.06 * s, batter: 0.10 }), 0xb4b8c0);
  b.prop('carved', stoneBlock(1.48 * s, 0.85 * s, 1.48 * s, P(0, 0.45 * s, 0), { bevel: 0.06 * s, batter: 0.08 }), 0xc6cad2);
  b.prop('bronze', stoneBox(1.52 * s, 0.16 * s, 1.52 * s, P(0, 0.92 * s, 0), { bevel: 0.02 * s }), 0xd4aa62);
  b.prop('carved', stoneBlock(1.62 * s, 0.24 * s, 1.62 * s, P(0, 1.28 * s, 0), { bevel: 0.05 * s, batter: -0.06 }), 0xd2d6dc);

  // Broad fluted forged-iron fire bowl with gilded bronze lip and radial ribs.
  const bowlY = 1.52 * s;
  b.prop('iron', rod(P(0, bowlY, 0), P(0, bowlY + 0.72 * s, 0), 0.58 * s, 1.18 * s, 12), 0x2c2e34);
  b.prop('bronze', rod(P(0, bowlY + 0.62 * s, 0), P(0, bowlY + 0.78 * s, 0), 1.16 * s, 1.26 * s, 12), 0xd8b068);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    b.prop('bronze', hewnBeam(
      P(dx * 0.62 * s, bowlY + 0.04 * s, dz * 0.62 * s),
      P(dx * 1.24 * s, bowlY + 0.76 * s, dz * 1.24 * s),
      0.11 * s, 0.13 * s, { bevel: 0.015 * s },
    ), 0xcba25e);
  }

  // Glowing hot coal dome + multi-tongue animated fire.
  const fireY = bowlY + 0.72 * s;
  b.prop('glow', rod(P(0, fireY - 0.05 * s, 0), P(0, fireY + 0.26 * s, 0), 0.96 * s, 0.42 * s, 10), '#ff6214', 2.6);
  b.flame(P(0, fireY + 0.06 * s, 0), { width: 1.55 * fs, height: 2.35 * fs, core: '#fff4c4', outer: '#ff4e0c', speed: 1.05 });
  b.flame(P(-0.26 * s, fireY + 0.02 * s, 0.18 * s), { width: 1.05 * fs, height: 1.65 * fs, core: '#ffe89c', outer: '#ff5c12', speed: 1.22 });
  b.flame(P(0.24 * s, fireY + 0.02 * s, -0.16 * s), { width: 1.05 * fs, height: 1.55 * fs, core: '#ffe89c', outer: '#ff520e', speed: 0.92 });

  b.light(P(0, fireY + 1.05 * s, 0), '#ff9c42', intensity, range, {
    radius: 1.8 * s,
    halo: halo * s,
    haloGain: 0.36,
    importance,
    flicker: 0.11,
  });
  if (emitEmbers) b.emit('ember', P(0, fireY + 0.45 * s, 0));
  b.nav.block(at, 1.25 * s, 3.2 * s);
}

/**
 * Faceted alpine pine tree for mountain approach cliffs and colossus ledges (Refs 1, 3, 4, 5).
 * Uses `timber` for the trunk and `pine` (dark alpine evergreen with snow dusting) for boughs.
 */
export function buildAlpinePine(b, at, { height = 6.5, seed = 1, mat = 'pine' } = {}) {
  const h = height;
  const P = (dx, dy, dz) => ({ x: at.x + dx, y: at.y + dy, z: at.z + dz });
  b.prop('timber', rod(P(0, -0.4, 0), P(0, h * 0.46, 0), h * 0.048, h * 0.024, 6), 0x4f3a29);
  const tiers = 5;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / (tiers - 1);
    const y0 = h * (0.20 + t * 0.56);
    const y1 = y0 + h * (0.30 - t * 0.07);
    const rBot = h * (0.29 - t * 0.19);
    const rTop = i === tiers - 1 ? 0.04 : rBot * 0.18;
    const jx = Math.sin(seed * 17.3 + i * 2.9) * h * 0.015;
    const jz = Math.cos(seed * 11.7 + i * 3.1) * h * 0.015;
    const shade = 0.86 + ((i * 7 + seed) % 4) * 0.06;
    const c = new THREE.Color(0x2d4634).multiplyScalar(shade).getHex();
    b.prop(mat, rod(P(jx, y0, jz), P(jx * 0.5, y1, jz * 0.5), rBot, rTop, 7), c);
  }
}

/**
 * Builds a smooth parabolic curved waterfall sheet from `top` to `bot` with arc-length UVs
 * (`u: 0..1` across width, `v: 0..arcLength` down the fall) for `WaterfallMaterial`.
 */
export function createWaterfallSheet(top, bot, {
  widthTop = 3.2,
  widthBot = 4.8,
  bow = 2.4,
  segs = 18,
  outDir = null,
} = {}) {
  const dx = bot.x - top.x;
  const dz = bot.z - top.z;
  const horizLen = Math.hypot(dx, dz);
  let ox, oz;
  if (outDir) {
    const ol = Math.hypot(outDir.x, outDir.z) || 1;
    ox = outDir.x / ol;
    oz = outDir.z / ol;
  } else if (horizLen > 0.05) {
    ox = dx / horizLen;
    oz = dz / horizLen;
  } else {
    ox = 0;
    oz = 1;
  }
  const sx = -oz;
  const sz = ox;

  const spine = [];
  const widths = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    // Accelerating gravity curve: pushes gently forward over the cliff lip, then plunges steeply.
    const bulge = Math.sin(Math.PI * t) * bow;
    const px = top.x + dx * t + ox * bulge;
    const pz = top.z + dz * t + oz * bulge;
    const py = top.y + (bot.y - top.y) * (t * 0.22 + t * t * 0.78);
    spine.push([px, py, pz]);
    widths.push(widthTop + (widthBot - widthTop) * t);
  }

  const positions = [];
  const uvs = [];
  let dist = 0;
  for (let i = 0; i < segs; i += 1) {
    const a = spine[i];
    const c = spine[i + 1];
    const segLen = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const wa = widths[i] * 0.5;
    const wc = widths[i + 1] * 0.5;

    const aL = [a[0] - sx * wa, a[1], a[2] - sz * wa];
    const aR = [a[0] + sx * wa, a[1], a[2] + sz * wa];
    const cR = [c[0] + sx * wc, c[1], c[2] + sz * wc];
    const cL = [c[0] - sx * wc, c[1], c[2] - sz * wc];

    positions.push(...aL, ...aR, ...cR, ...aL, ...cR, ...cL);
    uvs.push(0, dist, 1, dist, 1, dist + segLen, 0, dist, 1, dist + segLen, 0, dist + segLen);
    dist += segLen;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
