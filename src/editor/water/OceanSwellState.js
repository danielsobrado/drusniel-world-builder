import { Vector4 } from 'three';
import { frameUniform as uniform } from '../../render/FrameUniforms.js';
import { resolveOffshoreFft } from './fft/OceanFftConfig.js';
import { resolveFftWind } from './fft/OceanFftWeather.js';
import {
  createOceanSwellModes, OCEAN_SWELL_MODE_COUNT, oceanSwellAmplitudeBound, oceanSwellAmplitudes,
  oceanSwellTimePhase, sampleOceanSwellCpu,
} from './OceanSwellModes.js';

/**
 * The long swell's per-frame state (PR I phase I.6), shared by the water shader
 * and gameplay water queries the way `seaState` shares the storm: module state,
 * because materials are built before anything drives it.
 *
 * Each frame, once: amplitudes ease toward the wind's (frame time; the weather is
 * the authority), and every mode's time phase is taken from the absolute water
 * clock in double precision. The shader reads both as uniforms; the CPU reads
 * the same arrays. Nothing here depends on the GPU FFT being available.
 */

const VEC4S = OCEAN_SWELL_MODE_COUNT / 4;
export const OCEAN_SWELL_MODES = createOceanSwellModes();
/** Amplitudes (m) and time phases (rad), four modes per vec4, for the shader. */
export const oceanSwellUniforms = Object.freeze({
  amplitude: Array.from({ length: VEC4S }, () => uniform(new Vector4())),
  timePhase: Array.from({ length: VEC4S }, () => uniform(new Vector4())),
});

let settings = null; // resolved offshoreFft when geometry is on, else null
let headroom = 0;
const target = new Float64Array(OCEAN_SWELL_MODE_COUNT);
const amplitudes = new Float64Array(OCEAN_SWELL_MODE_COUNT);
let waterTime = 0;
let lastRealSeconds = null;
let primed = false;
const scratch = [0, 0, 0];

function writeUniforms() {
  for (let v = 0; v < VEC4S; v++) {
    oceanSwellUniforms.amplitude[v].value.fromArray(amplitudes, 4 * v);
    const phase = oceanSwellUniforms.timePhase[v].value;
    phase.set(...[0, 1, 2, 3].map((j) => oceanSwellTimePhase(OCEAN_SWELL_MODES[4 * v + j], waterTime)));
  }
}

/** From `configureSea`: on only with `water.sea.offshoreFft.enabled` and its `geometry.enabled`. */
export function configureOceanSwell(sea) {
  const resolved = sea ? resolveOffshoreFft(sea.offshoreFft) : null;
  // `enabled` is the master switch: off restores the original sea, swell included.
  settings = resolved?.enabled && resolved.geometry.enabled ? resolved : null;
  // Storm ceiling of the wind mapping (OceanFftWeather): 2.4 × the reference breeze.
  headroom = settings ? oceanSwellAmplitudeBound(OCEAN_SWELL_MODES, settings.weather.referenceWindSpeed * 2.4) : 0;
  oceanSwellAmplitudes(OCEAN_SWELL_MODES, resolveFftWind(null, resolved?.weather ?? { referenceWindSpeed: 10 }), target);
  amplitudes.set(settings ? target : target.fill(0));
  primed = false;
  lastRealSeconds = null;
  writeUniforms();
}

export const oceanSwellEnabled = () => settings !== null;
/** Metres the swell can add above or below the water field: slot bounds headroom. */
export const oceanSwellHeadroom = () => headroom;
/** The blend thresholds the swell fades with (the FFT normals' geography). */
export const oceanSwellBlend = () => settings?.blend ?? null;

/**
 * Once per frame, after the water clock: `weather` is `{ enabled, directionDegrees,
 * intensity }` (WorldWindPass), `realSeconds` the frame timestamp. The first weather
 * sample snaps; later ones ease with the configured transition time.
 */
export function updateOceanSwell({ waterTimeSeconds, realSeconds, weather }) {
  if (!settings) return;
  if (Number.isFinite(waterTimeSeconds)) waterTime = waterTimeSeconds;
  if (weather) oceanSwellAmplitudes(OCEAN_SWELL_MODES, resolveFftWind(weather, settings.weather), target);
  const dt = lastRealSeconds === null || !Number.isFinite(realSeconds) ? 0 : Math.min(0.25, Math.max(0, realSeconds - lastRealSeconds));
  if (Number.isFinite(realSeconds)) lastRealSeconds = realSeconds;
  if (!primed && weather) {
    amplitudes.set(target);
    primed = true;
  } else {
    // ~95 % of the way in transitionSeconds; exponential, so a retarget is continuous.
    const blend = 1 - Math.exp((-3 * dt) / settings.weather.transitionSeconds);
    for (let i = 0; i < amplitudes.length; i++) amplitudes[i] += (target[i] - amplitudes[i]) * blend;
  }
  writeUniforms();
}

/** Finish easing now (QA captures). */
export function settleOceanSwell() {
  if (!settings) return;
  amplitudes.set(target);
  writeUniforms();
}

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

/** Where the swell stands, 0..1: offshore depth × shore distance × exposure (CPU twin of the shader weight). */
export function oceanSwellWeight(depth, shoreDistance, exposure) {
  const blend = settings?.blend;
  if (!blend) return 0;
  return smooth(blend.depthStartMeters, blend.depthEndMeters, depth)
    * smooth(blend.shoreStartMeters, blend.shoreEndMeters, shoreDistance)
    * Math.min(Math.max(exposure, 0), 1);
}

/** The swell's height (m) at canonical (x, z) of open-ocean water, as drawn this frame. */
export function oceanSwellOffset(x, z, depth, shoreDistance, exposure) {
  const weight = oceanSwellWeight(depth, shoreDistance, exposure);
  if (weight === 0) return 0;
  return weight * sampleOceanSwellCpu(OCEAN_SWELL_MODES, amplitudes, x, z, waterTime, scratch)[0];
}

/** Test and QA view of the current amplitudes (copy). */
export const oceanSwellAmplitudesNow = () => Float64Array.from(amplitudes);
