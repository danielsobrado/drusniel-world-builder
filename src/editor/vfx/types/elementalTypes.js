import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Fire, frost, acid and lightning particles beyond the reference explosion. */
const FROST_MIST = [0.72, 0.82, 0.92];
const ACID = [0.3, 0.72, 0.04];

export const ELEMENTAL_TYPES = Object.freeze({
  // ——— Fire: projectile, wall, meteor ———
  'fire.head': {
    tiles: [TILE.GLOW, TILE.GLOW], life: 0.05, size: 1.8, sizeEnd: 1, heat: 1, heatEnd: 1, emissive: 14,
    fadeIn: 0, fadeOut: 0.5, cameraFade: false,
  },
  'fire.head.puff': {
    tiles: TILE_SPANS.fire, tileMode: 'life', life: [0.22, 0.36], size: [0.6, 0.9], sizeEnd: 1.5,
    sizeEase: 'outQuad', heat: [0.95, 1.05], heatEnd: 0.4, emissive: 9, additive: 1, fadeIn: 0, fadeOut: 0.35,
    drag: 2, gravity: -1.5, spin: [1, 3],
  },
  'fire.trail.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [0.9, 1.4], size: [0.3, 0.45], sizeEnd: 2.4, heat: 0.4, heatEnd: 0,
    heatEase: 'outExpo', emissive: 6, additive: 0.4, additiveEnd: 0, tint: [0.25, 0.23, 0.22],
    tintEnd: [0.5, 0.5, 0.5], opacity: 0.4, fadeIn: 0.3, fadeOut: 0.4, drag: 1.5, gravity: -0.8,
    turbulence: 0.8, spin: [0.3, 1],
  },
  'wall.flame': {
    tiles: TILE_SPANS.flame, orient: 'axis', aspect: 2.6, life: [0.6, 1.15], size: [1.1, 2],
    sizeEnd: 0.7, sizeEase: 'outQuad', heat: [0.9, 1.05], heatEnd: 0.45, emissive: 13, fadeIn: 0.12,
    fadeOut: 0.5, gravity: -6, drag: 1.4, turbulence: 1.2,
  },
  'wall.body': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [0.7, 1.1], size: [1.1, 1.7], sizeEnd: 1.4,
    heat: [0.85, 1], heatEnd: 0.1, emissive: 11, additive: 1, additiveEnd: 0.2, tint: [0.1, 0.09, 0.08],
    fadeIn: 0.08, fadeOut: 0.5, gravity: -3.5, drag: 1.8, spin: [0.2, 0.8],
  },
  'wall.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [3, 5], size: [1.5, 2.4], sizeEnd: 2.4, sizeEase: 'outQuad',
    heat: 0.2, heatEnd: 0, heatEase: 'outExpo', emissive: 5, additive: 0, tint: [0.3, 0.29, 0.28],
    tintEnd: [0.5, 0.5, 0.5], opacity: 0.45, fadeIn: 0.15, fadeOut: 0.5, drag: 1, gravity: -1.6,
    turbulence: 1, turbulenceScale: 0.15, spin: [0.05, 0.25],
  },
  'meteor.rock': {
    tiles: TILE_SPANS.chunk, lit: 1, life: 0.05, size: 1.4, heat: 0.9, heatEnd: 0.9, emissive: 8,
    additive: 0, tint: [0.1, 0.08, 0.07], fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'meteor.halo': {
    tiles: [TILE.FLARE, TILE.FLARE], life: 0.05, size: 5.5, heat: 1, heatEnd: 1, emissive: 22,
    fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'meteor.trail': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [1.2, 2.2], size: [1.4, 2.2], sizeEnd: 2.6,
    sizeEase: 'outQuad', heat: [0.85, 1], heatEnd: 0, heatEase: 'outQuad', emissive: 12, additive: 1,
    additiveEnd: 0, tint: [0.1, 0.09, 0.085], tintEnd: [0.28, 0.27, 0.27], opacity: 0.85, fadeIn: 0,
    fadeOut: 0.45, drag: 1.2, gravity: -0.6, turbulence: 1, spin: [0.3, 1],
  },

  // ——— Frost ———
  'frost.mist': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.FROST, life: [0.9, 1.5], size: [0.4, 0.7], sizeEnd: [3.5, 5],
    sizeEase: 'outCubic', heat: [0.4, 0.55], heatEnd: 0.05, emissive: 2.5, additive: 0.4, additiveEnd: 0,
    tint: FROST_MIST, opacity: 0.3, fadeIn: 0.04, fadeOut: 0.45, drag: 2.3, gravity: 0.6,
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
  'frost.fog': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.FROST, life: [3.5, 5.5], size: [1.6, 2.4], sizeEnd: 1.8,
    heat: 0.4, heatEnd: 0.1, emissive: 2.5, additive: 0, tint: [0.84, 0.92, 1], opacity: 0.34, fadeIn: 0.25,
    fadeOut: 0.5, drag: 1.4, gravity: 0.05, turbulence: 0.25, turbulenceScale: 0.2, groundFade: true,
    spin: [0.05, 0.2],
  },
  'ice.cloud': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.LIGHTNING, life: [4.2, 5.2], size: [5, 8],
    sizeEnd: [1.3, 1.6], sizeEase: 'outCubic', heat: 0, heatEnd: 0, emissive: 0, additive: 0,
    tint: [0.15, 0.17, 0.21], tintEnd: [0.24, 0.26, 0.31], opacity: 0.88, fadeIn: 0.15, fadeOut: 0.65,
    drag: 1.2, swirl: 0.7, turbulence: 0.35, turbulenceScale: 0.08, spin: [0.04, 0.12],
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
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.04, aspect: 3, ramp: RAMP.FROST,
    life: 1.4, size: [0.16, 0.26], heat: 0.8, heatEnd: 0.8, emissive: 8, additive: 0.7, lit: 1,
    tint: [0.85, 0.92, 1], fadeIn: 0.05, fadeOut: 0.95, collide: 'die',
    onImpact: [
      { type: 'ice.hail.chip', count: [1, 3], speed: [1.5, 3.5], up: 2 },
      { type: 'frost.glint', count: [1, 2], speed: [0.5, 2], up: 1, lift: 0.4 },
      { type: 'ice.hail.splash', count: 1, speed: 0, lift: 0.35 },
    ],
  },
  'ice.hail.chip': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [0.6, 1.1], size: [0.05, 0.1], heat: 0.4,
    heatEnd: 0.2, emissive: 3, additive: 0, tint: [0.8, 0.9, 1], fadeIn: 0, fadeOut: 0.6, gravity: 9.8,
    spin: [6, 12], collide: 'bounce', restitution: 0.3,
  },
  'ice.stone': {
    tiles: TILE_SPANS.shard, orient: 'velocity', stretch: 0.012, lit: 1, ramp: RAMP.FROST, life: [4, 6],
    size: [0.16, 0.26], heat: 0.6, heatEnd: 0.25, emissive: 5, additive: 0.25, additiveEnd: 0,
    tint: [0.85, 0.93, 1], fadeIn: 0, fadeOut: 0.85, collide: 'stick',
    onImpact: [
      { type: 'ice.hail.splash', count: 1, speed: 0, lift: 0.35 },
      { type: 'frost.glint', count: [2, 3], speed: [1, 2.5], up: 1.5, lift: 0.4 },
    ],
  },
  'ice.hail.splash': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.FROST, life: [0.3, 0.5], size: 0.25, sizeEnd: 3.2, sizeEase: 'outQuart',
    heat: 0.45, heatEnd: 0.2, emissive: 2, additive: 0.3, additiveEnd: 0, tint: [0.92, 0.95, 1], opacity: 0.32, fadeIn: 0, fadeOut: 0.3,
  },

  // ——— Acid ———
  'acid.blob': {
    tiles: [TILE.DROPLET, TILE.DROPLET], lit: 1, ramp: RAMP.ACID, life: 0.05, size: 0.55, heat: 0.75,
    heatEnd: 0.75, emissive: 4, additive: 0, tint: ACID, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'acid.glow': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ACID, life: 0.05, size: 1.6, heat: 0.75, heatEnd: 0.75,
    emissive: 5, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'acid.drop': {
    tiles: [TILE.DROPLET, TILE.DROPLET], orient: 'velocity', stretch: 0.035, aspect: 1.2, lit: 1,
    ramp: RAMP.ACID, life: [0.8, 1.6], size: [0.1, 0.22], heat: 0.75, heatEnd: 0.5, emissive: 7,
    additive: 0, tint: ACID, fadeIn: 0, fadeOut: 0.85, gravity: 9.8, drag: 0.4, collide: 'die',
    onImpact: { type: 'acid.sizzle', count: 1, speed: 0.2, up: 0.4 },
  },
  'acid.sizzle': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.ACID, life: [0.6, 1], size: 0.15, sizeEnd: 4, heat: 0.45,
    heatEnd: 0, emissive: 2.5, additive: 0.3, additiveEnd: 0, tint: [0.62, 0.72, 0.32], opacity: 0.5,
    fadeIn: 0.05, fadeOut: 0.4, drag: 2, gravity: -1,
  },
  'acid.fume': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.ACID, life: [2, 3.2], size: [0.5, 0.9], sizeEnd: 3, heat: 0.4,
    heatEnd: 0, heatEase: 'outExpo', emissive: 5, additive: 0.3, additiveEnd: 0, tint: [0.5, 0.72, 0.2],
    tintEnd: [0.45, 0.52, 0.3], opacity: 0.5, fadeIn: 0.15, fadeOut: 0.5, drag: 1.2, gravity: -0.9,
    turbulence: 0.9, spin: [0.2, 0.6], groundFade: true,
  },
  'acid.bubble': {
    tiles: [TILE.BUBBLE, TILE.BUBBLE], lit: 1, ramp: RAMP.ACID, life: [0.5, 1.3], size: [0.06, 0.16],
    sizeEnd: 2, sizeEase: 'inQuad', heat: 0.8, heatEnd: 0.6, emissive: 4, additive: 0.3,
    tint: [0.5, 0.9, 0.2], fadeIn: 0.1, fadeOut: 0.92,
    onDeath: { type: 'acid.pop', count: 1, speed: 0 },
  },
  'acid.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ACID, life: 0.3, size: 3.5, sizeEnd: 1.4, sizeEase: 'outExpo',
    heat: 0.95, heatEnd: 0.6, emissive: 12, fadeIn: 0, fadeOut: 0.3,
  },
  'acid.pop': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], ramp: RAMP.ACID, life: 0.18, size: 0.15, sizeEnd: 3,
    sizeEase: 'outQuart', heat: 0.8, heatEnd: 0.5, emissive: 4, fadeIn: 0, fadeOut: 0.3,
  },

  // ——— Lightning ———
  'bolt.core': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.LIGHTNING, life: [0.09, 0.13], size: 0.16,
    heat: 1.05, heatEnd: 0.8, emissive: 34, fadeIn: 0, fadeOut: 0.25, cameraFade: false,
  },
  'bolt.glow': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.LIGHTNING, life: [0.12, 0.18], size: 0.75,
    heat: 0.75, heatEnd: 0.5, emissive: 5, opacity: 0.7, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },
  'bolt.afterglow': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.LIGHTNING, life: 0.6, size: 0.16, heat: 0.6,
    heatEnd: 0.25, emissive: 2, opacity: 0.5, fadeIn: 0, fadeOut: 0.1, cameraFade: false,
  },
  'bolt.spark': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.04, aspect: 2, ramp: RAMP.LIGHTNING,
    life: [0.25, 0.7], size: [0.04, 0.08], heat: 1, heatEnd: 0.6, emissive: 30, fadeIn: 0, fadeOut: 0.5,
    gravity: 9.8, drag: 1.2, collide: 'bounce', restitution: 0.4, cameraFade: false,
  },
  'bolt.flare': {
    tiles: [TILE.FLARE, TILE.FLARE], ramp: RAMP.LIGHTNING, life: [0.1, 0.16], size: [2.4, 3.4], heat: 1,
    heatEnd: 0.8, emissive: 30, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },
  'bolt.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.LIGHTNING, life: 0.14, size: 9, sizeEnd: 1.4, sizeEase: 'outExpo',
    heat: 1, heatEnd: 0.75, emissive: 26, fadeIn: 0, fadeOut: 0.15, cameraFade: false,
  },
  'thunder.shell': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], ramp: RAMP.LIGHTNING, life: 0.4, size: 1, sizeEnd: 7,
    sizeEase: 'outQuart', heat: 0.85, heatEnd: 0.45, emissive: 2.4, opacity: 0.4, fadeIn: 0, fadeOut: 0.15,
    cameraFade: false,
  },
  'thunder.leaf': {
    tiles: [TILE.ASH, TILE.ASH], lit: 1, life: [1.6, 2.8], size: [0.1, 0.22], heat: 0, emissive: 0,
    additive: 0, tint: [0.42, 0.62, 0.18], fadeIn: 0, fadeOut: 0.7, gravity: 4, drag: 1.6, turbulence: 6,
    turbulenceScale: 1.2, spin: [4, 12], collide: 'stick',
  },
  'thunder.dust': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [1.2, 2], size: [0.4, 0.7], sizeEnd: 3, heat: 0, emissive: 0,
    additive: 0, tint: [0.7, 0.66, 0.58], opacity: 0.2, fadeIn: 0.03, fadeOut: 0.5, drag: 3, gravity: -0.05,
    turbulence: 0.8, spin: [0.2, 0.8],
  },
  'bolt.ion.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.LIGHTNING, life: [1.2, 2], size: [0.3, 0.5], sizeEnd: 4,
    heat: 0.4, heatEnd: 0, heatEase: 'outExpo', emissive: 4, additive: 0.3, additiveEnd: 0,
    tint: [0.48, 0.5, 0.55], opacity: 0.35, fadeIn: 0.05, fadeOut: 0.5, drag: 1.5, gravity: -0.8,
    turbulence: 0.6,
  },
});
