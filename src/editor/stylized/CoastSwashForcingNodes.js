import { cos, float, oneMinus, sin, smoothstep } from 'three/tsl';
import { periodicFbm } from './PeriodicNoiseNodes.js';

const TAU = Math.PI * 2;

/** Shared phase and advancing-front coverage for analytic and simulated swash. */
export function coastSwashForcingNodes({ localXZ, patternOrigins, height, clock, config,
  runupScale = float(1), phaseLag = float(0) }) {
  const drift = periodicFbm(patternOrigins.latticePoint('drift', localXZ)).mul(TAU * 1.6);
  const breakupPhase = patternOrigins.wavePhase('frontBreakup', localXZ);
  const phase = clock.mul(TAU / config.period).add(drift).add(phaseLag);
  const frontHeight = runupScale.mul(config.runupHeight).add(config.breakDepth);
  const frontAt = samplePhase => {
    const excursion = oneMinus(cos(samplePhase)).mul(0.5);
    // Two incommensurate along-shore harmonics produce organic scalloped swash
    // tongues rather than a uniform sinusoidal wave line.
    const primaryScallop = sin(breakupPhase.add(samplePhase.mul(0.17))).mul(0.68);
    const secondaryScallop = sin(breakupPhase.mul(2.13).sub(samplePhase.mul(0.29)).add(drift.mul(0.45))).mul(0.32);
    const breakup = primaryScallop.add(secondaryScallop)
      .mul(config.breakupStrength * config.frontBand);
    return excursion.mul(frontHeight).sub(config.breakDepth).add(breakup.mul(runupScale));
  };
  const coverageAt = samplePhase => {
    const front = frontAt(samplePhase);
    return oneMinus(smoothstep(front.sub(config.frontBand), front.add(config.frontBand), height));
  };
  const frontVelocity = sin(phase).mul(
    frontHeight.mul(TAU / (2 * config.period)),
  ).add(
    cos(breakupPhase.add(phase.mul(0.17))).mul(0.68 * 0.17)
      .sub(cos(breakupPhase.mul(2.13).sub(phase.mul(0.29)).add(drift.mul(0.45))).mul(0.32 * 0.29))
      .mul(runupScale).mul(TAU * config.breakupStrength * config.frontBand / config.period),
  );
  return { phase, frontAt, coverageAt, frontVelocity, front: frontAt(phase) };
}
