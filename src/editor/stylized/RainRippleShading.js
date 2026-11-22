import {
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  fwidth,
  int,
  length,
  max,
  mix,
  oneMinus,
  sin,
  smoothstep,
  step,
  uint,
  vec2,
} from 'three/tsl';
import { latticeHashNode } from '../weather/wind/windNoise.js';

/**
 * Rain capillary ripples on a water chunk.
 *
 * Three lattices of distinct scales (heavy drops, medium rain, fine drizzle)
 * each re-hash every drop's position, size, strength, ring count and subtle
 * organic warp on each lifetime cycle so impacts never repeat in a fixed grid.
 * Each drop expands as a crisp, asymmetric multi-ring capillary wave packet
 * with an initial pinpoint impact glint, directional crest shading, and radial
 * slope perturbation that tilts the water normal to break up reflections.
 *
 * Cells divide the 1 m chunk origin lattice into exact integers so indexing
 * stays continuous across chunk borders at planet scale.
 */

export const RAIN_RIPPLE_CELL_METERS = 1;

const TAU = Math.PI * 2;
// Fixed grazing bias so one arc of each crest catches sky light while the
// opposite arc stays subdued, avoiding flat 360-degree painted circles.
const CREST_LIGHT_DIR = vec2(0.58, 0.81);

// [cellMeters, salt, profile]. Every 1 / cellMeters must remain an integer.
export const RAIN_RIPPLE_LAYERS = Object.freeze([
  Object.freeze([0.5, 11, Object.freeze({
    periodMin: 0.92,
    periodMax: 1.88,
    radiusMin: 0.19,
    radiusMax: 0.43,
    ringWidth: 0.0095,
    density: 0.44,
    tailMin: 2.1,
    tailMax: 3.4,
    warpMax: 0.075,
    ringGain: 0.68,
    slopeGain: 0.022,
    pinpointGain: 0.55,
  })]),
  Object.freeze([1 / 3, 23, Object.freeze({
    periodMin: 0.46,
    periodMax: 1.24,
    radiusMin: 0.14,
    radiusMax: 0.40,
    ringWidth: 0.0075,
    density: 0.78,
    tailMin: 1.5,
    tailMax: 2.7,
    warpMax: 0.065,
    ringGain: 0.58,
    slopeGain: 0.018,
    pinpointGain: 0.45,
  })]),
  Object.freeze([0.2, 41, Object.freeze({
    periodMin: 0.25,
    periodMax: 0.70,
    radiusMin: 0.11,
    radiusMax: 0.35,
    ringWidth: 0.0058,
    density: 0.86,
    tailMin: 1.1,
    tailMax: 1.9,
    warpMax: 0.05,
    ringGain: 0.46,
    slopeGain: 0.014,
    pinpointGain: 0.38,
  })]),
]);

function cellHash(cellX, cellZ, salt) {
  return latticeHashNode(
    uint(int(cellX)).add(uint(salt * 7919)),
    uint(int(cellZ)).add(uint(salt * 104729)),
  );
}

function organicAngularWarp(dir, hA, hB, hC, hD, warpAmp) {
  // Cheap 2-lobe and 3-lobe harmonics from unit direction (no atan2).
  const c2 = dir.x.mul(dir.x).sub(dir.y.mul(dir.y));
  const s2 = dir.x.mul(dir.y).mul(2);
  const c3 = dir.x.mul(c2).sub(dir.y.mul(s2));
  const s3 = dir.y.mul(c2).add(dir.x.mul(s2));
  const w2a = hA.mul(2).sub(1);
  const w2b = hB.mul(2).sub(1);
  const w3a = hC.mul(2).sub(1).mul(0.55);
  const w3b = hD.mul(2).sub(1).mul(0.55);
  const warp = c2.mul(w2a).add(s2.mul(w2b)).add(c3.mul(w3a)).add(s3.mul(w3b));
  const arcBreak = mix(float(0.62), float(1.0), c2.mul(w2b).add(s3.mul(w3a)).mul(0.5).add(0.5));
  return { scale: float(1).add(warp.mul(warpAmp)), arcBreak };
}

function rippleLayer({ localMeters, originMeters, time, rain, cellMeters, salt, profile }) {
  const perMetre = 1 / cellMeters;
  const point = localMeters.mul(perMetre);
  const cell = floor(point);
  const local = fract(point);
  const offset = step(0.5, local).mul(2).sub(1);
  const origin = originMeters.mul(perMetre);
  const baseWidth = float(profile.ringWidth * perMetre);
  // Anti-alias crests to pixel footprint and fade smoothly in the distance.
  const footprint = fwidth(point.x).add(fwidth(point.y));
  const resolved = oneMinus(smoothstep(0.06, 0.18, footprint));
  let ring = float(0);
  let slope = vec2(0);

  for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const neighbour = vec2(offset.x.mul(ox), offset.y.mul(oz));
    const id = cell.add(neighbour).add(origin);
    const staticHash = index => cellHash(id.x, id.y, salt + index);

    const period = mix(float(profile.periodMin), float(profile.periodMax), staticHash(5));
    const timeline = time.div(period).add(staticHash(3));
    const age = fract(timeline);
    const cycle = floor(timeline);
    // Re-seed every drop on each cycle so impacts never repeat in a fixed grid.
    const dropX = id.x.add(cycle.mul(17));
    const dropZ = id.y.add(cycle.mul(31));
    const dropHash = index => cellHash(dropX, dropZ, salt + 100 + index);

    const active = step(dropHash(4), rain.mul(profile.density));
    const reach = mix(float(profile.radiusMin), float(profile.radiusMax), dropHash(6));
    const centre = neighbour.add(vec2(dropHash(1), dropHash(2)).mul(0.58).add(0.21));
    const toPixel = local.sub(centre);
    const distance = length(toPixel);
    const dir = toPixel.div(max(distance, 1e-4));

    const warpAmp = dropHash(7).mul(profile.warpMax);
    const { scale: radialScale, arcBreak } = organicAngularWarp(
      dir, dropHash(9), dropHash(10), dropHash(11), dropHash(12), warpAmp,
    );
    const warpedDistance = distance.mul(radialScale);

    // Fast initial burst decelerating as capillary energy spreads.
    const radius = reach.mul(oneMinus(age.oneMinus().mul(age.oneMinus())));
    const ownWidth = baseWidth.mul(age.mul(0.75).add(1));
    const outerWidth = max(ownWidth, footprint.mul(0.75));
    const tailCycles = mix(float(profile.tailMin), float(profile.tailMax), dropHash(13));
    const tailWidth = max(ownWidth.mul(tailCycles), footprint.mul(1.15));

    const delta = warpedDistance.sub(radius);
    const envWidth = delta.greaterThan(0).select(outerWidth, tailWidth);
    const envX = delta.div(envWidth);
    const envelope = exp(envX.mul(envX).negate());

    // Multi-ring capillary carrier inside the envelope (Nyquist-clamped to footprint).
    const wavelength = max(ownWidth.mul(2.2), footprint.mul(1.35));
    const wavePhase = delta.div(wavelength).mul(TAU);
    const rawCrest = max(float(0), cos(wavePhase));
    const sharpCrest = rawCrest.mul(rawCrest);
    const waveSlope = sin(wavePhase).negate();

    // Skewed strength distribution: mostly delicate ripples with occasional crisp hero impacts.
    const strengthSeed = dropHash(8);
    const dropStrength = mix(float(0.32), float(1.18), strengthSeed.mul(strengthSeed));
    const fadeIn = smoothstep(0.0, 0.055, age);
    const fadeOut = age.oneMinus().mul(age.oneMinus());
    const aaAtten = ownWidth.div(outerWidth).sqrt();
    const life = fadeIn.mul(fadeOut).mul(active).mul(dropStrength).mul(aaAtten);

    // Directional sky-glint + subtle angular breakup so rings read as curved water, not flat donuts.
    const dirLight = mix(float(0.24), float(1.0), smoothstep(-0.6, 0.85, dot(dir, CREST_LIGHT_DIR)));
    const ringValue = envelope.mul(sharpCrest).mul(life).mul(dirLight).mul(arcBreak).mul(profile.ringGain);

    // Brief pinpoint splash crown at impact birth before the wave expands.
    const pinWidth = max(baseWidth.mul(0.95), footprint.mul(0.7));
    const pinX = distance.div(pinWidth);
    const pinLife = smoothstep(0.0, 0.025, age).mul(oneMinus(smoothstep(0.03, 0.14, age)));
    const pinpoint = exp(pinX.mul(pinX).negate()).mul(pinLife).mul(active).mul(dropStrength).mul(profile.pinpointGain);

    ring = max(ring, max(ringValue, pinpoint));

    // Radial height derivative tilts the surface normal to shimmer reflections.
    const radialSlope = envelope.mul(waveSlope).mul(life).mul(perMetre * profile.slopeGain);
    slope = slope.add(dir.mul(radialSlope));
  }

  return { ring: ring.mul(resolved), slope: slope.mul(resolved) };
}

/**
 * @param {object} options
 * @param {object} options.localMeters vec2: metres from the chunk's origin corner, cell axes
 * @param {object} options.originMeters vec2 uniform: the chunk origin in whole metres, cell axes
 * @param {object} options.time seconds
 * @param {object} options.rain 0..1
 * @returns {{ ring: object, slope: object }} brightness 0..1 and dh/dx, dh/dz on canonical axes
 */
export function createRainRippleNode({ localMeters, originMeters, time, rain }) {
  let ring = float(0);
  let slope = vec2(0);
  for (const [cellMeters, salt, profile] of RAIN_RIPPLE_LAYERS) {
    const layer = rippleLayer({ localMeters, originMeters, time, rain, cellMeters, salt, profile });
    ring = max(ring, layer.ring);
    slope = slope.add(layer.slope);
  }
  // Cell axes run z the other way: hand the slope over on canonical axes.
  return { ring: ring.mul(rain), slope: vec2(slope.x, slope.y.negate()).mul(rain) };
}

/** Pixels too far for rings still lose their mirror finish to the rain. */
export function rainRoughness(rain) {
  return rain.mul(0.14);
}
