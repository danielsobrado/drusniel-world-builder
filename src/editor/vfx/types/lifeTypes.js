import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Necrotic and radiant: Blight, Cure Wounds and Sunbeam. */
export const LIFE_TYPES = Object.freeze({
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
  // Drained life boiling off: bruise-purple smoke lit sickly green from inside, thinning as it rises.
  'necrotic.burst.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.NECROTIC, life: [2, 3.2], size: [0.9, 1.4], sizeEnd: 2.6,
    heat: [0.45, 0.62], heatEnd: 0.05, heatEase: 'outQuad', emissive: 4, additive: 0.25, additiveEnd: 0,
    tint: [0.15, 0.1, 0.17], tintEnd: [0.3, 0.27, 0.31], opacity: 0.5, opacityEnd: 0.35, fadeIn: 0.03, fadeOut: 0.5,
    drag: 2.4, gravity: -1.1, turbulence: 1, spin: [0.2, 0.6], windDrift: 0.4, groundFade: true,
  },
  // Tendrils of rot climbing out of the blighted ground, coiling as they rise.
  'necrotic.rise': {
    tiles: [TILE.WISP, TILE.WISP], orient: 'velocity', stretch: 0.3, aspect: 2.5, ramp: RAMP.NECROTIC,
    life: [1, 1.7], size: [0.25, 0.42], sizeEnd: 0.5, heat: [0.5, 0.68], heatEnd: 0.3, emissive: 12, additive: 0.8,
    additiveEnd: 0.4, tint: [0.08, 0.04, 0.1], lit: 1, fadeIn: 0.15, fadeOut: 0.6, swirl: 3.5, gravity: -3.2,
    drag: 1.2, turbulence: 1.2, cameraFade: false,
  },
  // The ground's sick glow under the withering, fading over seconds.
  'necrotic.glow': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', ramp: RAMP.NECROTIC, life: 4, size: 8, sizeEnd: 1.1,
    heat: 0.62, heatEnd: 0.4, emissive: 2.2, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.5,
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
  // A warm rim of light round the healed body: an outline, not a sphere over it.
  'holy.rim': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.HOLY, life: 0.85, size: 2.4, sizeEnd: 1.15, sizeEase: 'outQuad',
    heat: 0.84, heatEnd: 0.5, emissive: 5, opacity: 1, fadeIn: 0.2, fadeOut: 0.4, cameraFade: false,
  },
  'holy.aura': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.HOLY, life: 0.9, size: 1.3, sizeEnd: 1.4, heat: 0.7,
    heatEnd: 0.4, emissive: 1.4, opacity: 0.6, fadeIn: 0.2, fadeOut: 0.45, cameraFade: false,
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
  'sun.spark': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.05, aspect: 2, ramp: RAMP.HOLY,
    life: [0.3, 0.7], size: [0.04, 0.08], heat: 1, heatEnd: 0.5, emissive: 26, fadeIn: 0, fadeOut: 0.5,
    drag: 2.5, gravity: 3, cameraFade: false,
  },
  'sun.ground.ring': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], orient: 'plane', ramp: RAMP.HOLY, life: 0.6, size: 1,
    sizeEnd: 9, sizeEase: 'outQuart', heat: 0.95, heatEnd: 0.5, emissive: 7, fadeIn: 0, fadeOut: 0.3,
  },
  'sun.mote': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.HOLY, life: [0.6, 1.3], size: [0.06, 0.14], heat: 0.95,
    heatEnd: 0.4, emissive: 18, fadeIn: 0, fadeOut: 0.5, drag: 2, turbulence: 2.5, turbulenceScale: 0.7,
  },
});
