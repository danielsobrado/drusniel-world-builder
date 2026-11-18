import { SEA_SWELL_COMPONENTS } from './SeaSwell.js';

export const SURF_TAU = Math.PI * 2;
const EPSILON = 1e-6;

export const DIRECTIONAL_SURF_DEFAULTS = Object.freeze({
  referenceDepthMeters: 2,
  obliquity: 0.12,
  carrierWeights: Object.freeze([0.55, 0.30, 0.15]),
  packetMinimum: 0.55,
  packetMaximum: 1.10,
  packetModulation: 1,
});

export const BREAKING_SURF_DEFAULTS = Object.freeze({
  gamma: 0.72,
  onsetRatio: 0.78,
  fullRatio: 1.12,
  shoalingReferenceDepthMeters: 4,
  minimumCalculationDepthMeters: 0.25,
  maximumShoalingGain: 1.65,
  shallowFadeStartMeters: 0.08,
  shallowFadeEndMeters: 0.40,
  dissipationStrength: 0.10,
  minimumCrestSkew: 0.18,
  maximumCrestSkew: 0.68,
  rollerStrength: 0.75,
  trailDecay: 4.5,
});

export const directionalCarriers = Object.freeze(SEA_SWELL_COMPONENTS.slice(0, 3));

export function surfSmoothstep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function solveSurfWaveNumber(deepWaveNumber, referenceDepth) {
  const target = deepWaveNumber;
  let low = target;
  let high = Math.max(target * 2, Math.sqrt(target / referenceDepth) * 2);
  while (high * Math.tanh(high * referenceDepth) < target) high *= 2;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) * 0.5;
    if (mid * Math.tanh(mid * referenceDepth) < target) low = mid;
    else high = mid;
  }
  return (low + high) * 0.5;
}

export function surfCarrierFrames(wave, index, directional) {
  const k = wave.waveNumber;
  const { x, z } = wave;
  return {
    [`surfOblique${index}`]: { wave: [x * k * directional.obliquity, z * k * directional.obliquity] },
    [`surfPacketA${index}`]: { wave: [k * (x * 0.06 - z * 0.08), k * (z * 0.06 + x * 0.08)] },
    [`surfPacketB${index}`]: { wave: [k * (x * 0.09 + z * 0.11), k * (z * 0.09 - x * 0.11)] },
  };
}

export function surfPacket(phaseA, phaseB, wave, time, directional) {
  const envelope = 0.78 + directional.packetModulation * (
    0.14 * Math.sin(phaseA + time * wave.angularSpeed * 0.08)
    + 0.08 * Math.sin(phaseB - time * wave.angularSpeed * 0.05)
  );
  return Math.max(directional.packetMinimum, Math.min(directional.packetMaximum, envelope));
}

export function surfWaveShape(phase, skew) {
  const s = Math.sin(phase);
  return (Math.sin(phase + skew * s) + 0.28 * skew * (s * s - 0.5)) / (1 + 0.28 * skew);
}

export function surfShoalingGain(depth, breaking) {
  return Math.min(
    breaking.maximumShoalingGain,
    Math.max(1, Math.pow(breaking.shoalingReferenceDepthMeters
      / Math.max(depth, breaking.minimumCalculationDepthMeters), 0.25)),
  );
}

export function surfBreakingIntensity(depth, incidentAmplitude, packetEnergy, breaking, fadeStart, fadeEnd) {
  if (depth <= 0) return 0;
  const ratio = 2 * incidentAmplitude * packetEnergy / (breaking.gamma * Math.max(depth, EPSILON));
  return surfSmoothstep(breaking.onsetRatio, breaking.fullRatio, ratio)
    * surfSmoothstep(breaking.shallowFadeStartMeters, breaking.shallowFadeEndMeters, depth)
    * (1 - surfSmoothstep(fadeStart, fadeEnd, depth));
}

export function surfVisibleAmplitude(depth, incidentAmplitude, packetEnergy, intensity, breaking) {
  if (depth <= 0) return 0;
  const cap = 0.5 * breaking.gamma * depth;
  return Math.min(incidentAmplitude * packetEnergy, cap)
    * (1 - breaking.dissipationStrength * intensity)
    * surfSmoothstep(breaking.shallowFadeStartMeters, breaking.shallowFadeEndMeters, depth);
}

export function evaluateDirectionalSurfCpu(x, z, depth, shoreDistance, time, settings, sea, storm, exposure) {
  if (depth <= 0) return { height: 0, amplitude: 0, breaking: 0 };
  const { directional, breaking } = settings;
  let packetEnergy = 0;
  const phases = [];
  const packets = [];
  for (let i = 0; i < directionalCarriers.length; i++) {
    const wave = directionalCarriers[i];
    const frames = surfCarrierFrames(wave, i, directional);
    const plane = ([vx, vz]) => x * vx + z * vz;
    const phase = wave.phase + (time * wave.angularSpeed) % SURF_TAU
      + shoreDistance * directional.waveNumbers[i]
      + plane(frames[`surfOblique${i}`].wave);
    const packet = surfPacket(plane(frames[`surfPacketA${i}`].wave),
      plane(frames[`surfPacketB${i}`].wave), wave, time, directional);
    phases.push(phase);
    packets.push(packet);
    packetEnergy += directional.carrierWeights[i] * packet;
  }
  const incident = sea.amplitude * (1 + storm * (sea.stormScale - 1))
    * exposure * surfShoalingGain(depth, breaking);
  const intensity = surfBreakingIntensity(depth, incident, packetEnergy,
    breaking, settings.fadeStart, settings.fadeEnd);
  const skew = breaking.minimumCrestSkew
    + (breaking.maximumCrestSkew - breaking.minimumCrestSkew) * intensity;
  let height = 0;
  for (let i = 0; i < phases.length; i++) {
    height += directional.carrierWeights[i] * packets[i] * surfWaveShape(phases[i], skew);
  }
  height = Math.max(-1, Math.min(1, height / Math.max(packetEnergy, EPSILON)));
  return {
    height,
    amplitude: surfVisibleAmplitude(depth, incident, packetEnergy, intensity, breaking),
    breaking: intensity,
  };
}
