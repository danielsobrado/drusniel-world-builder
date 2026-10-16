import { cos, mix, sin, smoothstep, vec2 } from 'three/tsl';
import { meadowNoise } from './meadowNoise.js';
import { MEADOW_TUFT_FIELD as F } from './meadowTuftField.js';

const TAU = Math.PI * 2;
const offset = ([x, z]) => vec2(x, z);

/**
 * The tuft field at a stem (meadowTuftField.js; CPU twin meadowTuftOccupancy).
 * `occupancy` is 0 between plants and 1 in a tuft's core; `lean` is the unit
 * resting direction the tuft's stems share.
 */
export function meadowTuftNodes(canonical) {
  const core = meadowNoise(canonical.div(F.coreMeters).add(offset(F.coreOffset)));
  const cluster = meadowNoise(canonical.div(F.clusterMeters).add(offset(F.clusterOffset)));
  const occupancy = smoothstep(F.low, F.high, mix(cluster, core, F.coreWeight));
  const angle = meadowNoise(canonical.div(F.leanMeters).add(offset(F.leanOffset))).mul(TAU * F.leanTurns);
  return { occupancy, lean: vec2(cos(angle), sin(angle)) };
}
