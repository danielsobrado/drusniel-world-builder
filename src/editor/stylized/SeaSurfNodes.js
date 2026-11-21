import { clamp, exp, float, fract, max, min, mix, oneMinus, pow, sin, smoothstep, vec2 } from 'three/tsl';
import { directionalCarriers } from '../water/SeaSurfMath.js';
import { SEA_SWELL_COMPONENTS } from '../water/SeaSwell.js';
import { periodicFbm2 } from './PeriodicNoiseNodes.js';
import { createSeaRefractionPhaseNode } from './SeaRefractionNodes.js';
import { createSeaDiffractionPhaseNode } from './SeaDiffractionNodes.js';

/** Depth-following surf on an arbitrary coast; all pattern origins are bounded. */
/**
 * Whitecap breakup, lace and storm streaks. The drift stays slow, but the shapes evolve:
 * the warp cycles in about a minute, and the fine octave drifts against the coarse one,
 * so a foam patch reshapes within seconds instead of sliding by unchanged for minutes.
 */
const FOAM_WARP_RATE = [0.093, 0.069];
const FOAM_FINE_DRIFT = [-0.06, 0.045];

export function createSeaFoamNoise(patterns, localXZ, time) {
  const point=patterns.latticePoint('surfLace',localXZ)
    .add(vec2(time.mul(0.021).mod(512),time.mul(-0.013).mod(512)));
  // Independent, bounded phases warp the lattice without creating chunk seams.
  // The old sea-normal height channel repeated the same crest stamp every 5 m.
  const warp=vec2(
    sin(patterns.wavePhase('surfLaceWarpX',localXZ).add(time.mul(FOAM_WARP_RATE[0]).mod(Math.PI*2))),
    sin(patterns.wavePhase('surfLaceWarpZ',localXZ).sub(time.mul(FOAM_WARP_RATE[1]).mod(Math.PI*2))),
  ).mul(0.85);
  const warped = point.add(warp);
  // Wrapped by the noise's 512-cell period, so the fine octave stays seamless across chunks.
  const fineDrift = vec2(time.mul(FOAM_FINE_DRIFT[0]).mod(512), time.mul(FOAM_FINE_DRIFT[1]).mod(512));
  return periodicFbm2(warped).mul(.7)
    .add(periodicFbm2(warped.mul(4).add(vec2(19.3, 7.1)).add(fineDrift)).mul(.3)).toVar('seaFoamField');
}

export function createSeaSurfNodes({
  swell, waterDepth, shoreDistance, localXZ, patterns, time, settings,
  offshoreAmplitude, legacyAmplitude, exposure, seaMask, waterCoverage,
}) {
  if (settings.enabled && settings.model === 'directionalBreakers' && patterns) {
    return createDirectionalSurfNodes({
      swell, waterDepth, shoreDistance, localXZ, patterns, time, settings,
      offshoreAmplitude, legacyAmplitude, exposure, seaMask, waterCoverage,
    });
  }
  if (!settings.enabled || !patterns) return null;
  const wave = SEA_SWELL_COMPONENTS[0];
  const along = patterns.wavePhase('surfAlong', localXZ);
  const group = patterns.wavePhase('surfGroup', localXZ)
    .add(time.mul(wave.angularSpeed * settings.setGroup).mod(Math.PI * 2));
  const set = oneMinus(sin(group.add(sin(along).mul(1.6))).mul(0.5).add(0.5).mul(settings.setDepth));
  // Increasing depth advances phase; positive time sends each crest ashore.
  const phase = float(wave.phase).add(time.mul(wave.angularSpeed).mod(Math.PI * 2))
    .add(sin(along).mul(settings.phaseWarp)).add(waterDepth.mul(settings.depthPhaseScale));
  const s = sin(phase);
  const near = s.add(s.mul(s).sub(0.5).mul(0.45)).div(1.225).mul(set);
  const offshore = smoothstep(settings.fadeStart, settings.fadeEnd, waterDepth);
  const lace = createSeaFoamNoise(patterns,localXZ,time);
  const age = fract(phase.sub(Math.PI / 2).div(Math.PI * 2));
  const zone = smoothstep(settings.breakDepthStart, settings.breakDepthFull, waterDepth)
    .mul(oneMinus(smoothstep(settings.breakDepthFade, settings.breakDepthEnd, waterDepth)))
    .mul(smoothstep(1 - settings.setDepth * 0.6 - 0.001, 1 - settings.setDepth * 0.1, set))
    .mul(oneMinus(offshore));
  const roll = smoothstep(0.92, 0.985, age).mul(smoothstep(0.5, 0.8, lace));
  const trail = exp(age.mul(-settings.trail))
    .mul(smoothstep(age.mul(0.5).add(0.45), age.mul(0.5).add(0.7), lace));
  // Over a gently shelving bed the depth term crowds crests closer than a
  // pixel; drawn there they aliased into white fingerprint whorls.
  const resolved = oneMinus(smoothstep(0.35, 1.1, phase.fwidth()));
  return {
    foamNoise: lace,
    height: mix(near, swell.height, offshore),
    offshore,
    foam: max(roll, trail).mul(zone).mul(resolved).mul(float(settings.strength)),
  };
}

/** Shoreline distance provides a coherent scalar phase over flat shelves and curved coasts. */
function createDirectionalSurfNodes({
  swell, waterDepth, shoreDistance, localXZ, patterns, time, settings,
  offshoreAmplitude, legacyAmplitude, exposure, seaMask, waterCoverage,
}) {
  const { directional, breaking } = settings;
  const phases = [];
  const packets = [];
  let packetEnergy = float(0);

  directionalCarriers.forEach((wave, index) => {
    const carrierPhase = float(wave.phase).add(time.mul(wave.angularSpeed).mod(Math.PI * 2))
      .add(shoreDistance.mul(directional.waveNumbers[index]))
      .add(patterns.wavePhase(`surfOblique${index}`, localXZ));
    const refractedPhase = settings.refraction.enabled
      ? carrierPhase.add(createSeaRefractionPhaseNode({
        waterDepth, shoreDistance, wave, referenceWaveNumber: directional.waveNumbers[index],
        directional, settings: settings.refraction,
      }))
      : carrierPhase;
    const phase = settings.diffraction.enabled
      ? refractedPhase.add(createSeaDiffractionPhaseNode({
        exposure, shoreDistance, wave, settings: settings.diffraction,
      })).toVarying(`seaCoastalSurfPhase${index}`)
      : settings.refraction.enabled ? refractedPhase.toVarying(`seaRefractedSurfPhase${index}`)
        : refractedPhase;
    const packetA = patterns.wavePhase(`surfPacketA${index}`, localXZ)
      .add(time.mul(wave.angularSpeed * 0.08).mod(Math.PI * 2));
    const packetB = patterns.wavePhase(`surfPacketB${index}`, localXZ)
      .sub(time.mul(wave.angularSpeed * 0.05).mod(Math.PI * 2));
    const packet = clamp(float(0.78).add(sin(packetA).mul(0.14)
      .add(sin(packetB).mul(0.08)).mul(directional.packetModulation)),
    directional.packetMinimum, directional.packetMaximum);
    phases.push(phase);
    packets.push(packet);
    packetEnergy = packetEnergy.add(packet.mul(directional.carrierWeights[index]));
  });

  const blend = smoothstep(settings.fadeStart, settings.fadeEnd, waterDepth);
  const gain = clamp(pow(
    float(breaking.shoalingReferenceDepthMeters).div(
      max(waterDepth, float(breaking.minimumCalculationDepthMeters))), 0.25),
  1, breaking.maximumShoalingGain);
  const incident = offshoreAmplitude.mul(exposure).mul(gain);
  const ratio = incident.mul(packetEnergy).mul(2).div(
    max(waterDepth, float(1e-6)).mul(breaking.gamma));
  const breakingIntensity = smoothstep(breaking.onsetRatio, breaking.fullRatio, ratio)
    .mul(smoothstep(breaking.shallowFadeStartMeters, breaking.shallowFadeEndMeters, waterDepth))
    .mul(oneMinus(blend))
    .toVar('seaBreakerIntensity');
  const skew = float(breaking.minimumCrestSkew)
    .add(breakingIntensity.mul(breaking.maximumCrestSkew - breaking.minimumCrestSkew));
  const norm = float(1).add(skew.mul(0.28));

  let nearHeight = float(0);
  let foamCrests = float(0);
  phases.forEach((phase, index) => {
    const s = sin(phase);
    const shapedPhase = phase.add(skew.mul(s));
    const shape = sin(shapedPhase)
      .add(s.mul(s).sub(0.5).mul(skew).mul(0.28)).div(norm);
    const weight = packets[index].mul(directional.carrierWeights[index]);
    nearHeight = nearHeight.add(shape.mul(weight));
    const age = fract(phase.sub(Math.PI / 2).div(Math.PI * 2));
    const crest = smoothstep(0.65, 0.95, sin(shapedPhase))
      .mul(breaking.rollerStrength);
    const trail = smoothstep(0, 0.045, age)
      .mul(exp(age.mul(-breaking.trailDecay)))
      .mul(oneMinus(smoothstep(0.85, 1, age)));
    foamCrests = max(foamCrests, max(crest, trail).mul(weight));
  });
  nearHeight = clamp(nearHeight.div(max(packetEnergy, float(1e-6))), -1, 1);
  const depthCap = waterDepth.mul(0.5 * breaking.gamma);
  const visibleAmplitude = min(incident.mul(packetEnergy), depthCap)
    .mul(oneMinus(breakingIntensity.mul(breaking.dissipationStrength)))
    .mul(smoothstep(breaking.shallowFadeStartMeters, breaking.shallowFadeEndMeters, waterDepth))
    .mul(seaMask).mul(waterCoverage);
  const amplitude = mix(visibleAmplitude, legacyAmplitude, blend)
    .toVarying('seaDirectionalAmplitude');
  const height = mix(nearHeight, swell.height, blend);
  const displacement = mix(nearHeight.mul(visibleAmplitude),
    swell.height.mul(legacyAmplitude), blend);
  const foamNoise = createSeaFoamNoise(patterns, localXZ, time);
  const resolved = oneMinus(smoothstep(0.35, 1.1, phases[0].fwidth()));
  const foam = foamCrests.mul(breakingIntensity)
    .mul(smoothstep(0.35, 0.82, foamNoise))
    .mul(resolved).mul(settings.strength)
    .mul(oneMinus(blend)).mul(seaMask).mul(waterCoverage);
  return {
    height, displacement, amplitude, offshore: blend, foam, foamNoise,
    breaking: breakingIntensity,
  };
}
