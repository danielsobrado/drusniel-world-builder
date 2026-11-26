import { TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Fire beyond the reference explosion: the projectile, the wall and the meteors. */
export const FIRE_TYPES = Object.freeze({
  // ——— Fire: projectile, wall, meteor ———
  'fire.head': {
    tiles: [TILE.FLARE, TILE.FLARE], life: 0.05, size: 2.1, sizeEnd: 1.05, heat: 1, heatEnd: 0.96, emissive: 15,
    fadeIn: 0, fadeOut: 0.5, cameraFade: false,
  },
  // Directional flame wake streaming back along the projectile's heading.
  'fire.wake': {
    tiles: TILE_SPANS.flame, orient: 'axis', life: 0.06, size: 0.95, sizeEnd: 0.8, heat: 0.96, heatEnd: 0.65,
    emissive: 11, fadeIn: 0, fadeOut: 0.7, cameraFade: false,
  },
  'fire.head.puff': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [0.24, 0.4], size: [0.65, 1.0], sizeEnd: 1.65,
    sizeEase: 'outQuad', heat: [0.96, 1.08], heatEnd: 0.18, emissive: 10, additive: 1, additiveEnd: 0.25,
    tint: [0.14, 0.12, 0.11], fadeIn: 0, fadeOut: 0.38, drag: 2.1, gravity: -1.8, turbulence: 1.2, spin: [1.2, 3.2],
  },
  // Hot peeling cinders tearing off a fireball in flight.
  'fire.spark': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.04, aspect: 2.4,
    life: [0.22, 0.45], size: [0.04, 0.08], sizeEnd: 0.4, heat: [0.92, 1.05], heatEnd: 0.25,
    emissive: 22, fadeIn: 0, fadeOut: 0.6, drag: 1.8, gravity: 2.2, turbulence: 2.4, cameraFade: false,
  },
  'fire.trail.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [0.9, 1.4], size: [0.3, 0.45], sizeEnd: 2.4, heat: 0.4, heatEnd: 0,
    heatEase: 'outExpo', emissive: 6, additive: 0.4, additiveEnd: 0, tint: [0.25, 0.23, 0.22],
    tintEnd: [0.5, 0.5, 0.5], opacity: 0.4, fadeIn: 0.3, fadeOut: 0.4, drag: 1.5, gravity: -0.8,
    turbulence: 0.8, spin: [0.3, 1],
  },
  // Searing molten hearth glow anchoring the foot of a Wall of Fire or gas vent.
  'wall.base': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', life: [0.35, 0.65], size: [1.2, 1.9], sizeEnd: 1.35,
    heat: [0.85, 1], heatEnd: 0.38, emissive: 8.5, opacity: 0.72, fadeIn: 0.15, fadeOut: 0.55,
  },
  'wall.flame': {
    tiles: TILE_SPANS.flame, orient: 'axis', aspect: 2.75, life: [0.6, 1.15], size: [1.1, 2.05],
    sizeEnd: 0.68, sizeEase: 'outQuad', heat: [0.92, 1.06], heatEnd: 0.42, emissive: 13.5, fadeIn: 0.1,
    fadeOut: 0.48, gravity: -6.2, drag: 1.4, turbulence: 1.45,
  },
  // Detached flame licks whipping off the top of the wall before dissolving.
  'wall.wisp': {
    tiles: [TILE.WISP, TILE.WISP], orient: 'velocity', stretch: 0.05, aspect: 2.6,
    life: [0.42, 0.82], size: [0.38, 0.72], sizeEnd: 0.35, sizeEase: 'outQuad',
    heat: [0.82, 0.98], heatEnd: 0.22, emissive: 12, opacity: 0.85, fadeIn: 0.1, fadeOut: 0.45,
    gravity: -5.4, drag: 1.1, turbulence: 2.8, turbulenceScale: 0.45,
  },
  'wall.body': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [0.7, 1.1], size: [1.1, 1.75], sizeEnd: 1.45,
    heat: [0.88, 1.02], heatEnd: 0.08, emissive: 11.5, additive: 1, additiveEnd: 0.15, tint: [0.1, 0.09, 0.08],
    fadeIn: 0.08, fadeOut: 0.5, gravity: -3.6, drag: 1.8, turbulence: 1.1, spin: [0.25, 0.9],
  },
  'wall.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [3.5, 5.5], size: [1.5, 2.4], sizeEnd: 2.8, sizeEase: 'outQuad',
    heat: 0.25, heatEnd: 0, heatEase: 'outExpo', emissive: 6, additive: 0, tint: [0.16, 0.15, 0.145],
    tintEnd: [0.46, 0.455, 0.45], opacity: 0.6, opacityEnd: 0.3, fadeIn: 0.15, fadeOut: 0.5, drag: 1,
    gravity: -1.6, turbulence: 1, turbulenceScale: 0.15, spin: [0.05, 0.25], windDrift: 0.6,
  },
  // A roaring gout: taller, broader tongues thrown up where the wall surges.
  'wall.roar': {
    tiles: TILE_SPANS.flame, orient: 'axis', aspect: 2.95, life: [0.7, 1.25], size: [1.85, 2.9],
    sizeEnd: 0.78, sizeEase: 'outQuad', heat: [0.96, 1.1], heatEnd: 0.38, emissive: 15.5, fadeIn: 0.08,
    fadeOut: 0.5, gravity: -5.4, drag: 1.4, turbulence: 1.7,
  },
  'meteor.rock': {
    tiles: TILE_SPANS.chunk, lit: 1, life: 0.05, size: 1.4, heat: 0.9, heatEnd: 0.9, emissive: 8,
    additive: 0, tint: [0.1, 0.08, 0.07], fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'meteor.halo': {
    tiles: [TILE.FLARE, TILE.FLARE], life: 0.05, size: 5.8, heat: 1, heatEnd: 1, emissive: 22,
    fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  // A long line of fire behind the rock, redrawn each frame along its heading.
  'meteor.streak': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'axis', life: 0.05, size: 1.7, heat: 0.98, heatEnd: 0.98,
    emissive: 14, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  // Ablating incandescent sparks streaming back along the meteor's wake.
  'meteor.spark': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.055, aspect: 2.8,
    life: [0.28, 0.6], size: [0.07, 0.14], sizeEnd: 0.45, heat: [0.95, 1.08], heatEnd: 0.3,
    emissive: 26, fadeIn: 0, fadeOut: 0.65, drag: 1.2, gravity: 4.5, turbulence: 2.2, cameraFade: false,
  },
  'meteor.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [3, 4.5], size: [1.6, 2.4], sizeEnd: 2.2, sizeEase: 'outQuad',
    heat: [0.28, 0.44], heatEnd: 0, heatEase: 'outExpo', emissive: 6.5, additive: 0.22, additiveEnd: 0,
    tint: [0.14, 0.13, 0.125], tintEnd: [0.42, 0.415, 0.41], opacity: 0.5, opacityEnd: 0.3, fadeIn: 0.1,
    fadeOut: 0.5, drag: 1.4, turbulence: 0.8, turbulenceScale: 0.1, spin: [0.05, 0.25], windDrift: 0.4,
  },
  'meteor.trail': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [2, 3.2], size: [1.45, 2.25], sizeEnd: 2.6,
    sizeEase: 'outQuad', heat: [0.88, 1.02], heatEnd: 0, heatEase: 'outQuad', emissive: 12.5, additive: 1,
    additiveEnd: 0, tint: [0.1, 0.09, 0.085], tintEnd: [0.28, 0.27, 0.27], opacity: 0.85, fadeIn: 0,
    fadeOut: 0.45, drag: 1.2, gravity: -0.6, turbulence: 1.1, spin: [0.3, 1],
  },
});
