import {
  arch,
  beam,
  extrudedProfile,
  hewnBeam,
  rod,
  stoneBlock,
  stoneBox,
} from '../gen/propKit.js';

import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const UMBRA_SKIRT = Object.freeze({ skirtMat: 'masonry', skirtTint: 0x383246 });
const UMBRA_LOAM_SKIRT = Object.freeze({ skirtMat: 'loam', skirtTint: 0x2e2838 });
const IRON_DARK = 0x23262e;
const IRON_TRIM = 0x343947;
const BRONZE_ACCENT = 0x7a6850;

/** 1. Giant sinuous veil-fungus parasol with root buttresses, gill lamellae, shelf brackets & curved spore tendrils. */
export function buildVeilFungusParasol(b, at, scale = 1.0) {
  emitDetailedUndergroundProp(b, at, UMBRA_LOAM_SKIRT, (p) => {
    const s = scale;
    // Rooted basal loam collar + 6 radial root buttress tendrils anchoring into cavern silt.
    p.prop('loam', rod(P(at.x, at.y - 0.18 * s, at.z), P(at.x, at.y + 0.16 * s, at.z), 0.78 * s, 0.34 * s, 12), 0x2e2838);
    for (let r = 0; r < 6; r += 1) {
      const a = (r / 6) * Math.PI * 2 + 0.25;
      const dx = Math.cos(a), dz = Math.sin(a);
      p.prop('loam', rod(
        P(at.x + dx * 0.18 * s, at.y + 0.18 * s, at.z + dz * 0.18 * s),
        P(at.x + dx * 0.86 * s, at.y - 0.06 * s, at.z + dz * 0.86 * s),
        0.11 * s, 0.035 * s, 7,
      ), 0x362e44);
    }

    // Sinuous 4-segment fluted stalk with fibrous annular collar ring & mid-stem shelf brackets.
    const segments = [
      P(at.x, at.y - 0.12, at.z),
      P(at.x + 0.16 * s, at.y + 0.85 * s, at.z + 0.09 * s),
      P(at.x + 0.04 * s, at.y + 1.78 * s, at.z - 0.06 * s),
      P(at.x - 0.09 * s, at.y + 2.52 * s, at.z - 0.08 * s),
      P(at.x, at.y + 3.15 * s, at.z),
    ];
    const radii = [0.28 * s, 0.20 * s, 0.16 * s, 0.145 * s, 0.22 * s];
    for (let i = 0; i < segments.length - 1; i += 1) {
      p.prop('loam', rod(segments[i], segments[i + 1], radii[i], radii[i + 1], 10), 0x3b3348);
    }
    // Volva ring + glowing mid-stalk shelf brackets + twin young sapling buds.
    p.prop('loam', rod(P(segments[2].x, segments[2].y - 0.06 * s, segments[2].z), P(segments[2].x, segments[2].y + 0.12 * s, segments[2].z), 0.30 * s, 0.19 * s, 10), 0x4b405d);
    for (const [bx, by, bz, br] of [[0.14, 1.15, 0.16, 0.26], [-0.12, 1.55, -0.15, 0.22]]) {
      p.prop('glow', rod(P(at.x + bx * s, at.y + by * s, at.z + bz * s), P(at.x + bx * s, at.y + (by + 0.10) * s, at.z + bz * s), br * s, br * 0.35 * s, 8), '#79e3c4', 1.1);
    }
    for (const [sx, sz, sh] of [[0.38, 0.22, 0.62], [-0.34, 0.28, 0.48]]) {
      p.prop('loam', rod(P(at.x + sx * s, at.y - 0.06 * s, at.z + sz * s), P(at.x + sx * 1.18 * s, at.y + sh * s, at.z + sz * 1.15 * s), 0.10 * s, 0.045 * s, 7), 0x443a54);
      p.prop('glow', rod(P(at.x + sx * 1.18 * s, at.y + (sh - 0.04) * s, at.z + sz * 1.15 * s), P(at.x + sx * 1.18 * s, at.y + (sh + 0.16) * s, at.z + sz * 1.15 * s), 0.24 * s, 0.04 * s, 8), '#9b7ef0', 1.15);
    }

    // Layered ribbed parasol bell cap + underside radial gill lamellae + glowing dome crown.
    const capAt = segments[4];
    p.prop('masonry', rod(P(capAt.x, capAt.y - 0.14 * s, capAt.z), P(capAt.x, capAt.y + 0.32 * s, capAt.z), 1.52 * s, 0.84 * s, 14), 0x2c2440);
    p.prop('masonry', rod(P(capAt.x, capAt.y + 0.30 * s, capAt.z), P(capAt.x, capAt.y + 0.56 * s, capAt.z), 0.84 * s, 0.32 * s, 12), 0x352b4d);
    p.prop('glow', rod(P(capAt.x, capAt.y + 0.52 * s, capAt.z), P(capAt.x, capAt.y + 0.74 * s, capAt.z), 0.34 * s, 0.06 * s, 10), '#79e3c4', 1.45);
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      // Underside radial gill rib.
      p.prop('glow', hewnBeam(
        P(capAt.x + dx * 0.22 * s, capAt.y - 0.06 * s, capAt.z + dz * 0.22 * s),
        P(capAt.x + dx * 1.38 * s, capAt.y - 0.16 * s, capAt.z + dz * 1.38 * s),
        0.04 * s, 0.09 * s,
      ), '#6fd0ff', 0.95);
      // 2-segment curved hanging luminescent spore tendril + glowing tip droplet.
      const len = (k % 2 === 0 ? 1.05 : 0.78) * s;
      const topPt = P(capAt.x + dx * 1.28 * s, capAt.y - 0.12 * s, capAt.z + dz * 1.28 * s);
      const midPt = P(capAt.x + dx * 1.18 * s, capAt.y - 0.12 * s - len * 0.52, capAt.z + dz * 1.18 * s);
      const tipPt = P(capAt.x + dx * 1.08 * s, capAt.y - 0.12 * s - len, capAt.z + dz * 1.08 * s);
      p.prop('glow', rod(topPt, midPt, 0.032 * s, 0.020 * s, 5), '#9b7ef0', 1.05);
      p.prop('glow', rod(midPt, tipPt, 0.020 * s, 0.008 * s, 5), '#79e3c4', 1.25);
      p.prop('glow', rod(P(tipPt.x, tipPt.y - 0.05 * s, tipPt.z), P(tipPt.x, tipPt.y + 0.04 * s, tipPt.z), 0.036 * s, 0.02 * s, 6), '#79e3c4', 1.6);
    }
    p.light(P(capAt.x, capAt.y - 0.3 * s, capAt.z), '#79e3c4', 2.4, 14, { halo: 1.0 });
    p.nav.block(at, 0.45 * s, 3.2 * s);
  });
}

/** 2. Faceted dark-basalt crystal resonator obelisk with buttressed gothic plinth, crystal cluster & concentric tuning rings. */
export function buildCrystalResonatorObelisk(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, UMBRA_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Multi-tiered hexagonal gothic plinth with 6 radial buttress fins & bronze rune collar.
    p.prop('masonry', rod(L(0, -0.22, 0), L(0, 0.22, 0), 1.22, 1.05, 6), 0xffffff);
    p.prop('masonry', rod(L(0, 0.2, 0), L(0, 0.62, 0), 0.98, 0.72, 6), 0xe8e4f2);
    p.prop('masonry', stoneBox(1.02, 0.32, 1.02, L(0, 0.76, 0), { yaw, bevel: 0.04 }), 0xffffff);
    p.prop('iron', rod(L(0, 0.90, 0), L(0, 1.02, 0), 0.62, 0.56, 8), BRONZE_ACCENT);
    for (let f = 0; f < 6; f += 1) {
      const a = (f / 6) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      p.prop('masonry', hewnBeam(L(dx * 1.18, 0.02, dz * 1.18), L(dx * 0.64, 0.88, dz * 0.64), 0.16, 0.22, { bevel: 0.02 }), 0xe8e4f2);
    }

    // Main faceted amethyst crystal spire + 5 asymmetrical canted satellite shards.
    p.prop('glow', rod(L(0, 0.98, 0), L(0, 3.05, 0), 0.34, 0.04, 6), '#9b7ef0', 2.25);
    const shards = [
      [0.36, 0.16, 0.54, 0.22, 1.55, 0.12],
      [-0.32, 0.24, -0.48, 0.34, 1.38, 0.11],
      [0.14, -0.38, 0.22, -0.56, 1.26, 0.10],
      [-0.34, -0.22, -0.46, -0.32, 1.08, 0.09],
      [0.24, 0.32, 0.34, 0.44, 0.95, 0.08],
    ];
    for (const [bx, bz, tx, tz, h, rad] of shards) {
      p.prop('glow', rod(L(bx, 0.85, bz), L(tx, 0.85 + h, tz), rad, 0.02, 6), '#79e3c4', 1.65);
    }

    // 6 curved forged-iron spider-leg tuning prongs + 2 concentric segmented resonator rings.
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      p.prop('iron', beam(L(dx * 0.72, 0.76, dz * 0.72), L(dx * 0.82, 1.78, dz * 0.82), 0.06, 0.06), IRON_DARK);
      p.prop('iron', beam(L(dx * 0.82, 1.78, dz * 0.82), L(dx * 0.38, 2.68, dz * 0.38), 0.05, 0.05), IRON_TRIM);
      p.prop('iron', rod(L(dx * 0.38, 2.68, dz * 0.38), L(dx * 0.22, 2.98, dz * 0.22), 0.032, 0.01, 5), BRONZE_ACCENT);
    }
    for (const [ry, rr] of [[1.78, 0.82], [2.42, 0.52]]) {
      for (let s = 0; s < 12; s += 1) {
        const a0 = (s / 12) * Math.PI * 2;
        const a1 = ((s + 1) / 12) * Math.PI * 2;
        p.prop('iron', beam(L(Math.cos(a0) * rr, ry, Math.sin(a0) * rr), L(Math.cos(a1) * rr, ry, Math.sin(a1) * rr), 0.042, 0.042), IRON_TRIM);
      }
    }
    p.light(L(0, 2.1, 0), '#9b7ef0', 2.8, 16, { halo: 1.2 });
    p.nav.block(at, 0.95, 3.0);
  });
}

/** 3. Ornate wrought-iron street gallows suspending a multi-tiered pierced filigree censer spire. */
export function buildHangingCenserSpire(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, UMBRA_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Stepped gothic basalt pedestal + iron collar ring.
    p.prop('masonry', rod(L(0, -0.06, 0), L(0, 0.24, 0), 0.52, 0.44, 8), 0xffffff);
    p.prop('masonry', rod(L(0, 0.22, 0), L(0, 0.56, 0), 0.42, 0.30, 8), 0xe8e4f2);
    p.prop('iron', rod(L(0, 0.54, 0), L(0, 0.66, 0), 0.24, 0.14, 8), IRON_TRIM);

    // Fluted wrought-iron gallows post with mid-bands, spire finial, scrolled arm & curved gusset brace.
    p.prop('iron', rod(L(0, 0.62, 0), L(0, 3.45, 0), 0.075, 0.045, 8), IRON_DARK);
    for (const cy of [1.45, 2.35, 3.15]) {
      p.prop('iron', rod(L(0, cy, 0), L(0, cy + 0.09, 0), 0.092, 0.092, 8), BRONZE_ACCENT);
    }
    p.prop('iron', rod(L(0, 3.45, 0), L(0, 3.88, 0), 0.045, 0.012, 6), BRONZE_ACCENT);
    p.prop('iron', hewnBeam(L(0, 2.75, 0), L(0.42, 3.18, 0), 0.065, 0.075), IRON_DARK);
    p.prop('iron', hewnBeam(L(0.42, 3.18, 0), L(0.82, 3.42, 0), 0.055, 0.065), IRON_DARK);
    p.prop('iron', beam(L(0, 2.28, 0), L(0.56, 3.08, 0), 0.038, 0.038), IRON_TRIM);
    p.prop('iron', rod(L(0.82, 3.36, 0), L(0.94, 3.56, 0), 0.032, 0.012, 5), BRONZE_ACCENT);

    // Articulated chain links + pierced filigree 6-rib censer cage around faceted crystal core.
    for (let li = 0; li < 4; li += 1) {
      const ly = 3.36 - li * 0.16;
      p.prop('iron', rod(L(0.80, ly, 0), L(0.80, ly - 0.14, 0), 0.024, 0.024, 6), IRON_TRIM);
    }
    const cx = 0.80, cy = 2.38;
    p.prop('iron', rod(L(cx, cy + 0.22, 0), L(cx, cy + 0.42, 0), 0.24, 0.06, 8), IRON_TRIM);
    p.prop('iron', rod(L(cx, cy - 0.24, 0), L(cx, cy - 0.56, 0), 0.20, 0.02, 8), IRON_TRIM);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      const dx = Math.cos(a) * 0.23, dz = Math.sin(a) * 0.23;
      p.prop('iron', beam(L(cx + dx * 0.85, cy + 0.24, dz * 0.85), L(cx + dx, cy, dz), 0.024, 0.024), IRON_DARK);
      p.prop('iron', beam(L(cx + dx, cy, dz), L(cx + dx * 0.78, cy - 0.24, dz * 0.78), 0.024, 0.024), IRON_DARK);
    }
    p.prop('glow', rod(L(cx, cy - 0.18, 0), L(cx, cy + 0.18, 0), 0.14, 0.11, 6), '#6fd0ff', 2.6);
    p.light(L(cx, cy, 0), '#6fd0ff', 3.6, 15, { halo: 1.1 });
    p.nav.block(at, 0.48, 3.3);
  });
}

/** 4. Gothic carved basalt spiderweb sanctuary arch with concentric forged web rings, stepped altar & flanking braziers. */
export function buildSpiderWebBalustradeShrine(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, UMBRA_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Two-stepped octagonal basalt sanctuary dais.
    p.prop('masonry', rod(L(0, -0.06, 0), L(0, 0.22, 0), 1.52, 1.42, 8), 0xffffff);
    p.prop('masonry', rod(L(0, 0.2, 0), L(0, 0.46, 0), 1.24, 1.14, 8), 0xe8e4f2);

    // Fluted octagonal shrine pilasters + bases + corbel capitals + flanking obsidian spirelets.
    for (const sx of [-1.0, 1.0]) {
      p.prop('masonry', stoneBlock(0.52, 0.28, 0.52, L(sx, 0.44, 0), { yaw, bevel: 0.03 }), 0xe8e4f2);
      p.prop('masonry', rod(L(sx, 0.70, 0), L(sx, 2.52, 0), 0.22, 0.19, 8), 0xffffff);
      p.prop('masonry', stoneBox(0.54, 0.24, 0.54, L(sx, 2.62, 0), { yaw, bevel: 0.03 }), 0xe8e4f2);
      p.prop('masonry', rod(L(sx, 2.74, 0), L(sx, 3.45, 0), 0.18, 0.03, 6), 0xe8e4f2);
      // Flanking miniature incense braziers.
      p.prop('iron', rod(L(sx * 0.76, 0.44, 0.52), L(sx * 0.76, 0.92, 0.52), 0.06, 0.16, 8), IRON_DARK);
      p.prop('glow', rod(L(sx * 0.76, 0.90, 0.52), L(sx * 0.76, 1.04, 0.52), 0.11, 0.04, 6), '#79e3c4', 1.6);
    }

    // Pointed gothic voussoir arch + central crowning obsidian finial.
    p.prop('masonry', arch(2.2, 0.92, 0.48, 0.28, L(0, 2.55, 0), { yaw, segments: 10 }), 0xe8e4f2);
    p.prop('masonry', rod(L(0, 3.25, 0), L(0, 3.92, 0), 0.20, 0.03, 6), 0xe8e4f2);

    // Forged spiderweb filigree: 8 radial spokes + 2 concentric polygonal web rings.
    const hub = L(0, 1.72, 0);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      p.prop('iron', beam(hub, L(Math.cos(a) * 0.88, 1.72 + Math.sin(a) * 0.88, 0), 0.026, 0.026), IRON_TRIM);
    }
    for (const r of [0.36, 0.68]) {
      for (let i = 0; i < 8; i += 1) {
        const a0 = (i / 8) * Math.PI * 2;
        const a1 = ((i + 1) / 8) * Math.PI * 2;
        p.prop('iron', beam(
          L(Math.cos(a0) * r, 1.72 + Math.sin(a0) * r, 0),
          L(Math.cos(a1) * r, 1.72 + Math.sin(a1) * r, 0),
          0.022, 0.022,
        ), IRON_DARK);
      }
    }

    // Carved stepped altar pedestal + bronze chalice cradle + glowing silk-egg crystal.
    p.prop('masonry', stoneBox(0.68, 0.24, 0.68, L(0, 0.56, 0), { yaw, bevel: 0.03 }), 0xe8e4f2);
    p.prop('masonry', stoneBox(0.52, 0.56, 0.52, L(0, 0.94, 0), { yaw, bevel: 0.03 }), 0xffffff);
    p.prop('iron', rod(L(0, 1.20, 0), L(0, 1.32, 0), 0.14, 0.22, 8), BRONZE_ACCENT);
    p.prop('glow', rod(L(0, 1.28, 0), L(0, 1.66, 0), 0.17, 0.05, 8), '#9b7ef0', 2.4);
    p.light(L(0, 1.55, 0), '#9b7ef0', 2.8, 14, { halo: 0.9 });
    p.nav.block(at, 1.35, 2.8);
  });
}

/** 5. Slender ribbed dark-timber canal gondola with swan-neck prow finial, bow lantern, oar & cargo bales. */
export function buildTideGondolaSkiff(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, UMBRA_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    // Ribbed dark-timber hull shell + raised gunwale trim rails + keel spine.
    const hull = [[-2.05, 0.42], [-1.35, -0.26], [1.35, -0.26], [2.05, 0.42], [1.38, 0.14], [-1.38, 0.14]];
    p.prop('timber', extrudedProfile(hull, 1.02, { yaw, at: L(0, 0.36, 0), bevel: 0.035 }), 0x2e231c);
    for (const sz of [-0.52, 0.52]) {
      p.prop('timber', hewnBeam(L(-1.82, 0.68, sz), L(1.82, 0.68, sz), 0.075, 0.08, { bevel: 0.015 }), 0x453428);
    }
    // 5 interior hull ribs + 3 planked cross-thwart benches.
    for (const rx of [-1.1, -0.55, 0, 0.55, 1.1]) {
      p.prop('timber', stoneBox(0.08, 0.34, 0.92, L(rx, 0.40, 0), { yaw, bevel: 0.01 }), 0x3b2c22);
    }
    for (const tx of [-0.85, 0.0, 0.85]) {
      p.prop('timber', stoneBox(0.42, 0.08, 0.98, L(tx, 0.54, 0), { yaw, bevel: 0.015 }), 0x4e3b2d);
    }
    // Sweeping 3-segment forged drow swan-neck prow finial + suspended bow lantern.
    p.prop('iron', rod(L(-1.85, 0.58, 0), L(-2.12, 1.08, 0), 0.068, 0.044, 7), IRON_DARK);
    p.prop('iron', rod(L(-2.12, 1.08, 0), L(-2.22, 1.52, 0), 0.044, 0.024, 7), IRON_TRIM);
    p.prop('iron', rod(L(-2.22, 1.52, 0), L(-1.98, 1.62, 0), 0.024, 0.012, 6), BRONZE_ACCENT);
    p.prop('iron', rod(L(-1.98, 1.58, 0), L(-1.98, 1.38, 0), 0.016, 0.016, 5), IRON_TRIM);
    p.prop('glow', rod(L(-1.98, 1.16, 0), L(-1.98, 1.38, 0), 0.11, 0.07, 6), '#79e3c4', 2.25);

    // Stern steering oar in forged oarlock + wrapped fungus-silk cargo bundles.
    p.prop('iron', rod(L(1.25, 0.68, 0.52), L(1.25, 0.84, 0.52), 0.032, 0.026, 6), IRON_TRIM);
    p.prop('timber', rod(L(-0.85, 0.60, 0.42), L(1.55, 0.80, 0.54), 0.032, 0.026, 7), 0x5c4636);
    p.prop('timber', stoneBox(0.55, 0.04, 0.16, L(1.75, 0.84, 0.56), { yaw: yaw + 0.1, bevel: 0.01 }), 0x6b523e);
    p.prop('loam', stoneBox(0.56, 0.34, 0.48, L(0.45, 0.68, -0.12), { yaw: yaw + 0.15, bevel: 0.05 }), 0x4a3959);
    p.prop('loam', rod(L(-0.48, 0.62, -0.22), L(-0.48, 0.62, 0.24), 0.16, 0.16, 8), 0x3b4d4a);

    p.light(L(-1.98, 1.28, 0), '#79e3c4', 2.4, 12, { halo: 0.8 });
  });
}
