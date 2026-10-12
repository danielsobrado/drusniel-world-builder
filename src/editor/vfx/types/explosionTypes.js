import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';

/**
 * The reference explosion's layers, in order of appearance: flash,
 * shockwave, fireball, sparks, fragments with smoke trails, debris, smoke
 * column. Other spells borrow these freely (dust, debris, sparks).
 *
 * Units are metres and seconds. Emissive values are linear HDR multipliers
 * on the ramp; the bloom threshold is ~2, so anything past ~3 blooms.
 */
// Fire smoke: warm charcoal near the fire, cooling to ash grey as it rises.
const SMOKE_DARK = [0.17, 0.162, 0.155];
const SMOKE_GREY = [0.5, 0.495, 0.49];
const DUST = [0.45, 0.38, 0.29];
const DIRT = [0.24, 0.19, 0.14];

export const EXPLOSION_TYPES = Object.freeze({
  // 1. Flash — 2–4 frames, huge, blooming.
  'explosion.flash': {
    tiles: [TILE.GLOW, TILE.GLOW], life: [0.08, 0.11], size: [6, 7.5], sizeEnd: 1.5, sizeEase: 'outExpo',
    heat: 0.95, heatEnd: 0.55, emissive: 18, fadeIn: 0, fadeOut: 0.15, cameraFade: false,
  },
  'explosion.flare': {
    tiles: [TILE.FLARE, TILE.FLARE], life: [0.14, 0.18], size: [6, 7], sizeEnd: 1.6, sizeEase: 'outExpo',
    heat: 1, heatEnd: 0.7, emissive: 26, fadeIn: 0, fadeOut: 0.1, cameraFade: false,
  },
  // Rays thrown out round the flash: the shape of the blast, not a white disc.
  'explosion.starburst': {
    tiles: [TILE.STARBURST, TILE.STARBURST], life: [0.16, 0.22], size: [5, 6], sizeEnd: 2.2, sizeEase: 'outExpo',
    heat: 0.98, heatEnd: 0.5, emissive: 16, fadeIn: 0, fadeOut: 0.2, cameraFade: false,
  },

  // 2. Shockwave — a thin bright ring racing over the ground, and a pale air shell.
  'explosion.shock.ground': {
    tiles: [TILE.RING_THIN, TILE.RING_THIN], orient: 'plane', life: 0.42, size: 2, sizeEnd: 13,
    sizeEase: 'outQuart', ramp: RAMP.MOON, heat: 0.95, heatEnd: 0.6, emissive: 5, fadeIn: 0, fadeOut: 0.25,
  },
  'explosion.shock.dust': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], orient: 'plane', life: 0.9, size: 3, sizeEnd: 9,
    sizeEase: 'outQuart', lit: 1, heat: 0, emissive: 0, additive: 0, tint: DUST, opacity: 0.55,
    fadeIn: 0, fadeOut: 0.3,
  },
  'explosion.shock.air': {
    tiles: [TILE.RING_SOFT, TILE.RING_SOFT], life: 0.28, size: 3, sizeEnd: 7, sizeEase: 'outCubic',
    ramp: RAMP.MOON, heat: 0.75, heatEnd: 0.4, emissive: 1.6, opacity: 0.3, fadeIn: 0, fadeOut: 0.1,
  },

  // 3. Fireball — eroding flipbook puffs that cool from additive fire into lit smoke.
  'explosion.fireball': {
    tiles: TILE_SPANS.fire, tileMode: 'life', lit: 1, life: [1.3, 2.1], size: [3, 4.3],
    sizeEnd: [1.7, 2.2], sizeEase: 'outExpo', heat: [0.95, 1.08], heatEnd: 0, heatEase: 'outQuad',
    emissive: 8, additive: 1, additiveEnd: 0, tint: SMOKE_DARK, tintEnd: SMOKE_GREY,
    fadeIn: 0.02, fadeOut: 0.5, drag: 3.2, gravity: -2.6, turbulence: 1.6, spin: [0.2, 0.9],
    spinDrag: 0.6, groundFade: true,
  },
  'explosion.core': {
    tiles: TILE_SPANS.fire, tileMode: 'life', life: [0.4, 0.7], size: [2.2, 3], sizeEnd: 1.9,
    sizeEase: 'outExpo', heat: [1.05, 1.2], heatEnd: 0.45, emissive: 12, fadeIn: 0, fadeOut: 0.4,
    drag: 4, gravity: -2, spin: [0.4, 1.2],
  },

  // 4. Sparks — stretched along velocity, bounce once and die.
  'explosion.spark': {
    tiles: [TILE.STREAK, TILE.STREAK], orient: 'velocity', stretch: 0.045, aspect: 2,
    life: [0.6, 1.5], size: [0.05, 0.1], sizeEnd: 0.6, heat: [0.9, 1.05], heatEnd: 0.35,
    emissive: 28, fadeIn: 0, fadeOut: 0.7, gravity: 9.8, drag: 0.9, collide: 'bounce',
    restitution: 0.35, friction: 0.5, cameraFade: false,
  },
  'explosion.ember': {
    tiles: [TILE.MOTE, TILE.MOTE], life: [2, 4.5], size: [0.07, 0.15], sizeEnd: 0.4, heat: [0.7, 0.95],
    heatEnd: 0.15, emissive: 16, fadeIn: 0.05, fadeOut: 0.6, gravity: -0.5, drag: 1.4,
    turbulence: 3, turbulenceScale: 0.6, cameraFade: false,
  },

  // 5. Fragments — hot tumbling rocks trailing fire that turns to smoke.
  'explosion.fragment': {
    tiles: TILE_SPANS.chunk, lit: 1, life: [1.8, 2.8], size: [0.22, 0.45], sizeEnd: 1, heat: [0.55, 0.75],
    heatEnd: 0.05, emissive: 7, additive: 0, tint: [0.2, 0.17, 0.15], fadeIn: 0, fadeOut: 0.85,
    gravity: 9.8, drag: 0.15, spin: [4, 11], collide: 'bounce', restitution: 0.3, friction: 0.45,
    trail: { type: 'explosion.fragment.smoke', rate: 34, inherit: 0.08, shrink: true },
    onImpact: { type: 'explosion.dust.kick', count: [2, 3], speed: [0.4, 1.4], up: 0.6 },
  },
  'explosion.fragment.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [0.8, 1.4], size: [0.32, 0.5], sizeEnd: 3.2, heat: [0.45, 0.6],
    heatEnd: 0, heatEase: 'outExpo', emissive: 9, additive: 0.7, additiveEnd: 0, tint: SMOKE_DARK,
    tintEnd: SMOKE_GREY, opacity: 0.75, fadeIn: 0.04, fadeOut: 0.45, drag: 2, gravity: -0.7,
    turbulence: 0.7, spin: [0.3, 1],
  },

  // 6. Debris — cold dirt and stone that bounce and settle.
  'explosion.debris': {
    tiles: TILE_SPANS.chunk, lit: 1, life: [2.5, 4.2], size: [0.07, 0.2], heat: 0, emissive: 0,
    additive: 0, tint: DIRT, fadeIn: 0, fadeOut: 0.85, gravity: 9.8, drag: 0.25, spin: [3, 10],
    collide: 'bounce', restitution: 0.28, friction: 0.5,
  },
  'explosion.dust.ring': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [1.6, 2.6], size: [1, 1.6], sizeEnd: 3.4, heat: 0, emissive: 0,
    additive: 0, tint: DUST, tintEnd: [0.52, 0.47, 0.4], opacity: 0.42, fadeIn: 0.04, fadeOut: 0.45,
    drag: 2.6, gravity: -0.35, turbulence: 0.6, spin: [0.2, 0.6], groundFade: true,
  },
  'explosion.dust.kick': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [0.7, 1.2], size: [0.25, 0.4], sizeEnd: 3, heat: 0, emissive: 0,
    additive: 0, tint: DUST, opacity: 0.55, fadeIn: 0.05, fadeOut: 0.4, drag: 3, gravity: -0.2,
  },

  // 7. Smoke column — slow, lit, rising and curling; capped like a mushroom.
  'explosion.smoke': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [5.5, 8.5], size: [2.4, 3.6], sizeEnd: [3.2, 4.4], sizeEase: 'outQuad',
    heat: [0.25, 0.4], heatEnd: 0, heatEase: 'outExpo', emissive: 7, additive: 0.15, additiveEnd: 0,
    tint: SMOKE_DARK, tintEnd: [0.56, 0.555, 0.55], opacity: 0.84, opacityEnd: 0.15, fadeIn: 0.1, fadeOut: 0.55,
    drag: 0.9, gravity: -1.5, turbulence: 1, turbulenceScale: 0.12, spin: [0.05, 0.25],
    windDrift: 0.45, groundFade: true,
  },
  // The stem keeps feeding from the ground for seconds, rising slower than the cap.
  'explosion.smoke.stem': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [6, 9], size: [1.6, 2.4], sizeEnd: [2.2, 3], sizeEase: 'outQuad',
    heat: [0.15, 0.3], heatEnd: 0, heatEase: 'outExpo', emissive: 6, additive: 0, tint: [0.24, 0.23, 0.22],
    tintEnd: [0.62, 0.615, 0.61], opacity: 0.66, opacityEnd: 0.3, fadeIn: 0.1, fadeOut: 0.6, drag: 1.3,
    gravity: -1.1, turbulence: 0.8, turbulenceScale: 0.15, spin: [0.05, 0.25], windDrift: 0.3, groundFade: true,
  },
  // The cap rolls outward and thins as it spreads, rather than ending as a dark ball.
  'explosion.smoke.cap': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [5, 8], size: [3, 4.2], sizeEnd: 3.6, sizeEase: 'outQuad',
    heat: [0.2, 0.35], heatEnd: 0, heatEase: 'outExpo', emissive: 6, additive: 0, tint: SMOKE_DARK,
    tintEnd: [0.58, 0.575, 0.57], opacity: 0.7, opacityEnd: 0.12, fadeIn: 0.15, fadeOut: 0.4, drag: 0.8,
    gravity: -0.4, turbulence: 0.8, turbulenceScale: 0.1, spin: [0.05, 0.2], windDrift: 0.6,
  },
  // Thin wisps curling off the scorch long after the blast.
  'explosion.smoulder': {
    tiles: TILE_SPANS.smoke, lit: 1, life: [3, 5], size: [0.35, 0.6], sizeEnd: [4, 6], sizeEase: 'outQuad',
    heat: [0.15, 0.25], heatEnd: 0, heatEase: 'outExpo', emissive: 5, additive: 0, tint: [0.26, 0.25, 0.24],
    tintEnd: [0.55, 0.55, 0.55], opacity: 0.32, opacityEnd: 0.3, fadeIn: 0.2, fadeOut: 0.5, drag: 1.2,
    gravity: -0.9, turbulence: 0.9, turbulenceScale: 0.4, spin: [0.1, 0.4], windDrift: 0.8,
  },
  // Coals glowing among the burnt stubble, dimming over seconds.
  'explosion.coal': {
    tiles: [TILE.MOTE, TILE.MOTE], life: [3, 7], size: [0.1, 0.22], sizeEnd: 0.6, heat: [0.6, 0.82], heatEnd: 0.18,
    emissive: 12, fadeIn: 0.05, fadeOut: 0.5, cameraFade: false,
  },

  // An effect light's pool on the ground, redrawn every frame by VfxSystem.
  'light.pool': {
    tiles: [TILE.GLOW, TILE.GLOW], orient: 'plane', ramp: RAMP.MOON, life: 0.001, size: 1, heat: 1, heatEnd: 1,
    emissive: 1, fadeIn: 0, fadeOut: 1, cameraFade: false,
  },

  // After-burn: small licking flames on the scorch.
  'explosion.groundfire': {
    tiles: TILE_SPANS.flame, orient: 'axis', aspect: 2.1, life: [0.45, 0.9], size: [0.4, 0.95],
    sizeEnd: 0.55, heat: [0.85, 1], heatEnd: 0.45, emissive: 12, fadeIn: 0.12, fadeOut: 0.45,
    gravity: -2.5, drag: 1.5,
  },
});
