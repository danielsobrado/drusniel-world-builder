import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat, markGrass } from '../effects/groundPress.js';
import { launchProjectile } from '../effects/projectile.js';
import { addScaled, copy, onGround, UP } from '../effects/vec.js';

export const CHAR = [0.035, 0.03, 0.028];

/**
 * The reference explosion: a structured flash, shockwave, fireball, sparks,
 * fragments with smoke trails, debris, a smoke column that thins and leans
 * downwind, a scorch that keeps burning, coals and smouldering wisps, and a
 * meadow left charred at the centre and singed round it.
 * `ctx.scale` scales radius, counts and light together (Meteor Swarm uses 1.8).
 */
export function fireballExplosion(fx, ctx) {
  const s = ctx.scale ?? 1;
  // Several scaled blasts side by side must not wall the sky off with smoke.
  const smoke = s ** 0.5;
  // Four meteors land within a second: their flashes must not sum to a white screen.
  const flash = { sizeScale: s, emissiveScale: 1 / Math.sqrt(s) };
  const ground = onGround(fx, ctx.target, 0);
  const center = addScaled(ground, UP, 1.3 * s);
  const big = { sizeScale: s, velocityScale: Math.sqrt(s) };
  // A scaled blast's fireball burns a little cooler, so several side by side stay orange, not white.
  const fire = { ...big, heatScale: s > 1 ? 0.82 : 1, emissiveScale: 1 / s };

  fx.at(0, () => {
    fx.burst('explosion.flash', 1, { kind: 'point', center: addScaled(center, UP, 0.4) }, flash);
    fx.burst('explosion.flare', 1, { kind: 'point', center }, flash);
    fx.burst('explosion.starburst', 1, { kind: 'point', center }, flash);
    fx.light({ position: center, ramp: RAMP.BLACKBODY, intensity: 900 * s, range: 40 * s, attack: 0.004, hold: 0.06, decay: 4 });
    fx.shake(0.7 * Math.min(1.4, s), center, 12 * s);
    fx.sound('explosion', center, { size: s });
    fx.burst('explosion.shock.ground', 1, { kind: 'point', center: addScaled(ground, UP, 0.5) }, { sizeScale: s });
    fx.burst('explosion.shock.dust', 1, { kind: 'point', center: addScaled(ground, UP, 0.55) }, { sizeScale: s, opacityScale: s > 1 ? 0.6 : 1 });
    fx.burst('explosion.shock.air', 2, { kind: 'point', center }, { sizeScale: s });
    fx.burst('explosion.core', 12, { kind: 'sphere', center, radius: 0.5 * s, speed: [2, 6] }, fire);
    fx.decal({
      x: ground.x, z: ground.z, radius: 6.5 * s, tile: TILE.SCORCH_FIRST + Math.floor(fx.random() * 4),
      ramp: RAMP.BLACKBODY, tint: CHAR, emissive: 7, heat: 1, coolSeconds: 9, opacity: 0.95, hold: 25, fadeOut: 10,
    });
  });
  fx.at(0.02, () => {
    fx.burst('explosion.fireball', Math.round(36 * Math.sqrt(s)), { kind: 'sphere', center, radius: 0.9 * s, speed: [6, 15], up: 0.25 }, fire);
    fx.burst('explosion.spark', Math.round(170 * s), { kind: 'sphere', center, radius: 0.5, speed: [10, 28], up: 0.35, hemisphere: true });
  });
  fx.at(0.04, () => {
    // The fire's own light rises with the fireball and flickers while it burns.
    const start = fx.time;
    fx.light({
      position: center, ramp: RAMP.BLACKBODY, intensity: 300 * Math.sqrt(s), range: 30 * s, attack: 0.05, hold: 0.5,
      decay: 0.9, flicker: 0.35, follow: () => addScaled(center, UP, Math.min(6, (fx.time - start) * 3) * s),
    });
  });
  fx.at(0.05, () => {
    fx.burst('explosion.fragment', Math.round(10 * s), { kind: 'sphere', center, radius: 0.5, speed: [9, 16], up: 0.9, hemisphere: true }, { velocityScale: Math.sqrt(s) });
    fx.burst('explosion.debris', Math.round(60 * s), { kind: 'sphere', center: addScaled(ground, UP, 0.3), radius: 1, speed: [5, 12], up: 1.2, hemisphere: true }, { velocityScale: Math.sqrt(s) });
    // Dust stays low and apart from the smoke; big blasts side by side must not raise a wall of it.
    fx.burst('explosion.dust.ring', Math.round(26 * Math.sqrt(s)), { kind: 'ring', center: addScaled(ground, UP, 0.6), radius: 1.5 * s, speed: [11, 16], lift: [0.2, 0.9] }, {
      sizeScale: s ** 0.7, velocityScale: Math.sqrt(s), opacityScale: s > 1 ? 0.6 : 1,
    });
  });

  blastWave(fx, ground, 10 * s, 0.3);
  holdFlat(fx, ground, 5.5 * s, 0.3, 30, 0.9, 6);
  // The meadow itself burns: charred at the heart, singed brown round it.
  markGrass(fx, ground, 9.5 * s, 'singe', 0.05, 12, { strength: 0.85, grow: 0.4, inner: 0.35 });
  markGrass(fx, ground, 5.2 * s, 'scorch', 0, 12, { grow: 0.25, inner: 0.55 });

  // Smoke column: a rising stem fed for seconds, and a cap that rolls outward.
  fx.stream('explosion.smoke', 0.2, 2.2, (t) => 18 * smoke * (1 - 0.6 * t), (t) => ({
    kind: 'sphere', center: addScaled(center, UP, (0.8 + 2.5 * t) * s), radius: 1.3 * s, speed: [0.4, 1.6], lift: 2.4 * Math.sqrt(s),
  }), { sizeScale: s, heatScale: (index, params, random) => 1.2 - random() * 0.6 });
  fx.stream('explosion.smoke.stem', 0.6, 9, (t) => 14 * smoke * (1 - 0.75 * t), {
    kind: 'disk', center: ground, radius: 1.6 * s, ground: fx.groundHeight, height: [0.4, 1.2], lift: [0.5, 1.4], spread: 0.3,
  }, { sizeScale: s });
  fx.at(0.55, () => {
    fx.burst('explosion.smoke.cap', Math.round(14 * smoke), {
      kind: 'ring', center: addScaled(center, UP, 7.5 * s), radius: 1.8 * s, speed: [3.5, 5.5], lift: [0.4, 1.2],
    }, { sizeScale: s });
  });
  fx.stream('explosion.ember', 0.1, 4.5, 32 * s, { kind: 'sphere', center: addScaled(center, UP, 1), radius: 2.5 * s, speed: [1, 4], lift: 1.5 });
  // After-burn licking over the scorch, dying down; coals and wisps outlast it.
  fx.stream('explosion.groundfire', 0.35, 8, (t) => 34 * s * (1 - t) ** 1.2, (t) => ({
    kind: 'disk', center: ground, radius: 4 * s * (1 - t * 0.45), ground: fx.groundHeight, height: 0.35,
  }));
  fx.stream('explosion.coal', 0.4, 10, (t) => 26 * s * (1 - t), {
    kind: 'disk', center: ground, radius: 4.5 * s, ground: fx.groundHeight, height: 0.3,
  });
  fx.stream('explosion.smoulder', 1.5, 16, (t) => 9 * s * (1 - t * 0.8), {
    kind: 'disk', center: ground, radius: 4 * s, ground: fx.groundHeight, height: 0.3, lift: [0.3, 0.8],
  });

  // The smoke column's sun shadow: a soft dark pool that grows as it rises.
  fx.at(0.6, () => {
    const sun = ctx.sunDirection ?? UP;
    const lean = 6 * s / Math.max(0.25, sun.y);
    fx.decal({
      x: ground.x - sun.x * lean, z: ground.z - sun.z * lean, radius: 6 * s, tile: TILE.CLOUD, ramp: RAMP.BLACKBODY,
      tint: [0, 0, 0], opacity: 0.3, fadeIn: 1.6, hold: 3.5, fadeOut: 4,
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
