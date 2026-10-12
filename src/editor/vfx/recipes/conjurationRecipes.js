import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat, markGrass } from '../effects/groundPress.js';
import { launchProjectile } from '../effects/projectile.js';
import { addScaled, copy, onGround, UP } from '../effects/vec.js';

/**
 * Acid Splash: a glossy globule arcs to the target and bursts into a crown of
 * droplets that hiss and eat in where they land, leaving a bubbling puddle,
 * thin corrosive threads curling off it and the grass round it burnt yellow.
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
    fx.burst('acid.flash', 1, { kind: 'point', center: addScaled(ground, UP, 1.2) }, { sizeScale: 1.6 });
    fx.burst('acid.drop', 160, { kind: 'sphere', center: addScaled(ground, UP, 0.4), radius: 0.4, speed: [5, 11], up: 1.1, hemisphere: true });
    // The crown: a tall ring of fat droplets thrown up and out, readable at range.
    fx.burst('acid.drop', 70, { kind: 'ring', center: addScaled(ground, UP, 0.3), radius: 0.7, speed: [2.5, 5], lift: [5, 8] }, { sizeScale: 2.2 });
    // A geyser: a column of liquid thrown high, the silhouette that reads at range.
    fx.burst('acid.drop', 90, { kind: 'cone', origin: addScaled(ground, UP, 0.3), direction: UP, angle: 0.22, speed: [8, 14] }, { sizeScale: 2.4 });
    fx.burst('acid.sizzle', 18, { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: 0.45, lift: [0.6, 1.4] }, { sizeScale: 1.6 });
    fx.burst('acid.puddle.glow', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) });
    fx.decal({
      x: ground.x, z: ground.z, radius: 3.2, tile: TILE.ACID_SPLAT, ramp: RAMP.ACID, tint: [0.12, 0.28, 0.02],
      emissive: 8, heat: 1, coolSeconds: duration + 2, opacity: 0.95, fadeIn: 0.08, hold: 14, fadeOut: 6,
    });
    fx.light({ position: addScaled(ground, UP, 1), ramp: RAMP.ACID, intensity: 260, range: 14, attack: 0.02, hold: 0.4, decay: 0.7, flicker: 0.25 });
  });
  blastWave(fx, ground, 4.5, 0.25);
  holdFlat(fx, ground, 3, 0.25, duration + 10, 0.9, 4);
  // Splashed grass yellows and dies back round the puddle.
  markGrass(fx, ground, 4.2, 'acid', 0.1, duration, { grow: 1.2, inner: 0.35 });
  // Thin corrosive threads and a little haze, not a green cloud.
  fx.stream('acid.wisp', 0.15, duration, (t) => 30 * (1 - t * 0.7), { kind: 'disk', center: ground, radius: 2.2, ground: fx.groundHeight, height: 0.45, lift: [0.5, 1.2] });
  fx.stream('acid.fume', 0.3, duration, (t) => 10 * (1 - t * 0.8), { kind: 'disk', center: ground, radius: 2.2, ground: fx.groundHeight, height: 0.4, lift: [0.4, 1] });
  // Bubbles sit at grass height so they read over a meadow as well as on bare ground.
  fx.stream('acid.bubble', 0.2, duration, (t) => 50 * (1 - t * 0.7), { kind: 'disk', center: ground, radius: 2.4, ground: fx.groundHeight, height: [0.1, 0.5] }, { sizeScale: 1.8 });
  fx.stream('acid.drop', 0.3, duration * 0.6, (t) => 20 * (1 - t), { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: 0.4, lift: [2, 4], spread: 0.6 });
}

const BANK_RADIUS_M = 7.5;

/**
 * A conjured bank: low lenses of cloud rolled out over the ground from the
 * point of casting, denser at the heart and see-through at the edges, kept
 * fed while it lasts and drifting slowly downwind, with wisps peeling off.
 */
function conjuredBank(fx, ctx, { puff, extras, sound, tint = null, duration = 11 }) {
  const ground = onGround(fx, ctx.target, 0);
  const center = addScaled(ground, UP, 1);
  // Fog has no top edge against the sky, and a lens must stay level.
  const look = {
    rotation: (index, params, random) => (random() - 0.5) * 0.16,
    opacityScale: (index, params) => {
      const reach = Math.hypot(params.x - ground.x, params.z - ground.z) / BANK_RADIUS_M;
      return Math.max(0.25, 1 - reach * reach * 0.75);
    },
    ...(tint ? { tint } : {}),
  };
  fx.at(0, () => {
    fx.sound(sound, center, { duration });
    // It rolls out along the ground from where it was cast.
    fx.burst(puff, 26, { kind: 'ring', center: addScaled(ground, UP, 0.8), radius: [0.5, 2], speed: [4, 9], lift: [0, 0.4] }, look);
    fx.burst(puff, 18, { kind: 'disk', center: ground, radius: BANK_RADIUS_M * 0.4, ground: fx.groundHeight, height: [0.8, 2.2], outward: [1, 3] }, look);
  });
  // Keep the bank full and low, a thinner upper layer over the dense floor.
  fx.stream(puff, 0.8, duration - 5, 9, { kind: 'disk', center: ground, radius: BANK_RADIUS_M * 0.85, ground: fx.groundHeight, height: [0.8, 1.8], spread: 0.2 }, look);
  // A rolling upper layer, thinner, so the bank's top has lumps rather than a level edge.
  fx.stream(puff, 1.2, duration - 5, 4, { kind: 'disk', center: ground, radius: BANK_RADIUS_M * 0.55, ground: fx.groundHeight, height: [2, 3], spread: 0.2 }, {
    ...look, opacityScale: 0.6, sizeScale: 0.75,
  });
  // Lumps rolling over the bank's top and wisps peeling off it downwind.
  fx.burst('fog.wisp', 14, { kind: 'disk', center: ground, radius: BANK_RADIUS_M * 0.6, ground: fx.groundHeight, height: [1.2, 2.2], outward: [0.5, 1.5] }, tint ? { tint } : {});
  fx.stream('fog.wisp', 1, duration - 2, 6, { kind: 'disk', center: ground, radius: BANK_RADIUS_M * 0.8, ground: fx.groundHeight, height: [1.2, 2.4] }, tint ? { tint } : {});
  extras?.(fx, { ground, center, radius: BANK_RADIUS_M, duration });
}

/** Fog Cloud: a heavy grey bank rolls out over the ground and hangs. */
export function fogCloud(fx, ctx) {
  conjuredBank(fx, ctx, { puff: 'fog.puff', sound: 'whoosh' });
}

const STINK_HUES = Object.freeze([
  [1, 1, 1], [0.92, 1, 0.78], [1.06, 0.94, 0.88], [0.86, 0.95, 0.92], [1.08, 1.02, 0.7],
]);

/** Stinking Cloud: the same, in sickly yellows and greens, with flies buzzing in it. */
export function stinkingCloud(fx, ctx) {
  conjuredBank(fx, ctx, {
    puff: 'stink.puff',
    sound: 'stink',
    // Each puff a slightly different sickly hue: olive, bile, ochre.
    tint: (index, params, random) => STINK_HUES[Math.floor(random() * STINK_HUES.length)],
    extras: (cloudFx, { ground, center, radius, duration }) => {
      markGrass(cloudFx, ground, radius * 0.85, 'sickly', 0.5, duration, { strength: 0.75, grow: 2.5, inner: 0.4 });
      cloudFx.at(0.4, () => cloudFx.burst('stink.fly', 40, { kind: 'disk', center: ground, radius: radius * 0.6, ground: cloudFx.groundHeight, height: [0.4, 1.8] }, { anchor: center }));
      cloudFx.stream('stink.fly', 1, duration - 3, 6, { kind: 'disk', center: ground, radius: radius * 0.5, ground: cloudFx.groundHeight, height: [0.4, 1.6] }, { anchor: center });
      cloudFx.stream('acid.bubble', 0.3, duration - 2, 10, { kind: 'disk', center: ground, radius: radius * 0.6, ground: cloudFx.groundHeight, height: 0.3 }, { sizeScale: 1.4 });
    },
  });
}
