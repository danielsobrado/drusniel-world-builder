import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { holdFlat, markGrass } from '../effects/groundPress.js';
import { addScaled, copy, onGround, UP } from '../effects/vec.js';
import { strike } from './stormRecipes.js';

const CONE_HALF_ANGLE = 0.46;
const CONE_LENGTH_M = 16;

/**
 * Cone of Cold: a 60-ft blast of freezing mist from the hand — thin blue-white
 * vapour, glittering crystals and shards that stick where they land, a fan of
 * rime over frosted grass, ice crystals left standing, and cold air that pools
 * low and clears within a few seconds.
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
  fx.stream('frost.mist', 0, duration, 110, cone([14, 23], CONE_HALF_ANGLE, [1.6, 2.6]));
  fx.stream('frost.streak', 0, duration, 240, cone([18, 30], CONE_HALF_ANGLE * 0.85));
  fx.stream('frost.glint', 0, duration, 150, cone([15, 27], CONE_HALF_ANGLE * 0.9));
  fx.stream('frost.flake', 0, duration * 1.1, 80, cone([10, 20]));
  fx.stream('frost.shard', 0.05, duration, 46, cone([16, 27], CONE_HALF_ANGLE * 0.8));
  fx.stream('frost.hand', 0, duration, 60, { kind: 'point', center: origin });
  fx.at(0, () => {
    const handLight = fx.light({ position: origin, color: [0.55, 0.8, 1], intensity: 90, range: 20, attack: 0.3, hold: duration - 0.1, decay: 3, flicker: 0.15 });
    const start = fx.time;
    fx.during(0, duration, () => {
      const travel = Math.min(1, (fx.time - start) / duration) * CONE_LENGTH_M * 0.45;
      const at = addScaled(origin, aim, travel);
      handLight.setPosition(at.x, at.y + 1.2, at.z);
    });
  });
  // A fan of rime spreading along the ground under the cone, frosting the grass.
  const flat = { x: aim.x, y: 0, z: aim.z };
  const flatLength = Math.hypot(flat.x, flat.z) || 1;
  flat.x /= flatLength;
  flat.z /= flatLength;
  const fanPoint = (along, across) => ({
    x: ctx.caster.x + flat.x * along - flat.z * across,
    y: 0,
    z: ctx.caster.z + flat.z * along + flat.x * across,
  });
  [3, 6.5, 10, 13.5].forEach((distance, index) => {
    const at = addScaled(ctx.caster, flat, distance);
    const width = 1 + distance * Math.tan(CONE_HALF_ANGLE) * 0.85;
    holdFlat(fx, at, width * 0.8, 0.1 + index * 0.1, 14, 0.6, 4);
    markGrass(fx, at, width * 1.1, 'frost', 0.08 + index * 0.1, 6, { grow: 0.35, inner: 0.35 });
    fx.at(0.12 + index * 0.12, () => {
      fx.decal({
        x: at.x, z: at.z, radius: 1.2 + distance * Math.tan(CONE_HALF_ANGLE) * 0.9, tile: TILE.FROST_DECAL, ramp: RAMP.FROST,
        tint: [0.78, 0.86, 0.95], emissive: 3, heat: 1, coolSeconds: 3, opacity: 0.85, fadeIn: 0.35, hold: 14, fadeOut: 7,
      });
    });
  });
  // Ice crystals growing out of the frosted ground in the cone's wake.
  fx.at(0.35, () => {
    for (let index = 0; index < 26; index += 1) {
      const along = 2.5 + fx.random() * (CONE_LENGTH_M - 4);
      const across = (fx.random() * 2 - 1) * along * Math.tan(CONE_HALF_ANGLE) * 0.75;
      const size = 0.45 + fx.random() * 0.7;
      fx.at(0.35 + along * 0.03, () => {
        fx.burst('frost.spike', 1, { kind: 'point', center: onGround(fx, fanPoint(along, across), size * 0.45) }, { sizeScale: size, axis: UP });
      });
    }
  });
  fx.every(0.9, 7, 0.12, () => {
    const along = 2.5 + fx.random() * (CONE_LENGTH_M - 4);
    const across = (fx.random() * 2 - 1) * along * Math.tan(CONE_HALF_ANGLE) * 0.75;
    fx.burst('frost.glint', 1, { kind: 'point', center: onGround(fx, fanPoint(along, across), 0.5) }, { sizeScale: 1.6 });
  });
  // Cold air pooling low, thinning out within a few seconds.
  fx.at(0.5, () => {
    for (let index = 0; index < 22; index += 1) {
      const along = 2 + fx.random() * (CONE_LENGTH_M - 3);
      const across = (fx.random() * 2 - 1) * along * Math.tan(CONE_HALF_ANGLE) * 0.8;
      fx.burst('frost.fog', 1, { kind: 'point', center: onGround(fx, fanPoint(along, across), 0.35), spread: 0.3 });
    }
  });
}

/**
 * Ice Storm: a dark storm deck churns over a 20-ft radius, lit from inside by
 * lightning, trailing veils of sleet, then hammers the ground with hail that
 * bursts into spray and chips; ice builds up among frosted grass.
 */
export function iceStorm(fx, ctx) {
  const ground = onGround(fx, ctx.target, 0);
  const radius = 6.5;
  const cloudHeight = 10;
  const cloud = addScaled(ground, UP, cloudHeight);
  const duration = 3.6;
  const inCloud = (spread) => {
    const angle = fx.random() * Math.PI * 2;
    const reach = Math.sqrt(fx.random()) * radius * spread;
    return { x: cloud.x + Math.cos(angle) * reach, y: cloud.y - 0.6 + fx.random() * 1.2, z: cloud.z + Math.sin(angle) * reach };
  };

  fx.at(0, () => {
    fx.sound('hail', ground, { duration });
    fx.burst('ice.cloud', 36, { kind: 'disk', center: cloud, radius: radius * 1.35, height: [-0.8, 1.2], spread: 0.3 }, { anchor: cloud });
    fx.light({ position: addScaled(ground, UP, cloudHeight - 4), color: [0.55, 0.72, 1], intensity: 160, range: 28, attack: 0.6, hold: duration - 1, decay: 2 });
  });
  fx.stream('ice.cloud', 0.3, duration - 0.6, 9, { kind: 'disk', center: cloud, radius: radius * 1.1, height: [-0.5, 0.8] }, { anchor: cloud, lifeScale: 0.75 });
  // Lightning crawling through the deck, lighting it from inside.
  fx.every(0.3, duration - 0.3, 0.2, (index) => {
    if (fx.random() < 0.25) return;
    const a = inCloud(0.8);
    const b = inCloud(0.8);
    strike(fx, a, b, { forks: 2, depth: 4, glow: 0.7, coreScale: 0.55 });
    fx.burst('ice.cloud.glow', 1, { kind: 'point', center: lerpMid(a, b) });
    fx.light({ position: lerpMid(a, b), color: [0.7, 0.8, 1], intensity: 300, range: 34, attack: 0.01, hold: 0.04, decay: 18 });
    // Now and then one finds the ground.
    if (index % 6 === 3) {
      const target = onGround(fx, { x: a.x + (fx.random() - 0.5) * 4, y: 0, z: a.z + (fx.random() - 0.5) * 4 });
      strike(fx, a, target, { forks: 3, depth: 5, coreScale: 0.7, halo: 0.6 });
      fx.burst('bolt.spark', 20, { kind: 'sphere', center: target, radius: 0.2, speed: [3, 9], up: 0.6, hemisphere: true });
    }
  });
  // Veils of sleet hanging under the deck.
  fx.stream('ice.veil', 0.3, duration - 0.6, 7, {
    kind: 'disk', center: addScaled(ground, UP, cloudHeight * 0.5), radius: radius * 0.85, height: [-0.5, 0.5],
  }, { axisLength: cloudHeight * 0.9 });
  fx.stream('ice.hail', 0.45, duration - 0.3, 230, {
    kind: 'disk', center: addScaled(ground, UP, cloudHeight - 1.5), radius, height: [-0.5, 0.5], spread: 1.4, lift: [-30, -24],
  });
  // Bigger stones that land, stick and pile up glinting among the grass.
  fx.stream('ice.stone', 0.6, duration - 0.2, 70, {
    kind: 'disk', center: addScaled(ground, UP, cloudHeight - 1.5), radius: radius * 0.9, height: [-0.5, 0.5], spread: 1, lift: [-26, -20],
  });
  fx.every(0.5, duration - 0.3, 0.3, () => fx.shake(0.07, ground, 12));
  holdFlat(fx, ground, radius * 1.05, 0.6, duration + 12, 0.75, 4);
  // The ground whitens as the hail piles up.
  markGrass(fx, ground, radius * 1.15, 'frost', 0.6, duration + 4, { grow: duration - 0.8, inner: 0.5 });
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
    fx.burst('frost.fog', 26, { kind: 'disk', center: ground, radius: radius * 1.1, ground: fx.groundHeight, height: [0.3, 0.7], outward: [0.2, 0.8] });
  });
}

function lerpMid(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}
