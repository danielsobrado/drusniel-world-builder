import { fitFootprintToGround } from './groundSeating.js';

/**
 * Footprint seating for boulders in canonical metres: sinks toward the lowest
 * support and computes a gentle partial slope tilt (`~38%`, capped near 22°)
 * from the same five height samples so stones settle naturally on hillsides.
 */
export function fitRockToGround(placement, footprint, heightAt) {
  const reach = Math.max(0.4, footprint * placement.scale * 0.45);
  const fit = fitFootprintToGround({
    x: placement.x,
    z: placement.z,
    reach,
    heightAt,
    sinkShare: 0.7,
    bury: 0,
    tiltShare: 0.38,
    maxTiltSin: 0.38,
  });
  if (!fit) return null;
  // A boulder spanning an unsupported cliff is rejected rather than buried
  // through the entire bank. Ordinary slopes seat toward the lowest support.
  if (fit.high - fit.low > reach * 2 * 1.2) return null;
  return {
    groundFitHeight: fit.height,
    groundNormal: fit.normal ? Object.freeze(fit.normal) : null,
  };
}
