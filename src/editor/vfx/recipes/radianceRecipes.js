import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';
import { blastWave, holdFlat } from '../effects/groundPress.js';
import { addScaled, copy, direction, distance, lerpVec, onGround, UP } from '../effects/vec.js';

/**
 * Moonbeam: a silver strike from the sky opens into a pale cylinder of light,
 * motes drifting up inside it, rings pulsing outward over a rune on the
 * ground.
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
    fx.burst('moon.beam', 1, { kind: 'point', center: addScaled(ground, UP, height * 0.5) }, { axisLength: height });
    fx.burst('moon.halo', 1, { kind: 'point', center: addScaled(ground, UP, height * 0.5) }, { axisLength: height });
    fx.burst('moon.ground', 1, { kind: 'point', center: addScaled(ground, UP, 0.4) });
    // A ring of thin beams gives the column a body: brighter at its edges, like a lit cylinder.
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const rim = { x: ground.x + Math.cos(angle) * 1.6, y: ground.y + height * 0.5, z: ground.z + Math.sin(angle) * 1.6 };
      fx.burst('moon.rim', 1, { kind: 'point', center: rim }, { axisLength: height, rotation: 0 });
    }
  });
  holdFlat(fx, ground, 2.4, 0.05, duration, 0.8, 1);
  fx.every(0.1, duration - 0.6, 0.55, () => {
    fx.burst('moon.ring', 1, { kind: 'point', center: addScaled(ground, UP, 0.4) });
  });
  // Light falling through the column, and motes spiralling up round it.
  fx.stream('moon.fall', 0.1, duration - 0.6, 46, {
    kind: 'disk', center: addScaled(ground, UP, height * 0.85), radius: 1.5, height: [-2, 2], lift: [-24, -18],
  });
  fx.stream('moon.spiral', 0.1, duration - 0.6, 30, { kind: 'ring', center: addScaled(ground, UP, 0.5), radius: [1.2, 1.7], lift: [0.5, 1.2] }, { anchor: ground });
  fx.stream('moon.mote', 0.1, duration - 0.5, 60, { kind: 'disk', center: ground, radius: 2, ground: fx.groundHeight, height: [0, 4], lift: [0.6, 2] });
}

/**
 * Sunbeam: a blinding 60-ft line of radiance from the hand, a long soft halo
 * round it, flares at both ends and motes boiling off the line. The beam is
 * built from segments so the part beside the caster's eye fades out.
 */
export function sunbeam(fx, ctx) {
  const hand = copy(ctx.origin);
  const aim = direction(hand, ctx.target);
  const from = addScaled(hand, aim, 1.2);
  const length = Math.min(18, Math.max(6, distance(from, ctx.target)));
  const to = addScaled(from, aim, length);
  const segments = 8;
  const segmentLength = length / segments;
  fx.at(0, () => {
    fx.sound('sunbeam', lerpVec(from, to, 0.5));
    fx.shake(0.15, from, 6);
    for (let index = 0; index < segments; index += 1) {
      const middle = lerpVec(from, to, (index + 0.5) / segments);
      fx.burst('sun.beam', 1, { kind: 'point', center: middle }, { axis: aim, axisLength: segmentLength * 1.15, rotation: 0 });
      fx.burst('sun.halo', 1, { kind: 'point', center: middle }, { axis: aim, axisLength: segmentLength * 1.15, rotation: 0 });
    }
    // Rings round the beam: seen end-on from the caster's eye they make a tunnel of light.
    for (let index = 1; index <= 7; index += 1) {
      fx.burst('sun.ring', 1, { kind: 'point', center: lerpVec(from, to, index / 8) }, { axis: aim, rotation: index * 0.7 });
    }
    fx.burst('sun.flare', 1, { kind: 'point', center: to }, { sizeScale: 1.5 });
    fx.light({ position: lerpVec(from, to, 0.35), ramp: RAMP.HOLY, intensity: 60, range: 14, attack: 0.05, hold: 0.7, decay: 5 });
    fx.light({ position: to, ramp: RAMP.HOLY, intensity: 220, range: 18, attack: 0.03, hold: 0.7, decay: 5 });
    const ground = onGround(fx, to);
    if (to.y - ground.y < 2) {
      fx.decal({
        x: ground.x, z: ground.z, radius: 1.8, tile: TILE.SCORCH_FIRST + 1, ramp: RAMP.HOLY, tint: [0.12, 0.1, 0.06],
        emissive: 6, heat: 1, coolSeconds: 2.5, opacity: 0.7, hold: 10, fadeOut: 6,
      });
    }
  });
  fx.stream('holy.twinkle', 0, 1, 90, { kind: 'line', from, to, jitter: 0.5, spread: 0.6, lift: [0.2, 1] });
  fx.stream('sun.mote', 0, 0.9, 50, { kind: 'line', from, to, jitter: 0.3, spread: 1, lift: [0.3, 1.2] });
  // A helix of sparks winding along the beam.
  fx.during(0, 0.9, (t) => {
    const side = { x: -aim.z, y: 0, z: aim.x };
    const sideLength = Math.hypot(side.x, side.z) || 1;
    side.x /= sideLength; side.z /= sideLength;
    const up = { x: aim.y * side.z, y: aim.z * side.x - aim.x * side.z, z: -aim.y * side.x };
    for (let strand = 0; strand < 2; strand += 1) {
      const along = (t * 3 + strand * 0.5) % 1;
      const angle = along * Math.PI * 10 + strand * Math.PI;
      const point = lerpVec(from, to, along);
      const radius = 0.9;
      fx.burst('sun.mote', 1, { kind: 'point', center: {
        x: point.x + (side.x * Math.cos(angle) + up.x * Math.sin(angle)) * radius,
        y: point.y + (side.y * Math.cos(angle) + up.y * Math.sin(angle)) * radius,
        z: point.z + (side.z * Math.cos(angle) + up.z * Math.sin(angle)) * radius,
      } }, { sizeScale: 1.6 });
    }
  });
}
