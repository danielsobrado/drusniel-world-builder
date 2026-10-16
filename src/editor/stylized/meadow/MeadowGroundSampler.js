import { meadowPageGrowthKey } from './MeadowGrowthUpdates.js';
import { createMeadowPathSampler } from './MeadowPathSampler.js';
import { rockSignatureForChunk, rocksInfluencingChunk } from '../chunkRockSignature.js';
import { createForestDensitySampler } from '../forest/ForestFloor.js';

import { createMeadowGroundSample } from './MeadowGroundSample.js';
import { identityOf } from './MeadowSharedGroundInputs.js';
export { MIN_GRASS_STRENGTH } from './MeadowGroundSample.js';

/**
 * The ground under the meadow grass: height, whether grass grows, and which
 * silhouette it wears, read from the terrain pages already resident in the
 * terrain view — never from the generator, which would stall a frame.
 *
 * A meadow tile is chunk-aligned, so `forTile` resolves its page once and the
 * returned sampler answers every stem of the tile against that one page.
 */
export class MeadowGroundSampler {
  /**
   * @param {object} options
   * @param {object} options.terrainView InfiniteTerrainView (slots, worldStore)
   * @param {Iterable<number>} options.tileIds biomes grass grows on
   * @param {Uint8Array} options.shapeTable shape id per tile id
   * @param {() => object | null} [options.forestFieldProvider]
   * @param {object} [options.forestFloorConfig] trees.forestFloor
   * @param {() => object[]} [options.rockPlacementsProvider] canonical rock placements
   * @param {{ radius: number, falloff: number, flatten: number }} [options.rocks] config.rocks
   */
  constructor({
    terrainView, tileIds, shapeTable, forestFieldProvider = () => null, forestFloorConfig = null,
    rockPlacementsProvider = () => [], rocks = null, growth = null, pathConfig = null,
  }) {
    this.terrainView = terrainView;
    this.eligible = new Uint8Array(256);
    for (const id of tileIds) this.eligible[id] = 1;
    this.shapeTable = shapeTable;
    this.growth=growth;
    this.pathConfig = pathConfig;
    this.paths=createMeadowPathSampler(pathConfig);
    this.forestFieldProvider = forestFieldProvider;
    this.forestFloorConfig = forestFloorConfig;
    this.forestSamplers = new Map();
    this.rockPlacementsProvider = rockPlacementsProvider;
    this.rocks = rocks;
    this.rockPlacements = [];
    this.revision = 0;
    this.lastTerrainRevision = Number.NaN;
    this.lastFocusChunkKey = null;
    this.lastRockPlacements = null;
  }

  setGrowth(growth,shapeTable) {
    this.growth=growth;this.shapeTable=shapeTable;
    this.growthPageKeys=new WeakMap();this.revision++;
  }

  growthKey(slot) {
    if(!this.growth)return '';
    this.growthPageKeys??=new WeakMap();
    const cached=this.growthPageKeys.get(slot.page);
    if(cached?.revision===slot.pageRevision)return cached.key;
    const key=':'+meadowPageGrowthKey(slot.page.tiles,this.growth,this.shapeTable);
    this.growthPageKeys.set(slot.page,{revision:slot.pageRevision,key});return key;
  }

  get chunkSize() {
    return this.terrainView.worldStore.chunkSize;
  }

  get tileSize() {
    return this.terrainView.worldStore.tileSize;
  }

  get chunkWorldSize() {
    return this.chunkSize * this.tileSize;
  }

  /** Indexes the resident slots by chunk; call once a frame before `forTile`. */
  beginFrame() {
    const rockPlacements = this.rocks ? (this.rockPlacementsProvider?.() ?? []) : [];
    const terrainRevision = this.terrainView.contentRevision ?? 0;
    const focusChunkKey = this.terrainView.focusChunkKey ?? null;
    if (terrainRevision !== this.lastTerrainRevision
        || focusChunkKey !== this.lastFocusChunkKey
        || rockPlacements !== this.lastRockPlacements) {
      this.revision += 1;
      this.lastTerrainRevision = terrainRevision;
      this.lastFocusChunkKey = focusChunkKey;
      this.lastRockPlacements = rockPlacements;
    }
    this.rockPlacements = rockPlacements;
    this.slotsByChunk ??= new Map();
    this.slotsByChunk.clear();
    for (const slot of this.terrainView.slots) {
      const descriptor = slot.descriptor;
      if (descriptor && slot.page && !slot.loading) this.slotsByChunk.set(`${descriptor.chunkX}:${descriptor.chunkZ}`, slot);
    }
  }

  /** The resident slot holding a chunk, with a committed page; null while it streams. */
  slotFor(chunkX, chunkZ) {
    if (!this.slotsByChunk) this.beginFrame();
    return this.slotsByChunk.get(`${chunkX}:${chunkZ}`) ?? null;
  }

  /**
   * What a tile at this canonical centre would build from — its page revision and
   * the rocks standing in its chunk — or null while the chunk streams. A rock set
   * that changes elsewhere leaves this tile's revision, and so its stems, alone.
   */
  revisionAt(centerX, centerZ) {
    const slot = this.slotFor(...this.chunkOf(centerX, centerZ));
    if (!slot) return null;
    return `${slot.descriptor.key}:${slot.pageRevision}:${this.rockSignature(slot.descriptor)}${this.growthKey(slot)}${this.paths.signature}`;
  }

  rockSignature(descriptor) {
    if (!this.rocks || this.rockPlacements.length === 0) return '';
    return rockSignatureForChunk({
      descriptor,
      rockPlacements: this.rockPlacements,
      chunkWorldSize: this.chunkWorldSize,
      radius: this.rocks.radius,
      falloff: this.rocks.falloff,
    });
  }

  /** Rocks close enough to touch a tile, with their reach squared, for the stem loop. */
  rocksNear(descriptor, centerX, centerZ, tileHalf) {
    if (!this.rocks || this.rockPlacements.length === 0) return [];
    const local = rocksInfluencingChunk({
      descriptor,
      rockPlacements: this.rockPlacements,
      chunkWorldSize: this.chunkWorldSize,
      radius: this.rocks.radius,
      falloff: this.rocks.falloff,
    });
    const near = [];
    // A placement's radius is its spacing from other boulders, wider than the
    // stone. grass-test's grass grows up to its stones, so only this share of
    // it is bare (1 keeps the whole spacing radius clear).
    const clearance = this.rocks.grassClearance ?? 1;
    for (const rock of local) {
      const radius = (rock.radius ?? this.rocks.radius) * clearance;
      const reach = radius + this.rocks.falloff;
      if (Math.abs(rock.x - centerX) > tileHalf + reach || Math.abs(rock.z - centerZ) > tileHalf + reach) continue;
      near.push({ x: rock.x, z: rock.z, radius, reach });
    }
    return near;
  }

  chunkOf(centerX, centerZ) {
    return [
      Math.floor(Math.floor(centerX / this.tileSize) / this.chunkSize),
      Math.floor(Math.floor(-centerZ / this.tileSize) / this.chunkSize),
    ];
  }

  forestSampler(slot) {
    const field = this.forestFieldProvider?.() ?? null;
    if (!field) return null;
    const key = `${slot.descriptor.key}:${slot.pageRevision}`;
    const cached = this.forestSamplers.get(key);
    if (cached && cached.field === field) return cached.sampler;
    if (this.forestSamplers.size > 64) this.forestSamplers.clear();
    const sampler = createForestDensitySampler({
      descriptor: slot.descriptor,
      field,
      kind: 'grass',
      config: this.forestFloorConfig,
      chunkWorldSize: this.chunkWorldSize,
    });
    this.forestSamplers.set(key, { field, sampler });
    return sampler;
  }

  /**
   * A sampler for the tile centred on a canonical point, or null while its
   * chunk is not resident. The sampler reads canonical metres and writes into
   * `out`: { height, strength, shape, path }; it returns false where no grass
   * grows.
   */
  forTile(centerX, centerZ, tileHalf = 4) {
    const tileSize = this.tileSize;
    const chunkSize = this.chunkSize;
    const slot = this.slotFor(...this.chunkOf(centerX, centerZ));
    if (!slot) return null;
    const page = slot.page;
    const descriptor = slot.descriptor;
    const mask = page.surfaceMaskPixels;
    const forest = this.forestSampler(slot);
    const { eligible, shapeTable, growth } = this;
    const worldSeed=this.terrainView.worldStore.generator?.toMetadata?.().seed ?? 0;
    // Only the rocks that can reach this tile are tested per stem.
    const rocks = this.rocksNear(descriptor, centerX, centerZ, tileHalf);
    const flatten = this.rocks?.flatten ?? 0;
    const snapshot = {
      page: { tiles: page.tiles, heights: page.heights, surfaceMaskPixels: mask },
      descriptor, chunkSize, tileSize, eligible, shapeTable, growth, worldSeed, rocks, flatten,
      pathConfig: this.pathConfig, forest: forest?.snapshot ?? null,
    };
    // Every input a worker may cache, by identity: a replaced page, canopy grid
    // or settings object, or a page revision, gets a new key.
    snapshot.sharedKey = [identityOf(page), slot.pageRevision, identityOf(snapshot.forest), identityOf(growth),
      identityOf(shapeTable), identityOf(eligible), identityOf(this.pathConfig), worldSeed, chunkSize, tileSize].join(':');
    const sample = createMeadowGroundSample(snapshot, { forest, paths: this.paths });
    // The same key `revisionAt` gives the tile, rocks included: a job whose
    // revision differs from its tile's is abandoned, so a mismatch here would
    // restart every build every frame.
    return { sample, snapshot, revision: `${descriptor.key}:${slot.pageRevision}:${this.rockSignature(descriptor)}${this.growthKey(slot)}${this.paths.signature}` };
  }
}
