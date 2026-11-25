import { NEUTRAL_SKY_REGION, skyRegionAt } from './skyRegionClimate.js';

const RESAMPLE_SECONDS = 1.5;
/** Farther than this between samples is a teleport or a world load, not travel. */
const JUMP_METRES = 1500;

/**
 * A town is drained, built-up ground: over it a wetland's share of the air is
 * temperate instead, so a town beside a marsh is not drawn under the bog's murk
 * (fog ×5, half the sun, a solid cloud lid washed burg 18 out). `town` is 0..1.
 */
export function drainedRegion(region, town) {
  const wetland = region.weights.wetland ?? 0;
  if (!(town > 0) || wetland === 0) return region;
  const lifted = wetland * Math.min(1, town);
  return { ...region, weights: { ...region.weights, wetland: wetland - lifted, temperate: (region.weights.temperate ?? 0) + lifted } };
}

/**
 * Measures the sky region under the camera about every second and a half, for
 * SkyLookController.setRegion (which eases toward it). Measured from the
 * ground below the camera, like SnowCountryWeight, so an orbit camera high
 * over a desert is still over a desert.
 */
export class SkyRegionSampler {
  /**
   * @param {object} options
   * @param {(cellX: number, cellZ: number) => number|null} options.getBiome
   * @param {() => number} options.getTileSize
   * @param {() => {x:number, z:number}} options.getOrigin floating origin
   * @param {(x: number, z: number) => number} options.getGroundHeight canonical metres
   * @param {() => number} options.getSeaLevel
   * @param {() => number} [options.getSeed]
   * @param {(x: number, z: number) => number} [options.getTownPresence] 0..1, how far inside a town canonical (x, z) is
   */
  constructor({ getBiome, getTileSize, getOrigin, getGroundHeight, getSeaLevel, getSeed = () => 0, getTownPresence = () => 0 }) {
    Object.assign(this, { getBiome, getTileSize, getOrigin, getGroundHeight, getSeaLevel, getSeed, getTownPresence });
    this.region = NEUTRAL_SKY_REGION;
    this.sinceSample = Infinity;
    this.last = null;
  }

  update(dt, camera) {
    this.sinceSample += dt;
    if (this.sinceSample < RESAMPLE_SECONDS) return this.region;
    this.sinceSample = 0;
    const origin = this.getOrigin();
    const x = camera.position.x + origin.x;
    const z = camera.position.z + origin.z;
    const ground = this.getGroundHeight(x, z);
    const jump = !this.last || Math.hypot(x - this.last.x, z - this.last.z) > JUMP_METRES;
    this.last = { x, z };
    try {
      const region = drainedRegion(skyRegionAt({
        getBiome: this.getBiome,
        tileSize: this.getTileSize(),
        x,
        z,
        heightAboveSea: Number.isFinite(ground) ? ground - (this.getSeaLevel() ?? 0) : 0,
        seed: this.getSeed() | 0,
      }), this.getTownPresence(x, z));
      // A jump asks the sky to arrive at once instead of easing across the map.
      this.region = Object.freeze({ ...region, jump });
    } catch (error) {
      console.warn('Sky region sampling failed.', error);
    }
    return this.region;
  }
}
