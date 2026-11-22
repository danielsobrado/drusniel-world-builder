import { collarRing, hewnPole, windFlagMesh } from '../gen/clothKit.js';
import { boulder, facetedCrystal, snowPillow } from '../gen/iceKit.js';
import { box, hewnBeam, rod, stoneBox } from '../gen/propKit.js';
import { DARK, LOG, PALE, STONE } from './frostgardKit.js';
import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const IRON = 0x3b404a;
const FRONT_SNOW_SKIRT = Object.freeze({ skirtMat: 'roof', skirtTint: 0xecf4fc });
const FRONT_ROCK_SKIRT = Object.freeze({ skirtMat: 'rock', skirtTint: STONE });
const CAIRN_TONES = [0x928e88, 0x807d79, 0xa29d95, 0x767574];

/** 1. Cantilevered pressure-sheared faceted glacier serac fin cluster with fractured ice plinth. */
export function buildSeracFinMonolith(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_SNOW_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    const seed = Math.round(at.x * 17 + at.z * 23) + 19;
    // Fractured glacial ice plinth & calved basal ice chunks bedded straight into the snowpack.
    p.prop('iceBlock', boulder(L(0, -0.26, 0), 1.32, 0.78, 1.12, { seed: seed + 13, blocky: 0.85, yaw }), 0xffffff);
    p.prop('iceBlock', boulder(L(0.75, -0.22, 0.35), 0.62, 0.46, 0.52, { seed: seed + 19, blocky: 0.9, yaw: yaw + 0.7 }), 0xffffff);
    p.prop('iceBlock', boulder(L(-0.72, -0.2, 0.26), 0.54, 0.38, 0.48, { seed: seed + 25, blocky: 0.88, yaw: yaw - 0.5 }), 0xe8f6ff);
    // Five sheared, leaning hexagonal crystal serac spires (zero floating box shelves or oval discs!).
    p.prop('clearIce', facetedCrystal(L(-0.08, -0.32, 0.02), L(0.74, 3.85, -0.28), 0.68,
      { sides: 6, taper: 0.52, tipRatio: 0.28, twist: 0.1, seed: seed + 31, flare: 1.18 }), 0xffffff);
    p.prop('clearIce', facetedCrystal(L(-0.58, -0.26, 0.24), L(-0.26, 2.55, 0.14), 0.46,
      { sides: 6, taper: 0.48, tipRatio: 0.3, twist: -0.08, seed: seed + 43, flare: 1.14 }), 0xe8f6ff);
    p.prop('clearIce', facetedCrystal(L(0.46, -0.24, -0.18), L(0.95, 2.1, -0.34), 0.38,
      { sides: 6, taper: 0.55, tipRatio: 0.32, twist: 0.06, seed: seed + 59, flare: 1.12 }), 0xdff2ff);
    p.prop('clearIce', facetedCrystal(L(-0.18, -0.22, -0.36), L(0.12, 1.65, -0.58), 0.32,
      { sides: 5, taper: 0.58, tipRatio: 0.34, twist: 0.04, seed: seed + 71, flare: 1.1 }), 0xffffff);
    p.prop('clearIce', facetedCrystal(L(0.28, -0.18, 0.42), L(0.58, 1.25, 0.62), 0.26,
      { sides: 6, taper: 0.52, tipRatio: 0.35, twist: -0.05, seed: seed + 83, flare: 1.12 }), 0xeef8ff);
    p.nav.block(at, 1.25, 3.9);
  });
}

/** 2. Organic drystone glacial wayfinder cairn crowned by sculpted snow cushion, iron crook lantern & wind-whipped pennant. */
export function buildGlacialWayfinderCairn(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_SNOW_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    const seed = Math.round(at.x * 13 + at.z * 29) + 41;
    // 11 irregular sculpted alpine rocks stacked in 3 tapered drystone courses bedded directly in the snow.
    const baseRing = [
      [0.42, -0.08, 0.36, 0.52, 0.42, 0.46],
      [-0.44, -0.1, 0.32, 0.48, 0.4, 0.44],
      [0.36, -0.08, -0.4, 0.46, 0.44, 0.42],
      [-0.38, -0.09, -0.36, 0.5, 0.4, 0.46],
      [0.0, -0.04, 0.0, 0.58, 0.48, 0.56],
    ];
    const midRing = [
      [0.24, 0.38, 0.2, 0.4, 0.36, 0.38],
      [-0.26, 0.4, 0.16, 0.38, 0.34, 0.36],
      [0.18, 0.38, -0.24, 0.36, 0.35, 0.36],
      [-0.2, 0.36, -0.2, 0.38, 0.36, 0.38],
    ];
    const topCap = [
      [0.06, 0.78, 0.04, 0.42, 0.32, 0.4],
      [-0.08, 1.02, -0.02, 0.3, 0.24, 0.28],
    ];
    let idx = 0;
    for (const [bx, by, bz, rx, ry, rz] of [...baseRing, ...midRing, ...topCap]) {
      p.prop('rock', boulder(L(bx, by, bz), rx, ry, rz, {
        seed: seed + 11 + idx * 17,
        blocky: 0.22,
        yaw: yaw + idx * 0.9,
      }), CAIRN_TONES[idx % CAIRN_TONES.length]);
      idx += 1;
    }
    // Modest drifted snow cushion nestled atop the cap stones.
    p.prop('roof', snowPillow(L(0.02, 1.08, 0.02), 0.38, 0.12, 0.36, { seed: seed + 97, yaw, drape: 0.38, detail: 3 }), 0xffffff);
    // Crooked guide staff bound with forged iron collars + iron lantern crook + framed storm lantern.
    const staffTop = L(0.1, 3.05, 0.04);
    p.prop('timber', hewnPole(L(0, 1.1, 0), staffTop, 0.055, 0.038,
      { seed: seed + 113, segments: 6, sides: 8, bow: 0.05 }), DARK);
    p.prop('iron', collarRing(L(0.08, 2.86, 0.03), P(0, 1, 0), 0.05, 0.035, 8), IRON);
    p.prop('iron', collarRing(L(0.07, 2.46, 0.03), P(0, 1, 0), 0.054, 0.035, 8), IRON);
    // Wrought-iron lantern crook arm + framed cage around the warm beacon flame.
    p.prop('iron', hewnBeam(L(0.04, 2.08, 0), L(-0.32, 2.16, 0.02), 0.032, 0.032, { irregular: 0.12 }), IRON);
    p.prop('iron', rod(L(-0.3, 2.15, 0.02), L(-0.3, 2.0, 0.02), 0.014, 0.014, 6), IRON);
    p.prop('iron', stoneBox(0.24, 0.05, 0.24, L(-0.3, 1.98, 0.02), { yaw, bevel: 0.015 }), IRON);
    p.prop('iron', stoneBox(0.24, 0.05, 0.24, L(-0.3, 1.72, 0.02), { yaw, bevel: 0.015 }), IRON);
    for (const [cx, cz] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) {
      p.prop('iron', rod(L(-0.3 + cx, 1.74, 0.02 + cz), L(-0.3 + cx, 1.96, 0.02 + cz), 0.012, 0.012, 5), IRON);
    }
    p.prop('glow', box(0.15, 0.19, 0.15, L(-0.3, 1.85, 0.02), yaw), '#ffb25a', 2.6);
    p.light(L(-0.3, 1.85, 0.02), '#ffb25a', 3.4, 14, { halo: 0.9 });
    // Wind-animated swallowtail oxblood wool wayfinder pennant.
    p.prop('cloth', windFlagMesh(L(0.09, 2.9, 0.03), L(0.08, 2.46, 0.03), P(0.6, 0, 0.8), 1.02,
      { style: 'swallowtail', seed: seed + 131, droop: 0.14 }), 0x8e241b);
    p.nav.block(at, 0.85, 3.1);
  });
}

/** 3. Hewn spruce A-frame sawyer trestle clamping a faceted crystal harvest block & serrated two-man ice saw. */
export function buildIceSawyerTrestle(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_SNOW_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    const seed = Math.round(at.x * 23 + at.z * 11) + 73;
    for (const sx of [-0.74, 0.74]) {
      p.prop('timber', hewnPole(L(sx, -0.18, -0.5), L(sx, 0.94, 0.02), 0.068, 0.055,
        { seed: seed + Math.round(sx * 29), segments: 4, sides: 8, bow: 0.025 }), LOG);
      p.prop('timber', hewnPole(L(sx, -0.18, 0.5), L(sx, 0.94, -0.02), 0.068, 0.055,
        { seed: seed + Math.round(sx * 37) + 3, segments: 4, sides: 8, bow: 0.025 }), LOG);
      // Lower horizontal A-frame spreader bar + iron joint wrap.
      p.prop('timber', hewnBeam(L(sx, 0.34, -0.34), L(sx, 0.34, 0.34), 0.055, 0.055, { irregular: 0.2 }), DARK);
      p.prop('iron', collarRing(L(sx, 0.88, 0), P(1, 0, 0), 0.085, 0.05, 8), IRON);
    }
    // Heavy notched saddle beam & longitudinal brace.
    p.prop('timber', hewnBeam(L(-0.92, 0.9, 0), L(0.92, 0.9, 0), 0.13, 0.14, { irregular: 0.28 }), DARK);
    p.prop('timber', hewnBeam(L(-0.74, 0.36, 0), L(0.74, 0.36, 0), 0.075, 0.075, { irregular: 0.25 }), LOG);
    // Clamped translucent harvested glacier ice block (faceted fractured crystal block, not a rigid cube).
    p.prop('clearIce', boulder(L(0, 1.08, 0), 0.64, 0.38, 0.42, { seed: seed + 19, blocky: 0.92, yaw }), 0xffffff);
    // Serrated forged iron two-man crosscut ice saw resting in the cut kerf.
    p.prop('iron', stoneBox(1.56, 0.1, 0.028, L(0, 1.46, 0), { yaw, bevel: 0.004 }), IRON);
    for (let t = -0.58; t <= 0.58; t += 0.14) {
      p.prop('iron', facetedCrystal(L(t, 1.42, 0), L(t + 0.02, 1.35, 0), 0.026,
        { sides: 4, taper: 0.2, tipRatio: 0.85, seed: seed + Math.round(t * 50) }), IRON);
    }
    for (const hx of [-0.78, 0.78]) {
      p.prop('timber', hewnPole(L(hx, 1.36, 0), L(hx, 1.72, 0), 0.032, 0.028,
        { seed: seed + Math.round(hx * 41), segments: 3, sides: 7, bow: 0.01 }), PALE);
      p.prop('iron', collarRing(L(hx, 1.45, 0), P(0, 1, 0), 0.04, 0.04, 8), IRON);
    }
    // Sparkling ice shavings & calved chunks piled beneath the saw kerf.
    for (let s = 0; s < 5; s += 1) {
      const ang = (s / 5) * Math.PI * 2 + 0.4;
      p.prop('clearIce', facetedCrystal(
        L(Math.cos(ang) * 0.22, -0.06, Math.sin(ang) * 0.2),
        L(Math.cos(ang) * 0.34, 0.18 + (s % 2) * 0.08, Math.sin(ang) * 0.28),
        0.09, { sides: 5, taper: 0.45, tipRatio: 0.4, seed: seed + 101 + s * 7 },
      ), 0xe6f5ff);
    }
    p.nav.block(at, 0.98, 1.75);
  });
}

/** 4. Crossed iron-hooped guide standards flying opposite-phase wind-animated storm pennants & weathered signboard. */
export function buildFrostBannerStandards(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_ROCK_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    const seed = Math.round(at.x * 19 + at.z * 31) + 59;
    // Chinked base stones grounding the crossed poles without floating snow discs.
    p.prop('rock', boulder(L(-0.36, -0.12, 0.14), 0.36, 0.26, 0.32, { seed: seed + 5, blocky: 0.22, yaw }), CAIRN_TONES[0]);
    p.prop('rock', boulder(L(0.38, -0.12, -0.12), 0.34, 0.24, 0.3, { seed: seed + 11, blocky: 0.22, yaw: yaw + 1.1 }), CAIRN_TONES[1]);
    // Organically bowed crossed spruce guide standards.
    const tipA = L(0.3, 2.86, 0.12);
    const tipB = L(-0.3, 2.74, -0.12);
    p.prop('timber', hewnPole(L(-0.56, -0.22, 0), tipA, 0.068, 0.042,
      { seed: seed + 17, segments: 6, sides: 8, bow: 0.055 }), DARK);
    p.prop('timber', hewnPole(L(0.56, -0.22, 0), tipB, 0.068, 0.042,
      { seed: seed + 29, segments: 6, sides: 8, bow: 0.055 }), DARK);
    // Forged iron crossing hoop + spearhead finials.
    p.prop('iron', collarRing(L(0, 1.56, 0), P(0, 0, 1), 0.12, 0.09, 10), IRON);
    p.prop('iron', facetedCrystal(L(0.28, 2.82, 0.11), L(0.35, 3.12, 0.14), 0.045,
      { sides: 4, taper: 0.3, tipRatio: 0.75, seed: seed + 37 }), IRON);
    p.prop('iron', facetedCrystal(L(-0.28, 2.7, -0.11), L(-0.35, 2.98, -0.14), 0.045,
      { sides: 4, taper: 0.3, tipRatio: 0.75, seed: seed + 41 }), IRON);
    // Weathered split-plank waystation signboard with iron bolt heads.
    p.prop('timber', hewnBeam(L(-0.52, 1.32, 0.06), L(0.52, 1.28, 0.06), 0.15, 0.055, { irregular: 0.38 }), LOG);
    p.prop('timber', hewnBeam(L(-0.48, 1.14, 0.06), L(0.46, 1.12, 0.06), 0.14, 0.055, { irregular: 0.42 }), 0x6f553b);
    for (const bx of [-0.26, 0.26]) {
      p.prop('iron', collarRing(L(bx, 1.24, 0.08), P(0, 0, 1), 0.025, 0.03, 6), IRON);
    }
    // Two wind-whipped swallowtail storm pennants streaming in valley wind.
    p.prop('cloth', windFlagMesh(L(0.27, 2.74, 0.11), L(0.2, 2.28, 0.09), P(0.6, 0, 0.8), 1.08,
      { style: 'swallowtail', seed: seed + 61, droop: 0.13 }), 0x8e241b);
    p.prop('cloth', windFlagMesh(L(-0.27, 2.64, -0.11), L(-0.2, 2.22, -0.09), P(0.6, 0, 0.8), 0.96,
      { style: 'pennant', seed: seed + 83, droop: 0.15 }), 0x284b6e);
    p.nav.block(at, 0.78, 2.95);
  });
}

/** 5. Sculpted alpine erratic boulder anchored with an iron-banded winch capstan & coiled hawser. */
export function buildMoraineErraticAnchorPost(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_ROCK_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    const seed = Math.round(at.x * 29 + at.z * 17) + 91;
    p.prop('rock', boulder(L(0, -0.2, 0), 1.12, 0.82, 1.02, { seed: seed + 13, blocky: 0.2, yaw }), STONE);
    // Forged iron base flange & iron-hooped timber capstan drum.
    p.prop('iron', collarRing(L(0, 0.72, 0), P(0, 1, 0), 0.32, 0.08, 12), IRON);
    p.prop('timber', hewnPole(L(0, 0.72, 0), L(0, 1.54, 0), 0.24, 0.21,
      { seed: seed + 23, segments: 4, sides: 10, bow: 0.015 }), DARK);
    p.prop('iron', collarRing(L(0, 1.08, 0), P(0, 1, 0), 0.26, 0.06, 10), IRON);
    p.prop('iron', collarRing(L(0, 1.48, 0), P(0, 1, 0), 0.25, 0.07, 10), IRON);
    // Coiled hawser rope wraps around the capstan waist + radial winch bars.
    for (let w = 0; w < 3; w += 1) {
      p.prop('timber', collarRing(L(0, 0.84 + w * 0.065, 0), P(0, 1, 0), 0.275, 0.055, 10), PALE);
    }
    p.prop('timber', hewnPole(L(-0.72, 1.38, 0), L(0.72, 1.38, 0), 0.048, 0.044,
      { seed: seed + 41, segments: 4, sides: 7, bow: 0.02 }), LOG);
    p.prop('timber', hewnPole(L(0, 1.38, -0.72), L(0, 1.38, 0.72), 0.048, 0.044,
      { seed: seed + 53, segments: 4, sides: 7, bow: 0.02 }), LOG);
    p.nav.block(at, 0.95, 1.65);
  });
}
