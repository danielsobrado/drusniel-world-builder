import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat } from '../effects/groundPress.js';
import { launchProjectile } from '../effects/projectile.js';
import { addScaled, copy, distance, onGround, UP } from '../effects/vec.js';

/**
 * Magic Missile: three glowing darts peel off the hand on curving paths,
 * trailing violet ribbons, and strike the target one after another.
 */
export function magicMissile(fx, ctx) {
  const from = copy(ctx.origin);
  const target = addScaled(ctx.target, UP, distance(from, ctx.target) > 3 ? 0.9 : 0.2);
  const bends = [-1, 1, 0];
  fx.at(0, () => fx.sound('cast-arcane', from));
  bends.forEach((side, index) => {
    fx.at(index * 0.13, () => {
      const lateral = side === 0 ? 0 : side * (2 + fx.random() * 1.5);
      const lift = 1.2 + fx.random() * 2;
      let light = null;
      const dart = launchProjectile(fx, {
        from: addScaled(from, ctx.right, side * 0.15), to: target, speed: 24, path: 'curve',
        bend1: { x: ctx.right.x * lateral, y: lift, z: ctx.right.z * lateral },
        bend2: { x: ctx.right.x * lateral * 0.4, y: lift * 0.5, z: ctx.right.z * lateral * 0.4 },
        onFrame: (position, heading, dt, t, previous) => {
          if (!light) light = fx.light({ position, ramp: RAMP.ARCANE, intensity: 50, range: 9, attack: 0.3, hold: 60, decay: 10, follow: () => dart.position });
          // The head grows in over the first metres so it never blinds the caster.
          const grown = Math.min(1, distance(from, position) / 2.5);
          fx.burst('arcane.head', 1, { kind: 'point', center: position }, { sizeScale: 0.35 + 0.65 * grown });
          fx.burst('arcane.flare', 1, { kind: 'point', center: position }, { rotation: t * 9, sizeScale: 0.3 + 0.7 * grown });
          const step = distance(previous, position);
          if (step > 1e-3) {
            fx.burst('arcane.ribbon', 1, {
              kind: 'point', center: { x: (previous.x + position.x) * 0.5, y: (previous.y + position.y) * 0.5, z: (previous.z + position.z) * 0.5 },
            }, { axis: heading, axisLength: step * 1.25, rotation: 0 });
          }
          if (fx.random() < 0.7) fx.burst('arcane.mote', 1, { kind: 'sphere', center: position, radius: 0.1, speed: [0.3, 1.2] });
        },
        onArrive: (position) => {
          light?.release();
          fx.spawn('magicMissileImpact', { ...ctx, target: copy(position) });
        },
      });
    });
  });
}

export function magicMissileImpact(fx, ctx) {
  const at = ctx.target;
  fx.at(0, () => {
    fx.sound('missile-hit', at);
    fx.shake(0.1, at, 6);
    fx.burst('arcane.burst', 1, { kind: 'point', center: at });
    fx.burst('arcane.ring', 1, { kind: 'point', center: at });
    fx.burst('arcane.spark', 64, { kind: 'sphere', center: at, radius: 0.1, speed: [5, 15] });
    fx.burst('arcane.mote', 30, { kind: 'sphere', center: at, radius: 0.3, speed: [0.5, 4] });
    fx.light({ position: at, ramp: RAMP.ARCANE, intensity: 320, range: 14, attack: 0.005, hold: 0.03, decay: 9 });
    const ground = onGround(fx, at);
    if (at.y - ground.y < 1.5) {
      fx.burst('arcane.ground.ring', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) });
      fx.decal({
        x: ground.x, z: ground.z, radius: 1.1, tile: TILE.RUNE_CIRCLE, ramp: RAMP.ARCANE, tint: [0.2, 0.12, 0.3],
        emissive: 9, heat: 1, coolSeconds: 1.6, opacity: 0.7, fadeIn: 0.05, hold: 1.2, fadeOut: 1.4,
      });
    }
  });
}

/**
 * Shatter: crystal glints rush inward for a breath, then the air breaks like
 * glass — a white flash, shards and glitter flung out, and a star of cracks.
 */
export function shatter(fx, ctx) {
  const ground = onGround(fx, ctx.target, 0);
  const center = addScaled(ground, UP, 1.5);
  const crack = 0.22;
  fx.at(0, () => {
    fx.sound('shatter-charge', center);
    fx.burst('shatter.implode', 1, { kind: 'point', center });
    // Glints start on a shell and fly inward so they all arrive as it breaks.
    for (let index = 0; index < 60; index += 1) {
      const dirX = fx.random() * 2 - 1;
      const dirY = fx.random() * 2 - 1;
      const dirZ = fx.random() * 2 - 1;
      const norm = Math.hypot(dirX, dirY, dirZ) || 1;
      const radius = 3.2 + fx.random() * 0.8;
      const start = { x: center.x + dirX / norm * radius, y: center.y + dirY / norm * radius, z: center.z + dirZ / norm * radius };
      fx.burst('shatter.converge', 1, { kind: 'point', center: start, velocity: { x: -dirX / norm * radius / crack, y: -dirY / norm * radius / crack, z: -dirZ / norm * radius / crack } });
    }
  });
  blastWave(fx, ground, 7, 0.3, crack);
  holdFlat(fx, ground, 2.8, crack + 0.3, 16, 0.8, 4);
  fx.at(crack, () => {
    fx.sound('shatter', center);
    fx.shake(0.55, center, 10);
    fx.burst('shatter.flash', 1, { kind: 'point', center });
    fx.burst('bolt.flare', 1, { kind: 'point', center }, { sizeScale: 1.8 });
    fx.burst('explosion.shock.air', 2, { kind: 'point', center }, { sizeScale: 1.2 });
    fx.burst('shatter.ring', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) });
    // A sphere of crystal breaking: shards start on its shell and fly outward.
    fx.burst('shatter.crystal', 90, { kind: 'sphere', center, radius: 1.6, shell: true, speed: [6, 14], up: 0.2 });
    fx.burst('shatter.shard', 50, { kind: 'sphere', center, radius: 0.4, speed: [8, 18], up: 0.25 });
    fx.burst('shatter.glitter', 220, { kind: 'sphere', center, radius: 1.4, speed: [1, 7] });
    fx.burst('frost.mist', 24, { kind: 'sphere', center, radius: 0.8, speed: [3, 7] }, { opacityScale: 0.7, lifeScale: 0.8 });
    fx.burst('shatter.glitter', 120, { kind: 'ring', center: addScaled(ground, UP, 0.6), radius: [0.5, 2], speed: [3, 8], lift: [1, 3] });
    fx.light({ position: center, color: [0.8, 0.92, 1], intensity: 600, range: 22, attack: 0.003, hold: 0.04, decay: 10 });
    fx.decal({
      x: ground.x, z: ground.z, radius: 3.2, tile: TILE.CRACKS, ramp: RAMP.MOON, tint: [0.06, 0.06, 0.07],
      emissive: 6, heat: 1, coolSeconds: 1.2, opacity: 0.9, hold: 16, fadeOut: 8,
    });
  });
}
