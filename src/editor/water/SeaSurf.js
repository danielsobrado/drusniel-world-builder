import { SEA_SWELL_COMPONENTS, sampleSeaSwellCpu, seaWaveShape } from './SeaSwell.js';

/** Gods' End wave sets, scaled to humans and driven by canonical water depth. */
export const SEA_SURF_DEFAULTS = Object.freeze({
  enabled: false, fadeStart: 2.5, fadeEnd: 7, depthPhaseScale: 1.4,
  setDepth: 0.5, setGroup: 0.29, alongFrequency: 0.031, phaseWarp: 0.32,
  breakDepthStart: 0.25, breakDepthFull: 0.7, breakDepthFade: 2.4, breakDepthEnd: 4.5,
  strength: 0.8, trail: 4.5, laceScale: 0.19,
});

export function resolveSeaSurf(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('water.sea.surf must be an object.');
  const result = { ...SEA_SURF_DEFAULTS, ...source };
  if (typeof result.enabled !== 'boolean') throw new Error('water.sea.surf.enabled must be boolean.');
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'enabled' && (!Number.isFinite(value) || value < 0)) throw new Error(`water.sea.surf.${key} must be finite and non-negative.`);
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
  return result;
}

export function seaSurfPatternFrames(settings) {
  const wave = SEA_SWELL_COMPONENTS[0];
  return {
    surfGroup: { wave: [wave.x * wave.waveNumber * settings.setGroup, wave.z * wave.waveNumber * settings.setGroup] },
    surfAlong: { wave: [-wave.z * settings.alongFrequency, wave.x * settings.alongFrequency] },
    surfLace: { scale: settings.laceScale },
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
