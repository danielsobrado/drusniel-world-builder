import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Arcane force and breaking crystal: Magic Missile and Shatter. */
export const ARCANE_TYPES = Object.freeze({
  // ——— Arcane (Magic Missile, Shatter) ———
  'arcane.head': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ARCANE, life: 0.05, size: 0.5, heat: 1, heatEnd: 1,
    emissive: 20, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'arcane.flare': {
    tiles: [TILE.FLARE, TILE.FLARE], ramp: RAMP.ARCANE, life: 0.05, size: 0.9, heat: 0.92, heatEnd: 0.92,
    emissive: 11, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'arcane.ribbon': {
    tiles: [TILE.BOLT, TILE.BOLT], orient: 'axis', ramp: RAMP.ARCANE, life: [0.85, 1.15], size: 0.34,
    sizeEnd: 0.35, heat: 0.95, heatEnd: 0.2, emissive: 7, fadeIn: 0, fadeOut: 0.12, cameraFade: false,
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
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ARCANE, life: 0.16, size: 2.4, sizeEnd: 1.6, sizeEase: 'outExpo',
    heat: 0.95, heatEnd: 0.5, emissive: 14, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },
  'arcane.starburst': {
    tiles: [TILE.STARBURST, TILE.STARBURST], ramp: RAMP.ARCANE, life: [0.2, 0.26], size: 2, sizeEnd: 2.4,
    sizeEase: 'outExpo', heat: 0.95, heatEnd: 0.45, emissive: 14, fadeIn: 0, fadeOut: 0.25, cameraFade: false,
  },
  // Motes of spent force hanging where a dart struck, drifting and winking out.
  'arcane.linger': {
    tiles: [TILE.MOTE, TILE.MOTE], ramp: RAMP.ARCANE, life: [1.8, 3.4], size: [0.06, 0.13], heat: [0.8, 0.95],
    heatEnd: 0.35, emissive: 14, fadeIn: 0.1, fadeOut: 0.55, drag: 2.2, gravity: -0.15, turbulence: 1.4,
    turbulenceScale: 0.9,
  },
  // Spent force left hanging along the dart's path: faint violet smoke, slowly dispersing.
  'arcane.wisp': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.ARCANE, life: [1.6, 2.6], size: [0.25, 0.4], sizeEnd: 4.5,
    sizeEase: 'outQuad', heat: [0.45, 0.55], heatEnd: 0.1, emissive: 3, additive: 0.55, additiveEnd: 0.1,
    tint: [0.55, 0.42, 0.75], opacity: 0.26, opacityEnd: 0.4, fadeIn: 0.1, fadeOut: 0.45, drag: 2,
    turbulence: 0.6, turbulenceScale: 0.5, spin: [0.2, 0.6], windDrift: 0.5,
  },
  'arcane.residue': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.ARCANE, life: 1.4, size: 1.6, sizeEnd: 0.6, heat: 0.7, heatEnd: 0.3,
    emissive: 3, opacity: 0.8, fadeIn: 0, fadeOut: 0.2,
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
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], ramp: RAMP.FROST, life: 0.22, size: 7, sizeEnd: 0.08,
    sizeEase: 'inQuad', heat: 0.6, heatEnd: 0.85, emissive: 3, opacity: 0.6, fadeIn: 0.15, fadeOut: 0.95,
  },
  'shatter.shard': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [6, 8], size: [0.16, 0.4], heat: [0.35, 0.55],
    heatEnd: 0.3, emissive: 6, additive: 0.15, additiveEnd: 0, tint: [0.75, 0.88, 1], fadeIn: 0,
    fadeOut: 0.85, gravity: 9.8, drag: 0.6, spin: [8, 20], collide: 'bounce', restitution: 0.35,
    friction: 0.55,
  },
  'shatter.crystal': {
    tiles: TILE_SPANS.shard, lit: 1, ramp: RAMP.FROST, life: [5, 7], size: [0.3, 0.6], heat: [0.65, 0.85],
    heatEnd: 0.35, emissive: 7, additive: 0.35, additiveEnd: 0.05, tint: [0.8, 0.92, 1], fadeIn: 0,
    fadeOut: 0.85, gravity: 9.8, drag: 0.9, spin: [6, 16], collide: 'bounce', restitution: 0.3, friction: 0.5,
  },
  'shatter.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], ramp: RAMP.FROST, life: 0.1, size: 2.6, sizeEnd: 1.3, sizeEase: 'outExpo',
    heat: 0.9, heatEnd: 0.5, emissive: 9, fadeIn: 0, fadeOut: 0.15, cameraFade: false,
  },
  'shatter.starburst': {
    tiles: [TILE.STARBURST, TILE.STARBURST], ramp: RAMP.FROST, life: [0.26, 0.32], size: 8, sizeEnd: 1.5,
    sizeEase: 'outExpo', heat: 0.9, heatEnd: 0.45, emissive: 10, fadeIn: 0, fadeOut: 0.25, cameraFade: false,
  },
  // Two rings racing out at slightly different speeds: cyan and magenta fringes.
  'shatter.fringe.cyan': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], ramp: RAMP.FROST, life: 0.34, size: 1, sizeEnd: 10,
    sizeEase: 'outQuart', heat: 0.85, heatEnd: 0.45, emissive: 6, fadeIn: 0, fadeOut: 0.3, cameraFade: false,
  },
  'shatter.fringe.magenta': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], ramp: RAMP.ARCANE, life: 0.38, size: 0.9, sizeEnd: 9,
    sizeEase: 'outQuart', heat: 0.8, heatEnd: 0.4, emissive: 5, fadeIn: 0, fadeOut: 0.3, cameraFade: false,
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
});
