import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat } from '../effects/groundPress.js';
import { launchProjectile } from '../effects/projectile.js';
import { addScaled, copy, onGround, UP } from '../effects/vec.js';

/**
 * Acid Splash: a glossy globule arcs to the target and bursts into a crown of
 * droplets that hiss where they land, leaving a bubbling, fuming puddle.
 */
export function acidSplash(fx, ctx) {
  const from = copy(ctx.origin);
  fx.at(0, () => fx.sound('cast-acid', from));
  let light = null;
  const blob = launchProjectile(fx, {
    from, to: copy(ctx.target), speed: 19, path: 'arc', arc: 0.14,
    onFrame: (position) => {
      if (!light) light = fx.light({ position, ramp: RAMP.ACID, intensity: 40, range: 8, attack: 0.3, hold: 60, decay: 8, follow: () => blob.position });
      fx.burst('acid.blob', 1, { kind: 'point', center: position });
      fx.burst('acid.glow', 1, { kind: 'point', center: position });
      if (fx.random() < 0.5) fx.burst('acid.drop', 1, { kind: 'sphere', center: position, radius: 0.15, speed: [0.2, 1] }, { sizeScale: 0.6 });
    },
    onArrive: (position) => {
      light?.release();
      fx.spawn('acidSplashImpact', { ...ctx, target: copy(position) });
    },
  });
}

export function acidSplashImpact(fx, ctx) {
  const ground = onGround(fx, ctx.target, 0);
  const duration = 6;
  fx.at(0, () => {
    fx.sound('acid', ground, { duration });
    fx.shake(0.12, ground, 8);
    fx.burst('acid.flash', 1, { kind: 'point', center: addScaled(ground, UP, 0.8) }, { sizeScale: 1.6 });
    fx.burst('acid.drop', 160, { kind: 'sphere', center: addScaled(ground, UP, 0.4), radius: 0.4, speed: [5, 11], up: 1.1, hemisphere: true });
    // The crown: a tall ring of fat droplets thrown up and out, readable at range.
    fx.burst('acid.drop', 70, { kind: 'ring', center: addScaled(ground, UP, 0.3), radius: 0.7, speed: [2.5, 5], lift: [5, 8] }, { sizeScale: 2.2 });
    fx.burst('acid.sizzle', 26, { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: 0.45, lift: [0.6, 1.4] }, { sizeScale: 2 });
    fx.burst('acid.puddle.glow', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) });
    fx.decal({
      x: ground.x, z: ground.z, radius: 3.2, tile: TILE.ACID_SPLAT, ramp: RAMP.ACID, tint: [0.12, 0.28, 0.02],
      emissive: 8, heat: 1, coolSeconds: duration + 2, opacity: 0.95, fadeIn: 0.08, hold: 14, fadeOut: 6,
    });
    fx.light({ position: addScaled(ground, UP, 1), ramp: RAMP.ACID, intensity: 260, range: 14, attack: 0.02, hold: 0.4, decay: 0.7, flicker: 0.25 });
  });
  blastWave(fx, ground, 4.5, 0.25);
  holdFlat(fx, ground, 3, 0.25, duration + 10, 0.9, 4);
  // A corrosive plume: thick green fumes climbing well above the grass.
  fx.stream('acid.fume', 0.1, duration, (t) => 34 * (1 - t * 0.8), { kind: 'disk', center: ground, radius: 2.4, ground: fx.groundHeight, height: 0.4, lift: [0.6, 1.6] }, { sizeScale: 1.5 });
  // Bubbles sit at grass height so they read over a meadow as well as on bare ground.
  fx.stream('acid.bubble', 0.2, duration, (t) => 46 * (1 - t * 0.7), { kind: 'disk', center: ground, radius: 2.4, ground: fx.groundHeight, height: [0.1, 0.5] }, { sizeScale: 1.8 });
  fx.stream('acid.drop', 0.3, duration * 0.6, (t) => 20 * (1 - t), { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: 0.4, lift: [2, 4], spread: 0.6 });
}

function conjuredCloud(fx, ctx, { puff, extras, sound, duration = 11 }) {
  const ground = onGround(fx, ctx.target, 0);
  const center = addScaled(ground, UP, 2.2);
  const radius = 6;
  fx.at(0, () => {
    fx.sound(sound, center, { duration });
    fx.burst(puff, 48, { kind: 'sphere', center, radius: 1.5, speed: [3, 9], up: 0.15 });
    fx.burst(puff, 22, { kind: 'ring', center: addScaled(ground, UP, 0.9), radius: 1, speed: [5, 10], lift: [0, 0.6] });
  });
  // Keep the cloud full, puffs drifting in from its volume.
  fx.stream(puff, 1.2, duration - 5, 7, { kind: 'disk', center: ground, radius: radius * 0.85, ground: fx.groundHeight, height: [0.8, 3.6], spread: 0.3 }, { anchor: center });
  extras?.(fx, { ground, center, radius, duration });
}

/** Fog Cloud: a 20-ft sphere of heavy grey fog billows out and hangs. */
export function fogCloud(fx, ctx) {
  conjuredCloud(fx, ctx, { puff: 'fog.puff', sound: 'whoosh' });
}

/** Stinking Cloud: the same, sickly yellow-green, with flies buzzing in it. */
export function stinkingCloud(fx, ctx) {
  conjuredCloud(fx, ctx, {
    puff: 'stink.puff',
    sound: 'stink',
    extras: (cloudFx, { ground, center, radius, duration }) => {
      cloudFx.at(0.4, () => cloudFx.burst('stink.fly', 40, { kind: 'disk', center: ground, radius: radius * 0.7, ground: cloudFx.groundHeight, height: [0.4, 2.2] }, { anchor: center }));
      cloudFx.stream('stink.fly', 1, duration - 3, 6, { kind: 'disk', center: ground, radius: radius * 0.6, ground: cloudFx.groundHeight, height: [0.4, 2] }, { anchor: center });
      cloudFx.stream('acid.bubble', 0.3, duration - 2, 10, { kind: 'disk', center: ground, radius: radius * 0.7, ground: cloudFx.groundHeight, height: 0.05 }, { sizeScale: 1.4 });
    },
  });
}
