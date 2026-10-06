import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { createCompaction } from './meadowGrassCompaction.js';
import { MeadowGrassBatches } from './MeadowGrassBatches.js';
import { tileDistanceSquared } from './meadowGrassLayout.js';
import { compactionPrefix } from './MeadowCompactionPrefix.js';
import { meadowTileInView } from './meadowTileVisibility.js';

/**
 * A camera-centred grid of chunk-aligned tiles, each drawing one band's template
 * compacted against its ground — the machinery grass-test's `GrassField` and
 * `FarGrassField` share, here shared by the meadow's blades and its far cards.
 *
 *  - Tiles are keyed by their canonical grid cell, so a tile survives the
 *    floating origin moving; only its render-space origin (and so its batch
 *    slot) is rewritten.
 *  - Builds run nearest-first until the caller's deadline, in slices of
 *    `SLICE_STEMS`, and a tile keeps drawing its previous band until the new one
 *    is ready, so nothing blinks.
 *  - One draw per band.
 *  - No garbage in steady state: a band's compaction outputs (up to ~0.5 MB each)
 *    are pooled and reused as tiles leave and rebuild. Allocating them fresh
 *    showed up as 40–230 ms collector pauses while running across the meadow.
 */
/** Stems compacted between deadline checks. */
const SLICE_STEMS = 256;
/** Recycled outputs kept per band; past this they are left to the collector. */
const POOL_LIMIT = 24;
const CAMERA_POSITION_QUANTIZATION = 4;
const VIEW_DIRECTION_QUANTIZATION = 512;

export class MeadowTileLayer {
  /**
   * @param {object} options
   * @param {object} options.scene
   * @param {string} options.name
   * @param {number} options.tileSize metres
   * @param {Record<string, object>} options.templates band → template
   * @param {object} options.material
   * @param {(distanceSquared: number, farthestSquared: number) => string | null} options.selectBand
   * @param {number} options.reach metres beyond which no tile is considered
   * @param {object} options.ground MeadowGroundSampler
   * @param {number} [options.renderOrder]
   */
  constructor({ scene, name, tileSize, templates, material, selectBand, selectPreparationBand = null, reach, ground, renderOrder = 0 }) {
    this.tileSize = tileSize;
    this.templates = templates;
    this.selectBand = selectBand;
    this.reach = reach;
    this.ground = ground;
    const definitions = Object.values(templates).map(template => template.userData?.meadow);
    this.stablePrefixes = definitions.every(definition => definition?.tileSize === tileSize
      && definition.cards === definitions[0].cards);
    this.selectPreparationBand = this.stablePrefixes ? selectPreparationBand : null;
    this.batches = new MeadowGrassBatches({ scene, templates, material, name, renderOrder });
    this.tiles = new Map();
    this.pools = new Map(Object.keys(templates).map((band) => [band, []]));
    this.buildSerial = 0;
    this.frameSerial = 0;
    this.updateSerial = 0;
    this.staleTiles = [];
    this.layoutState = new Float64Array(5);
    this.layoutState.fill(Number.NaN);
    this.viewState = new Float64Array(3);
    this.viewState.fill(Number.NaN);
    this.batchDirty = true;
    this.stats = {
      tiles: 0,
      building: 0,
      stems: 0,
      bands: {},
      visibleMissing: 0,
      visibleCapacityLag: 0,
      inViewMissing: 0,
      inViewCapacityLag: 0,
    };
  }

  get meshes() {
    return this.batches.meshes;
  }

  /**
   * @param {{ x: number, z: number }} camera canonical metres
   * @param {{ x: number, z: number }} origin floating origin
   * @param {number} deadline performance.now() by which this frame's builds stop
   */
  update(camera, origin, deadline, time = performance.now() / 1000, viewCone = null) {
    this.time = time;
    this.updateSerial += 1;
    const groundRevision = Number.isFinite(this.ground.revision)
      ? this.ground.revision
      : this.updateSerial;
    const layoutChanged = this.updateLayoutState(camera, origin, groundRevision);
    if (layoutChanged) this.refreshLayout(camera, origin, viewCone);
    else if (this.staleTiles.length > 1 && this.updateViewState(viewCone)) {
      for (const tile of this.staleTiles) {
        tile.inView = meadowTileInView(
          tile.centerX,
          tile.centerZ,
          camera,
          this.tileSize,
          viewCone,
        );
      }
      this.sortStaleTiles();
    }
    this.build(deadline, layoutChanged);
    this.commit();
  }

  updateLayoutState(camera, origin, groundRevision) {
    const cameraX = Math.round(camera.x * CAMERA_POSITION_QUANTIZATION);
    const cameraZ = Math.round(camera.z * CAMERA_POSITION_QUANTIZATION);
    const state = this.layoutState;
    const changed = state[0] !== cameraX
      || state[1] !== cameraZ
      || state[2] !== origin.x
      || state[3] !== origin.z
      || state[4] !== groundRevision;
    state[0] = cameraX;
    state[1] = cameraZ;
    state[2] = origin.x;
    state[3] = origin.z;
    state[4] = groundRevision;
    return changed;
  }

  updateViewState(viewCone) {
    const nextX = viewCone ? Math.round(viewCone.x * VIEW_DIRECTION_QUANTIZATION) : 0;
    const nextZ = viewCone ? Math.round(viewCone.z * VIEW_DIRECTION_QUANTIZATION) : 0;
    const nextTangent = viewCone ? Math.round(viewCone.tangent * VIEW_DIRECTION_QUANTIZATION) : 0;
    const changed = this.viewState[0] !== nextX
      || this.viewState[1] !== nextZ
      || this.viewState[2] !== nextTangent;
    this.viewState[0] = nextX;
    this.viewState[1] = nextZ;
    this.viewState[2] = nextTangent;
    return changed;
  }

  refreshLayout(camera, origin, viewCone) {
    this.updateViewState(viewCone);
    const size = this.tileSize;
    const reach = this.reach + size;
    const frameSerial = ++this.frameSerial;
    for (let tz = Math.floor((camera.z - reach) / size); tz <= Math.floor((camera.z + reach) / size); tz += 1) {
      for (let tx = Math.floor((camera.x - reach) / size); tx <= Math.floor((camera.x + reach) / size); tx += 1) {
        const centerX = (tx + 0.5) * size;
        const centerZ = (tz + 0.5) * size;
        const nearest = tileDistanceSquared(camera.x, camera.z, centerX, centerZ, size);
        const farthest = (Math.abs(camera.x - centerX) + size / 2) ** 2
          + (Math.abs(camera.z - centerZ) + size / 2) ** 2;
        const band = this.selectBand(nearest, farthest);
        const preparationBand = this.selectPreparationBand?.(nearest, farthest) ?? band;
        if (!preparationBand) continue;
        const key = `${tx}:${tz}`;
        let tile = this.tiles.get(key);
        if (!tile) {
          tile = { key, centerX, centerZ, output: null, buildId: 0, job: null };
          this.tiles.set(key, tile);
          this.batchDirty = true;
        }
        const previousBand = tile.band;
        const previousRenderX = tile.renderX;
        const previousRenderZ = tile.renderZ;
        tile.seenFrame = frameSerial;
        tile.band = band;
        if (band === null && tile.output) {
          tile.output = null;
          this.batchDirty = true;
        }
        tile.preparationBand = preparationBand;
        tile.preparationCapacity = this.templates[preparationBand].instanceCount;
        tile.distanceSquared = nearest;
        tile.inView = meadowTileInView(centerX, centerZ, camera, size, viewCone);
        tile.renderX = centerX - origin.x;
        tile.renderZ = centerZ - origin.z;
        if (previousBand !== tile.band
            || previousRenderX !== tile.renderX
            || previousRenderZ !== tile.renderZ) {
          this.batchDirty = true;
        }
        tile.revision = this.ground.revisionAt(centerX, centerZ);
        if (this.stablePrefixes && tile.band !== null && tile.revision !== null
          && tile.prepared?.revision === tile.revision
          && tile.prepared.capacity >= this.templates[tile.band].instanceCount) {
          if (!tile.output || tile.builtBand !== tile.band || tile.builtRevision !== tile.revision) {
            this.publishPrepared(tile);
            PerfCounters.inc('meadowCompactionReuses');
          }
        }
      }
    }
    for (const [key, tile] of this.tiles) {
      if (tile.seenFrame === frameSerial) continue;
      if (tile.output) this.batchDirty = true;
      this.release(tile.prepared?.band ?? tile.builtBand, tile.prepared?.output ?? tile.output);
      this.release(tile.job?.band, tile.job?.compaction.output);
      this.tiles.delete(key);
    }
    this.rebuildStaleTiles();
  }

  rebuildStaleTiles() {
    const stale = this.staleTiles;
    stale.length = 0;
    for (const tile of this.tiles.values()) {
      if (tile.job && ((tile.job.band !== tile.preparationBand
        && this.templates[tile.job.band].instanceCount < tile.preparationCapacity)
        || tile.job.revision !== tile.revision)) {
        this.release(tile.job.band, tile.job.compaction.output);
        tile.job = null;
      }
      if (MeadowTileLayer.isStale(tile)) stale.push(tile);
      else if (tile.job) {
        this.release(tile.job.band, tile.job.compaction.output);
        tile.job = null;
      }
    }
    this.sortStaleTiles();
    this.stats.building = stale.length;
  }

  sortStaleTiles() {
    this.staleTiles.sort((a, b) => Number(!a.inView) - Number(!b.inView)
      || a.distanceSquared - b.distanceSquared);
  }

  release(band, output) {
    const pool = this.pools.get(band);
    if (output && pool && pool.length < POOL_LIMIT) pool.push(output);
  }

  /** A tile needs a build when its ground is resident and its band or page moved on. */
  static isStale(tile) {
    return tile.revision !== null && ((tile.band !== null
      && (tile.builtBand !== tile.band || tile.builtRevision !== tile.revision))
      || (tile.preparationBand !== tile.band
        && (tile.prepared?.revision !== tile.revision || tile.prepared.capacity < tile.preparationCapacity)));
  }

  build(deadline, layoutChanged) {
    const stale = this.staleTiles;
    if (layoutChanged && stale.length === 0) {
      this.stats.building = 0;
      return;
    }
    const run = () => this.buildTiles(stale, this.workBudgetProvider && stale.length
      ? Math.min(deadline, performance.now() + this.workBudgetProvider(this.workBudgetMs))
      : deadline);
    if (this.workRunner && stale.length) this.workRunner(run);
    else if (stale.length) run();
    else this.stats.building = 0;
  }

  buildTiles(stale, deadline) {
    let compacted = 0;
    let write = 0;
    for (let read = 0; read < stale.length; read += 1) {
      const tile = stale[read];
      if (!MeadowTileLayer.isStale(tile)) continue;
      if (performance.now() >= deadline) {
        for (let remaining = read; remaining < stale.length; remaining += 1) {
          const pending = stale[remaining];
          if (MeadowTileLayer.isStale(pending)) stale[write++] = pending;
        }
        break;
      }
      const capacity = tile.preparationCapacity;
      if (this.stablePrefixes && tile.prepared?.revision === tile.revision
        && tile.prepared.capacity >= capacity) {
        this.release(tile.job?.band, tile.job?.compaction.output);
        tile.job = null;
        this.publishPrepared(tile);
        PerfCounters.inc('meadowCompactionReuses');
        continue;
      }
      if (!tile.job) {
        const ground = this.ground.forTile(tile.centerX, tile.centerZ, this.tileSize / 2);
        if (!ground) {
          stale[write++] = tile;
          continue;
        }
        tile.job = {
          band: tile.preparationBand,
          revision: ground.revision,
          compaction: createCompaction({
            template: this.templates[tile.preparationBand],
            centerX: tile.centerX,
            centerZ: tile.centerZ,
            sample: ground.sample,
            output: this.pools.get(tile.preparationBand).pop() ?? null,
            previous: this.stablePrefixes && tile.prepared?.revision === ground.revision
              ? tile.prepared
              : null,
          }),
        };
      }
      const { compaction } = tile.job;
      const total = this.templates[tile.job.band].instanceCount;
      const before = compaction.progress;
      while (!compaction.done && performance.now() < deadline) compaction.advance(SLICE_STEMS);
      compacted += Math.round((compaction.progress - before) * total);
      if (!compaction.done) {
        stale[write++] = tile;
        continue;
      }
      this.release(tile.prepared?.band ?? tile.builtBand, tile.prepared?.output ?? tile.output);
      if (this.stablePrefixes) {
        tile.prepared = {
          output: compaction.output,
          capacity: total,
          band: tile.job.band,
          revision: tile.job.revision,
        };
      }
      if (this.stablePrefixes) this.publishPrepared(tile, true);
      else this.publish(tile, compaction.output, tile.job.band, tile.job.revision);
      tile.job = null;
      if (MeadowTileLayer.isStale(tile)) stale[write++] = tile;
    }
    stale.length = write;
    this.stats.building = stale.length;
    PerfCounters.inc('meadowStemsCompacted', compacted);
  }

  publish(tile, output, band, revision) {
    const previousCapacity = tile.output?.count ? this.templates[tile.builtBand].instanceCount : 0;
    if (!previousCapacity || this.templates[band].instanceCount > previousCapacity) {
      // Keep an active arrival fade across a rapid second promotion. A ground
      // refresh of already-present ranks must not make the whole tile blink.
      if (!tile.output?.count || this.time - tile.revealTime >= 0.35) {
        tile.revealTime = this.time;
        tile.revealRank = previousCapacity;
      }
    }
    tile.output = output;
    tile.builtBand = band;
    tile.builtRevision = revision;
    tile.buildId = ++this.buildSerial;
    this.batchDirty = true;
  }

  publishPrepared(tile, force = false) {
    if (tile.band === null || (!force && tile.output
      && tile.builtBand === tile.band && tile.builtRevision === tile.revision)) return;
    this.publish(tile, compactionPrefix(tile.prepared.output, this.templates[tile.band].instanceCount), tile.band, tile.revision);
  }

  commit() {
    if (!this.batchDirty) return;
    this.batches.begin();
    let tiles = 0;
    let visibleMissing = 0, visibleCapacityLag = 0;
    let inViewMissing = 0, inViewCapacityLag = 0;
    for (const tile of this.tiles.values()) {
      if (tile.band !== null && tile.revision !== null) {
        if (!tile.output) {
          visibleMissing++;
          if (tile.inView) inViewMissing++;
        } else if (this.templates[tile.builtBand].instanceCount < this.templates[tile.band].instanceCount) {
          visibleCapacityLag++;
          if (tile.inView) inViewCapacityLag++;
        }
      }
      if (tile.band === null || !tile.output || tile.output.count === 0) continue;
      this.batches.add(tile.builtBand, tile);
      tiles += 1;
    }
    const uploadStartedAt = performance.now();
    this.stats.bands = this.batches.commit();
    PerfCounters.inc('meadowBatchCommitMs', performance.now() - uploadStartedAt);
    this.stats.tiles = tiles;
    this.stats.visibleMissing = visibleMissing;
    this.stats.visibleCapacityLag = visibleCapacityLag;
    this.stats.inViewMissing = inViewMissing;
    this.stats.inViewCapacityLag = inViewCapacityLag;
    this.stats.stems = Object.values(this.stats.bands).reduce((sum, value) => sum + value, 0);
    this.batchDirty = false;
  }

  getState() {
    return {
      ...this.stats,
      building: this.staleTiles.length,
      bands: { ...this.stats.bands },
      resident: this.tiles.size,
    };
  }

  dispose() {
    this.batches.dispose();
    this.tiles.clear();
    this.pools.clear();
  }
}
