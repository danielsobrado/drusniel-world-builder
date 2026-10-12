import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { holdFlat, markGrass } from '../effects/groundPress.js';
import { addScaled, copy, direction, distance, lerpVec, onGround, UP } from '../effects/vec.js';

/** Moonbeam's column, bottom to top: each section dimmer, so it fades out into the sky. */
const MOON_SECTIONS = Object.freeze([
  { from: 0, to: 12, opacity: 1 },
  { from: 9, to: 21, opacity: 0.5 },
  { from: 18, to: 32, opacity: 0.18 },
]);

/**
 * Moonbeam: a silver strike from the sky opens into a pale cylinder of light
 * that fades into the sky above, pulsing as bands of light slide down it,
 * motes swirling up inside it and a ring shimmering on the silvered grass.
 */
export function moonbeam(fx, ctx) {
  const ground = onGround(fx, ctx.target, 0);
  const height = 26;
  const duration = 6;
  fx.at(0, () => {
    fx.sound('moonbeam', ground, { duration });
    fx.burst('moon.strike', 1, { kind: 'point', center: addScaled(ground, UP, height * 0.5) }, { axisLength: height });
    fx.burst('bolt.flare', 1, { kind: 'point', center: addScaled(ground, UP, 0.5) }, { sizeScale: 1.2 });
    fx.light({ position: addScaled(ground, UP, 2.5), ramp: RAMP.MOON, intensity: 170, range: 16, attack: 0.15, hold: duration - 1, decay: 2.5 });
    fx.decal({
      x: ground.x, z: ground.z, radius: 2, tile: TILE.RUNE_CIRCLE, ramp: RAMP.MOON, tint: [0.25, 0.3, 0.4],
      emissive: 5, heat: 1, coolSeconds: duration + 1, opacity: 0.85, fadeIn: 0.3, hold: duration - 0.8, fadeOut: 1.2,
    });
  });
  fx.at(0.08, () => {
    for (const section of MOON_SECTIONS) {
      const middle = addScaled(ground, UP, (section.from + section.to) * 0.5);
      const length = section.to - section.from;
      fx.burst('moon.beam', 1, { kind: 'point', center: middle }, { axisLength: length, opacityScale: section.opacity });
      fx.burst('moon.halo', 1, { kind: 'point', center: middle }, { axisLength: length, opacityScale: section.opacity });
    }
    fx.burst('moon.ground', 1, { kind: 'point', center: addScaled(ground, UP, 0.4) });
  });
  holdFlat(fx, ground, 2.4, 0.05, duration, 0.6, 1);
  markGrass(fx, ground, 3, 'moon', 0.1, duration, { strength: 0.7, grow: 0.5, inner: 0.5 });
  fx.every(0.1, duration - 0.6, 0.55, () => {
    fx.burst('moon.ring', 1, { kind: 'point', center: addScaled(ground, UP, 0.4) });
  });
  // Pulses: the column brightens and a band of light slides down it.
  fx.every(0.4, duration - 0.8, 1.1, () => {
    fx.burst('moon.pulse', 1, { kind: 'point', center: addScaled(ground, UP, 6) }, { axisLength: 12 });
    fx.burst('moon.band', 1, { kind: 'point', center: addScaled(ground, UP, 16), velocity: { x: 0, y: -12, z: 0 } });
  });
  fx.every(0.2, duration - 0.5, 0.18, () => {
    fx.burst('moon.shimmer', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) });
  });
  // Light falling through the column, and motes swirling up inside it.
  fx.stream('moon.fall', 0.1, duration - 0.6, 46, {
    kind: 'disk', center: addScaled(ground, UP, height * 0.6), radius: 1.5, height: [-2, 2], lift: [-24, -18],
  });
  fx.stream('moon.spiral', 0.1, duration - 0.6, 70, { kind: 'ring', center: addScaled(ground, UP, 0.5), radius: [0.6, 1.8], lift: [0.5, 1.4] }, { anchor: ground });
  fx.stream('moon.mote', 0.1, duration - 0.5, 70, { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: [0, 4], lift: [0.6, 2] });
}

const SUN_SWEEP_RAD = 0.32;
const SUN_SECONDS = 1;

/**
 * Sunbeam: a blinding 60-ft line of radiance from the hand that sweeps across
 * its target, a long soft halo round it, flares at both ends, motes boiling
 * off the line, and a line of scorched, singed grass where it raked the
 * ground. The beam is rebuilt every frame along its current aim, in segments,
 * so the part beside the caster's eye can fade out.
 */
export function sunbeam(fx, ctx) {
  const hand = copy(ctx.origin);
  const centerAim = direction(hand, ctx.target);
  const segments = 8;
  const beamAt = (t) => {
    // Swept round the vertical axis, easing in and out of the turn.
    const angle = (0.5 - 0.5 * Math.cos(Math.min(1, t) * Math.PI) - 0.5) * 2 * SUN_SWEEP_RAD;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const aim = {
      x: (centerAim.x * cos - centerAim.z * sin),
      y: centerAim.y,
      z: (centerAim.x * sin + centerAim.z * cos),
    };
    const from = addScaled(hand, aim, 1.2);
    const length = Math.min(18, Math.max(6, distance(from, ctx.target)));
    return { aim, from, to: addScaled(from, aim, length), length };
  };

  fx.at(0, () => {
    const { from, to } = beamAt(0);
    fx.sound('sunbeam', lerpVec(from, to, 0.5));
    fx.shake(0.15, from, 6);
    fx.burst('holy.flash', 1, { kind: 'point', center: from }, { sizeScale: 0.6 });
  });
  let farLight = null;
  let lastMark = -1;
  fx.during(0, SUN_SECONDS, (t) => {
    const { aim, from, to, length } = beamAt(t);
    const segmentLength = length / segments;
    for (let index = 0; index < segments; index += 1) {
      const middle = lerpVec(from, to, (index + 0.5) / segments);
      fx.burst('sun.beam', 1, { kind: 'point', center: middle }, { axis: aim, axisLength: segmentLength * 1.15, rotation: 0, lifeScale: 0.05 });
      fx.burst('sun.halo', 1, { kind: 'point', center: middle }, { axis: aim, axisLength: segmentLength * 1.15, rotation: 0, lifeScale: 0.05 });
    }
    fx.burst('sun.flare', 1, { kind: 'point', center: to }, { sizeScale: 1.4, lifeScale: 0.05 });
    if (!farLight) farLight = fx.light({ position: to, ramp: RAMP.HOLY, intensity: 240, range: 18, attack: 0.03, hold: SUN_SECONDS, decay: 5, follow: () => beamAt(fx.time).to });
    fx.burst('sun.spark', 4, { kind: 'sphere', center: to, radius: 0.3, speed: [4, 12], up: 0.4 });
    fx.burst('sun.spark', 3, { kind: 'line', from, to, jitter: 0.2, spread: 6, lift: [-1, 3] });
    fx.burst('holy.twinkle', 2, { kind: 'line', from, to, jitter: 0.5, spread: 0.6, lift: [0.2, 1] });
    fx.burst('sun.mote', 1, { kind: 'line', from, to, jitter: 0.3, spread: 1, lift: [0.3, 1.2] });
    // Where it rakes the ground it scorches a line through the grass.
    const ground = onGround(fx, to);
    if (to.y - ground.y < 2 && t - lastMark > 0.08) {
      lastMark = t;
      fx.decal({
        x: ground.x, z: ground.z, radius: 1.4, tile: TILE.SCORCH_FIRST + 1, ramp: RAMP.HOLY, tint: [0.12, 0.1, 0.06],
        emissive: 6, heat: 1, coolSeconds: 2.5, opacity: 0.7, hold: 10, fadeOut: 6,
      });
      fx.burst('holy.ground', 1, { kind: 'point', center: addScaled(ground, UP, 0.45) }, { sizeScale: 0.7, lifeScale: 0.4 });
      fx.burst('explosion.coal', 3, { kind: 'disk', center: ground, radius: 0.8, ground: fx.groundHeight, height: 0.35 });
      fx.burst('explosion.smoulder', 1, { kind: 'disk', center: ground, radius: 0.6, ground: fx.groundHeight, height: 0.4, lift: [0.4, 0.8] });
    }
  });
  // The scorched track, marked along the sweep.
  for (let index = 0; index <= 6; index += 1) {
    const t = index / 6;
    const end = beamAt(t).to;
    const ground = onGround(fx, end);
    if (end.y - ground.y >= 2) continue;
    markGrass(fx, ground, 2.2, 'singe', t * SUN_SECONDS, SUN_SECONDS + 4, { strength: 0.8, grow: 0.15, inner: 0.3 });
    markGrass(fx, ground, 1.1, 'scorch', t * SUN_SECONDS, SUN_SECONDS + 4, { strength: 0.9, grow: 0.1, inner: 0.4 });
    holdFlat(fx, ground, 1.2, t * SUN_SECONDS, SUN_SECONDS + 10, 0.6, 3);
  }
  fx.at(SUN_SECONDS, () => {
    const { to } = beamAt(1);
    fx.burst('holy.flash', 1, { kind: 'point', center: to }, { sizeScale: 1.4 });
    fx.burst('sun.ground.ring', 1, { kind: 'point', center: addScaled(onGround(fx, to), UP, 0.5) });
    fx.burst('sun.spark', 40, { kind: 'sphere', center: to, radius: 0.3, speed: [4, 12], up: 0.4 });
    fx.burst('explosion.smoulder', 6, { kind: 'line', from: onGround(fx, beamAt(0).to), to: onGround(fx, to), jitter: 0.5, lift: [0.3, 0.8] });
  });
}
