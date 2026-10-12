import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat, markGrass } from '../effects/groundPress.js';
import { addScaled, onGround, UP } from '../effects/vec.js';

/**
 * Blight: dark tendrils and smoke spiral in toward the target while motes of
 * life are drawn out of the ground, then a withering pulse rolls outward:
 * tendrils of rot climb out of the earth in a sickly green-purple glow, the
 * drained life boils off as thinning smoke, and the meadow withers grey-brown.
 */
export function blight(fx, ctx) {
  const ground = onGround(fx, ctx.target, 0);
  const heart = addScaled(ground, UP, 1.1);
  const gather = 1.05;
  const anchor = { anchor: heart };
  fx.at(0, () => {
    fx.sound('necrotic', heart, { duration: gather + 1 });
    fx.light({ position: heart, ramp: RAMP.NECROTIC, intensity: 140, range: 16, attack: gather, hold: 0.3, decay: 2 });
  });
  fx.stream('necrotic.tendril', 0, gather, 150, { kind: 'ring', center: addScaled(ground, UP, 0.6), radius: [4, 6.5], lift: [0.5, 2.5] }, anchor);
  fx.stream('necrotic.smoke', 0, gather, 50, { kind: 'ring', center: addScaled(ground, UP, 0.8), radius: [3.5, 5.5], lift: [0, 1.2] }, anchor);
  fx.stream('necrotic.essence', 0.1, gather, 110, { kind: 'disk', center: ground, radius: 6, ground: fx.groundHeight, height: 0.4, lift: [1, 2.5] }, anchor);
  holdFlat(fx, ground, 2.6, gather, gather + 14, 0.6, 5);
  blastWave(fx, ground, 6, 0.4, gather);
  // The life drained out of the meadow: it withers from the centre outward.
  markGrass(fx, ground, 7, 'wither', gather, gather + 10, { grow: 1.4, inner: 0.45 });
  fx.at(gather, () => {
    fx.shake(0.22, heart, 8);
    fx.sound('necrotic-burst', heart);
    fx.burst('necrotic.flash', 1, { kind: 'point', center: heart }, { sizeScale: 0.7 });
    fx.burst('explosion.starburst', 1, { kind: 'point', center: heart }, { sizeScale: 0.9, tint: [0.7, 1, 0.55] });
    fx.burst('necrotic.pulse', 1, { kind: 'point', center: addScaled(ground, UP, 0.5) });
    fx.burst('necrotic.glow', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) });
    fx.burst('necrotic.burst.smoke', 26, { kind: 'sphere', center: heart, radius: 0.6, speed: [2, 7], up: 0.7 });
    fx.burst('explosion.dust.ring', 10, { kind: 'ring', center: addScaled(ground, UP, 0.8), radius: 1, speed: [6, 9], lift: [0.6, 1.4] }, { tint: [0.62, 0.58, 0.6], opacityScale: 0.45 });
    fx.burst('necrotic.essence', 30, { kind: 'sphere', center: heart, radius: 0.3, speed: [2, 5] }, { anchor: addScaled(heart, UP, 6) });
    fx.light({ position: addScaled(ground, UP, 1.5), ramp: RAMP.NECROTIC, intensity: 120, range: 14, attack: 0.05, hold: 1.2, decay: 1.2, flicker: 0.3 });
    fx.decal({
      x: ground.x, z: ground.z, radius: 4.2, tile: TILE.BLIGHT_DECAL, ramp: RAMP.NECROTIC, tint: [0.09, 0.08, 0.07],
      emissive: 7, heat: 1, coolSeconds: 6, opacity: 0.9, fadeIn: 0.4, hold: 20, fadeOut: 8,
    });
  });
  // Tendrils of rot climbing out of the ground and coiling upward.
  fx.stream('necrotic.rise', gather, gather + 2.6, (t) => 46 * (1 - t), {
    kind: 'disk', center: ground, radius: 3.8, ground: fx.groundHeight, height: 0.35, lift: [1.5, 3],
  }, anchor);
  // The drained life rises off the spot as a thinning, slowly coiling plume.
  fx.stream('necrotic.burst.smoke', gather + 0.1, gather + 2.4, (t) => 8 * (1 - t), {
    kind: 'sphere', center: heart, radius: 0.8, speed: [0.5, 1.5], lift: 2.5,
  }, { sizeScale: 0.8 });
  fx.stream('necrotic.essence', gather + 0.3, gather + 3.5, (t) => 18 * (1 - t), {
    kind: 'disk', center: ground, radius: 4, ground: fx.groundHeight, height: 0.4, lift: [0.6, 1.4],
  }, { anchor: addScaled(heart, UP, 5) });
}

/**
 * Cure Wounds: a golden rune circle opens at the caster's feet, motes spiral
 * up through rising rings inside a soft column of light, and the healing
 * closes in a warm rim of light round the body; the grass at the caster's
 * feet greens.
 */
export function cureWounds(fx, ctx) {
  const feet = onGround(fx, ctx.caster, 0);
  const anchor = { anchor: feet };
  const duration = 2.2;
  fx.at(0, () => {
    fx.sound('heal', feet, { duration });
    fx.decal({
      x: feet.x, z: feet.z, radius: 1.5, tile: TILE.RUNE_CIRCLE, ramp: RAMP.HOLY, tint: [0.35, 0.3, 0.15],
      emissive: 9, heat: 1, coolSeconds: duration + 0.6, opacity: 0.9, fadeIn: 0.3, hold: duration - 0.6, fadeOut: 1, rotation: 0,
    });
    fx.burst('holy.column', 1, { kind: 'point', center: addScaled(feet, UP, 2.4) }, { axisLength: 5 });
    fx.light({ position: addScaled(addScaled(feet, ctx.forward, 1.6), UP, 0.3), ramp: RAMP.HOLY, intensity: 4, range: 6, attack: 0.35, hold: duration - 0.9, decay: 2 });
    fx.burst('holy.ground', 1, { kind: 'point', center: addScaled(feet, UP, 0.4) });
  });
  holdFlat(fx, feet, 1.8, 0, duration + 0.5, 0.75, 1);
  markGrass(fx, feet, 2.4, 'bloom', 0.2, duration, { strength: 0.8, grow: 1.2, inner: 0.4 });
  fx.every(0, duration - 0.5, 0.32, () => {
    fx.burst('holy.ring', 1, { kind: 'point', center: addScaled(feet, UP, 0.35), velocity: { x: 0, y: 1.3, z: 0 } });
  });
  fx.stream('holy.mote', 0.1, duration - 0.3, 130, { kind: 'ring', center: addScaled(feet, UP, 0.3), radius: [0.6, 1.1], lift: [1.2, 2.8] }, anchor);
  fx.stream('holy.twinkle', 0.2, duration, 30, { kind: 'disk', center: addScaled(feet, UP, 0.5), radius: 0.9, height: [0, 1.6], lift: [0.2, 0.6] });
  // The close: a warm outline of light round the body, not a white sphere over it.
  fx.at(duration - 0.6, () => {
    const chest = addScaled(feet, UP, 1.05);
    const camera = fx.camera;
    const away = { x: chest.x - camera.x, y: 0, z: chest.z - camera.z };
    const length = Math.hypot(away.x, away.z) || 1;
    fx.burst('holy.rim', 1, { kind: 'point', center: { x: chest.x + away.x / length * 0.5, y: chest.y, z: chest.z + away.z / length * 0.5 } });
    fx.burst('holy.aura', 1, { kind: 'point', center: addScaled(feet, UP, 1.1) }, { axisLength: 2.6 });
    fx.burst('holy.mote', 40, { kind: 'sphere', center: addScaled(feet, UP, 1), radius: 0.6, speed: [1, 3], up: 0.8 }, anchor);
    fx.burst('holy.twinkle', 16, { kind: 'sphere', center: addScaled(feet, UP, 1.1), radius: 0.7, shell: true, speed: [0.3, 1] });
  });
}
