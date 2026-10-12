import { RAMP, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';
import { holdFlat, markGrass } from '../effects/groundPress.js';
import { addScaled, lerpVec, onGround } from '../effects/vec.js';
import { CHAR } from './fireRecipes.js';

/**
 * How tall the wall burns at `along` metres from its centre, `time` seconds in:
 * two drifting waves, so roaring sections travel along it instead of every
 * flame reaching the same height like a fence.
 */
function wallHeight(along, time) {
  const swell = 0.5 + 0.5 * Math.sin(along * 0.55 + time * 1.3 + Math.sin(along * 1.7) * 0.8);
  const surge = 0.5 + 0.5 * Math.sin(along * 0.23 - time * 0.7 + 1.9);
  return 0.5 + 0.95 * swell * (0.45 + 0.55 * surge);
}

/** Wall of Fire: ignites from the centre outward, roars in surges, then gutters out. */
export function wallOfFire(fx, ctx) {
  const center = onGround(fx, ctx.target, 0);
  const halfLength = 9;
  const side = ctx.right;
  const endA = addScaled(center, side, -halfLength);
  const endB = addScaled(center, side, halfLength);
  const duration = 8;
  const sweep = 0.6;
  const reach = () => Math.min(1, fx.time / sweep);
  const span = (above = 0) => {
    const r = reach();
    return {
      kind: 'line', from: onGround(fx, lerpVec(center, endA, r), above), to: onGround(fx, lerpVec(center, endB, r), above),
      jitter: 0.25, lift: [0, 0.6],
    };
  };
  const along = (params) => (params.x - center.x) * side.x + (params.z - center.z) * side.z;
  const fade = (t) => (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
  const height = (params) => wallHeight(along(params), fx.time) * (0.7 + 0.3 * fade(fx.time / duration));

  fx.at(0, () => {
    fx.sound('fire-wall', center, { duration });
    fx.shake(0.18, center, 10);
  });
  // The ignition front: bursts racing toward both ends.
  fx.during(0, sweep, (t) => {
    for (const end of [endA, endB]) {
      const front = onGround(fx, lerpVec(center, end, t), 0.6);
      fx.burst('explosion.core', 2, { kind: 'sphere', center: front, radius: 0.3, speed: [1, 3] }, { sizeScale: 0.7 });
      fx.burst('explosion.spark', 6, { kind: 'sphere', center: front, radius: 0.2, speed: [4, 10], up: 0.8, hemisphere: true });
    }
  });
  let rate = 0;
  fx.during(0, duration, (t, dt) => {
    rate += 190 * fade(t) * dt;
    const whole = Math.floor(rate);
    rate -= whole;
    if (whole > 0) fx.burst('wall.flame', whole, span(), { sizeScale: (index, params) => height(params) });
  });
  fx.stream('wall.body', 0.1, duration * 0.92, 60, () => span(), { sizeScale: (index, params) => 0.8 + 0.5 * height(params) });
  fx.stream('explosion.ember', 0.2, duration, 75, () => ({ ...span(), lift: [1, 3.5] }));
  // Roaring surges: a tall gout of flame at a random point, throwing up dark smoke.
  fx.every(0.4, duration - 1, 0.32, () => {
    const at = onGround(fx, addScaled(center, side, (fx.random() * 2 - 1) * halfLength * reach() * 0.9));
    fx.burst('wall.roar', [5, 8], { kind: 'disk', center: at, radius: 0.7, ground: fx.groundHeight, height: 0.2, lift: [1, 2.5] });
    fx.burst('explosion.core', 2, { kind: 'sphere', center: addScaled(at, { x: 0, y: 1, z: 0 }, 1.4), radius: 0.4, speed: [1, 3] }, { sizeScale: 0.8 });
    fx.burst('wall.smoke', 3, { kind: 'sphere', center: addScaled(at, { x: 0, y: 1, z: 0 }, 3.2), radius: 0.6, speed: [0.3, 1], lift: [3, 4.5] });
  });
  // Steady smoke columns where the wall burns hottest.
  for (const fraction of [0.18, 0.45, 0.72, 0.9]) {
    const base = onGround(fx, lerpVec(endA, endB, fraction));
    fx.stream('wall.smoke', 0.5 + fraction * 0.3, duration * 0.95, 3.5, { kind: 'sphere', center: addScaled(base, { x: 0, y: 1, z: 0 }, 2.6), radius: 0.7, speed: [0.2, 0.8], lift: [3, 4.5] });
  }
  fx.stream('wall.smoke', 0.5, duration * 0.95, 4, () => ({ ...span(), lift: [3, 4.5] }));
  // Burnt ground after: charred along the line, singed either side.
  for (let index = -4; index <= 4; index += 1) {
    const point = addScaled(center, side, index * 2.25);
    holdFlat(fx, point, 1.8, Math.abs(index) * 0.07, duration + 6, 0.85, 4);
    markGrass(fx, point, 3.6, 'singe', Math.abs(index) * 0.07, duration + 4, { strength: 0.8, inner: 0.3 });
    markGrass(fx, point, 2, 'scorch', Math.abs(index) * 0.07 + 0.2, duration + 4, { grow: 1, inner: 0.4 });
  }
  for (let index = -3; index <= 3; index += 1) {
    const point = addScaled(center, side, index * 3);
    fx.at(Math.abs(index) * 0.09, () => fx.decal({
      x: point.x, z: point.z, radius: 2.4, tile: TILE_SPANS.scorch[0] + ((index + 3) % 4), ramp: RAMP.BLACKBODY,
      tint: CHAR, emissive: 6, heat: 1, coolSeconds: duration + 3, opacity: 0.85, hold: 24, fadeOut: 8,
    }));
  }
  // Once it gutters out the line smoulders: coals and thin wisps.
  fx.stream('explosion.coal', duration * 0.8, duration + 6, (t) => 40 * (1 - t), () => ({ ...span(0.35), lift: 0, jitter: 0.6 }));
  fx.stream('explosion.smoulder', duration * 0.85, duration + 10, (t) => 10 * (1 - t), () => ({ ...span(0.3), lift: [0.3, 0.8], jitter: 0.6 }));
  fx.at(0.05, () => {
    for (const fraction of [0.25, 0.75]) {
      const at = onGround(fx, lerpVec(endA, endB, fraction), 1.6);
      fx.light({ position: at, ramp: RAMP.BLACKBODY, intensity: 220, range: 22, attack: 0.4, hold: duration - 1.4, decay: 1.6, flicker: 0.45 });
    }
  });
}
