import { cos, float, sin, vec2 } from 'three/tsl';
import { OCEAN_SWELL_MODES, oceanSwellUniforms } from '../water/OceanSwellState.js';

const LANES = ['x', 'y', 'z', 'w'];

/**
 * The long swell (PR I phase I.6) as TSL: twin of `sampleOceanSwellCpu`.
 *
 * phase = origin (chunk centre, f64-wrapped on the CPU) + k·(local·d) − timePhase (f64-wrapped
 * per frame); |local·k| ≤ 64 m · 0.13 rad/m, so f32 holds it at any world position. Amplitudes
 * and time phases are the frame uniforms gameplay reads too.
 *
 * @param {object} options.localXZ vec2 node: metres from the chunk centre, canonical axes
 * @param {Array<object>} options.origin four vec4 nodes: each mode's phase at the chunk centre
 * @returns {{ height: object, slope: object }} metres and ∂h/∂x, ∂h/∂z
 */
export function createOceanSwellNodes({ localXZ, origin }) {
  let height = float(0);
  let slope = vec2(0, 0);
  OCEAN_SWELL_MODES.forEach((mode, index) => {
    const vector = index >> 2, lane = LANES[index & 3];
    const phase = origin[vector][lane]
      .add(localXZ.x.mul(mode.x * mode.waveNumber))
      .add(localXZ.y.mul(mode.z * mode.waveNumber))
      .sub(oceanSwellUniforms.timePhase[vector][lane]);
    const amplitude = oceanSwellUniforms.amplitude[vector][lane];
    height = height.add(amplitude.mul(sin(phase)));
    slope = slope.add(vec2(mode.x, mode.z).mul(amplitude.mul(cos(phase)).mul(mode.waveNumber)));
  });
  return { height, slope };
}
