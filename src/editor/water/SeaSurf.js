import { SEA_SWELL_COMPONENTS, sampleSeaSwellCpu, seaWaveShape } from './SeaSwell.js';
import {
  BREAKING_SURF_DEFAULTS, DIRECTIONAL_SURF_DEFAULTS, directionalCarriers,
  evaluateDirectionalSurfCpu, solveSurfWaveNumber, surfCarrierFrames, surfSmoothstep,
} from './SeaSurfMath.js';

/** Gods' End wave sets, scaled to humans and driven by canonical water depth. */
export const SEA_SURF_DEFAULTS = Object.freeze({
  enabled: false, model: 'legacy', fadeStart: 2.5, fadeEnd: 7, depthPhaseScale: 1.4,
  setDepth: 0.5, setGroup: 0.29, alongFrequency: 0.031, phaseWarp: 0.32,
  breakDepthStart: 0.25, breakDepthFull: 0.7, breakDepthFade: 2.4, breakDepthEnd: 4.5,
  strength: 0.8, trail: 4.5, laceScale: 0.19,
  directional: DIRECTIONAL_SURF_DEFAULTS,
  breaking: BREAKING_SURF_DEFAULTS,
});

export function resolveSeaSurf(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('water.sea.surf must be an object.');
  const result = {
    ...SEA_SURF_DEFAULTS, ...source,
    directional: { ...DIRECTIONAL_SURF_DEFAULTS, ...source.directional },
    breaking: { ...BREAKING_SURF_DEFAULTS, ...source.breaking },
  };
  if (!['legacy', 'directionalBreakers'].includes(result.model)) {
    throw new Error('water.sea.surf.model must be legacy or directionalBreakers.');
  }
  if (typeof result.enabled !== 'boolean') throw new Error('water.sea.surf.enabled must be boolean.');
  for (const [key, value] of Object.entries(result)) {
    if (!['enabled', 'model', 'directional', 'breaking'].includes(key) && (!Number.isFinite(value) || value < 0)) throw new Error(`water.sea.surf.${key} must be finite and non-negative.`);
  }
  for (const [start, end] of [['fadeStart', 'fadeEnd'], ['breakDepthStart', 'breakDepthFull'],
    ['breakDepthFull', 'breakDepthFade'], ['breakDepthFade', 'breakDepthEnd']]) {
    if (result[start] >= result[end]) throw new Error(`water.sea.surf.${end} must exceed ${start}.`);
  }
  if (result.setDepth > 0.95 || result.strength > 2 || result.phaseWarp > 2
    || result.fadeEnd > 30 || result.depthPhaseScale > 5 || result.alongFrequency > 1
    || result.setGroup > 1 || result.laceScale > 2 || result.trail > 20) {
    throw new Error('water.sea.surf settings exceed supported bounds.');
  }
  if (result.model === 'directionalBreakers') {
    const ranges = {
      directional: {
        referenceDepthMeters: [0.25, 20], obliquity: [0, 0.3],
        packetMinimum: [0.1, 1.5], packetMaximum: [0.2, 2],
        packetModulation: [0, 1],
      },
      breaking: {
        gamma: [0.3, 1], onsetRatio: [0.2, 2], fullRatio: [0.3, 3],
        shoalingReferenceDepthMeters: [0.25, 20], minimumCalculationDepthMeters: [0.02, 2],
        maximumShoalingGain: [1, 3], shallowFadeStartMeters: [0, 1],
        shallowFadeEndMeters: [0.02, 2], dissipationStrength: [0, 0.9],
        minimumCrestSkew: [0, 0.9], maximumCrestSkew: [0, 0.95],
        rollerStrength: [0, 2], trailDecay: [0.1, 20],
      },
    };
    for (const [section, fields] of Object.entries(ranges)) {
      for (const [name, [minimum, maximum]] of Object.entries(fields)) {
        const value = result[section][name];
        if (!Number.isFinite(value) || value < minimum || value > maximum) {
          throw new Error(`water.sea.surf.${section}.${name} must be within [${minimum}, ${maximum}].`);
        }
      }
    }
    const d = result.directional, b = result.breaking;
    if (!Array.isArray(d.carrierWeights) || d.carrierWeights.length !== directionalCarriers.length
      || d.carrierWeights.some(v => !Number.isFinite(v) || v <= 0)) {
      throw new Error('water.sea.surf.directional.carrierWeights requires three positive finite weights.');
    }
    const sum = d.carrierWeights.reduce((a, v) => a + v, 0);
    d.carrierWeights = d.carrierWeights.map(weight => weight / sum);
    if (d.packetMinimum >= d.packetMaximum || b.onsetRatio >= b.fullRatio
      || b.shallowFadeStartMeters >= b.shallowFadeEndMeters
      || b.minimumCrestSkew > b.maximumCrestSkew) {
      throw new Error('water.sea.surf directional and breaking ranges must be ordered.');
    }
    d.waveNumbers = directionalCarriers.map(wave =>
      solveSurfWaveNumber(wave.waveNumber, d.referenceDepthMeters));
  }
  return result;
}

export function seaSurfPatternFrames(settings) {
  const wave = SEA_SWELL_COMPONENTS[0];
  return {
    ...(settings.model === 'directionalBreakers'
      ? Object.assign({}, ...directionalCarriers.map((wave, index) =>
        surfCarrierFrames(wave, index, settings.directional))) : {}),
    surfGroup: { wave: [wave.x * wave.waveNumber * settings.setGroup, wave.z * wave.waveNumber * settings.setGroup] },
    surfAlong: { wave: [-wave.z * settings.alongFrequency, wave.x * settings.alongFrequency] },
    surfLace: { scale: settings.laceScale },
    surfLaceWarpX: { wave: [0.071, 0.043] },
    surfLaceWarpZ: { wave: [-0.037, 0.061] },
  };
}

function smoothstep(a, b, value) {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a))); return t * t * (3 - 2 * t);
}

/** CPU twin of the drawn surface: swimmers and render vertices share the wave sets. */
export function sampleSeaHeightCpu(x, z, depth, time, sharpness, settings) {
  const swell = sampleSeaSwellCpu(x, z, time, sharpness);
  if (!settings?.enabled) return swell;
  const wave = SEA_SWELL_COMPONENTS[0];
  const phase = wave.phase + (time * wave.angularSpeed) % (Math.PI * 2);
  const along = (-x * wave.z + z * wave.x) * settings.alongFrequency;
  const group = (x * wave.x + z * wave.z) * wave.waveNumber * settings.setGroup
    + time * wave.angularSpeed * settings.setGroup;
  const set = 1 - settings.setDepth * (Math.sin(group + Math.sin(along) * 1.6) * 0.5 + 0.5);
  const near = seaWaveShape(phase + Math.sin(along) * settings.phaseWarp + depth * settings.depthPhaseScale, 0.45) * set;
  const offshore = smoothstep(settings.fadeStart, settings.fadeEnd, depth);
  return near * (1 - offshore) + swell * offshore;
}

/** Directional surf displacement in metres; agrees with the TSL vertex path. */
export function sampleSeaSurfDisplacementCpu(x, z, depth, shoreDistance, time, sharpness,
  settings, sea, storm, exposure, legacyAmplitude) {
  if (!(depth > 0)) return 0;
  const near = evaluateDirectionalSurfCpu(x, z, depth, shoreDistance, time,
    settings, sea, storm, exposure);
  const blend = surfSmoothstep(settings.fadeStart, settings.fadeEnd, depth);
  const offshoreHeight = sampleSeaSwellCpu(x, z, time, sharpness);
  return near.height * near.amplitude * (1 - blend)
    + offshoreHeight * legacyAmplitude * blend;
}
