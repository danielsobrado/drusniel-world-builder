import { completeIterator } from './ResumableIterator.js';
import {
  clusterNoise,
  createStonePlacementSink,
  smoothstep,
  stoneHash01,
} from './stonePlacementSink.js';

/**
 * Pebbles and small stones on beaches (after grass-test's beach scatter).
 *
 * Jittered candidates stand within `band` metres above sea level and within
 * reach of an actual ocean body. Clustering leaves clean sand between drifts.
 * The ocean distance field excludes inland lakes, even at the same elevation.
 *
 * Most chunks are nowhere near the sea: five height samples reject them before
 * any candidate is tried.
 */

export const DEFAULT_COAST_STONES = Object.freeze({
  enabled: true,
  spacingMeters: 3,
  band: 1.8,
  keep: 0.35,
  clusterMeters: 14,
  minScale: 0.12,
  maxScale: 0.38,
});

/** Chunks whose sampled ground is further than this from sea level are skipped. */
const CHUNK_REJECT_MARGIN = 12;

/**
 * @param {object} options sink options (see createStonePlacementSink), plus:
 * @param {number} options.seaLevel
 * @param {object} [options.config] `rocks.coast`
 */
export function* iterateCoastStones({ seaLevel, config = DEFAULT_COAST_STONES, coastalDistanceAt = null, ...sinkOptions }) {
  if (!config.enabled) return [];
  const sink = createStonePlacementSink({ prefix: 'coast-rock', ...sinkOptions });
  const { tileSize, heightAt } = sinkOptions;
  const { minX, minZ, maxX, maxZ } = sink.cells;
  const x0 = minX * tileSize;
  const x1 = maxX * tileSize;
  const z0 = -maxZ * tileSize;
  const z1 = -minZ * tileSize;
  const probes = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]
    .map(([x, z]) => heightAt(x, z) - seaLevel);
  if (Math.min(...probes) > config.band + CHUNK_REJECT_MARGIN
      || Math.max(...probes) < -CHUNK_REJECT_MARGIN) {
    return [];
  }
  const spacing = config.spacingMeters;
  // One grid row and column before the chunk as well: a candidate jitters up to
  // a whole spacing from its grid point, so one from the row before can land in
  // this chunk, and no other chunk would try it. The sink keeps only the
  // candidates this chunk owns, so none is placed twice.
  for (let gz = Math.ceil(z0 / spacing) - 1; gz * spacing < z1; gz += 1) {
    for (let gx = Math.ceil(x0 / spacing) - 1; gx * spacing < x1; gx += 1) {
      yield;
      const rolls = [0, 1, 2, 3, 4, 5, 6].map((channel) => stoneHash01(gx, gz, channel, 0x5a17));
      const x = (gx + rolls[0]) * spacing;
      const z = (gz + rolls[1]) * spacing;
      const height = heightAt(x, z);
      const above = height - seaLevel;
      if (above < 0.05 || above > config.band) continue;
      if (coastalDistanceAt && !(coastalDistanceAt(x, z) <= 24)) continue;
      // Densest just above the water, thinning up the beach.
      const beach = 1 - smoothstep(config.band * 0.4, config.band, above);
      const cluster = smoothstep(0.45, 0.8, clusterNoise(x, z, config.clusterMeters, 0x71));
      if (rolls[2] > config.keep * beach * cluster * 2) continue;
      const scale = config.minScale + rolls[3] * (config.maxScale - config.minScale);
      sink.place(`${gx}:${gz}`, x, z, scale, rolls[4], rolls[5], rolls[6], height);
    }
  }
  return sink.placements;
}

export function buildCoastStones(options) {
  return completeIterator(iterateCoastStones(options));
}
