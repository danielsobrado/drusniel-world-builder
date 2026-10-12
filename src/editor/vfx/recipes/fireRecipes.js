import { RAMP, TILE, TILE_SPANS } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat } from '../effects/groundPress.js';
import { launchProjectile } from '../effects/projectile.js';
import { addScaled, copy, lerpVec, onGround, UP } from '../effects/vec.js';

const CHAR = [0.035, 0.03, 0.028];

/**
 * The reference explosion: flash, shockwave, fireball, sparks, fragments with
 * smoke trails, debris, smoke column with its light, scorch and after-burn.
 * `ctx.scale` scales radius, counts and light together (Meteor Swarm uses 1.5).
 */
export function fireballExplosion(fx, ctx) {
  const s = ctx.scale ?? 1;
  const ground = onGround(fx, ctx.target, 0);
  const center = addScaled(ground, UP, 1.3 * s);
  const big = { sizeScale: s, velocityScale: Math.sqrt(s) };

  fx.at(0, () => {
    fx.burst('explosion.flash', 1, { kind: 'point', center: addScaled(center, UP, 0.4) }, { sizeScale: s });
    fx.burst('explosion.flare', 1, { kind: 'point', center }, { sizeScale: s });
    fx.light({ position: center, ramp: RAMP.BLACKBODY, intensity: 900 * s, range: 40 * s, attack: 0.004, hold: 0.04, decay: 5 });
    fx.shake(0.7 * Math.min(1.4, s), center, 12 * s);
    fx.sound('explosion', center, { size: s });
    fx.burst('explosion.shock.ground', 1, { kind: 'point', center: addScaled(ground, UP, 0.5) }, { sizeScale: s });
    fx.burst('explosion.shock.dust', 1, { kind: 'point', center: addScaled(ground, UP, 0.55) }, { sizeScale: s });
    fx.burst('explosion.shock.air', 2, { kind: 'point', center }, { sizeScale: s });
    fx.burst('explosion.core', 10, { kind: 'sphere', center, radius: 0.4 * s, speed: [2, 6] }, big);
    fx.decal({
      x: ground.x, z: ground.z, radius: 6.5 * s, tile: TILE.SCORCH_FIRST + Math.floor(fx.random() * 4),
      ramp: RAMP.BLACKBODY, tint: CHAR, emissive: 7, heat: 1, coolSeconds: 7, opacity: 0.95, hold: 25, fadeOut: 10,
    });
  });
  fx.at(0.02, () => {
    fx.burst('explosion.fireball', Math.round(28 * s), { kind: 'sphere', center, radius: 0.8 * s, speed: [5, 13], up: 0.25 }, big);
    fx.burst('explosion.spark', Math.round(170 * s), { kind: 'sphere', center, radius: 0.5, speed: [10, 28], up: 0.35, hemisphere: true });
  });
  fx.at(0.04, () => {
    // The fire's own light rises with the fireball and flickers while it burns.
    const start = fx.time;
    fx.light({
      position: center, ramp: RAMP.BLACKBODY, intensity: 260 * s, range: 30 * s, attack: 0.05, hold: 0.35,
      decay: 1.1, flicker: 0.35, follow: () => addScaled(center, UP, Math.min(6, (fx.time - start) * 3) * s),
    });
  });
  fx.at(0.05, () => {
    fx.burst('explosion.fragment', Math.round(10 * s), { kind: 'sphere', center, radius: 0.5, speed: [9, 16], up: 0.9, hemisphere: true }, { velocityScale: Math.sqrt(s) });
    fx.burst('explosion.debris', Math.round(60 * s), { kind: 'sphere', center: addScaled(ground, UP, 0.3), radius: 1, speed: [5, 12], up: 1.2, hemisphere: true }, { velocityScale: Math.sqrt(s) });
    fx.burst('explosion.dust.ring', Math.round(26 * s), { kind: 'ring', center: addScaled(ground, UP, 0.6), radius: 1.5 * s, speed: [11, 16], lift: [0.4, 1.4] }, big);
  });

  blastWave(fx, ground, 10 * s, 0.3);
  holdFlat(fx, ground, 5.5 * s, 0.3, 30, 0.9, 6);

  // 7. Smoke column: a rising stem, then a cap that rolls outward.
  fx.stream('explosion.smoke', 0.2, 2.2, (t) => 18 * s * (1 - 0.6 * t), (t) => ({
    kind: 'sphere', center: addScaled(center, UP, (0.8 + 2.5 * t) * s), radius: 1.3 * s, speed: [0.4, 1.6], lift: 2.4 * Math.sqrt(s),
  }), { sizeScale: s, heatScale: (index, params, random) => 1.2 - random() * 0.6 });
  fx.stream('explosion.smoke.stem', 0.8, 6.5, (t) => 15 * s * (1 - 0.6 * t), {
    kind: 'disk', center: ground, radius: 1.6 * s, ground: fx.groundHeight, height: [0.4, 1.2], lift: [0.4, 1.2], spread: 0.3,
  }, { sizeScale: s });
  fx.at(0.55, () => {
    fx.burst('explosion.smoke.cap', Math.round(14 * s), {
      kind: 'ring', center: addScaled(center, UP, 7.5 * s), radius: 1.8 * s, speed: [2.5, 4], lift: [0.4, 1.2],
    }, { sizeScale: s });
  });
  fx.stream('explosion.ember', 0.1, 3.5, 32 * s, { kind: 'sphere', center: addScaled(center, UP, 1), radius: 2.5 * s, speed: [1, 4], lift: 1.5 });
  // After-burn licking over the scorch, dying down.
  fx.stream('explosion.groundfire', 0.35, 5, (t) => 30 * s * (1 - t) ** 1.5, (t) => ({
    kind: 'disk', center: ground, radius: 4 * s * (1 - t * 0.4), ground: fx.groundHeight, height: 0.35,
  }));

  // The smoke column's sun shadow: a soft dark pool that grows as it rises.
  fx.at(0.6, () => {
    const sun = ctx.sunDirection ?? UP;
    const lean = 6 * s / Math.max(0.25, sun.y);
    fx.decal({
      x: ground.x - sun.x * lean, z: ground.z - sun.z * lean, radius: 6 * s, tile: TILE.CLOUD, ramp: RAMP.BLACKBODY,
      tint: [0, 0, 0], opacity: 0.32, fadeIn: 1.6, hold: 3.5, fadeOut: 4,
    });
  });
}

/** Fireball: a roaring projectile that bursts into the reference explosion. */
export function fireball(fx, ctx) {
  const from = copy(ctx.origin);
  const to = copy(ctx.target);
  let light = null;
  fx.at(0, () => {
    fx.sound('cast-fire', from);
    fx.burst('explosion.core', 4, { kind: 'sphere', center: from, radius: 0.1, speed: [0.5, 1.5] }, { sizeScale: 0.3 });
  });
  const flight = launchProjectile(fx, {
    from, to, speed: 30, path: 'arc', arc: 0.05,
    onFrame: (position, heading) => {
      if (!light) light = fx.light({ position, ramp: RAMP.BLACKBODY, intensity: 90, range: 14, attack: 0.35, hold: 60, decay: 8, flicker: 0.3, follow: () => flight.position });
      fx.burst('fire.head', 1, { kind: 'point', center: position });
      fx.burst('fire.head.puff', 3, { kind: 'sphere', center: position, radius: 0.15, speed: [0.5, 2] }, { addVelocity: { x: -heading.x * 4, y: -heading.y * 4, z: -heading.z * 4 } });
      // No smoke in the caster's face: the trail starts a few metres out.
      if (Math.hypot(position.x - from.x, position.y - from.y, position.z - from.z) > 3) {
        fx.burst('fire.trail.smoke', 1, { kind: 'sphere', center: position, radius: 0.2, speed: [0.2, 0.6] });
      }
      if (fx.random() < 0.6) fx.burst('explosion.ember', 1, { kind: 'sphere', center: position, radius: 0.2, speed: [1, 3] });
    },
    onArrive: (position) => {
      light?.release();
      fx.spawn('fireballExplosion', { ...ctx, target: copy(position) });
    },
  });
}

/** Wall of Fire: ignites from the centre outward, roars, then gutters out. */
export function wallOfFire(fx, ctx) {
  const center = onGround(fx, ctx.target, 0);
  const halfLength = 9;
  const side = ctx.right;
  const endA = addScaled(center, side, -halfLength);
  const endB = addScaled(center, side, halfLength);
  const duration = 8;
  const sweep = 0.6;
  const reach = () => Math.min(1, fx.time / sweep);
  const span = () => {
    const r = reach();
    return { kind: 'line', from: onGround(fx, lerpVec(center, endA, r)), to: onGround(fx, lerpVec(center, endB, r)), jitter: 0.25, lift: [0, 0.6] };
  };

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
  const fade = (t) => (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
  let rate = 0;
  fx.during(0, duration, (t, dt) => {
    rate += 170 * fade(t) * dt;
    const whole = Math.floor(rate);
    rate -= whole;
    if (whole > 0) fx.burst('wall.flame', whole, span(), { sizeScale: 0.7 + 0.3 * fade(t) });
  });
  fx.stream('wall.body', 0.1, duration * 0.92, 60, () => span(), { sizeScale: 1.2 });
  fx.stream('explosion.ember', 0.2, duration, 40, () => ({ ...span(), lift: [1, 3] }));
  fx.stream('wall.smoke', 0.5, duration * 0.95, 7, () => ({ ...span(), lift: [3, 4.5] }));
  for (let index = -4; index <= 4; index += 1) {
    const point = addScaled(center, side, index * 2.25);
    holdFlat(fx, point, 1.8, Math.abs(index) * 0.07, duration + 6, 0.85, 4);
  }
  for (let index = -3; index <= 3; index += 1) {
    const point = addScaled(center, side, index * 3);
    fx.at(Math.abs(index) * 0.09, () => fx.decal({
      x: point.x, z: point.z, radius: 2.4, tile: TILE_SPANS.scorch[0] + ((index + 3) % 4), ramp: RAMP.BLACKBODY,
      tint: CHAR, emissive: 6, heat: 1, coolSeconds: duration + 2, opacity: 0.85, hold: 20, fadeOut: 8,
    }));
  }
  fx.at(0.05, () => {
    for (const fraction of [0.25, 0.75]) {
      const at = onGround(fx, lerpVec(endA, endB, fraction), 1.6);
      fx.light({ position: at, ramp: RAMP.BLACKBODY, intensity: 200, range: 22, attack: 0.4, hold: duration - 1.4, decay: 1.6, flicker: 0.45 });
    }
  });
}

/** Meteor Swarm: four burning rocks fall out of the sky, staggered. */
export function meteorSwarm(fx, ctx) {
  const center = onGround(fx, ctx.target, 0);
  const back = { x: -ctx.forward.x, y: 0, z: -ctx.forward.z };
  const offsets = [[0, 0], [7, 5], [-6, 8], [3, -7]];
  fx.at(0, () => fx.sound('cast-meteor', ctx.origin));
  offsets.forEach(([dx, dz], index) => {
    fx.at(index * 0.38, () => {
      const impact = onGround(fx, { x: center.x + ctx.right.x * dx + back.x * dz, y: 0, z: center.z + ctx.right.z * dx + back.z * dz });
      const from = addScaled(addScaled(impact, back, 45), UP, 75);
      let light = null;
      const flight = launchProjectile(fx, {
        from, to: impact, speed: 62, collide: false,
        onFrame: (position, heading) => {
          if (!light) light = fx.light({ position, ramp: RAMP.BLACKBODY, intensity: 220, range: 40, attack: 0.1, hold: 60, decay: 6, flicker: 0.2, follow: () => flight.position });
          fx.burst('meteor.halo', 1, { kind: 'point', center: position });
          fx.burst('meteor.rock', 1, { kind: 'point', center: position });
          fx.burst('meteor.trail', 4, { kind: 'sphere', center: position, radius: 0.6, speed: [0.5, 2.5] }, { addVelocity: { x: -heading.x * 6, y: -heading.y * 6, z: -heading.z * 6 } });
          fx.burst('explosion.ember', 3, { kind: 'sphere', center: position, radius: 0.8, speed: [2, 6] });
        },
        onArrive: (position) => {
          light?.release();
          fx.spawn('fireballExplosion', { ...ctx, target: copy(position), scale: 1.8 });
          fx.shake(0.5, position, 25);
        },
      });
    });
  });
}
