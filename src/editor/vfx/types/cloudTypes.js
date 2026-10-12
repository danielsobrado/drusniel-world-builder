import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/** Conjured clouds: Fog Cloud and Stinking Cloud. */
export const CLOUD_TYPES = Object.freeze({
  // ——— Conjured clouds ———
  // A low lens of fog: banks are many of these, overlapping and drifting.
  'fog.puff': {
    tiles: [TILE.FOG_BANK, TILE.FOG_BANK], lit: 1, life: [7, 9.5], size: [5, 7.5], sizeEnd: 1.35, sizeEase: 'outQuad',
    heat: 0, emissive: 0, additive: 0, tint: [0.9, 0.92, 0.96], opacity: 0.5, fadeIn: 0.12, fadeOut: 0.62,
    drag: 1.6, swirl: 0.1, turbulence: 0.2, turbulenceScale: 0.08, windDrift: 0.12, spin: [0, 0.02],
  },
  'stink.puff': {
    tiles: [TILE.FOG_BANK, TILE.FOG_BANK], lit: 1, ramp: RAMP.ACID, life: [7, 9.5], size: [4.6, 7], sizeEnd: 1.35,
    sizeEase: 'outQuad', heat: 0.28, heatEnd: 0.12, emissive: 1, additive: 0, tint: [0.66, 0.68, 0.36],
    tintEnd: [0.6, 0.6, 0.4], opacity: 0.5, fadeIn: 0.12, fadeOut: 0.6, drag: 1.6, swirl: 0.18,
    turbulence: 0.25, turbulenceScale: 0.08, windDrift: 0.12, spin: [0, 0.02],
  },
  // Wisps peeling off a bank's top and drifting downwind.
  'fog.wisp': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [3, 4.5], size: [1.2, 1.8], sizeEnd: 2.4, sizeEase: 'outQuad', heat: 0,
    emissive: 0, additive: 0, tint: [0.92, 0.93, 0.96], opacity: 0.26, opacityEnd: 0.35, fadeIn: 0.25, fadeOut: 0.45,
    drag: 1, gravity: -0.15, turbulence: 0.4, turbulenceScale: 0.2, windDrift: 0.5, spin: [0.02, 0.08],
  },
  'stink.fly': {
    tiles: [TILE.MOTE, TILE.MOTE], lit: 1, life: [2, 4], size: [0.03, 0.05], heat: 0, emissive: 0,
    additive: 0, tint: [0.02, 0.02, 0.015], fadeIn: 0.1, fadeOut: 0.8, turbulence: 30,
    turbulenceScale: 1.6, drag: 4, swirl: 2, cameraFade: false,
  },
});
