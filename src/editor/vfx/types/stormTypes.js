import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Lightning and thunder: Lightning Bolt, Thunderwave and the storm deck. */
export const STORM_TYPES = Object.freeze({
  // ——— Lightning ———
  'bolt.core': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.LIGHTNING, life: [0.09, 0.13], size: 0.3,
    heat: 1.05, heatEnd: 0.8, emissive: 30, fadeIn: 0, fadeOut: 0.25, cameraFade: false,
  },
  'bolt.glow': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.LIGHTNING, life: [0.12, 0.18], size: 1.5,
    heat: 0.75, heatEnd: 0.5, emissive: 4, opacity: 0.7, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },
  // The wide, soft glow round the channel: what makes a bolt read as blinding.
  'bolt.halo': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'axis', ramp: RAMP.LIGHTNING, life: [0.13, 0.18], size: 4,
    heat: 0.62, heatEnd: 0.4, emissive: 1.6, opacity: 0.5, fadeIn: 0, fadeOut: 0.15, cameraFade: false,
  },
  // The ionised channel left hanging after the last stroke, cooling violet.
  'bolt.afterglow': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.LIGHTNING, life: [0.75, 0.95], size: 0.3, heat: 0.75,
    heatEnd: 0.28, emissive: 6, opacity: 0.6, fadeIn: 0, fadeOut: 0.15, cameraFade: false,
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
    tiles: TILE_SPANS.smoke, lit: 1, life: [1.2, 2], size: [0.6, 1], sizeEnd: 3.2, heat: 0, emissive: 0,
    additive: 0, tint: [0.66, 0.6, 0.5], opacity: 0.34, opacityEnd: 0.5, fadeIn: 0.03, fadeOut: 0.5, drag: 3,
    gravity: -0.05, turbulence: 0.8, spin: [0.2, 0.8], windDrift: 0.4,
  },
  // A wall of dust thrown up where the wave front runs out of force.
  'thunder.wall': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [1.5, 2.4], size: [1.1, 1.6], sizeEnd: 2.4, sizeEase: 'outQuad',
    heat: 0, emissive: 0, additive: 0, tint: [0.62, 0.56, 0.46], tintEnd: [0.7, 0.66, 0.58], opacity: 0.42,
    opacityEnd: 0.4, fadeIn: 0.03, fadeOut: 0.45, drag: 3.2, gravity: -0.5, turbulence: 0.9, spin: [0.2, 0.6],
    windDrift: 0.5, groundFade: true,
  },
  // The shock front itself, racing over the ground as a ring of raised dust.
  'thunder.ring': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', lit: 1, life: 0.6, size: 1.5, sizeEnd: 9,
    sizeEase: 'outCubic', heat: 0, emissive: 0, additive: 0, tint: [0.6, 0.55, 0.45], opacity: 0.6,
    fadeIn: 0, fadeOut: 0.35,
  },
  // Cut grass flung out by the wave: thin green slivers that tumble and settle.
  'thunder.clipping': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.012, aspect: 5, lit: 1, life: [1.4, 2.4],
    size: [0.03, 0.05], heat: 0, emissive: 0, additive: 0, tint: [0.3, 0.52, 0.12], fadeIn: 0, fadeOut: 0.8,
    gravity: 5, drag: 1.8, turbulence: 5, turbulenceScale: 1.1, collide: 'stick',
  },
  // Blue-white crackle clinging to the scorch after the strike.
  'bolt.ember': {
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.LIGHTNING, life: [0.08, 0.16], size: [0.2, 0.45],
    heat: 1, heatEnd: 0.6, emissive: 18, fadeIn: 0, fadeOut: 0.4, spin: [4, 10], cameraFade: false,
  },
  'bolt.ion.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.LIGHTNING, life: [1.2, 2], size: [0.3, 0.5], sizeEnd: 4,
    heat: 0.4, heatEnd: 0, heatEase: 'outExpo', emissive: 4, additive: 0.3, additiveEnd: 0,
    tint: [0.48, 0.5, 0.55], opacity: 0.35, fadeIn: 0.05, fadeOut: 0.5, drag: 1.5, gravity: -0.8,
    turbulence: 0.6,
  },
});
