import { NEUTRAL_SKY_REGION, skyRegionAt } from './skyRegionClimate.js';

const RESAMPLE_SECONDS = 1.5;
/** Farther than this between samples is a teleport or a world load, not travel. */
const JUMP_METRES = 1500;

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
   */
  constructor({ getBiome, getTileSize, getOrigin, getGroundHeight, getSeaLevel, getSeed = () => 0 }) {
    Object.assign(this, { getBiome, getTileSize, getOrigin, getGroundHeight, getSeaLevel, getSeed });
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
      const region = skyRegionAt({
        getBiome: this.getBiome,
        tileSize: this.getTileSize(),
        x,
        z,
        heightAboveSea: Number.isFinite(ground) ? ground - (this.getSeaLevel() ?? 0) : 0,
        seed: this.getSeed() | 0,
      });
      // A jump asks the sky to arrive at once instead of easing across the map.
      this.region = Object.freeze({ ...region, jump });
    } catch (error) {
      console.warn('Sky region sampling failed.', error);
    }
    return this.region;
  }
}
