import { ringPoints } from '../../world/sampleTilesAround.js';

/**
 * Tundra reads as partly snow country, glacier as wholly, when no biome look
 * table (config/biome-looks.yaml `snow.air` / `snow.fall`) is given.
 */
const SNOW_TILE_WEIGHT = Object.freeze({ 10: 0.6, 11: 1 });
const SAMPLE_RINGS = [0, 60, 180];
/**
 * Each sample's say, by ring: the ground underfoot counts as much as half a
 * ring, the far ring half as much as the near one. With equal votes the 180 m
 * ring outvoted the rest, so a snowy taiga beside a deciduous wood read as
 * barely snow country (0.09) and its sky stayed summer blue.
 */
const RING_WEIGHTS = [4, 1, 0.5];
/** Marine and lakes (Azgaar 0) have no say: open water is neither snowy nor not. */
const WATER_TILE = 0;
const SAMPLE_DIRECTIONS = 8;
const RESAMPLE_SECONDS = 1;

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How deep in snow country the ground under the camera is, 0..1: the larger
 * of the snowy biomes around it and its height against the snow line the
 * terrain draws. Measured from the ground below the camera, so an orbit
 * camera high over a meadow is still over a meadow.
 */
export function snowCountryWeight({
  tiles, weights = null, groundHeight, snowLine, snowFade, byTile = SNOW_TILE_WEIGHT,
}) {
  let biome = 0;
  let total = 0;
  tiles.forEach((tile, index) => {
    if (tile === WATER_TILE) return;
    const weight = weights?.[index] ?? 1;
    biome += (byTile[tile] ?? 0) * weight;
    total += weight;
  });
  biome = total > 0 ? biome / total : 0;
  const altitude = Number.isFinite(groundHeight)
    ? smoothstep(snowLine - snowFade, snowLine + snowFade, groundHeight)
    : 0;
  return Math.max(biome, altitude);
}

export class SnowCountryWeight {
  /**
   * @param {object} options
   * @param {(cellX: number, cellZ: number) => number} options.getTile
   * @param {() => number} options.getTileSize
   * @param {() => { x: number, z: number }} options.getOrigin floating origin
   * @param {(x: number, z: number) => number} options.getGroundHeight canonical metres
   * @param {number} options.snowLine
   * @param {number} options.snowFade
   * @param {object} [options.looks] resolveBiomeLooks: its `snow.air` column
   *   weighs the air, its `snow.fall` the snowfall
   */
  constructor({ getTile, getTileSize, getOrigin, getGroundHeight, snowLine, snowFade, looks = null }) {
    Object.assign(this, { getTile, getTileSize, getOrigin, getGroundHeight, snowLine, snowFade });
    this.airByTile = looks?.snow?.air ?? SNOW_TILE_WEIGHT;
    this.fallByTile = looks?.snow?.fall ?? SNOW_TILE_WEIGHT;
    this.value = 0;
    /** 0..1 regional snowfall coverage, sampled with `value`. */
    this.snowfall = 0;
    this.sinceSample = Infinity;
  }

  /** @returns {number} the current air weight, resampled about once a second */
  update(dt, camera) {
    this.sinceSample += dt;
    if (this.sinceSample < RESAMPLE_SECONDS) return this.value;
    this.sinceSample = 0;
    const origin = this.getOrigin();
    const x = camera.position.x + origin.x;
    const z = camera.position.z + origin.z;
    const tileSize = this.getTileSize();
    const tiles = [];
    const weights = [];
    SAMPLE_RINGS.forEach((radius, ring) => {
      for (const sample of ringPoints({ x, z, rings: [radius], directions: SAMPLE_DIRECTIONS })) {
        const tile = this.getTile(Math.floor(sample.x / tileSize), Math.floor(-sample.z / tileSize));
        if (!Number.isInteger(tile)) continue;
        tiles.push(tile);
        weights.push(RING_WEIGHTS[ring]);
      }
    });
    const sample = {
      tiles,
      weights,
      groundHeight: this.getGroundHeight(x, z),
      snowLine: this.snowLine,
      snowFade: this.snowFade,
    };
    this.value = snowCountryWeight({ ...sample, byTile: this.airByTile });
    this.snowfall = snowCountryWeight({ ...sample, byTile: this.fallByTile });
    return this.value;
  }
}
