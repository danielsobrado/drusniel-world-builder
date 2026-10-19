import { latticeHashCpu } from '../../weather/wind/windNoise.js';

export function wrapMeadowTileCoordinate(value, size) {
  return value - Math.floor((value + size / 2) / size) * size;
}

/** A canonical toroidal translation of the shared low-discrepancy sequence.
 * Adjacent tiles no longer repeat the same clump rows. Translation preserves
 * every rank prefix and tile area; it adds no candidates or instance attributes.
 * CPU compaction and its worker use the same transform before sampling ground.
 */
export function createMeadowTileDistribution(centerX, centerZ, size) {
  const tileX = Math.floor(centerX / size), tileZ = Math.floor(centerZ / size);
  const offsetX = latticeHashCpu(tileX, tileZ) * size;
  const offsetZ = latticeHashCpu(tileX ^ 0x45d9f3b, tileZ ^ 0x119de1f3) * size;
  return {
    offsetX, offsetZ,
    x: value => Math.fround(wrapMeadowTileCoordinate(value + offsetX, size)),
    z: value => Math.fround(wrapMeadowTileCoordinate(value + offsetZ, size)),
  };
}
