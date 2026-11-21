import { OFFSHORE_FFT_WIND } from './OceanFftConstants.js';

/**
 * The offshore FFT's wind from the world's resolved weather (PR I phase I.5). Pure.
 *
 * Input is what `WorldWindPass` already resolved this frame, the one prevailing wind
 * every swaying thing follows: `directionDegrees` (+X toward +Z) and `intensity`
 * (1 = the authored breeze, 0.45 still air, 2.4 a full storm, storm curves applied).
 * Speed = referenceWindSpeed · intensity, so the authored breeze is the reference
 * sea and a storm is ≈ 2.4× its wind, not a second storm multiplier on the slopes.
 * Weather off → the documented reference breeze along the primary swell.
 */
export const FFT_WIND_DEADBAND = Object.freeze({ speed: 0.5, direction: (3 * Math.PI) / 180 });
const MAX_INTENSITY = 2.4;

/** { windSpeed (m/s), windDirection (rad) } for a weather sample, or the reference breeze. */
export function resolveFftWind(weather, { referenceWindSpeed }) {
  const intensity = Number(weather?.intensity);
  const degrees = Number(weather?.directionDegrees);
  if (!weather?.enabled || !Number.isFinite(intensity) || !Number.isFinite(degrees)) {
    return { windSpeed: referenceWindSpeed, windDirection: OFFSHORE_FFT_WIND.windDirection };
  }
  return {
    windSpeed: referenceWindSpeed * Math.min(Math.max(intensity, 0), MAX_INTENSITY),
    windDirection: Math.atan2(Math.sin(degrees * Math.PI / 180), Math.cos(degrees * Math.PI / 180)),
  };
}

/** Signed shortest angle between two headings, (−π, π]. */
export const headingDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Whether `next` differs enough from `current` to rebuild the spectrum. */
export function windChanged(current, next) {
  return Math.abs(next.windSpeed - current.windSpeed) > FFT_WIND_DEADBAND.speed
    || Math.abs(headingDelta(current.windDirection, next.windDirection)) > FFT_WIND_DEADBAND.direction;
}
