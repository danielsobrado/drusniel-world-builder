import { TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Fire beyond the reference explosion: the projectile, the wall and the meteors. */
export const FIRE_TYPES = Object.freeze({
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
    tiles: TILE_SPANS.smoke, lit: 1, life: [3.5, 5.5], size: [1.5, 2.4], sizeEnd: 2.8, sizeEase: 'outQuad',
    heat: 0.25, heatEnd: 0, heatEase: 'outExpo', emissive: 6, additive: 0, tint: [0.16, 0.15, 0.145],
    tintEnd: [0.46, 0.455, 0.45], opacity: 0.6, opacityEnd: 0.3, fadeIn: 0.15, fadeOut: 0.5, drag: 1,
    gravity: -1.6, turbulence: 1, turbulenceScale: 0.15, spin: [0.05, 0.25], windDrift: 0.6,
  },
  // A roaring gout: taller, broader tongues thrown up where the wall surges.
  'wall.roar': {
    tiles: TILE_SPANS.flame, orient: 'axis', aspect: 2.8, life: [0.7, 1.2], size: [1.8, 2.8],
    sizeEnd: 0.8, sizeEase: 'outQuad', heat: [0.95, 1.08], heatEnd: 0.4, emissive: 15, fadeIn: 0.08,
    fadeOut: 0.5, gravity: -5, drag: 1.4, turbulence: 1.5,
  },
  'meteor.rock': {
    tiles: TILE_SPANS.chunk, lit: 1, life: 0.05, size: 1.4, heat: 0.9, heatEnd: 0.9, emissive: 8,
    additive: 0, tint: [0.1, 0.08, 0.07], fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'meteor.halo': {
    tiles: [TILE.FLARE, TILE.FLARE], life: 0.05, size: 5.5, heat: 1, heatEnd: 1, emissive: 22,
    fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  // A long line of fire behind the rock, redrawn each frame along its heading.
  'meteor.streak': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'axis', life: 0.05, size: 1.6, heat: 0.98, heatEnd: 0.98,
    emissive: 14, fadeIn: 0, fadeOut: 0.9, cameraFade: false,
  },
  'meteor.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [3, 4.5], size: [1.6, 2.4], sizeEnd: 2.2, sizeEase: 'outQuad',
    heat: [0.25, 0.4], heatEnd: 0, heatEase: 'outExpo', emissive: 6, additive: 0.2, additiveEnd: 0,
    tint: [0.14, 0.13, 0.125], tintEnd: [0.42, 0.415, 0.41], opacity: 0.5, opacityEnd: 0.3, fadeIn: 0.1,
    fadeOut: 0.5, drag: 1.4, turbulence: 0.8, turbulenceScale: 0.1, spin: [0.05, 0.25], windDrift: 0.4,
  },
  'meteor.trail': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [2, 3.2], size: [1.4, 2.2], sizeEnd: 2.6,
    sizeEase: 'outQuad', heat: [0.85, 1], heatEnd: 0, heatEase: 'outQuad', emissive: 12, additive: 1,
    additiveEnd: 0, tint: [0.1, 0.09, 0.085], tintEnd: [0.28, 0.27, 0.27], opacity: 0.85, fadeIn: 0,
    fadeOut: 0.45, drag: 1.2, gravity: -0.6, turbulence: 1, spin: [0.3, 1],
  },
});
