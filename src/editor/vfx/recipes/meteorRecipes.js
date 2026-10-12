import { RAMP } from '../atlas/ParticleAtlasLayout.js';
import { launchProjectile } from '../effects/projectile.js';
import { addScaled, copy, onGround, UP } from '../effects/vec.js';

const STREAK_LENGTH_M = 16;

/**
 * Meteor Swarm: four burning rocks fall out of the sky, staggered, each
 * dragging a long streak of fire and a smoke trail across the sky, and land
 * as scaled-up reference explosions.
 */
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
          // The streak: one long axial sprite of fire hanging behind the rock.
          fx.burst('meteor.streak', 1, { kind: 'point', center: addScaled(position, heading, -STREAK_LENGTH_M * 0.45) }, {
            axis: heading, axisLength: STREAK_LENGTH_M, rotation: 0,
          });
          const behind = { x: -heading.x * 6, y: -heading.y * 6, z: -heading.z * 6 };
          fx.burst('meteor.trail', 4, { kind: 'sphere', center: position, radius: 0.6, speed: [0.5, 2.5] }, { addVelocity: behind });
          fx.burst('meteor.smoke', 2, { kind: 'sphere', center: addScaled(position, heading, -3), radius: 0.8, speed: [0.3, 1.2] });
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
