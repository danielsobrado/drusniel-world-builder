import { WATER_KIND_OCEAN } from './WaterConstants.js';

const CONTEXT_CELLS = 16;
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;

/** Visual priors only. Azgaar terrain IDs and canonical water remain unchanged. */
export function waterBiomeContext(biome) {
  return {
    organic: biome === 12 ? 1 : [5, 6, 7, 8].includes(biome) ? .25 : 0,
    cold: biome === 11 ? 1 : biome === 10 ? .85 : biome === 9 ? .55 : biome === 2 ? .25 : 0,
  };
}

/** A small world-aligned context lattice, cached only for this generated page.
 * Smooth numeric properties across biome borders; never blend discrete kinds.
 * Sampling cost scales with coarse context cells, not every water vertex.
 */
export function createWaterAppearanceSampler(sampleBiome = () => 0) {
  const cache = new Map();
  const at = (x, z) => {
    const key = `${x}:${z}`;
    if (!cache.has(key)) {
      const sum = { organic: 0, cold: 0 };
      // Include nearby land when the lattice point itself is marine.
      let weight = 0;
      for (const [dx, dz] of [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]]) {
        const biome = sampleBiome(x * CONTEXT_CELLS + dx, z * CONTEXT_CELLS + dz);
        if (biome === 0) continue;
        const context = waterBiomeContext(biome);
        sum.organic += context.organic; sum.cold += context.cold; weight++;
      }
      cache.set(key, { organic: sum.organic / Math.max(1, weight), cold: sum.cold / Math.max(1, weight) });
    }
    return cache.get(key);
  };
  return (x, z, kind, shoreDistance) => {
    const cx = Math.floor(x / CONTEXT_CELLS), cz = Math.floor(z / CONTEXT_CELLS);
    const tx = smooth(x / CONTEXT_CELLS - cx), tz = smooth(z / CONTEXT_CELLS - cz);
    const corners = [at(cx, cz), at(cx + 1, cz), at(cx, cz + 1), at(cx + 1, cz + 1)];
    const value = key => mix(mix(corners[0][key], corners[1][key], tx), mix(corners[2][key], corners[3][key], tx), tz);
    return { organic: kind === WATER_KIND_OCEAN ? value('organic') * .16 : value('organic'), cold: value('cold'),
      exposure: kind === WATER_KIND_OCEAN ? seaExposure(shoreDistance) : 0 };
  };
}

/** Bounded local shelter proxy, shared by CPU wave queries and the shader.
 * Narrow inlets have no point far from a bank. This is not a wind-fetch solver.
 */
export function seaExposure(shoreDistance = 48) {
  const t = Math.max(0, Math.min(1, (shoreDistance - 4) / 32));
  return .3 + .7 * smooth(t);
}
