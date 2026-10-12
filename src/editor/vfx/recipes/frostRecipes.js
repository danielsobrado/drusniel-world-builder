import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat } from '../effects/groundPress.js';
import { addScaled, copy, onGround, UP } from '../effects/vec.js';

const CONE_HALF_ANGLE = 0.46;
const CONE_LENGTH_M = 16;

/**
 * Cone of Cold: a 60-ft blast of freezing mist from the hand — billowing frost
 * clouds, glittering ice crystals and shards that stick where they land, a
 * fan of rime on the ground and a cold fog that lingers low.
 */
export function coneOfCold(fx, ctx) {
  const origin = copy(ctx.origin);
  const aim = { ...ctx.direction };
  // Keep the cone from burying itself: aim no lower than slightly down.
  if (aim.y < -0.25) {
    aim.y = -0.25;
    const length = Math.hypot(aim.x, aim.y, aim.z);
    aim.x /= length; aim.y /= length; aim.z /= length;
  }
  const cone = (speed, angle = CONE_HALF_ANGLE, offset = [0.6, 1.4]) => ({ kind: 'cone', origin, direction: aim, angle, speed, offset });
  const duration = 0.95;

  fx.at(0, () => {
    fx.sound('frost', origin, { duration });
    fx.shake(0.15, origin, 6);
  });
  fx.stream('frost.mist', 0, duration, 120, cone([14, 23], CONE_HALF_ANGLE, [1.2, 2.4]));
  fx.stream('frost.streak', 0, duration, 220, cone([18, 30], CONE_HALF_ANGLE * 0.85));
  fx.stream('frost.glint', 0, duration, 130, cone([15, 27], CONE_HALF_ANGLE * 0.9));
  fx.stream('frost.flake', 0, duration * 1.1, 70, cone([10, 20]));
  fx.stream('frost.shard', 0.05, duration, 42, cone([16, 27], CONE_HALF_ANGLE * 0.8));
  fx.stream('frost.hand', 0, duration, 60, { kind: 'point', center: origin });
  fx.at(0, () => {
    const handLight = fx.light({ position: origin, color: [0.55, 0.8, 1], intensity: 70, range: 20, attack: 0.3, hold: duration - 0.1, decay: 6, flicker: 0.15 });
    const start = fx.time;
    fx.during(0, duration, () => {
      const travel = Math.min(1, (fx.time - start) / duration) * CONE_LENGTH_M * 0.45;
      const at = addScaled(origin, aim, travel);
      handLight.setPosition(at.x, at.y + 1.2, at.z);
    });
  });
  // A fan of rime spreading along the ground under the cone.
  const flat = { x: aim.x, y: 0, z: aim.z };
  const flatLength = Math.hypot(flat.x, flat.z) || 1;
  flat.x /= flatLength;
  flat.z /= flatLength;
  [3, 6.5, 10, 13.5].forEach((distance, index) => {
    holdFlat(fx, addScaled(ctx.caster, flat, distance), 1 + distance * Math.tan(CONE_HALF_ANGLE) * 0.8, 0.1 + index * 0.1, 14, 0.7, 4);
    fx.at(0.12 + index * 0.12, () => {
      const at = addScaled(ctx.caster, flat, distance);
      fx.decal({
        x: at.x, z: at.z, radius: 1.2 + distance * Math.tan(CONE_HALF_ANGLE) * 0.9, tile: TILE.FROST_DECAL, ramp: RAMP.FROST,
        tint: [0.78, 0.86, 0.95], emissive: 3, heat: 1, coolSeconds: 3, opacity: 0.85, fadeIn: 0.35, hold: 14, fadeOut: 7,
      });
    });
  });
  fx.at(0.55, () => {
    for (let index = 0; index < 34; index += 1) {
      const along = 2 + fx.random() * (CONE_LENGTH_M - 3);
      const spread = (fx.random() * 2 - 1) * along * Math.tan(CONE_HALF_ANGLE) * 0.8;
      const point = {
        x: ctx.caster.x + flat.x * along - flat.z * spread,
        y: 0,
        z: ctx.caster.z + flat.z * along + flat.x * spread,
      };
      fx.burst('frost.fog', 1, { kind: 'point', center: onGround(fx, point, 0.6), spread: 0.4 });
    }
  });
}

/**
 * Ice Storm: a churning storm deck gathers over a 20-ft radius, flickering
 * with inner light and trailing veils of sleet, then hammers the ground with
 * hail that bursts into spray and chips, frosting the earth.
 */
export function iceStorm(fx, ctx) {
  const ground = onGround(fx, ctx.target, 0);
  const radius = 6.5;
  const cloudHeight = 10;
  const cloud = addScaled(ground, UP, cloudHeight);
  const duration = 3.6;

  fx.at(0, () => {
    fx.sound('hail', ground, { duration });
    fx.burst('ice.cloud', 30, { kind: 'disk', center: cloud, radius: radius * 1.1, height: [-0.8, 1], spread: 0.3 }, { anchor: cloud });
    fx.light({ position: addScaled(ground, UP, cloudHeight - 4), color: [0.55, 0.72, 1], intensity: 160, range: 28, attack: 0.6, hold: duration - 1, decay: 2 });
  });
  fx.stream('ice.cloud', 0.3, duration - 0.6, 8, { kind: 'disk', center: cloud, radius: radius, height: [-0.5, 0.7] }, { anchor: cloud, lifeScale: 0.75 });
  // Lightning flicker inside the deck.
  fx.every(0.35, duration - 0.4, 0.22, () => {
    if (fx.random() < 0.3) return;
    const angle = fx.random() * Math.PI * 2;
    const inside = { x: cloud.x + Math.cos(angle) * radius * 0.6, y: cloud.y - 1, z: cloud.z + Math.sin(angle) * radius * 0.6 };
    fx.burst('ice.cloud.glow', 1, { kind: 'point', center: inside });
    fx.light({ position: inside, color: [0.7, 0.8, 1], intensity: 260, range: 34, attack: 0.01, hold: 0.04, decay: 18 });
  });
  // Veils of sleet hanging under the deck.
  fx.stream('ice.veil', 0.3, duration - 0.6, 6, {
    kind: 'disk', center: addScaled(ground, UP, cloudHeight * 0.5), radius: radius * 0.8, height: [-0.5, 0.5],
  }, { axisLength: cloudHeight * 0.9 });
  fx.stream('ice.hail', 0.45, duration - 0.3, 190, {
    kind: 'disk', center: addScaled(ground, UP, cloudHeight - 1.5), radius, height: [-0.5, 0.5], spread: 1.4, lift: [-30, -24],
  });
  // Bigger stones that land, stick and glint among the grass.
  fx.stream('ice.stone', 0.6, duration - 0.4, 26, {
    kind: 'disk', center: addScaled(ground, UP, cloudHeight - 1.5), radius: radius * 0.9, height: [-0.5, 0.5], spread: 1, lift: [-26, -20],
  });
  fx.every(0.5, duration - 0.3, 0.3, () => fx.shake(0.07, ground, 12));
  holdFlat(fx, ground, radius * 1.05, 0.6, duration + 12, 0.75, 4);
  for (let index = 0; index < 7; index += 1) {
    fx.at(0.6 + index * 0.35, () => {
      const angle = fx.random() * Math.PI * 2;
      const distance = Math.sqrt(fx.random()) * radius * 0.85;
      fx.decal({
        x: ground.x + Math.cos(angle) * distance, z: ground.z + Math.sin(angle) * distance, radius: 2.4 + fx.random() * 1.4,
        tile: TILE.FROST_DECAL, ramp: RAMP.FROST, tint: [0.82, 0.88, 0.96], emissive: 2, heat: 1, coolSeconds: 2,
        opacity: 0.85, fadeIn: 0.5, hold: 14, fadeOut: 7,
      });
    });
  }
  fx.at(duration - 0.9, () => {
    fx.burst('frost.fog', 34, { kind: 'disk', center: ground, radius: radius * 1.1, ground: fx.groundHeight, height: [0.4, 1.1], outward: [0.2, 0.8] });
  });
}
