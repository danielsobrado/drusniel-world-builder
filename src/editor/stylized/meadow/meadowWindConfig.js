/** Meadow-only wind shaping. WorldWindPass still owns the shared weather field. */
export const MEADOW_WIND_DEFAULTS = Object.freeze({
  /** Variation in the shared wavefront phase between individual stems. */
  phaseJitter: 0.18,
  /** Additional downwind pressure where a weather-field gust passes. */
  gustBoost: 0.55,
  /** Smaller wave riding over the broad gust front. */
  secondaryStrength: 0.24,
  /** How strongly gusts amplify tip flutter, within the culling envelope. */
  flutterGust: 0.65,
});

const LIMITS = Object.freeze({
  phaseJitter: [0, 1],
  gustBoost: [0, 2],
  secondaryStrength: [0, 0.75],
  flutterGust: [0, 2],
});

export const MEADOW_WIND_FRONT = Object.freeze({ onset: -0.25, peak: 0.75 });
export const MEADOW_FLUTTER_MAX_GAIN = Math.sqrt(3.5);

export function resolveMeadowWind(source, path = 'stylizedSurface.grass.meadow.wind') {
  if (source === undefined) return MEADOW_WIND_DEFAULTS;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Invalid editor configuration: ${path} must be an object.`);
  }
  const result = { ...MEADOW_WIND_DEFAULTS };
  for (const [key, value] of Object.entries(source)) {
    const limit = LIMITS[key];
    if (!limit) throw new Error(`Invalid editor configuration: ${path}.${key} is unknown.`);
    if (!Number.isFinite(value) || value < limit[0] || value > limit[1]) {
      throw new Error(`Invalid editor configuration: ${path}.${key} must be in [${limit.join(', ')}].`);
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

const unit = value => Math.max(0, Math.min(1, value));
const smooth = (low, high, value) => {
  const r = unit((value - low) / (high - low));
  return r * r * (3 - 2 * r);
};

/** Numeric twins of the two shader envelopes for deterministic tests. */
export function meadowWindFrontNumber(along, phase, time, frequency, speed, phaseJitter) {
  return Math.sin(along * frequency - time * speed + phase * phaseJitter);
}

export function meadowGustPressureNumber(front, gust, gustBoost) {
  return smooth(MEADOW_WIND_FRONT.onset, MEADOW_WIND_FRONT.peak, front)
    * (1 + unit(gust) * gustBoost);
}

export function meadowFlutterGainNumber(envelope, gust, flutterGust) {
  return Math.min(
    MEADOW_FLUTTER_MAX_GAIN,
    Math.sqrt(Math.max(0, Math.min(3.5, envelope))) * (1 + unit(gust) * flutterGust),
  );
}

export function meadowFlutterHeightNumber(ratio, start) {
  return smooth(Math.min(start, 0.98), 1, ratio) ** 2;
}
