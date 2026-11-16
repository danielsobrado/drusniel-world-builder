export const MICROHABITAT_CHANNELS = Object.freeze(['log', 'treeBase', 'water', 'shade', 'gap']);

const DEFAULT_WATER_REACH_METERS = 16;
const LOG_REACH_METERS = 1.7;

function clamp01(value) {
  return value > 1 ? 1 : (value > 0 ? value : 0);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Collects world-space tree root-halo circles `{ x, z, reach }` across the
 * 3x3 chunk neighborhood for microhabitat queries around trunks.
 */
export function collectChunkTreeBases(chunkX, chunkZ, treePlacementsProvider = null, out = []) {
  if (typeof treePlacementsProvider !== 'function') return out;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const trees = treePlacementsProvider(chunkX + dx, chunkZ + dz);
      if (!Array.isArray(trees) || trees.length === 0) continue;
      for (let i = 0; i < trees.length; i += 1) {
        const tree = trees[i];
        const scale = tree.scale ?? 1;
        out.push({
          x: tree.x,
          z: tree.z,
          reach: Math.max(1.8, 2.8 * scale),
          radius: Math.max(0.28, 0.42 * scale),
        });
      }
    }
  }
  return out;
}

function maxTreeBaseProximity(x, z, treeBases) {
  if (!treeBases || treeBases.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < treeBases.length; i += 1) {
    const base = treeBases[i];
    const reach = base.reach;
    const dx = x - base.x;
    const dz = z - base.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= reach * reach) continue;
    const prox = 1 - smoothstep(base.radius, reach, Math.sqrt(distSq));
    if (prox > best) best = prox;
  }
  return best;
}

function maxLogProximity(x, z, logSpines) {
  if (!logSpines || logSpines.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < logSpines.length; i += 1) {
    const log = logSpines[i];
    const vx = log.x1 - log.x0;
    const vz = log.z1 - log.z0;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 1e-6 ? clamp01(((x - log.x0) * vx + (z - log.z0) * vz) / lenSq) : 0.5;
    const dx = x - (log.x0 + vx * t);
    const dz = z - (log.z0 + vz * t);
    const reach = (log.radius ?? 0.24) + LOG_REACH_METERS;
    const distSq = dx * dx + dz * dz;
    if (distSq >= reach * reach) continue;
    const prox = 1 - smoothstep((log.radius ?? 0.24) * 0.85, reach, Math.sqrt(distSq));
    if (prox > best) best = prox;
  }
  return best;
}

/**
 * Computes deterministic world-space microhabitat cues `[0..1]` at `(x, z)` from
 * canopy coverage, water distance, nearby tree bases, and fallen-log spines.
 * Pass `out` to avoid allocations inside per-candidate scatter loops.
 */
export function sampleMicrohabitat(
  x,
  z,
  { habitat = null, treeBases = null, logSpines = null, waterReach = DEFAULT_WATER_REACH_METERS, out = null } = {},
) {
  const target = out ?? { log: 0, treeBase: 0, water: 0, shade: 0, gap: 0 };
  const coverage = clamp01(Number(habitat?.patchCoverage) || 0);
  const edge = clamp01(Number(habitat?.patchEdge) || 0);
  const waterDist = habitat?.waterDistance;

  target.shade = clamp01(coverage * (1 - edge));
  target.gap = clamp01(Math.max(edge, (1 - coverage) * 0.85));
  target.water = Number.isFinite(waterDist) && waterDist < waterReach
    ? 1 - smoothstep(1.2, waterReach, waterDist)
    : 0;
  target.treeBase = maxTreeBaseProximity(x, z, treeBases);
  target.log = maxLogProximity(x, z, logSpines);
  return target;
}

/** Validates and normalizes an optional `affinity` rule block on a scatter variant. */
export function normalizeAffinity(affinity) {
  if (affinity == null) return null;
  if (typeof affinity !== 'object' || Array.isArray(affinity)) {
    throw new Error('Microhabitat affinity must be a plain object.');
  }
  const normalized = {};
  let hasChannel = false;
  for (const key of Object.keys(affinity)) {
    if (!MICROHABITAT_CHANNELS.includes(key)) {
      throw new Error(`Unknown microhabitat channel "${key}".`);
    }
    const val = Number(affinity[key]);
    if (!Number.isFinite(val)) {
      throw new Error(`Microhabitat affinity.${key} must be a finite number.`);
    }
    if (val !== 0) {
      normalized[key] = val;
      hasChannel = true;
    }
  }
  return hasChannel ? Object.freeze(normalized) : null;
}

/**
 * Evaluates a multiplicative species-selection weight from a variant's normalized
 * microhabitat `affinity` profile and the local microhabitat `sample`.
 */
export function microhabitatAffinityWeight(affinity, sample) {
  if (!affinity || !sample) return 1;
  let boost = 0;
  let attenuation = 1;
  for (let i = 0; i < MICROHABITAT_CHANNELS.length; i += 1) {
    const channel = MICROHABITAT_CHANNELS[i];
    const coeff = affinity[channel];
    if (!coeff) continue;
    const signal = sample[channel] ?? 0;
    if (coeff > 0) boost += coeff * signal;
    else attenuation *= Math.max(0.12, 1 + coeff * signal);
  }
  return Math.max(0.08, (1 + boost) * attenuation);
}
