import { clusterNoise, stoneHash01 } from './stonePlacementSink.js';

export const SHORE_HABITATS = Object.freeze({
  starfish: Object.freeze({ reachMeters: 12, minimumNormalY: 0.9, damp: true }),
  shell: Object.freeze({ reachMeters: 18, minimumNormalY: 0.88, damp: true }),
  driftwood: Object.freeze({ reachMeters: 24, minimumNormalY: 0.75, damp: false }),
  groundcover: Object.freeze({ reachMeters: 48, minimumNormalY: 0.65, damp: false }),
});

/** Donor coast-field moisture, patch clustering and terrain-normal placement. */
export function evaluateShoreHabitat(candidate, rule, { distanceAt, heightAt, waterAt, seaLevel }) {
  const distance = distanceAt(candidate.x, candidate.z);
  if (!(distance > 0 && distance <= rule.reachMeters)) return null;
  const water = waterAt(candidate.x, candidate.z);
  if (water?.kind && water.coverage >= 0.5) return null;
  const step = 0.2;
  const dx = (heightAt(candidate.x + step, candidate.z) - heightAt(candidate.x - step, candidate.z)) / (step * 2);
  const dz = (heightAt(candidate.x, candidate.z + step) - heightAt(candidate.x, candidate.z - step)) / (step * 2);
  const length = Math.hypot(dx, 1, dz);
  const normal = [-dx / length, 1 / length, -dz / length];
  if (!(normal[1] >= rule.minimumNormalY)) return null;
  const moisture = Math.max(0, Math.min(1, 1 - (candidate.height - seaLevel) / 2.4))
    * (1 - distance / rule.reachMeters);
  const patch = clusterNoise(candidate.x, candidate.z, 14, 0xbeac);
  const chance = (0.35 + 0.65 * patch * patch) * (rule.damp ? 0.35 + moisture * 0.65 : 1);
  const roll = stoneHash01(Math.round(candidate.x * 100), Math.round(candidate.z * 100), 0x51fe);
  if (roll > chance) return null;
  return { groundNormal: Object.freeze(normal), shoreMoisture: moisture, oceanDistance: distance };
}
