import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat } from '../effects/groundPress.js';
import { buildLightningPath, emitPolyline } from '../effects/lightningPath.js';
import { addScaled, copy, direction, distance, lerpVec, onGround, UP } from '../effects/vec.js';

const STORM_WHITE = [0.82, 0.88, 1];

function strike(fx, from, to, { forks = 7, depth = 6, glow = 1, coreScale = 1 } = {}) {
  const path = buildLightningPath(from, to, fx.random, { depth, forks, roughness: 0.13 });
  emitPolyline(fx, 'bolt.core', path.trunk, { sizeScale: coreScale });
  emitPolyline(fx, 'bolt.glow', path.trunk, { opacityScale: glow });
  for (const fork of path.forks) {
    emitPolyline(fx, 'bolt.core', fork, { sizeScale: 0.55 * coreScale, emissiveScale: 0.7 });
    emitPolyline(fx, 'bolt.glow', fork, { sizeScale: 0.6, opacityScale: 0.5 * glow });
  }
  return path;
}

/**
 * Lightning Bolt: a 100-ft line that strikes four times in 0.3 s — each
 * re-strike a new path — then leaves an ionised afterglow, a scorch with
 * blue-hot cracks and arcs crawling over the ground.
 */
export function lightningBolt(fx, ctx) {
  const from = copy(ctx.origin);
  const reach = Math.min(30, distance(from, ctx.target));
  const to = addScaled(from, direction(from, ctx.target), reach);
  const ground = onGround(fx, to);
  const end = to.y - ground.y < 0.8 ? ground : to;

  fx.at(0, () => {
    fx.sound('lightning', end);
    fx.shake(0.4, end, 14);
    fx.decal({
      x: ground.x, z: ground.z, radius: 2.4, tile: TILE.SCORCH_FIRST + 2, ramp: RAMP.LIGHTNING, tint: [0.04, 0.04, 0.05],
      emissive: 9, heat: 1, coolSeconds: 2.2, opacity: 0.9, hold: 16, fadeOut: 8,
    });
    fx.burst('bolt.ion.smoke', 5, { kind: 'sphere', center: addScaled(end, UP, 0.3), radius: 0.3, speed: [0.5, 1.5], hemisphere: true }, { sizeScale: 0.6 });
  });
  [0, 0.07, 0.16, 0.3].forEach((time, index) => {
    fx.at(time, () => {
      const weight = index === 0 ? 1 : 0.75;
      strike(fx, from, end, { forks: index === 0 ? 9 : 5, coreScale: weight });
      fx.burst('bolt.flare', 1, { kind: 'point', center: from }, { sizeScale: 0.15 });
      fx.burst('bolt.flare', 1, { kind: 'point', center: end }, { sizeScale: 1.2 * weight });
      fx.burst('bolt.spark', index === 0 ? 70 : 24, { kind: 'sphere', center: end, radius: 0.2, speed: [4, 14], up: 0.6, hemisphere: true });
      fx.light({ position: lerpVec(from, end, 0.5), color: STORM_WHITE, intensity: 420 * weight, range: 45, attack: 0.002, hold: 0.03, decay: 22 });
      fx.light({ position: addScaled(end, UP, 0.8), color: [0.55, 0.7, 1], intensity: 420 * weight, range: 18, attack: 0.002, hold: 0.05, decay: 14 });
    });
  });
  blastWave(fx, ground, 3.5, 0.2);
  holdFlat(fx, ground, 2, 0.2, 16, 0.85, 4);
  // The ionised channel lingers a moment after the last stroke.
  fx.at(0.31, () => {
    const channel = buildLightningPath(from, end, fx.random, { depth: 4, forks: 0, roughness: 0.12 });
    emitPolyline(fx, 'bolt.afterglow', channel.trunk);
  });
  // Arcs crawling over the ground at the impact.
  fx.every(0.08, 0.7, 0.06, () => {
    const angle = fx.random() * Math.PI * 2;
    const length = 0.8 + fx.random() * 1.6;
    const tip = onGround(fx, { x: ground.x + Math.cos(angle) * length, y: 0, z: ground.z + Math.sin(angle) * length }, 0.4);
    strike(fx, addScaled(ground, UP, 0.5), tip, { forks: 1, depth: 4, glow: 0.6, coreScale: 0.5 });
  });
}

/**
 * Thunderwave: a 15-ft burst of force in front of the caster — a clap of
 * blue-white light, pressure shells racing outward, turf and leaves flung
 * away in a cone, a low wall of dust and static crackling over the ground.
 */
export function thunderwave(fx, ctx) {
  const center = onGround(fx, addScaled(ctx.caster, ctx.forward, 4.5), 0);
  const air = addScaled(center, UP, 1.2);
  const away = { x: ctx.forward.x, y: 0.35, z: ctx.forward.z };
  fx.at(0, () => {
    fx.sound('thunder', air);
    fx.shake(0.85, air, 10);
    fx.burst('bolt.flare', 1, { kind: 'point', center: ctx.origin }, { sizeScale: 0.25 });
    fx.burst('bolt.flash', 1, { kind: 'point', center: air }, { sizeScale: 0.8 });
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
    fx.burst('explosion.shock.dust', 1, { kind: 'point', center: addScaled(center, UP, 0.2) }, { sizeScale: 1.3 });
    fx.burst('thunder.dust', 64, { kind: 'ring', center: addScaled(center, UP, 0.6), radius: [0.5, 1.5], speed: [10, 18], lift: [0.1, 0.6] });
    fx.burst('thunder.leaf', 150, { kind: 'cone', origin: addScaled(ctx.caster, UP, 0.4), direction: away, angle: 0.75, speed: [9, 19], offset: [1.5, 4] });
    fx.burst('explosion.debris', 50, { kind: 'ring', center: addScaled(center, UP, 0.25), radius: [0.5, 3], speed: [7, 14], lift: [3, 7] }, {
      tint: (index, params, random) => (random() < 0.5 ? [0.2, 0.3, 0.1] : [0.3, 0.24, 0.16]),
    });
    fx.burst('bolt.spark', 40, { kind: 'sphere', center: air, radius: 0.5, speed: [6, 16], up: 0.3 });
    // The signature: a starburst of lightning racing out over the ground.
    for (let arm = 0; arm < 9; arm += 1) {
      const angle = (arm / 9) * Math.PI * 2 + fx.random() * 0.4;
      const reach = 4 + fx.random() * 3;
      const tip = onGround(fx, { x: center.x + Math.cos(angle) * reach, y: 0, z: center.z + Math.sin(angle) * reach }, 0.4);
      strike(fx, addScaled(center, UP, 0.8), tip, { forks: 2, depth: 5, glow: 0.8, coreScale: 0.7 });
    }
  });
  fx.every(0.03, 0.55, 0.05, () => {
    const angle = fx.random() * Math.PI * 2;
    const length = 1.5 + fx.random() * 3;
    const start = addScaled(center, UP, 0.6);
    const tip = onGround(fx, { x: center.x + Math.cos(angle) * length, y: 0, z: center.z + Math.sin(angle) * length }, 0.45);
    strike(fx, start, tip, { forks: 1, depth: 4, glow: 0.6, coreScale: 0.5 });
  });
}
