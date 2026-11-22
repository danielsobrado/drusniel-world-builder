import * as THREE from 'three/webgpu';
import { collarRing, hangingBannerMesh, hewnPole } from '../gen/clothKit.js';
import { facetedCrystal } from '../gen/iceKit.js';
import { createRng, fbm3 } from '../gen/noise.js';
import { extrudedProfile, hewnBeam, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { atFrame } from './propFrame.js';

/**
 * Shared Dwarven architectural framing, GPU wind-animated draped heraldry,
 * monumental forged braziers, organic drooping-bough alpine pines, and 3D
 * volumetric curved waterfall geometry for Stonehold's exterior approach and royal halls.
 */

const P = (x, y, z) => ({ x, y, z });

/**
 * Triple-stepped chamfered octagonal Dwarven portal frame:
 * battered side pylons, 45° chamfered haunches, massive monolithic crown lintel,
 * overhanging corbelled chevron cornice, and riveted bronze geometric inlays.
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

  // Outer monolithic octagonal arch ring.
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
  b.prop('carved', extrudedProfile(ringPts, depth, { bevel: 0.14, yaw, at: L(0, 0, 0) }), 0xbec3cc);

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
  b.prop('carved', extrudedProfile(innerRing, depth + 0.9, { bevel: 0.12, yaw, at: L(0, 0, 0.22) }), 0xc8cdd6);

  // Heavy weathered battered pylon bases & flanking bastion buttress piers.
  for (const sign of [-1, 1]) {
    b.prop('masonry', stoneBlock(frameWidth + 1.1, 2.35, depth + 1.5, L(sign * (hw + frameWidth * 0.52), 0, 0.25), {
      yaw, bevel: 0.14, batter: 0.14, irregular: 0.14,
    }), 0x9fa5b0);
    b.prop('carved', stoneBlock(2.45, outerTop + 1.8, depth * 0.86, L(sign * (outerHw + 0.9), 0, -0.2), {
      yaw, bevel: 0.14, batter: 0.06, irregular: 0.1,
    }), 0xb4bac4);
    // Stepped stone corbel brackets carrying the upper entablature hood.
    for (const cx of [outerHw * 0.45, outerHw * 0.92]) {
      b.prop('carved', stoneBlock(1.05, 1.35, 1.45, L(sign * cx, outerTop - 0.95, depth * 0.5 + 0.45), {
        yaw, bevel: 0.08, batter: -0.24, irregular: 0.12,
      }), 0xc4c9d2);
    }
  }

  // Stepped overhanging crown entablature & chevron frieze hood.
  b.prop('carved', stoneBox(outerHw * 2 + 3.8, 1.45, depth + 1.6, L(0, outerTop + 0.72, 0.35), { yaw, bevel: 0.12, irregular: 0.08 }), 0xc6cbd4);
  b.prop('carved', stoneBox(outerHw * 2 + 5.2, 0.95, depth + 2.2, L(0, outerTop + 1.82, 0.52), { yaw, bevel: 0.10, irregular: 0.1 }), 0xcfd4dc);

  if (bronzeInlay) {
    // Recessed gilded bronze runic frieze across crown & jamb channels + boss studs.
    b.prop('bronze', stoneBox(outerHw * 1.85, 0.42, 0.36, L(0, outerTop + 0.72, depth * 0.5 + 1.02), { yaw, bevel: 0.03 }), 0xd6ae62);
    for (const sign of [-1, 1]) {
      b.prop('bronze', stoneBlock(0.36, shoulderY - 0.8, 0.32, L(sign * (hw + frameWidth * 0.62), 1.4, depth * 0.5 + 0.45), { yaw, bevel: 0.025 }), 0xcfa65c);
      b.prop('bronze', hewnBeam(
        L(sign * (hw + frameWidth * 0.62), shoulderY + 0.55, depth * 0.5 + 0.48),
        L(sign * (hw - chamfer + frameWidth * 0.35), openingHeight + frameWidth * 0.6, depth * 0.5 + 0.48),
        0.34, 0.36, { bevel: 0.025 },
      ), 0xd6ae62);
      // Forged bronze rivet studs along the vertical jamb trim.
      for (let ry = 2.6; ry < shoulderY; ry += 2.6) {
        b.prop('iron', stoneBox(0.24, 0.24, 0.18, L(sign * (hw + frameWidth * 0.62), ry, depth * 0.5 + 0.62), { yaw: yaw + Math.PI / 4, bevel: 0.02 }), 0x3b3f48);
      }
    }
  }
}

/**
 * Draped GPU wind-animated crimson, obsidian & gilded gold Dwarven heraldic banner.
 * Replaces flat rigid extruded banner boards with deeply pleated woven cloth,
 * forged iron mounting rings, and gilded finial hardware.
 */
export function buildHeraldicBanner(b, at, {
  yaw = 0,
  width = 1.65,
  height = 4.6,
  pole = false,
  flutter = null,
} = {}) {
  const L = atFrame(at, yaw);
  const hw = width * 0.5;
  const seed = Math.round(at.x * 19 + at.y * 11 + at.z * 29) + 17;
  // Outdoor pole standards ripple briskly in alpine pass winds; indoor hall banners breathe gently in hearth drafts.
  const clothFlutter = flutter ?? (pole ? 0.72 : 0.20);

  // Forged iron horizontal crossbar + mounting rings + bronze spear finials.
  b.prop('iron', rod(L(-hw - 0.3, 0, 0), L(hw + 0.3, 0, 0), 0.068, 0.068, 9), 0x383c45);
  for (const sx of [-1, 1]) {
    b.prop('bronze', rod(L(sx * (hw + 0.28), 0, 0), L(sx * (hw + 0.48), 0, 0), 0.115, 0.025, 8), 0xd4aa60);
    b.prop('iron', collarRing(L(sx * (hw * 0.78), 0, 0), P(1, 0, 0), 0.085, 0.05, 8), 0x2d3038);
  }
  b.prop('iron', collarRing(L(0, 0, 0), P(1, 0, 0), 0.09, 0.06, 8), 0x2d3038);

  if (pole) {
    b.prop('iron', hewnPole(L(0, -height - 1.75, -0.08), L(0, 0.78, -0.08), 0.078, 0.056,
      { seed: seed + 5, segments: 6, sides: 8, bow: 0.02 }), 0x363a42);
    b.prop('bronze', rod(L(0, 0.76, -0.08), L(0, 1.2, -0.08), 0.13, 0.015, 6), 0xdcb46a);
    b.prop('bronze', collarRing(L(0, 0.02, -0.08), P(0, 1, 0), 0.095, 0.12, 8), 0xd4aa60);
  }

  // Deeply pleated, GPU wind-animated woven wool & gold-embroidered V-pointed royal tapestry.
  b.prop('cloth', hangingBannerMesh(L(-hw, -0.04, 0), L(hw, -0.04, 0), height, {
    style: 'heraldic',
    seed,
    cols: 20,
    rows: 22,
    flutter: clothFlutter,
    primaryHex: 0x621510,
    paleHex: 0x16151a,
    goldHex: 0xa8823c,
  }), 0xffffff);
}

/**
 * Monumental stepped stone & fluted forged-iron fire brazier with gilded bronze ribs,
 * glowing ember dome, layered flames, flickering light, and rising embers.
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
  const P0 = (dx, dy, dz) => ({ x: at.x + dx, y: at.y + dy, z: at.z + dz });

  // Weathered stepped carved stone pedestal with recessed bronze collar band.
  b.prop('masonry', stoneBlock(1.98 * s, 0.46 * s, 1.98 * s, P0(0, 0, 0), { bevel: 0.07 * s, batter: 0.12, irregular: 0.14 }), 0xa4a9b2);
  b.prop('carved', stoneBlock(1.48 * s, 0.86 * s, 1.48 * s, P0(0, 0.45 * s, 0), { bevel: 0.07 * s, batter: 0.09, irregular: 0.1 }), 0xb8bdc6);
  b.prop('bronze', stoneBox(1.54 * s, 0.16 * s, 1.54 * s, P0(0, 0.92 * s, 0), { bevel: 0.02 * s, irregular: 0.04 }), 0xcfa45a);
  b.prop('carved', stoneBlock(1.64 * s, 0.25 * s, 1.64 * s, P0(0, 1.28 * s, 0), { bevel: 0.06 * s, batter: -0.08, irregular: 0.1 }), 0xc6cbd4);

  // Broad fluted forged-iron fire bowl with gilded bronze lip and radial ribs.
  const bowlY = 1.52 * s;
  b.prop('iron', rod(P0(0, bowlY, 0), P0(0, bowlY + 0.72 * s, 0), 0.58 * s, 1.18 * s, 12), 0x2c2e34);
  b.prop('bronze', rod(P0(0, bowlY + 0.62 * s, 0), P0(0, bowlY + 0.78 * s, 0), 1.16 * s, 1.26 * s, 12), 0xd4aa60);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    b.prop('bronze', hewnBeam(
      P0(dx * 0.62 * s, bowlY + 0.04 * s, dz * 0.62 * s),
      P0(dx * 1.24 * s, bowlY + 0.76 * s, dz * 1.24 * s),
      0.11 * s, 0.13 * s, { bevel: 0.015 * s },
    ), 0xc89e56);
  }

  // Glowing hot coal dome + multi-tongue animated fire.
  const fireY = bowlY + 0.72 * s;
  b.prop('glow', rod(P0(0, fireY - 0.05 * s, 0), P0(0, fireY + 0.26 * s, 0), 0.96 * s, 0.42 * s, 10), '#ff6214', 2.4);
  b.flame(P0(0, fireY + 0.06 * s, 0), { width: 1.55 * fs, height: 2.35 * fs, core: '#fff4c4', outer: '#ff4e0c', speed: 1.05 });
  b.flame(P0(-0.26 * s, fireY + 0.02 * s, 0.18 * s), { width: 1.05 * fs, height: 1.65 * fs, core: '#ffe89c', outer: '#ff5c12', speed: 1.22 });
  b.flame(P0(0.24 * s, fireY + 0.02 * s, -0.16 * s), { width: 1.05 * fs, height: 1.55 * fs, core: '#ffe89c', outer: '#ff520e', speed: 0.92 });

  b.light(P0(0, fireY + 1.05 * s, 0), '#ff9c42', intensity, range, {
    radius: 1.8 * s,
    halo: halo * s,
    haloGain: 0.34,
    importance,
    flicker: 0.11,
  });
  if (emitEmbers) b.emit('ember', P0(0, fireY + 0.45 * s, 0));
  b.nav.block(at, 1.25 * s, 3.2 * s);
}

/**
 * Realistic gnarled alpine spruce/pine tree: crooked bark trunk grounded into
 * basal rocks and staggered asymmetric whorls of sweeping, pointed evergreen
 * needle boughs (replaces both stacked cones and rounded pebbles).
 */
export function buildAlpinePine(b, at, { height = 6.5, seed = 1, mat = 'pine' } = {}) {
  const rng = createRng(seed * 6971 + Math.round(height * 100));
  const h = height;
  const leanX = (rng() - 0.5) * h * 0.045;
  const leanZ = (rng() - 0.5) * h * 0.045;
  const P0 = (dx, dy, dz) => ({ x: at.x + dx, y: at.y + dy, z: at.z + dz });

  // Crooked tapered spruce trunk rooted deeply (`-1.6 m`) so steep cliffs never expose a floating base.
  b.prop('timber', hewnPole(
    P0(0, -1.6, 0),
    P0(leanX, h * 0.92, leanZ),
    h * 0.052,
    h * 0.01,
    { seed, segments: 6, sides: 8, bow: 0.05 },
  ), 0x453222);

  // 7 staggered whorls of pointed, sweeping, drooping evergreen bough fronds + dense inner foliage core.
  const whorls = 7;
  const boughTones = [0x1f3624, 0x26412b, 0x1a2e1f, 0x2c4930];
  for (let w = 0; w < whorls; w += 1) {
    const t = w / (whorls - 1);
    const wy = h * (0.20 + t * 0.70);
    const tx = leanX * (0.20 + t * 0.70);
    const tz = leanZ * (0.20 + t * 0.70);
    const branches = w < 2 ? 7 : w < 5 ? 6 : 5;
    const baseReach = h * (0.34 - t * 0.24);
    const angOffset = rng() * Math.PI * 2 + w * 0.83;

    // Dense interior spruce whorl core so branches never look sparse or hollow from below.
    b.prop(mat, facetedCrystal(
      P0(tx, wy - baseReach * 0.28, tz),
      P0(tx, wy + baseReach * 0.58, tz),
      baseReach * 0.56,
      { sides: 7, taper: 0.25, tipRatio: 0.72, twist: 0.14, seed: seed + w * 13, flare: 1.08 },
    ), boughTones[w % boughTones.length]);

    for (let k = 0; k < branches; k += 1) {
      const ang = angOffset + (k / branches) * Math.PI * 2 + (rng() - 0.5) * 0.36;
      const reach = baseReach * (0.82 + rng() * 0.34);
      const droop = reach * (0.42 - t * 0.16 + rng() * 0.14);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const tone = boughTones[(w * 5 + k + seed) % boughTones.length];
      // Tapered pointed spruce bough frond sweeping outward & downward with upturned needle tip feel.
      b.prop(mat, facetedCrystal(
        P0(tx + ca * reach * 0.08, wy + reach * 0.06, tz + sa * reach * 0.08),
        P0(tx + ca * reach, wy - droop, tz + sa * reach),
        reach * 0.26,
        { sides: 5, taper: 0.28, tipRatio: 0.65, twist: 0.08, seed: seed + w * 31 + k * 7, flare: 1.05 },
      ), tone);
    }
  }
  // Sharp snow-dusted alpine spruce leader spire at the crown.
  b.prop(mat, facetedCrystal(
    P0(leanX, h * 0.84, leanZ),
    P0(leanX * 1.04, h * 1.04, leanZ * 1.04),
    h * 0.085,
    { sides: 6, taper: 0.18, tipRatio: 0.82, twist: 0.06, seed: seed + 199, flare: 1.02 },
  ), 0x243d29);
}

/**
 * Builds a 3D multi-column curved parabolic waterfall sheet from `top` to `bot`
 * with across-width subdivision (`cols`), organic rock-lip convex curvature,
 * turbulent flow-channel depth ripples, and arc-length UVs for `WaterfallMaterial`.
 */
export function createWaterfallSheet(top, bot, {
  widthTop = 3.2,
  widthBot = 4.8,
  bow = 2.4,
  segs = 22,
  cols = 10,
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
  const seed = Math.round(top.x * 13 + top.y * 7 + top.z * 17);

  const spine = [];
  const widths = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const bulge = Math.sin(Math.PI * t) * bow;
    const px = top.x + dx * t + ox * bulge;
    const pz = top.z + dz * t + oz * bulge;
    const py = top.y + (bot.y - top.y) * Math.pow(t, 1.32);
    spine.push({ x: px, y: py, z: pz });
    widths.push((widthTop + (widthBot - widthTop) * Math.pow(t, 0.85)) * 0.5);
  }

  const arcLen = [0];
  for (let i = 1; i <= segs; i += 1) {
    const a = spine[i - 1], c = spine[i];
    arcLen.push(arcLen[i - 1] + Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z));
  }

  const vCount = (segs + 1) * (cols + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = [];

  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const sp = spine[i];
    const hw = widths[i];
    const v = arcLen[i];

    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const uNorm = (u - 0.5) * 2; // -1 .. +1
      // Convex cascading sheet profile (center projects forward, edges tuck organically back toward cliff rock).
      const archBulge = (1 - uNorm * uNorm) * 0.42 * (0.4 + 0.6 * Math.sin(Math.PI * t));
      const rib = (fbm3(u * 4.5 + seed, t * 5.2, 0.5, seed + 11, 2) - 0.5) * 0.34 * Math.sin(Math.PI * t);
      const outPush = archBulge + rib;
      const idx = i * (cols + 1) + c;
      positions[idx * 3] = sp.x + sx * (uNorm * hw) + ox * outPush;
      positions[idx * 3 + 1] = sp.y;
      positions[idx * 3 + 2] = sp.z + sz * (uNorm * hw) + oz * outPush;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  for (let i = 0; i < segs; i += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = i * (cols + 1) + c;
      const b = a + 1;
      const d = (i + 1) * (cols + 1) + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
