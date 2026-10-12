import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat, markGrass } from '../effects/groundPress.js';
import { buildLightningPath, emitPolyline } from '../effects/lightningPath.js';
import { addScaled, copy, direction, distance, lerpVec, onGround, UP } from '../effects/vec.js';

const STORM_WHITE = [0.82, 0.88, 1];

/** Every `stride`-th point of a polyline, keeping its ends: a coarse copy for wide glows. */
function coarse(points, stride) {
  const out = points.filter((point, index) => index % stride === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/**
 * One lightning stroke: a thick core with a glow round it, forks, and — for
 * the main channel — a wide soft halo that makes it read as blinding.
 */
export function strike(fx, from, to, { forks = 7, depth = 6, glow = 1, coreScale = 1, halo = 0 } = {}) {
  const path = buildLightningPath(from, to, fx.random, { depth, forks, roughness: 0.13 });
  emitPolyline(fx, 'bolt.core', path.trunk, { sizeScale: coreScale });
  emitPolyline(fx, 'bolt.glow', path.trunk, { opacityScale: glow });
  if (halo > 0) emitPolyline(fx, 'bolt.halo', coarse(path.trunk, 8), { opacityScale: halo });
  for (const fork of path.forks) {
    emitPolyline(fx, 'bolt.core', fork, { sizeScale: 0.5 * coreScale, emissiveScale: 0.7 });
    emitPolyline(fx, 'bolt.glow', fork, { sizeScale: 0.5, opacityScale: 0.5 * glow });
  }
  return path;
}

/**
 * Lightning Bolt: a 100-ft line that strikes five times in half a second —
 * each re-strike a new path — then leaves an ionised channel glowing for most
 * of a second, arcs crawling over the ground, and a scorch that catches fire,
 * crackles and smokes.
 */
export function lightningBolt(fx, ctx) {
  const from = copy(ctx.origin);
  const reach = Math.min(30, distance(from, ctx.target));
  const to = addScaled(from, direction(from, ctx.target), reach);
  const ground = onGround(fx, to);
  const end = to.y - ground.y < 0.8 ? ground : to;
  const strokes = [0, 0.08, 0.19, 0.33, 0.52];
  const lastStroke = strokes[strokes.length - 1];

  fx.at(0, () => {
    fx.sound('lightning', end);
    fx.shake(0.4, end, 14);
    fx.decal({
      x: ground.x, z: ground.z, radius: 2.6, tile: TILE.SCORCH_FIRST + 2, ramp: RAMP.LIGHTNING, tint: [0.04, 0.04, 0.05],
      emissive: 9, heat: 1, coolSeconds: 3, opacity: 0.9, hold: 18, fadeOut: 8,
    });
    fx.burst('bolt.ion.smoke', 6, { kind: 'sphere', center: addScaled(end, UP, 0.3), radius: 0.3, speed: [0.5, 1.5], hemisphere: true }, { sizeScale: 0.7 });
  });
  strokes.forEach((time, index) => {
    fx.at(time, () => {
      const weight = index === 0 ? 1 : 0.8 - index * 0.05;
      strike(fx, from, end, { forks: index === 0 ? 9 : 5, coreScale: weight, halo: weight });
      fx.burst('bolt.flare', 1, { kind: 'point', center: from }, { sizeScale: 0.15 });
      fx.burst('bolt.flare', 1, { kind: 'point', center: end }, { sizeScale: 1.2 * weight });
      fx.burst('bolt.spark', index === 0 ? 70 : 24, { kind: 'sphere', center: end, radius: 0.2, speed: [4, 14], up: 0.6, hemisphere: true });
      fx.light({ position: lerpVec(from, end, 0.5), color: STORM_WHITE, intensity: 420 * weight, range: 45, attack: 0.002, hold: 0.03, decay: 22 });
      fx.light({ position: addScaled(end, UP, 0.8), color: [0.55, 0.7, 1], intensity: 520 * weight, range: 18, attack: 0.002, hold: 0.05, decay: 12 });
    });
  });
  blastWave(fx, ground, 3.5, 0.2);
  holdFlat(fx, ground, 2, 0.2, 18, 0.85, 4);
  markGrass(fx, ground, 3.4, 'singe', 0.02, 8, { strength: 0.8, inner: 0.3 });
  markGrass(fx, ground, 1.8, 'scorch', 0, 8, { grow: 0.15, inner: 0.5 });
  // The ionised channel hangs a moment after the last stroke, cooling.
  fx.at(lastStroke + 0.01, () => {
    const channel = buildLightningPath(from, end, fx.random, { depth: 4, forks: 0, roughness: 0.12 });
    emitPolyline(fx, 'bolt.afterglow', channel.trunk);
    emitPolyline(fx, 'bolt.halo', coarse(channel.trunk, 4), { opacityScale: 0.4, lifeScale: 3 });
    fx.light({ position: addScaled(end, UP, 1), color: [0.5, 0.6, 1], intensity: 90, range: 12, attack: 0.01, hold: 0.25, decay: 4 });
  });
  // Arcs crawling over the ground, thinning out over a second and a half.
  fx.every(0.08, 1.6, 0.07, (index) => {
    if (fx.random() < index / 30) return;
    const angle = fx.random() * Math.PI * 2;
    const length = 0.8 + fx.random() * 1.8;
    const tip = onGround(fx, { x: ground.x + Math.cos(angle) * length, y: 0, z: ground.z + Math.sin(angle) * length }, 0.4);
    strike(fx, addScaled(ground, UP, 0.5), tip, { forks: 1, depth: 4, glow: 0.6, coreScale: 0.45 });
    fx.burst('bolt.ember', 1, { kind: 'point', center: tip });
  });
  // The strike sets the grass alight: small flames, coals, and smoke curling off.
  fx.stream('explosion.groundfire', 0.15, 3, (t) => 40 * (1 - t), {
    kind: 'disk', center: ground, radius: 1.8, ground: fx.groundHeight, height: 0.35,
  }, { sizeScale: 1.25 });
  fx.stream('explosion.coal', 0.3, 6, (t) => 20 * (1 - t), { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: 0.35 });
  // A column of smoke from the burning strike point, leaning downwind.
  fx.stream('explosion.smoulder', 0.3, 9, (t) => 16 * (1 - t * 0.7), {
    kind: 'disk', center: ground, radius: 1.2, ground: fx.groundHeight, height: 0.4, lift: [0.8, 1.6],
  }, { sizeScale: 1.8, opacityScale: 1.4 });
  fx.stream('bolt.ion.smoke', 0.4, 3, 8, { kind: 'disk', center: ground, radius: 1, ground: fx.groundHeight, height: 0.6, lift: [0.8, 1.6] }, { sizeScale: 1.4 });
}

/**
 * Thunderwave: a 15-ft burst of force in front of the caster — a clap of
 * blue-white light, a shock ring racing out over the ground, a wall of dust
 * thrown up where it spends itself, cut grass flung away and static
 * crackling over the ground. Everything is thrown forward, away from the caster.
 */
export function thunderwave(fx, ctx) {
  const center = onGround(fx, addScaled(ctx.caster, ctx.forward, 5), 0);
  const air = addScaled(center, UP, 1.2);
  const flat = { x: ctx.forward.x, z: ctx.forward.z };
  const flatLength = Math.hypot(flat.x, flat.z) || 1;
  const toward = { x: flat.x / flatLength, z: flat.z / flatLength };
  const away = { x: toward.x, y: 0.35, z: toward.z };
  const forward = (half) => ({ toward, half });
  fx.at(0, () => {
    fx.sound('thunder', air);
    fx.shake(0.85, air, 10);
    fx.burst('bolt.flare', 1, { kind: 'point', center: ctx.origin }, { sizeScale: 0.25 });
    fx.burst('bolt.flash', 1, { kind: 'point', center: air }, { sizeScale: 0.7 });
    fx.burst('explosion.starburst', 1, { kind: 'point', center: air }, { sizeScale: 1.3, tint: [0.7, 0.8, 1] });
    fx.light({ position: air, color: [0.7, 0.8, 1], intensity: 380, range: 26, attack: 0.003, hold: 0.04, decay: 9 });
    fx.decal({
      x: center.x, z: center.z, radius: 5, tile: TILE.RING_SOFT, ramp: RAMP.LIGHTNING, tint: [0.18, 0.16, 0.13],
      emissive: 0, opacity: 0.5, hold: 8, fadeOut: 6,
    });
  });
  // The meadow is blown flat in a ring racing out from the burst.
  blastWave(fx, center, 11, 0.4);
  blastWave(fx, center, 7, 0.3, 0.12);
  [0, 0.06, 0.13].forEach((time, index) => {
    fx.at(time, () => {
      fx.burst('thunder.shell', 1, { kind: 'point', center: air }, { sizeScale: 1 - index * 0.15 });
      fx.burst('explosion.shock.ground', 1, { kind: 'point', center: addScaled(center, UP, 0.5) }, { sizeScale: 1.3 - index * 0.2 });
    });
  });
  fx.at(0.02, () => {
    fx.burst('thunder.ring', 1, { kind: 'point', center: addScaled(center, UP, 0.45) }, { sizeScale: 1.4 });
    fx.burst('explosion.shock.dust', 1, { kind: 'point', center: addScaled(center, UP, 0.2) }, { sizeScale: 1.3 });
    fx.burst('thunder.dust', 56, { kind: 'ring', center: addScaled(center, UP, 0.6), radius: [0.5, 1.5], speed: [10, 18], lift: [0.1, 0.6], arc: forward(1.9) });
    fx.burst('thunder.leaf', 110, { kind: 'cone', origin: addScaled(center, UP, 0.4), direction: away, angle: 0.8, speed: [8, 17], offset: [0, 2] });
    fx.burst('thunder.clipping', 260, { kind: 'ring', center: addScaled(center, UP, 0.35), radius: [0.5, 3], speed: [6, 15], lift: [2, 6], arc: forward(1.7) });
    fx.burst('explosion.debris', 50, { kind: 'ring', center: addScaled(center, UP, 0.25), radius: [0.5, 3], speed: [7, 14], lift: [3, 7], arc: forward(1.8) }, {
      tint: (index, params, random) => (random() < 0.5 ? [0.2, 0.3, 0.1] : [0.3, 0.24, 0.16]),
    });
    fx.burst('bolt.spark', 40, { kind: 'sphere', center: air, radius: 0.5, speed: [6, 16], up: 0.3 });
    // The signature: a starburst of lightning racing out over the ground, ahead of the caster.
    for (let arm = 0; arm < 9; arm += 1) {
      const angle = Math.atan2(toward.x, toward.z) + (arm / 8 - 0.5) * 3.4 + (fx.random() - 0.5) * 0.3;
      const reach = 4 + fx.random() * 3;
      const tip = onGround(fx, { x: center.x + Math.sin(angle) * reach, y: 0, z: center.z + Math.cos(angle) * reach }, 0.4);
      strike(fx, addScaled(center, UP, 0.8), tip, { forks: 2, depth: 5, glow: 0.8, coreScale: 0.6 });
    }
  });
  // Where the wave runs out of force it throws up a wall of dust.
  fx.at(0.16, () => {
    fx.burst('thunder.wall', 34, { kind: 'ring', center: addScaled(center, UP, 0.7), radius: [5.5, 7], speed: [1.5, 3.5], lift: [0.8, 2], arc: forward(1.6) });
  });
  fx.every(0.03, 0.75, 0.05, () => {
    const angle = Math.atan2(toward.x, toward.z) + (fx.random() - 0.5) * 3.2;
    const length = 1.5 + fx.random() * 3;
    const start = addScaled(center, UP, 0.6);
    const tip = onGround(fx, { x: center.x + Math.sin(angle) * length, y: 0, z: center.z + Math.cos(angle) * length }, 0.45);
    strike(fx, start, tip, { forks: 1, depth: 4, glow: 0.6, coreScale: 0.45 });
  });
}
