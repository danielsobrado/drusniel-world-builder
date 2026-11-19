import { resolveSeaOptics, seaOpticsMode } from './SeaOptics.js';

const EPSILON = 1e-6;
const LUMINANCE = Object.freeze([0.2126, 0.7152, 0.0722]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Refraction of an air-side viewing ray through a flat water interface. */
export function refractedSeaCosine(airCosine, refractiveIndex = 1.333) {
  const cosine = clamp(Number.isFinite(airCosine) ? Math.abs(airCosine) : 1, 0, 1);
  return Math.sqrt(Math.max(0, 1 - (1 - cosine * cosine) / (refractiveIndex * refractiveIndex)));
}

export function seaOpticalPathLength(depthMeters, airCosine = 1, settings = {}) {
  const { maximumMeters, refractiveIndex, minimumCosine } = settings;
  const pathCosine = Math.max(minimumCosine ?? 0.15,
    refractedSeaCosine(airCosine, refractiveIndex ?? 1.333));
  return clamp(Math.max(0, Number.isFinite(depthMeters) ? depthMeters : 0) / pathCosine,
    0, maximumMeters ?? 43);
}

export function seaOpticalCoefficients(settings, storm = 0, mode = 'singleScatter') {
  const turbidity = 1 + (settings.scattering.stormTurbidityMultiplier - 1) * clamp(Number.isFinite(storm) ? storm : 0, 0, 1);
  const scattering = settings.scatteringCoefficients.map(v => mode === 'absorption' ? 0 : v * turbidity);
  const extinction = settings.absorptionCoefficients.map((v, i) => v + scattering[i]);
  return { scattering, extinction };
}

/** CPU reference for the TSL single-scattering path, with linear RGB inputs. */
export function computeSeaOpticsSample({
  depthMeters = 0, viewCosine = 1, sceneColor = [1, 1, 1],
  sourceColor = [0.1, 0.25, 0.3], storm = 0, settings: input = {},
  tier = 'high', opticalDistance = null,
} = {}) {
  const settings = resolveSeaOptics(input);
  const mode = seaOpticsMode(settings, tier);
  const distance = opticalDistance === null
    ? seaOpticalPathLength(depthMeters, viewCosine, settings.opticalDistance)
    : clamp(Number.isFinite(opticalDistance) ? opticalDistance : 0, 0, settings.opticalDistance.maximumMeters);
  const { scattering, extinction } = seaOpticalCoefficients(settings, storm,
    mode === 'legacy' ? 'absorption' : mode);
  const transmission = extinction.map(value => Math.exp(-value * distance));
  const scattered = transmission.map((through, i) =>
    clamp(sourceColor[i] * scattering[i] / Math.max(extinction[i], EPSILON) * (1 - through), 0, 2));
  const color = sceneColor.map((channel, i) => channel * transmission[i] + scattered[i]);
  const visibility = clamp(transmission.reduce((sum, value, i) => sum + value * LUMINANCE[i], 0)
    * settings.seabed.visibilityStrength, 0, 1);
  return { mode, opticalDistance: distance, extinction, transmission, scattered, color, visibility };
}
