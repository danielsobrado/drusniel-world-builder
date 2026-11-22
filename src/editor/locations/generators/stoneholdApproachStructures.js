import { emitRadialArch } from '../gen/dwarvenMasonry.js';
import { box, hewnBeam, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { buildHeraldicBanner, buildMonumentalBrazier } from './stoneholdDressing.js';

const P = (x, y, z) => ({ x, y, z });

/**
 * Crenellated Dwarven bridgehead watchtower flanking the chasm viaduct entry (Refs 4 & 6).
 */
export function buildWatchtower(b, at, { height = 10.5, width = 4.6, brazier = true } = {}) {
  const x = at.x, y = at.y, z = at.z;
  // Deep foundation plinth anchoring cleanly into rugged cliff rock below.
  b.prop('masonry', stoneBlock(width + 1.0, 6.0, width + 1.0, P(x, y - 5.8, z), { bevel: 0.10, batter: 0.08 }), 0x8e939c);
  // Main battered tower shaft with corner buttress pilasters.
  b.prop('carved', stoneBlock(width, height, width, P(x, y, z), { bevel: 0.10, batter: 0.06 }), 0xbcc0c8);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.prop('carved', stoneBlock(1.05, height + 0.4, 1.05, P(x + sx * (width * 0.46), y, z + sz * (width * 0.46)), { bevel: 0.07 }), 0xa8adb6);
    }
  }
  // Overhanging corbelled cornice belt + bronze frieze band.
  b.prop('carved', stoneBox(width + 0.85, 0.72, width + 0.85, P(x, y + height + 0.1, z), { bevel: 0.08 }), 0xcad0d8);
  b.prop('bronze', stoneBox(width + 0.92, 0.18, width + 0.92, P(x, y + height + 0.12, z), { bevel: 0.02 }), 0xd4aa62);
  // Heavy stepped Dwarven crenellated merlons around the crown deck.
  const deckY = y + height + 0.46;
  const hw = width * 0.5 + 0.25;
  for (const sign of [-1, 1]) {
    for (const off of [-hw * 0.65, 0, hw * 0.65]) {
      b.prop('carved', stoneBlock(0.95, 1.15, 0.65, P(x + off, deckY, z + sign * hw), { bevel: 0.05 }), 0xd0d4dc);
      b.prop('carved', stoneBlock(0.65, 1.15, 0.95, P(x + sign * hw, deckY, z + off), { bevel: 0.05 }), 0xd0d4dc);
    }
  }
  // Arrow-slit embrasure with subtle warm guard lantern glow.
  b.prop('glow', box(0.32, 1.35, 0.22, P(x, y + height * 0.62, z + width * 0.48)), '#ff9e42', 1.8);
  if (brazier) {
    buildMonumentalBrazier(b, P(x, deckY, z), {
      scale: 0.85, flameScale: 1.05, intensity: 7.5, range: 20, halo: 1.4, importance: 1.1,
    });
  }
  b.nav.block(at, width * 0.62, height + 2);
}

/**
 * Multi-arch monumental stone viaduct spanning the misty chasm (`zStart` -> `zEnd`),
 * with deep chasm piers, radial voussoir arches, heavy stone parapets, and flaming braziers.
 */
export function buildChasmViaduct(b, {
  zStart = 24,
  zEnd = -2,
  yStart = 7.5,
  yEnd = 9.0,
  chasmFloorY = -30,
  width = 10.4,
  spans = 3,
} = {}) {
  const hw = width * 0.5;
  const totalLen = zStart - zEnd;
  const spanLen = totalLen / spans;
  const yAt = (z) => yStart + (yEnd - yStart) * ((zStart - z) / totalLen);

  // Continuous beveled flagstone roadway deck & heavy structural spandrel fascia.
  const deckSegs = 14;
  for (let i = 0; i < deckSegs; i += 1) {
    const z0 = zStart - (i / deckSegs) * totalLen;
    const z1 = zStart - ((i + 1) / deckSegs) * totalLen;
    const zm = (z0 + z1) * 0.5;
    const ym = yAt(zm);
    const segD = Math.abs(z0 - z1) + 0.16;
    b.prop('carved', stoneBox(width, 1.15, segD, P(0, ym - 0.58, zm), { bevel: 0.06, irregular: 0.03 }), 0xbcc0c8);
    b.prop('masonry', stoneBox(width - 1.2, 0.18, segD, P(0, ym - 0.04, zm), { bevel: 0.03 }), 0xc8ccd2);
    // Side stone parapet walls + heavy coping cap.
    for (const sign of [-1, 1]) {
      b.prop('carved', stoneBlock(0.86, 1.15, segD, P(sign * (hw - 0.42), ym, zm), { bevel: 0.05 }), 0xc2c6ce);
      b.prop('carved', stoneBox(1.04, 0.24, segD, P(sign * (hw - 0.42), ym + 1.22, zm), { bevel: 0.04 }), 0xd2d6dc);
    }
  }

  // Colossal piers descending to the chasm floor + radial voussoir arches beneath each span.
  for (let i = 0; i <= spans; i += 1) {
    const pz = zStart - i * spanLen;
    const py = yAt(pz);
    const pierH = py - chasmFloorY;
    b.prop('masonry', stoneBlock(width + 0.9, pierH, 2.75, P(0, chasmFloorY, pz), { bevel: 0.12, batter: 0.05 }), 0x9fa4ae);
    b.prop('bronze', stoneBox(width + 1.05, 0.32, 2.9, P(0, py - 1.4, pz), { bevel: 0.03 }), 0xcfa660);

    // Tall parapet pier plinths & flaming monumental braziers flanking the bridge piers.
    for (const sign of [-1, 1]) {
      b.prop('carved', stoneBlock(1.45, 1.65, 1.65, P(sign * (hw - 0.22), py, pz), { bevel: 0.06 }), 0xd0d4dc);
      b.prop('bronze', stoneBox(1.52, 0.22, 1.72, P(sign * (hw - 0.22), py + 1.35, pz), { bevel: 0.02 }), 0xd8b068);
      if (i > 0 && i < spans) {
        buildMonumentalBrazier(b, P(sign * (hw - 0.22), py + 1.62, pz), {
          scale: 0.74, flameScale: 0.95, intensity: 8.5, range: 22, emitEmbers: true, halo: 1.5, importance: 1.25,
        });
      }
    }

    if (i < spans) {
      const nextZ = zStart - (i + 1) * spanLen;
      const archSpringY = Math.min(py, yAt(nextZ)) - 4.8;
      // Twin massive radial voussoir arch rings supporting the viaduct deck.
      for (const sign of [-1, 1]) {
        emitRadialArch(b, 'carved', P(sign * (hw - 1.05), archSpringY, pz - 1.15), P(sign * (hw - 1.05), archSpringY, nextZ + 1.15),
          3.8, 1.25, 2.1, 13, { pointed: 0.12, tint: 0xc2c6ce, keystoneTint: 0xd8dce2, irregular: 0.04 });
      }
      // Vault barrel soffit connecting the two outer arch faces.
      const midZ = (pz + nextZ) * 0.5;
      b.prop('masonry', stoneBox(width - 1.6, 1.35, spanLen - 2.2, P(0, archSpringY + 3.85, midZ), { bevel: 0.06 }), 0x8e939c);
    }
  }

  // Register walkable bridge deck cleanly in nav.
  b.nav.addSegment(P(0, yStart, zStart + 0.5), P(0, yEnd, zEnd - 0.5), width - 2.2);
}

/**
 * Grand stepped Dwarven causeway staircase ascending from the bridge end (`zStart, yStart`)
 * up to the monumental fortress gate landing (`zEnd, yEnd`) (Ref 6!).
 */
export function buildGateStaircase(b, {
  zStart = -2,
  zEnd = -18,
  yStart = 9.0,
  yEnd = 14.6,
  chasmFloorY = -30,
  width = 11.4,
  steps = 18,
} = {}) {
  const hw = width * 0.5;
  const totalRun = zStart - zEnd;
  const totalRise = yEnd - yStart;
  const stepD = totalRun / steps;
  const stepH = totalRise / steps;

  // Stepped battered retaining substructure cleanly supporting the stair rise without poking above treads.
  const subTiers = 4;
  for (let k = 0; k < subTiers; k += 1) {
    const t0 = k / subTiers;
    const t1 = (k + 1) / subTiers;
    const zm = zStart - (t0 + t1) * 0.5 * totalRun;
    const segD = totalRun / subTiers + 0.35;
    const topY = yStart + t0 * totalRise - 0.35;
    b.prop('masonry', stoneBlock(width + 1.4, topY - chasmFloorY, segD, P(0, chasmFloorY, zm), { bevel: 0.10, batter: 0.03 }), 0x8e939c);
  }

  for (let i = 0; i < steps; i += 1) {
    const sy = yStart + (i + 1) * stepH;
    const sz = zStart - (i + 0.5) * stepD;
    const treadTint = i % 3 === 0 ? 0xd2d6dc : 0xc6cad0;
    b.prop('carved', stoneBlock(width - 1.4, stepH + 0.45, stepD + 0.24, P(0, sy - stepH - 0.42, sz), { bevel: 0.035, irregular: 0.03 }), treadTint);
  }

  // Heavy stepped cheek balustrades climbing either side of the staircase.
  const cheekSegments = 6;
  for (let k = 0; k < cheekSegments; k += 1) {
    const t0 = k / cheekSegments;
    const t1 = (k + 1) / cheekSegments;
    const zm = zStart - (t0 + t1) * 0.5 * totalRun;
    const segD = (totalRun / cheekSegments) + 0.15;
    const topY = yStart + t1 * totalRise + 1.35;
    const baseY = yStart + t0 * totalRise - 1.2;
    for (const sign of [-1, 1]) {
      b.prop('carved', stoneBlock(1.25, topY - baseY, segD, P(sign * (hw - 0.15), baseY, zm), { bevel: 0.06 }), 0xc0c4cc);
      b.prop('carved', stoneBox(1.42, 0.26, segD + 0.06, P(sign * (hw - 0.15), topY + 0.1, zm), { bevel: 0.04 }), 0xd4d8de);
    }
  }

  // Flanking monumental braziers at both the foot and crown of the grand staircase (Ref 6!).
  for (const [bz, by, sc] of [[zStart + 0.4, yStart + 1.45, 0.85], [zEnd - 0.2, yEnd + 1.45, 1.05]]) {
    for (const sign of [-1, 1]) {
      b.prop('carved', stoneBlock(1.85, 1.55, 1.85, P(sign * (hw + 0.1), by - 1.45, bz), { bevel: 0.07 }), 0xc8ccd4);
      buildMonumentalBrazier(b, P(sign * (hw + 0.1), by, bz), {
        scale: sc, flameScale: 1.15, intensity: 11, range: 26, emitEmbers: true, halo: 1.9, importance: 1.45,
      });
    }
  }

  b.nav.addSegment(P(0, yStart, zStart + 0.4), P(0, yEnd, zEnd - 0.4), width - 2.4);
}

/**
 * Multi-story subterranean lit vaulted arcades and lower spanning chasm bridge recessed
 * deep beneath the main viaduct in the misty waterfall gorge (Ref 5!).
 */
export function buildLowerAbyssalArcades(b, { zWall = -19, bridgeZ = -8 } = {}) {
  for (const [tierY, archH, spanW, count] of [[-18.5, 6.2, 5.4, 5], [-8.5, 6.4, 5.6, 5]]) {
    const startX = -((count - 1) * spanW) * 0.5;
    b.prop('masonry', stoneBox(count * spanW + 4.0, 1.2, 3.6, P(0, tierY - 0.6, zWall), { bevel: 0.08 }), 0x7a808a);
    for (let i = 0; i < count; i += 1) {
      const cx = startX + i * spanW;
      // Pier jambs & radial voussoir arcade arch.
      for (const sx of [-1, 1]) {
        b.prop('carved', stoneBlock(1.05, archH, 2.4, P(cx + sx * (spanW * 0.46), tierY, zWall), { bevel: 0.06 }), 0x9aa0aa);
      }
      emitRadialArch(b, 'carved', P(cx - spanW * 0.44, tierY + archH - 1.4, zWall + 0.35), P(cx + spanW * 0.44, tierY + archH - 1.4, zWall + 0.35),
        2.1, 0.85, 1.6, 9, { pointed: 0.14, tint: 0xaab0ba, keystoneTint: 0xc2c8d2 });
      // Warm glowing hearth/hall interior windows shining through the gorge mist!
      b.prop('glow', box(spanW * 0.56, archH * 0.72, 0.35, P(cx, tierY + archH * 0.44, zWall - 0.95)), '#ff9432', 2.2);
      if (i % 2 === 0) {
        b.light(P(cx, tierY + archH * 0.55, zWall + 1.8), '#ff8e30', 7.5, 20, { radius: 2.0, halo: 2.4, haloGain: 0.34, importance: 0.9 });
      }
    }
  }

  // Slender lower subterranean bridge crossing the chasm deep beneath the main viaduct.
  const lowY = -14.5;
  b.prop('carved', stoneBox(36, 1.1, 3.4, P(0, lowY, bridgeZ), { bevel: 0.06 }), 0x949aa4);
  for (const ax of [-12, 0, 12]) {
    emitRadialArch(b, 'carved', P(ax - 5.4, lowY - 4.2, bridgeZ), P(ax + 5.4, lowY - 4.2, bridgeZ),
      3.8, 1.0, 2.8, 11, { pointed: 0.1, tint: 0x9aa0aa, keystoneTint: 0xb6bcc6 });
    b.prop('masonry', stoneBlock(1.8, 16, 3.0, P(ax - 5.8, -30, bridgeZ), { bevel: 0.08 }), 0x787e88);
    b.flame(P(ax, lowY + 1.4, bridgeZ + 1.4), { width: 0.75, height: 1.15, core: '#ffe89c', outer: '#ff520e', speed: 1.1 });
  }
}

/**
 * Soaring multi-arched Upper Royal Citadel Palace & fortified cliffside switchback
 * perched high on the left mountain spur silhouetted against snow-capped peaks (Refs 1 & 5).
 */
export function buildUpperCitadelAndSwitchback(b, { at = P(-42, 33, -40) } = {}) {
  const x = at.x, y = at.y, z = at.z;

  // Deep cyclopean cliffside bastion foundation anchoring the palace into the high mountain spur.
  b.prop('masonry', stoneBlock(28, 18, 16, P(x, y - 18, z), { bevel: 0.16, batter: 0.08 }), 0x9297a0);
  // Main multi-bay Royal Arcade Hall with glowing warm arched clerestory windows.
  b.prop('carved', stoneBlock(25, 11.5, 12.5, P(x, y, z), { bevel: 0.14, batter: 0.03 }), 0xc4c8d0);
  for (let i = -3; i <= 3; i += 1) {
    const bx = x + i * 3.4;
    b.prop('carved', stoneBlock(1.15, 12.2, 1.45, P(bx, y, z + 6.4), { bevel: 0.07 }), 0xd2d6dc);
    if (i < 3) {
      const mx = bx + 1.7;
      emitRadialArch(b, 'carved', P(bx + 0.4, y + 6.4, z + 6.55), P(bx + 3.0, y + 6.4, z + 6.55),
        1.8, 0.72, 1.2, 9, { pointed: 0.18, tint: 0xd0d4dc, keystoneTint: 0xe2e5ea });
      b.prop('glow', box(1.8, 5.4, 0.35, P(mx, y + 4.4, z + 6.1)), '#ff9a38', 2.0);
    }
  }
  b.light(P(x, y + 5.5, z + 9.5), '#ff9c3e', 10, 26, { flat: true });

  // Towering Upper Keep Crown Tower & flanking crenellated turrets (Ref 1 & Ref 5 skyline!).
  b.prop('carved', stoneBlock(9.5, 19.5, 9.5, P(x - 6.5, y + 4.0, z - 2.0), { bevel: 0.14, batter: 0.05 }), 0xc8ccd4);
  b.prop('carved', stoneBox(10.6, 1.2, 10.6, P(x - 6.5, y + 23.8, z - 2.0), { bevel: 0.09 }), 0xd8dce2);
  b.prop('bronze', stoneBox(10.8, 0.32, 10.8, P(x - 6.5, y + 23.8, z - 2.0), { bevel: 0.03 }), 0xd8b068);
  for (const sx of [-4.4, 0, 4.4]) {
    for (const sz of [-4.4, 4.4]) {
      b.prop('carved', stoneBlock(1.4, 1.8, 1.2, P(x - 6.5 + sx, y + 24.4, z - 2.0 + sz), { bevel: 0.06 }), 0xdce0e6);
    }
  }
  // Slender spire crowning the royal keep (nod to Ref 1 silhouette!).
  b.prop('carved', rod(P(x - 6.5, y + 24.4, z - 2.0), P(x - 6.5, y + 32.5, z - 2.0), 1.85, 0.32, 8), 0xd8dce2);

  // Flanking outer citadel watch-turret overlooking the switchback road.
  buildWatchtower(b, P(x + 15.5, y - 5.5, z + 9.5), { height: 11.5, width: 4.8, brazier: true });

  // Fortified switchback road climbing the left cliff face from the gate flank up to the citadel.
  const segments = [
    [P(-22, 16.5, -24), P(-38, 22.0, -18)],
    [P(-38, 22.0, -18), P(-28, 27.5, -30)],
    [P(-28, 27.5, -30), P(-38, 33.0, -34)],
  ];
  for (const [a, c] of segments) {
    b.prop('carved', hewnBeam(P(a.x, a.y - 1.2, a.z), P(c.x, c.y - 1.2, c.z), 3.6, 2.4, { bevel: 0.12 }), 0xb4b8c0);
    b.prop('carved', hewnBeam(P(a.x, a.y + 0.6, a.z + 1.5), P(c.x, c.y + 0.6, c.z + 1.5), 0.72, 1.15, { bevel: 0.05 }), 0xc8ccd4);
    const mid = P((a.x + c.x) * 0.5, (a.y + c.y) * 0.5 + 1.2, (a.z + c.z) * 0.5 + 1.5);
    b.flame(mid, { width: 0.72, height: 1.1, core: '#fff0b8', outer: '#ff520e', speed: 1.0 });
    buildHeraldicBanner(b, P(mid.x, mid.y + 3.4, mid.z + 0.3), { yaw: 0.35, width: 1.15, height: 3.1, pole: true });
  }
}
