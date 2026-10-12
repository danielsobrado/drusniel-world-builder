import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

const ACID = [0.3, 0.72, 0.04];

/** Acid: the globule, its droplets, fumes, bubbles and the puddle. */
export const ACID_TYPES = Object.freeze({
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
    ramp: RAMP.ACID, life: [0.8, 1.6], size: [0.1, 0.22], heat: 0.62, heatEnd: 0.5, emissive: 4,
    additive: 0, tint: ACID, fadeIn: 0, fadeOut: 0.85, gravity: 9.8, drag: 0.4, collide: 'die',
    onImpact: [
      { type: 'acid.sizzle', count: 1, speed: 0.2, up: 0.4 },
      { type: 'acid.splat', count: 1, speed: 0, lift: 0.4 },
    ],
  },
  // Where a droplet lands it eats in: a small glowing splat that hisses out.
  'acid.splat': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', ramp: RAMP.ACID, life: [1.8, 3], size: [0.3, 0.5], sizeEnd: 1.3,
    heat: 0.8, heatEnd: 0.35, emissive: 3, opacity: 0.85, fadeIn: 0, fadeOut: 0.5,
  },
  // Thin corrosive threads curling up off the puddle.
  'acid.wisp': {
    tiles: [TILE.WISP, TILE.WISP], orient: 'velocity', stretch: 0.2, aspect: 3.5, ramp: RAMP.ACID, lit: 1,
    life: [1.2, 2], size: [0.18, 0.32], sizeEnd: 1.8, heat: 0.55, heatEnd: 0.2, emissive: 3, additive: 0.5,
    additiveEnd: 0.2, tint: [0.6, 0.78, 0.35], opacity: 0.45, fadeIn: 0.15, fadeOut: 0.55, drag: 1.2,
    gravity: -1.3, turbulence: 1.8, turbulenceScale: 0.9, windDrift: 0.5, cameraFade: false,
  },
  'acid.sizzle': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.ACID, life: [0.5, 0.9], size: 0.12, sizeEnd: 2.6, heat: 0.45,
    heatEnd: 0, emissive: 2.5, additive: 0.3, additiveEnd: 0, tint: [0.62, 0.72, 0.32], opacity: 0.35,
    fadeIn: 0.05, fadeOut: 0.4, drag: 2, gravity: -1,
  },
  'acid.fume': {
    tiles: TILE_SPANS.smoke, lit: 1, ramp: RAMP.ACID, life: [2, 3.2], size: [0.3, 0.6], sizeEnd: 3.2, heat: 0.4,
    heatEnd: 0, heatEase: 'outExpo', emissive: 4, additive: 0.3, additiveEnd: 0, tint: [0.55, 0.72, 0.28],
    tintEnd: [0.55, 0.6, 0.42], opacity: 0.24, opacityEnd: 0.35, fadeIn: 0.15, fadeOut: 0.5, drag: 1.2,
    gravity: -0.9, turbulence: 0.9, spin: [0.2, 0.6], windDrift: 0.6, groundFade: true,
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
  'acid.puddle.glow': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', ramp: RAMP.ACID, life: 6, size: 6.5, heat: 0.85,
    heatEnd: 0.45, emissive: 3.5, opacity: 0.9, fadeIn: 0.03, fadeOut: 0.6,
  },
  'acid.pop': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], ramp: RAMP.ACID, life: 0.18, size: 0.15, sizeEnd: 3,
    sizeEase: 'outQuart', heat: 0.8, heatEnd: 0.5, emissive: 4, fadeIn: 0, fadeOut: 0.3,
  },
});
