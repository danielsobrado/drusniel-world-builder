import { RAMP } from '../atlas/ParticleAtlasLayout.js';
import { addScaled, onGround, UP } from '../effects/vec.js';

/**
 * Swamp gas catching on a bog island: a knee-high tongue of flame that swells,
 * gutters and goes out over `ctx.duration` seconds, a few embers lifting off it
 * and a flickering virtual light that the terrain and meadow pick up through
 * the world light, and the water through its reflection. Played by BogVents.
 */
export function bogGasFlame(fx, ctx) {
  const duration = ctx.duration ?? 6;
  const ground = onGround(fx, ctx.target, 0);
  // Catches quickly, burns, dies back over its last third.
  const strength = (t) => Math.max(0, Math.min(1, t * 6, (1 - t) * 3));
  const vent = { kind: 'disk', center: ground, radius: 0.22, ground: fx.groundHeight, height: [0, 0.12], spread: 0.12 };

  fx.at(0, () => {
    fx.light({
      position: addScaled(ground, UP, 0.9), ramp: RAMP.BLACKBODY, intensity: 110, range: 13,
      attack: 0.4, hold: Math.max(0.5, duration - 1.6), decay: 1.1, flicker: 0.45,
    });
  });
  fx.stream('wall.flame', 0, duration, (t) => 16 * strength(t), { ...vent, lift: [0.7, 1.6] }, { sizeScale: 0.6 });
  fx.stream('wall.body', 0.1, duration, (t) => 5 * strength(t), { ...vent, radius: 0.3, lift: [0.4, 1] }, { sizeScale: 0.5 });
  fx.stream('explosion.ember', 0.3, duration, (t) => 4 * strength(t), {
    ...vent, height: [0.4, 1], lift: [1, 2.4], spread: 0.3,
  });
}
