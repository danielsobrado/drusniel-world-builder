import { float, sin } from 'three/tsl';
import { wavePatternOrigin } from '../stylized/PatternOrigins.js';

// grass-test WaterMaterial/LakeFlora share these broad waves. Convert the
// donor's 2.8 units/metre once; both water and pads consume the same definition.
export const LAKE_WAVES = Object.freeze([
  Object.freeze({ x: 0.27 * 2.8, z: 0.11 * 2.8, speed: 0.72, height: 0.065 / 2.8 }),
  Object.freeze({ x: -0.14 * 2.8, z: 0.31 * 2.8, speed: 0.49, height: 0.035 / 2.8 }),
]);
export const LAKE_WAVE_FRAMES = Object.freeze(Object.fromEntries(
  LAKE_WAVES.map((wave, i) => [`lakeWave${i}`, { wave: [wave.x, wave.z] }]),
));

export function lakeWavePhases(x, z) {
  return LAKE_WAVES.map(wave => wavePatternOrigin(x, z, wave.x, wave.z));
}

export function lakeWaveRise(phases, clock) {
  return LAKE_WAVES.reduce((sum, wave, i) => sum.add(
    sin(phases[i].sub(clock.mul(wave.speed))).mul(wave.height),
  ), float(0));
}

export function lakeWaveHeight(x, z, seconds) {
  return lakeWavePhases(x, z).reduce((sum, phase, i) => sum
    + Math.sin(phase - seconds * LAKE_WAVES[i].speed) * LAKE_WAVES[i].height, 0);
}
