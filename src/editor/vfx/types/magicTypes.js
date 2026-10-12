import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Arcane, necrotic, radiant, lunar and conjured-cloud particles. */
export const MAGIC_TYPES = Object.freeze({
  // ——— Arcane (Magic Missile, Shatter) ———
  'arcane.head': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ARCANE, life: 0.05, size: 0.5, heat: 1, heatEnd: 1,
    emissive: 30, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'arcane.flare': {
    tiles: [TILE.FLARE, TILE.FLARE], ramp: RAMP.ARCANE, life: 0.05, size: 0.9, heat: 0.95, heatEnd: 0.95,
    emissive: 16, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'arcane.ribbon': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.ARCANE, life: [0.3, 0.42], size: 0.32,
    sizeEnd: 0.15, heat: 0.95, heatEnd: 0.3, emissive: 9, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },
  'arcane.mote': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.ARCANE, life: [0.5, 1.2], size: [0.06, 0.14], heat: 0.9,
    heatEnd: 0.4, emissive: 18, fadeIn: 0, fadeOut: 0.5, drag: 2, turbulence: 2.5, turbulenceScale: 0.7,
  },
  'arcane.spark': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.05, aspect: 2, ramp: RAMP.ARCANE,
    life: [0.25, 0.6], size: [0.04, 0.08], heat: 1, heatEnd: 0.5, emissive: 26, fadeIn: 0, fadeOut: 0.5,
    drag: 3, gravity: 2,
  },
  'arcane.burst': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ARCANE, life: 0.22, size: 4, sizeEnd: 1.6, sizeEase: 'outExpo',
    heat: 1, heatEnd: 0.6, emissive: 30, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },
  'arcane.ground.ring': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', ramp: RAMP.ARCANE, life: 0.5, size: 0.8,
    sizeEnd: 7, sizeEase: 'outQuart', heat: 0.85, heatEnd: 0.4, emissive: 5, fadeIn: 0, fadeOut: 0.3,
  },
  'arcane.ring': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], ramp: RAMP.ARCANE, life: 0.35, size: 0.6, sizeEnd: 9,
    sizeEase: 'outQuart', heat: 0.95, heatEnd: 0.5, emissive: 8, fadeIn: 0, fadeOut: 0.25,
  },

  // ——— Shatter ———
  'shatter.converge': {
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.FROST, life: 0.24, size: [0.1, 0.22], sizeEnd: 0.4,
    heat: 0.8, heatEnd: 1, emissive: 18, fadeIn: 0.2, fadeOut: 0.95, spin: [3, 8],
  },
  'shatter.implode': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], ramp: RAMP.MOON, life: 0.22, size: 7, sizeEnd: 0.08,
    sizeEase: 'inQuad', heat: 0.7, heatEnd: 1, emissive: 4, opacity: 0.8, fadeIn: 0.15, fadeOut: 0.95,
  },
  'shatter.shard': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [1.6, 2.6], size: [0.16, 0.4], heat: [0.35, 0.55],
    heatEnd: 0.1, emissive: 6, additive: 0.15, additiveEnd: 0, tint: [0.75, 0.88, 1], fadeIn: 0,
    fadeOut: 0.8, gravity: 9.8, drag: 0.6, spin: [8, 20], collide: 'bounce', restitution: 0.35,
    friction: 0.55,
  },
  'shatter.crystal': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [1.4, 2.4], size: [0.3, 0.6], heat: [0.65, 0.85],
    heatEnd: 0.2, emissive: 7, additive: 0.35, additiveEnd: 0.05, tint: [0.8, 0.92, 1], fadeIn: 0,
    fadeOut: 0.75, gravity: 9.8, drag: 0.9, spin: [6, 16], collide: 'bounce', restitution: 0.3, friction: 0.5,
  },
  'shatter.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.MOON, life: 0.32, size: 9, sizeEnd: 1.4, sizeEase: 'outExpo',
    heat: 1, heatEnd: 0.7, emissive: 36, fadeIn: 0, fadeOut: 0.15, cameraFade: false,
  },
  'shatter.ring': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], orient: 'plane', ramp: RAMP.FROST, life: 0.5, size: 1,
    sizeEnd: 12, sizeEase: 'outQuart', heat: 0.95, heatEnd: 0.5, emissive: 6, fadeIn: 0, fadeOut: 0.3,
  },
  'shatter.glitter': {
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.MOON, life: [1, 2.2], size: [0.1, 0.22], heat: 0.95,
    heatEnd: 0.4, emissive: 14, fadeIn: 0, fadeOut: 0.6, drag: 2.5, gravity: 1.2, turbulence: 1.5,
    spin: [2, 6],
  },

  // ——— Necrotic (Blight) ———
  'necrotic.tendril': {
    tiles: [TILE.WISP, TILE.WISP], orient: 'velocity', stretch: 0.25, aspect: 1, ramp: RAMP.NECROTIC,
    life: [0.6, 1], size: [0.22, 0.38], heat: [0.34, 0.44], heatEnd: 0.55, emissive: 16, additive: 0.7,
    tint: [0.05, 0.02, 0.06], lit: 1, fadeIn: 0.15, fadeOut: 0.75, swirl: 9, attract: 13, drag: 1.6,
    cameraFade: false,
  },
  'necrotic.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.NECROTIC, life: [1, 1.6], size: [0.6, 1], sizeEnd: 0.6,
    heat: [0.25, 0.35], heatEnd: 0.4, emissive: 3, additive: 0, tint: [0.07, 0.06, 0.08], opacity: 0.7,
    fadeIn: 0.15, fadeOut: 0.6, swirl: 6, attract: 9, drag: 1.6, spin: [0.5, 1.5],
  },
  'necrotic.essence': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.NECROTIC, life: [0.8, 1.2], size: [0.06, 0.12], heat: 0.85,
    heatEnd: 1, emissive: 16, fadeIn: 0.2, fadeOut: 0.85, attract: 10, swirl: 4, drag: 1,
  },
  'necrotic.burst.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.NECROTIC, life: [2, 3.2], size: [0.9, 1.4], sizeEnd: 2.6,
    heat: [0.3, 0.42], heatEnd: 0, heatEase: 'outQuad', emissive: 3, additive: 0, tint: [0.06, 0.055, 0.065],
    tintEnd: [0.16, 0.15, 0.17], opacity: 0.8, fadeIn: 0.03, fadeOut: 0.5, drag: 2.4, gravity: -1.1,
    turbulence: 1, spin: [0.2, 0.6], groundFade: true,
  },
  'necrotic.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.NECROTIC, life: 0.3, size: 6, sizeEnd: 1.3,
    sizeEase: 'outExpo', heat: 0.95, heatEnd: 0.5, emissive: 14, fadeIn: 0, fadeOut: 0.2,
  },
  'necrotic.pulse': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', ramp: RAMP.NECROTIC, life: 0.9, size: 1,
    sizeEnd: 10, sizeEase: 'outCubic', heat: 0.6, heatEnd: 0.2, emissive: 3, additive: 0.3, additiveEnd: 0,
    tint: [0.03, 0.02, 0.035], lit: 1, opacity: 0.8, fadeIn: 0, fadeOut: 0.35,
  },

  // ——— Radiant (Cure Wounds, Sunbeam) ———
  'holy.mote': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.HOLY, life: [1.1, 1.8], size: [0.06, 0.13], heat: 0.95,
    heatEnd: 0.5, emissive: 14, fadeIn: 0.1, fadeOut: 0.55, swirl: 5, drag: 0.8, gravity: -0.6,
  },
  'holy.twinkle': {
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.HOLY, life: [0.4, 0.9], size: [0.1, 0.24], heat: 0.95,
    heatEnd: 0.6, emissive: 16, fadeIn: 0.2, fadeOut: 0.5, gravity: -0.4, spin: [1, 3],
  },
  'holy.ring': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', ramp: RAMP.HOLY, life: 1.3, size: 1.5,
    sizeEnd: 1.8, sizeEase: 'outQuad', heat: 0.85, heatEnd: 0.4, emissive: 5, opacity: 0.85, fadeIn: 0.15,
    fadeOut: 0.5,
  },
  'holy.column': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.HOLY, life: 2, size: 1.7, heat: 0.75,
    heatEnd: 0.45, emissive: 2.5, opacity: 0.65, fadeIn: 0.15, fadeOut: 0.5, cameraFade: false,
  },
  'holy.ground': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', ramp: RAMP.HOLY, life: 2.1, size: 3.4, heat: 0.8,
    heatEnd: 0.5, emissive: 3, opacity: 0.8, fadeIn: 0.15, fadeOut: 0.6,
  },
  'holy.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.HOLY, life: 0.4, size: 3, sizeEnd: 1.4, sizeEase: 'outExpo',
    heat: 0.95, heatEnd: 0.5, emissive: 8, fadeIn: 0.05, fadeOut: 0.3,
  },
  'sun.beam': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.HOLY, life: 1.1, size: 1.3, heat: 1,
    heatEnd: 0.7, emissive: 9, fadeIn: 0.04, fadeOut: 0.55,
  },
  'sun.halo': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.HOLY, life: 1.2, size: 4, heat: 0.8,
    heatEnd: 0.5, emissive: 1.6, opacity: 0.6, fadeIn: 0.04, fadeOut: 0.5,
  },
  'sun.flare': {
    tiles: [TILE.FLARE, TILE.FLARE], ramp: RAMP.HOLY, life: [0.9, 1.1], size: 3.2, heat: 1, heatEnd: 0.7,
    emissive: 22, fadeIn: 0.04, fadeOut: 0.55, spin: [0.5, 1], cameraFade: false,
  },

  'sun.ring': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', ramp: RAMP.HOLY, life: 0.9, size: 1.6,
    sizeEnd: 2.4, sizeEase: 'outQuad', heat: 0.9, heatEnd: 0.5, emissive: 4, opacity: 0.75, fadeIn: 0.08,
    fadeOut: 0.4,
  },
  'sun.mote': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.HOLY, life: [0.6, 1.3], size: [0.06, 0.14], heat: 0.95,
    heatEnd: 0.4, emissive: 18, fadeIn: 0, fadeOut: 0.5, drag: 2, turbulence: 2.5, turbulenceScale: 0.7,
  },

  // ——— Lunar (Moonbeam) ———
  'moon.beam': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.MOON, life: 6, size: 5.5, heat: 0.95,
    heatEnd: 0.8, emissive: 8, fadeIn: 0.04, fadeOut: 0.88, cameraFade: false,
  },
  'moon.halo': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.MOON, life: 6, size: 11, heat: 0.8,
    heatEnd: 0.55, emissive: 3, opacity: 0.7, fadeIn: 0.1, fadeOut: 0.85, cameraFade: false,
  },
  'moon.strike': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'axis', ramp: RAMP.MOON, life: 0.22, size: 1.2, heat: 1,
    heatEnd: 0.9, emissive: 30, fadeIn: 0, fadeOut: 0.3, cameraFade: false,
  },
  'moon.ring': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', ramp: RAMP.MOON, life: 1.2, size: 2.2,
    sizeEnd: 2.2, sizeEase: 'outQuad', heat: 0.85, heatEnd: 0.3, emissive: 4, opacity: 0.8, fadeIn: 0.1,
    fadeOut: 0.4,
  },
  'moon.rim': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.MOON, life: 6, size: 0.7, heat: 0.95,
    heatEnd: 0.8, emissive: 6, opacity: 0.9, fadeIn: 0.06, fadeOut: 0.88, cameraFade: false,
  },
  'moon.fall': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.09, aspect: 2, ramp: RAMP.MOON,
    life: [0.9, 1.4], size: [0.05, 0.1], heat: 1, heatEnd: 0.8, emissive: 22, fadeIn: 0.1, fadeOut: 0.85,
    cameraFade: false, collide: 'die', onImpact: { type: 'moon.mote', count: 1, speed: 0.4, up: 0.6 },
  },
  'moon.spiral': {
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.MOON, life: [1.6, 2.4], size: [0.12, 0.22], heat: 1,
    heatEnd: 0.7, emissive: 16, fadeIn: 0.1, fadeOut: 0.6, swirl: 5, drag: 0.6, gravity: -1.4, spin: [1, 3],
  },
  'moon.ground': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', ramp: RAMP.MOON, life: 6, size: 6, heat: 0.85,
    heatEnd: 0.6, emissive: 3, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.85,
  },
  'moon.mote': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.MOON, life: [1.5, 2.6], size: [0.05, 0.12], heat: 0.95,
    heatEnd: 0.6, emissive: 12, fadeIn: 0.15, fadeOut: 0.6, gravity: -0.8, turbulence: 0.8,
    turbulenceScale: 0.9, drag: 0.8,
  },

  // ——— Conjured clouds ———
  'fog.puff': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [7, 9.5], size: [3.6, 5.4], sizeEnd: 1.5, sizeEase: 'outQuad',
    heat: 0, emissive: 0, additive: 0, tint: [0.86, 0.89, 0.94], opacity: 0.55, fadeIn: 0.12, fadeOut: 0.62,
    drag: 1.4, swirl: 0.25, turbulence: 0.25, turbulenceScale: 0.08, spin: [0.03, 0.12],
    groundFade: true,
  },
  'stink.puff': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.ACID, life: [7, 9.5], size: [3.4, 5], sizeEnd: 1.5,
    sizeEase: 'outQuad', heat: 0.3, heatEnd: 0.1, emissive: 1.2, additive: 0, tint: [0.66, 0.7, 0.34],
    tintEnd: [0.58, 0.6, 0.38], opacity: 0.45, fadeIn: 0.12, fadeOut: 0.6, drag: 1.4, swirl: 0.35,
    turbulence: 0.3, turbulenceScale: 0.08, spin: [0.03, 0.12], groundFade: true,
  },
  'stink.fly': {
    tiles: [TILE.MOTE, TILE.MOTE], lit: 1, life: [2, 4], size: [0.03, 0.05], heat: 0, emissive: 0,
    additive: 0, tint: [0.02, 0.02, 0.015], fadeIn: 0.1, fadeOut: 0.8, turbulence: 30,
    turbulenceScale: 1.6, drag: 4, swirl: 2, cameraFade: false,
  },
});
