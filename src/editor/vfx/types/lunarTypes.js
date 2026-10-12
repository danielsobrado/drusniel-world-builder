import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';

/** Moonlight: Moonbeam. */
export const LUNAR_TYPES = Object.freeze({
  // ——— Lunar (Moonbeam) ———
  'moon.beam': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.MOON, life: 6, size: 5.5, heat: 0.74,
    heatEnd: 0.62, emissive: 3.2, opacity: 0.85, fadeIn: 0.04, fadeOut: 0.88, cameraFade: false,
  },
  'moon.halo': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.MOON, life: 6, size: 11, heat: 0.7,
    heatEnd: 0.5, emissive: 2, opacity: 0.7, fadeIn: 0.1, fadeOut: 0.85, cameraFade: false,
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
  // A band of brighter light sliding down the column: the beam pulses.
  'moon.band': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', ramp: RAMP.MOON, life: 1.4, size: 4.2, sizeEnd: 4.6,
    heat: 0.9, heatEnd: 0.6, emissive: 4, opacity: 0.8, fadeIn: 0.15, fadeOut: 0.6, cameraFade: false,
  },
  'moon.pulse': {
    tiles: [TILE.BEAM, TILE.BEAM], orient: 'axis', ramp: RAMP.MOON, life: 0.6, size: 4.6, heat: 0.95, heatEnd: 0.7,
    emissive: 3, opacity: 0.7, fadeIn: 0.15, fadeOut: 0.3, cameraFade: false,
  },
  // A thin ring shimmering on the ground where the beam stands.
  'moon.shimmer': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], orient: 'plane', ramp: RAMP.MOON, life: [0.4, 0.7], size: [4, 4.6],
    sizeEnd: 1.06, heat: 0.92, heatEnd: 0.6, emissive: 5, opacity: 0.7, fadeIn: 0.3, fadeOut: 0.5, spin: [0.5, 1.5],
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
    tiles: [TILE.TWINKLE, TILE.TWINKLE], ramp: RAMP.MOON, life: [1.6, 2.4], size: [0.18, 0.34], heat: 1,
    heatEnd: 0.7, emissive: 20, fadeIn: 0.1, fadeOut: 0.6, swirl: 5, drag: 0.6, gravity: -1.4, spin: [1, 3],
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
});
