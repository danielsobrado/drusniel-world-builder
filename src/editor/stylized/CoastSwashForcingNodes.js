import { cos, oneMinus, sin, smoothstep } from 'three/tsl';
import { periodicFbm } from './PeriodicNoiseNodes.js';

const TAU = Math.PI * 2;

/** Shared phase and advancing-front coverage for analytic and simulated swash. */
export function coastSwashForcingNodes({ localXZ, patternOrigins, height, clock, config }) {
  const drift = periodicFbm(patternOrigins.latticePoint('drift', localXZ)).mul(TAU * 1.6);
  const breakupPhase = patternOrigins.wavePhase('frontBreakup', localXZ);
  const phase = clock.mul(TAU / config.period).add(drift);
  const frontAt = samplePhase => {
    const excursion = oneMinus(cos(samplePhase)).mul(0.5);
    const breakup = sin(breakupPhase.add(samplePhase.mul(0.17)))
      .mul(config.breakupStrength * config.frontBand);
    return excursion.mul(config.runupHeight + config.breakDepth).sub(config.breakDepth).add(breakup);
  };
  const coverageAt = samplePhase => {
    const front = frontAt(samplePhase);
    return oneMinus(smoothstep(front.sub(config.frontBand), front.add(config.frontBand), height));
  };
  const frontVelocity = sin(phase).mul(
    (config.runupHeight + config.breakDepth) * TAU / (2 * config.period),
  ).add(
    cos(breakupPhase.add(phase.mul(0.17)))
      .mul(0.17 * TAU * config.breakupStrength * config.frontBand / config.period),
  );
  return { phase, frontAt, coverageAt, frontVelocity, front: frontAt(phase) };
}
