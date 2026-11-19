import { Color } from 'three/webgpu';
import { abs, cameraPosition, dot, exp, float, mix, oneMinus, positionWorld, pow, smoothstep, sqrt, vec3 } from 'three/tsl';
import { resolveSeaOptics, seaOpticsMode } from '../water/SeaOptics.js';
import { seaStateUniforms } from '../water/seaState.js';
import { skyLightUniforms } from './sky/skyLight.js';

const VISIBILITY_RGB = vec3(0.2126, 0.7152, 0.0722);

function colorNode(value) {
  const color = new Color(value);
  return vec3(color.r, color.g, color.b);
}

export function seaDirectionalScatter(cosine, anisotropy) {
  const forward = cosine.clamp(-1, 1);
  const denominator = pow(float(1 + anisotropy * anisotropy).sub(forward.mul(2 * anisotropy)).max(0.001), 1.5);
  return float(1 - anisotropy * anisotropy).div(denominator).clamp(0.6, 1.6);
}

/** Above-water and underwater ocean transport use the same extinction coefficients. */
export function createSeaOpticsNodes(waterDepth, source, tier = 'high') {
  const settings = resolveSeaOptics(source);
  const mode = seaOpticsMode(settings, tier);
  const palette = name => mix(colorNode(settings.sunny[name]), colorNode(settings.storm[name]), seaStateUniforms.storm);
  const shallow = mix(palette('lagoon'), palette('shallow'), smoothstep(settings.lagoonStart, settings.lagoonEnd, waterDepth));
  const byDepth = mix(shallow, palette('deep'), smoothstep(settings.deepStart, settings.deepEnd, waterDepth));
  const far = smoothstep(60, 450, positionWorld.xz.distance(cameraPosition.xz));
  const absorption = vec3(...settings.absorptionCoefficients);
  const turbidity = mix(float(1), float(settings.scattering.stormTurbidityMultiplier), seaStateUniforms.storm);
  const scattering = mode === 'legacy' || mode === 'absorption'
    ? vec3(0) : vec3(...settings.scatteringCoefficients).mul(turbidity);
  const extinction = absorption.add(scattering);

  function pathLength(airCosine, verticalMeters) {
    const cosine = abs(airCosine).clamp(0, 1);
    const insideCosine = sqrt(oneMinus(oneMinus(cosine.mul(cosine))
      .div(settings.opticalDistance.refractiveIndex ** 2)).max(0));
    return verticalMeters.max(0).div(insideCosine.max(settings.opticalDistance.minimumCosine))
      .min(settings.opticalDistance.maximumMeters);
  }

  function sample(distance, depth, sunDirection = null, viewDirection = null) {
    const transmission = exp(extinction.mul(distance.negate()));
    const sunlightCosine = sunDirection ? sunDirection.y.max(0.15) : float(1);
    const sunTransmission = exp(absorption.mul(depth.max(0).mul(-0.5).div(sunlightCosine)));
    let sunlight = skyLightUniforms.sunColor.mul(settings.scattering.sunlightStrength).mul(sunTransmission);
    if (mode === 'directionalSingleScatter' && sunDirection && viewDirection) {
      sunlight = sunlight.mul(seaDirectionalScatter(dot(sunDirection, viewDirection), settings.scattering.anisotropy));
    }
    const sourceRadiance = palette('lagoon').mul(settings.scattering.ambientStrength)
      .add(palette('shallow').mul(sunlight))
      .mul(oneMinus(seaStateUniforms.storm.mul(0.2)));
    const scattered = sourceRadiance.mul(scattering.div(extinction.max(vec3(1e-4))))
      .mul(oneMinus(transmission));
    const visibility = dot(transmission, VISIBILITY_RGB).mul(settings.seabed.visibilityStrength).clamp(0, 1);
    return { transmission, scattered, visibility, sunTransmission };
  }

  return {
    settings, mode,
    color: mix(byDepth, palette('deep').mul(0.85), far.mul(0.6)),
    absorption, scattering, extinction, pathLength, sample,
  };
}
