import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

const FROST_MIST = [0.72, 0.82, 0.92];

/** Frost and ice: Cone of Cold and Ice Storm. */
export const FROST_TYPES = Object.freeze({
  // ——— Frost ———
  // Freezing vapour: thin and glowing blue-white, never a lit beige mass.
  'frost.mist': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.FROST, life: [0.7, 1.2], size: [0.4, 0.7], sizeEnd: [3, 4.2],
    sizeEase: 'outCubic', heat: [0.45, 0.6], heatEnd: 0.2, emissive: 2.5, additive: 0.6, additiveEnd: 0.25,
    tint: FROST_MIST, opacity: 0.16, opacityEnd: 0.5, fadeIn: 0.04, fadeOut: 0.4, drag: 2.3, gravity: 0.6,
    turbulence: 1.2, spin: [0.5, 1.5], spinDrag: 1,
  },
  'frost.hand': {
    tiles: [TILE.FLARE, TILE.FLARE], ramp: RAMP.FROST, life: 0.06, size: 0.35, heat: 0.95, heatEnd: 0.95,
    emissive: 14, fadeIn: 0, fadeOut: 0.6, cameraFade: false,
  },
  'frost.streak': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.07, aspect: 2, ramp: RAMP.FROST,
    life: [0.35, 0.65], size: [0.05, 0.1], heat: [0.75, 0.95], heatEnd: 0.4, emissive: 9, fadeIn: 0,
    fadeOut: 0.5, drag: 1.8, gravity: 1,
  },
  'frost.glint': {
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.FROST, life: [0.5, 1.1], size: [0.12, 0.3], sizeEnd: 0.3,
    heat: [0.8, 1], heatEnd: 0.5, emissive: 14, fadeIn: 0, fadeOut: 0.5, drag: 2.4, gravity: 1.2,
    spin: [2, 6],
  },
  'frost.flake': {
    tiles: [TILE.SNOWFLAKE, TILE.SNOWFLAKE], ramp: RAMP.FROST, life: [1.2, 2.4], size: [0.08, 0.18],
    heat: 0.7, heatEnd: 0.4, emissive: 5, fadeIn: 0.05, fadeOut: 0.6, drag: 2.6, gravity: 0.8,
    turbulence: 2.2, turbulenceScale: 0.8, spin: [0.5, 2],
  },
  'frost.shard': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [2.2, 3.4], size: [0.2, 0.42], heat: [0.35, 0.5],
    heatEnd: 0.15, emissive: 4, additive: 0, tint: [0.68, 0.84, 0.98], fadeIn: 0, fadeOut: 0.8,
    gravity: 6, drag: 0.6, spin: [6, 14], spinDrag: 0, collide: 'stick',
    onImpact: { type: 'frost.puff', count: 1, speed: 0.2, up: 0.3 },
  },
  'frost.puff': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.FROST, life: [0.5, 0.8], size: 0.3, sizeEnd: 3, heat: 0.4,
    heatEnd: 0, emissive: 2, additive: 0, tint: [0.85, 0.9, 0.96], opacity: 0.5, fadeIn: 0.05, fadeOut: 0.4,
    drag: 3,
  },
  // Cold air pooling low over the frosted ground, see-through and clearing fast.
  'frost.fog': {
    tiles: [TILE.FOG_BANK, TILE.FOG_BANK], lit: 1, ramp: RAMP.FROST, life: [2, 3.2], size: [2.6, 3.8], sizeEnd: 1.5,
    sizeEase: 'outQuad', heat: 0.42, heatEnd: 0.15, emissive: 2, additive: 0.3, additiveEnd: 0.1,
    tint: [0.68, 0.82, 1], opacity: 0.22, opacityEnd: 0.4, fadeIn: 0.2, fadeOut: 0.45, drag: 1.4, gravity: 0.12,
    turbulence: 0.25, turbulenceScale: 0.2, windDrift: 0.3, spin: [0.02, 0.08], cameraFade: true,
  },
  // Ice crystals left standing where the cone passed, glinting in the sun.
  'frost.spike': {
    tiles: [TILE.CRYSTAL, TILE.CRYSTAL], orient: 'axis', lit: 1, ramp: RAMP.FROST, life: [8, 10], size: 1,
    heat: [0.45, 0.6], heatEnd: 0.3, emissive: 3, additive: 0.2, additiveEnd: 0.05, tint: [0.72, 0.86, 1],
    fadeIn: 0.03, fadeOut: 0.85, cameraFade: false,
  },
  // The storm deck: big, dark, churning round its centre.
  'ice.cloud': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.LIGHTNING, life: [4.6, 5.6], size: [7, 11],
    sizeEnd: [1.2, 1.45], sizeEase: 'outCubic', heat: 0, heatEnd: 0, emissive: 0, additive: 0,
    tint: [0.1, 0.11, 0.14], tintEnd: [0.19, 0.21, 0.26], opacity: 0.9, fadeIn: 0.15, fadeOut: 0.65,
    drag: 1.2, swirl: 1.8, turbulence: 0.45, turbulenceScale: 0.08, spin: [0.08, 0.2],
  },
  'ice.veil': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.FROST, life: [1.6, 2.4], size: [2.5, 4],
    heat: 0.35, heatEnd: 0.2, emissive: 1.2, additive: 0.2, lit: 1, tint: [0.7, 0.78, 0.86], opacity: 0.2,
    fadeIn: 0.3, fadeOut: 0.5, cameraFade: false,
  },
  'ice.cloud.glow': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.LIGHTNING, life: [0.08, 0.16], size: [5, 8], heat: 0.85,
    heatEnd: 0.6, emissive: 10, fadeIn: 0, fadeOut: 0.3, cameraFade: false,
  },
  'ice.hail': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.06, aspect: 3, ramp: RAMP.FROST,
    life: 1.4, size: [0.22, 0.36], heat: 0.8, heatEnd: 0.8, emissive: 6, additive: 0.6, lit: 1,
    tint: [0.85, 0.92, 1], fadeIn: 0.05, fadeOut: 0.95, collide: 'die',
    onImpact: [
      { type: 'ice.hail.chip', count: [2, 4], speed: [1.5, 4], up: 2.4 },
      { type: 'frost.glint', count: [1, 2], speed: [0.5, 2], up: 1, lift: 0.4 },
      { type: 'ice.hail.splash', count: 1, speed: 0, lift: 0.35 },
    ],
  },
  'ice.hail.chip': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [0.6, 1.1], size: [0.07, 0.13], heat: 0.4,
    heatEnd: 0.2, emissive: 3, additive: 0, tint: [0.8, 0.9, 1], fadeIn: 0, fadeOut: 0.6, gravity: 9.8,
    spin: [6, 12], collide: 'bounce', restitution: 0.3,
  },
  'ice.stone': {
    tiles: TILE_SPANS.shard, orient: 'velocity', stretch: 0.012, lit: 1, ramp: RAMP.FROST, life: [10, 13],
    size: [0.18, 0.3], heat: 0.6, heatEnd: 0.25, emissive: 5, additive: 0.25, additiveEnd: 0,
    tint: [0.85, 0.93, 1], fadeIn: 0, fadeOut: 0.85, collide: 'stick',
    onImpact: [
      { type: 'ice.hail.splash', count: 1, speed: 0, lift: 0.35 },
      { type: 'frost.glint', count: [2, 3], speed: [1, 2.5], up: 1.5, lift: 0.4 },
    ],
  },
  'ice.hail.splash': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.FROST, life: [0.35, 0.6], size: 0.3, sizeEnd: 5, sizeEase: 'outQuart',
    heat: 0.5, heatEnd: 0.2, emissive: 2.5, additive: 0.4, additiveEnd: 0, tint: [0.92, 0.95, 1], opacity: 0.45, fadeIn: 0, fadeOut: 0.3,
  },
});
