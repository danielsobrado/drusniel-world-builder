import { box, panel, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { DARK, LOG, PALE, STONE } from './frostgardKit.js';
import { atFrame, emitDetailedUndergroundProp } from './propFrame.js';

const P = (x, y, z) => ({ x, y, z });
const FRONT_SNOW_SKIRT = Object.freeze({ skirtMat: 'roof', skirtTint: 0xecf4fc });
const FRONT_ROCK_SKIRT = Object.freeze({ skirtMat: 'rock', skirtTint: STONE });

/** 1. Cantilevered pressure-sheared glacier serac fin with fractured basal apron & drifted snow skirt. */
export function buildSeracFinMonolith(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_SNOW_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('roof', rod(L(0, -0.32, 0), L(0, 0.14, 0), 1.52, 1.12, 9), 0xffffff);
    p.prop('clearIce', rod(L(0, -0.3, 0), L(0.65, 3.8, -0.25), 0.95, 0.24, 6), 0xffffff);
    p.prop('clearIce', rod(L(-0.62, -0.25, 0.22), L(-0.35, 2.35, 0.15), 0.56, 0.15, 6), 0xffffff);
    p.prop('iceBlock', stoneBox(1.75, 0.52, 1.35, L(0, 0.24, 0), { yaw, bevel: 0.08 }), 0xffffff);
    p.prop('roof', stoneBox(0.95, 0.22, 0.65, L(0.4, 2.8, -0.1), { yaw, bevel: 0.06 }), 0xffffff);
    p.nav.block(at, 1.15, 3.8);
  });
}

/** 2. Stacked drystone glacial wayfinder cairn crowned by red cloth streamer, lantern & snow drift collar. */
export function buildGlacialWayfinderCairn(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_SNOW_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('roof', rod(L(0, -0.28, 0), L(0, 0.08, 0), 1.04, 0.84, 8), 0xffffff);
    p.prop('rock', stoneBlock(1.18, 0.65, 1.18, L(0, -0.05, 0), { yaw, bevel: 0.08, irregular: 0.55 }), STONE);
    p.prop('rock', stoneBlock(0.84, 0.68, 0.84, L(0, 0.6, 0), { yaw: yaw + 0.3, bevel: 0.06, irregular: 0.5 }), STONE);
    p.prop('roof', stoneBox(0.88, 0.16, 0.88, L(0, 1.34, 0), { yaw, bevel: 0.04 }), 0xffffff);
    p.prop('timber', rod(L(0, 1.25, 0), L(0.08, 2.95, 0), 0.06, 0.045, 6), DARK);
    p.prop('cloth', panel(L(0.08, 2.7, 0), L(0.92, 2.52, 0.18), P(0, 1, 0), 0.38, 0.02), 0xd6402e);
    p.prop('glow', box(0.22, 0.26, 0.22, L(-0.22, 1.85, 0), yaw), '#ffb25a', 2.4);
    p.light(L(-0.22, 1.85, 0), '#ffb25a', 3.2, 14, { halo: 0.85 });
    p.nav.block(at, 0.78, 3.0);
  });
}

/** 3. Hewn spruce A-frame sawyer trestle clamping a harvest block of glacier ice & crosscut blade. */
export function buildIceSawyerTrestle(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_SNOW_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    for (const sx of [-0.72, 0.72]) {
      p.prop('timber', rod(L(sx, -0.05, -0.46), L(sx, 0.92, 0), 0.065, 0.055, 6), LOG);
      p.prop('timber', rod(L(sx, -0.05, 0.46), L(sx, 0.92, 0), 0.065, 0.055, 6), LOG);
    }
    p.prop('timber', rod(L(-0.88, 0.88, 0), L(0.88, 0.88, 0), 0.075, 0.075, 7), DARK);
    p.prop('clearIce', stoneBox(1.12, 0.56, 0.68, L(0, 1.18, 0), { yaw, bevel: 0.04 }), 0xffffff);
    p.prop('iron', stoneBox(1.48, 0.08, 0.04, L(0, 1.48, 0), { yaw, bevel: 0.005 }), 0x3b404a);
    for (const hx of [-0.74, 0.74]) {
      p.prop('timber', rod(L(hx, 1.38, 0), L(hx, 1.66, 0), 0.032, 0.032, 6), PALE);
    }
    p.nav.block(at, 0.95, 1.7);
  });
}

/** 4. Crossed iron-hooped guide standards flying wind-tautened storm pennants & board. */
export function buildFrostBannerStandards(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_ROCK_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('timber', rod(L(-0.52, -0.1, 0), L(0.28, 2.75, 0.12), 0.065, 0.045, 6), DARK);
    p.prop('timber', rod(L(0.52, -0.1, 0), L(-0.28, 2.65, -0.12), 0.065, 0.045, 6), DARK);
    p.prop('timber', stoneBox(0.95, 0.32, 0.08, L(0, 1.25, 0.04), { yaw, bevel: 0.02 }), LOG);
    p.prop('cloth', panel(L(0.24, 2.48, 0.1), L(1.05, 2.28, 0.22), P(0, 1, 0), 0.42, 0.02), 0xd6402e);
    p.prop('cloth', panel(L(-0.24, 2.42, -0.1), L(-0.98, 2.22, -0.2), P(0, 1, 0), 0.36, 0.02), 0x3a648a);
    p.nav.block(at, 0.75, 2.8);
  });
}

/** 5. Moraine erratic boulder anchored with an iron winch capstan & survey tripod. */
export function buildMoraineErraticAnchorPost(b, at, yaw = 0) {
  emitDetailedUndergroundProp(b, at, FRONT_ROCK_SKIRT, (p) => {
    const L = atFrame(at, yaw);
    p.prop('rock', stoneBlock(1.42, 0.78, 1.32, L(0, -0.08, 0), { yaw, bevel: 0.12, irregular: 0.72 }), STONE);
    p.prop('iron', rod(L(0, 0.68, 0), L(0, 1.48, 0), 0.26, 0.24, 9), 0x353942);
    p.prop('timber', rod(L(-0.68, 1.34, 0), L(0.68, 1.34, 0), 0.055, 0.055, 6), LOG);
    p.prop('timber', rod(L(0, 1.34, -0.68), L(0, 1.34, 0.68), 0.055, 0.055, 6), LOG);
    p.nav.block(at, 0.9, 1.6);
  });
}
