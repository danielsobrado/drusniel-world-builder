import { fract, mix, sin, smoothstep } from 'three/tsl';

import { windWaveCoordinates } from '../../weather/wind/worldWindState.js';
import { MEADOW_FLUTTER_MAX_GAIN, MEADOW_WIND_FRONT } from './meadowWindConfig.js';

const TAU = Math.PI * 2;
const RANK_PHASE_STEP = 0.61803398875;

/** Canonical-space gust fronts travel along prevailing wind, with restrained per-stem phase. */
export function meadowWindFrontNodes(blade, uniforms, tuning, wind) {
  const wave = windWaveCoordinates(blade.canonical);
  const phase = wave.along.mul(tuning.windFrequency)
    .sub(uniforms.time.mul(tuning.windSpeed))
    .add(blade.phase.mul(uniforms.wind.phaseJitter));
  const front = sin(phase);
  const pressure = smoothstep(MEADOW_WIND_FRONT.onset, MEADOW_WIND_FRONT.peak, front)
    .mul(wind.gust.clamp(0, 1).mul(uniforms.wind.gustBoost).add(1));
  return { wave, phase, front, pressure };
}

/** High-frequency tip motion follows the same wind, but individual stems flutter out of phase. */
export function meadowTipFlutterNode({
  blade, wave, uniforms, tuning, wind, ratio, height, stature, distance, windResponse,
}) {
  const tip = smoothstep(tuning.flutterHeightStart.min(0.98), 1, ratio);
  const fade = smoothstep(tuning.flutterFadeStart, tuning.flutterFadeEnd, distance).oneMinus();
  const stemPhase = fract(blade.rank.mul(RANK_PHASE_STEP)).mul(TAU);
  const primary = sin(wave.across.mul(tuning.flutterFrequency)
    .sub(uniforms.time.mul(tuning.flutterSpeed))
    .add(blade.phase.mul(2.3)).add(stemPhase));
  const secondary = sin(wave.along.mul(tuning.flutterFrequency.mul(1.65))
    .add(uniforms.time.mul(tuning.flutterSpeed.mul(1.55)))
    .add(blade.variation.mul(TAU)));
  const gain = wind.envelope.clamp(0, 3.5).sqrt()
    .mul(wind.gust.clamp(0, 1).mul(uniforms.wind.flutterGust).add(1))
    .clamp(0, MEADOW_FLUTTER_MAX_GAIN);
  return primary.mul(0.72).add(secondary.mul(0.28))
    .mul(tuning.flutterStrength).mul(height)
    .mul(tip.mul(tip)).mul(fade).mul(gain)
    .mul(windResponse).mul(mix(0.6, 1, stature));
}
