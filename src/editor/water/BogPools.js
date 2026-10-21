import { WaterCellCache } from './WaterCellCache.js';
import { valueNoise } from './WaterNoise.js';

/**
 * Standing water in a bog: black pools threaded between low mossy islands.
 *
 * Over a bog biome the ground is re-laid around a local water table — the base
 * terrain sampled on a coarse lattice and interpolated, so the table is smooth
 * and near-level across a pool. A domain-warped noise field picks, at every
 * point, how far above the table the ground stands: a little on the islands,
 * well below it in the pools. Wherever the ground ends below the table the bog
 * reports still water at the table's height.
 *
 * The bog's own weight comes from the same lattice (is the node's tile a bog
 * tile?), so pools thin out and the ground returns to the base terrain over one
 * lattice step at the biome's edge rather than ending in a cliff.
 */

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** How far into a pool (metres from its edge) the bed reaches full depth, per metre of depth. */
const SHORE_RUN_PER_DEPTH = 12;

export class BogPools {
  constructor({ seed, config, cellSizeMeters, sampleBaseHeight, sampleBaseTile }) {
    this.seed = seed | 0;
    this.config = config;
    this.cellSizeMeters = cellSizeMeters;
    this.sampleBaseHeight = sampleBaseHeight;
    this.sampleBaseTile = sampleBaseTile;
    this.tileIds = new Set(config.tileIds);
    this.latticeCells = Math.max(1, Math.round(config.latticeMeters / cellSizeMeters));
    this.nodeWeights = new WaterCellCache({ ArrayType: Float32Array, blockSize: 16 });
    this.nodeLevels = new WaterCellCache({ ArrayType: Float64Array, blockSize: 16 });
  }

  nodeWeight(nodeX, nodeZ) {
    return this.nodeWeights.get(nodeX, nodeZ, (x, z) => (
      this.tileIds.has(this.sampleBaseTile(x * this.latticeCells, z * this.latticeCells)) ? 1 : 0
    ));
  }

  nodeLevel(nodeX, nodeZ) {
    return this.nodeLevels.get(nodeX, nodeZ, (x, z) => (
      this.sampleBaseHeight(x * this.latticeCells, z * this.latticeCells)
    ));
  }

  lattice(cellX, cellZ, read) {
    const gx = cellX / this.latticeCells;
    const gz = cellZ / this.latticeCells;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const tx = gx - x0;
    const tz = gz - z0;
    const north = read(x0, z0) + (read(x0 + 1, z0) - read(x0, z0)) * tx;
    const south = read(x0, z0 + 1) + (read(x0 + 1, z0 + 1) - read(x0, z0 + 1)) * tx;
    return north + (south - north) * tz;
  }

  /** 0..1: how much of a bog this point is. */
  weight(cellX, cellZ) {
    const raw = this.lattice(cellX, cellZ, (x, z) => this.nodeWeight(x, z));
    return raw <= 0 ? 0 : smoothstep(0.35, 0.95, raw);
  }

  /** The water table: still water stands here wherever the ground is lower. */
  level(cellX, cellZ) {
    return this.lattice(cellX, cellZ, (x, z) => this.nodeLevel(x, z)) - this.config.tableDrop;
  }

  /** -1..1: the islands-and-pools pattern, high in the pools. */
  poolField(cellX, cellZ) {
    const metresX = cellX * this.cellSizeMeters;
    const metresZ = cellZ * this.cellSizeMeters;
    const scale = this.config.poolScaleMeters;
    const warp = scale * 0.6;
    const warpX = valueNoise(metresX / (scale * 1.7), metresZ / (scale * 1.7), this.seed + 911) * warp;
    const warpZ = valueNoise(metresX / (scale * 1.7) + 17.3, metresZ / (scale * 1.7) - 4.1, this.seed + 912) * warp;
    const broad = valueNoise((metresX + warpX) / scale, (metresZ + warpZ) / scale, this.seed + 913);
    const detail = valueNoise(metresX / (scale * 0.33), metresZ / (scale * 0.33), this.seed + 914);
    return broad * 0.72 + detail * 0.28;
  }

  /**
   * Ground height relative to the water table, from the pool field: islands
   * stand `islandHeight` proud, pools sink to `maximumDepth`, and the shore is
   * the band of the field in between.
   */
  relief(cellX, cellZ) {
    const { threshold, shoreWidth, islandHeight, maximumDepth, hummockHeight } = this.config;
    const field = this.poolField(cellX, cellZ);
    const wet = smoothstep(threshold - shoreWidth, threshold + shoreWidth, field);
    const hummocks = hummockHeight * valueNoise(
      cellX * this.cellSizeMeters / 3.1,
      cellZ * this.cellSizeMeters / 3.1,
      this.seed + 915,
    ) * (1 - wet);
    return islandHeight + hummocks - (islandHeight + maximumDepth) * wet;
  }

  shapeHeight(cellX, cellZ, height) {
    const weight = this.weight(cellX, cellZ);
    if (weight <= 0) return height;
    const bog = this.level(cellX, cellZ) + this.relief(cellX, cellZ);
    return height + (bog - height) * weight;
  }

  /** Still water over a point whose ground (`bedHeight`) lies under the table. */
  sample(cellX, cellZ, bedHeight) {
    if (this.weight(cellX, cellZ) <= 0) return null;
    const surfaceHeight = this.level(cellX, cellZ);
    const depth = surfaceHeight - bedHeight;
    if (!(depth > 0)) return null;
    return {
      surfaceHeight,
      shoreDistance: Math.min(this.config.maximumDepth, depth) * SHORE_RUN_PER_DEPTH,
    };
  }
}
