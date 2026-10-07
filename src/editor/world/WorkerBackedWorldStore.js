import { InfiniteWorldStore } from './InfiniteWorldStore.js';
import { normalizeForestEditDocument } from '../forest/ForestEditDocument.js';
import {
  PERF_COUNTER_WATER_GENERATION_MS,
  PerfCounters,
} from '../performance/qa/PerfCounters.js';
import {
  decodeChunkDocument,
  encodeChunkDocument,
} from './ChunkDocumentCodec.js';
import {
  createSurfaceMaskConfig,
  getSurfaceMaskSearchRadius,
} from './ChunkRenderPixels.js';
import { assertCompatibleWaterDomainMetadata } from '../water/WaterConfig.js';
import { chunkKey } from './WorldCoordinates.js';
import { INFINITE_WORLD_FORMAT_VERSION } from './worldConstants.js';

const MAX_TILE_ID = 255;

function recordWaterGeneration(page, durationMs) {
  page.timings = {
    ...(page.timings ?? {}),
    waterGenerationMs: durationMs,
  };
  page.waterGenerationRecorded = true;
  PerfCounters.inc(PERF_COUNTER_WATER_GENERATION_MS, durationMs);
  PerfCounters.set('waterGeneration', durationMs);
}

function assertGeneratorMetadata(actual, expected) {
  const fields = ['seed', 'version', 'heightScale', 'seaLevel'];
  for (const field of fields) {
    if (actual?.[field] !== expected[field]) {
      throw new Error(`World generator ${field} does not match the active editor configuration.`);
    }
  }
  assertCompatibleWaterDomainMetadata(actual, expected);
}

function decodeAndValidateChunks(chunks, chunkSize, vertexSize) {
  if (!Array.isArray(chunks)) {
    throw new Error('Infinite world chunks must be an array.');
  }
  const tileCount = chunkSize ** 2;
  const heightCount = vertexSize ** 2;

  return chunks.map((chunk) => {
    const decoded = decodeChunkDocument(chunk, chunkSize);
    if (!Number.isSafeInteger(decoded.x) || !Number.isSafeInteger(decoded.z)) {
      throw new Error('Infinite world chunk coordinates must be safe integers.');
    }
    if (!Array.isArray(decoded.tiles) || !Array.isArray(decoded.heights)) {
      throw new Error('Infinite world chunk overrides must be arrays.');
    }

    for (const entry of decoded.tiles) {
      if (!Array.isArray(entry) || entry.length < 2) {
        throw new Error('Infinite world tile override must be an [index, value] pair.');
      }
      const [index, value] = entry;
      if (!Number.isInteger(index) || index < 0 || index >= tileCount) {
        throw new Error('Infinite world tile override index is invalid.');
      }
      if (!Number.isInteger(value) || value < 0 || value > MAX_TILE_ID) {
        throw new Error('Infinite world tile override value must be an unsigned byte.');
      }
    }

    for (const entry of decoded.heights) {
      if (!Array.isArray(entry) || entry.length < 2) {
        throw new Error('Infinite world height override must be an [index, value] pair.');
      }
      const [index, value] = entry;
      if (!Number.isInteger(index) || index < 0 || index >= heightCount || !Number.isFinite(value)) {
        throw new Error('Infinite world height override is invalid.');
      }
    }
    return decoded;
  });
}

function assertWorkerPage(page, chunkX, chunkZ, chunkSize) {
  const expectedKey = chunkKey(chunkX, chunkZ);
  const expectedOriginX = chunkX * chunkSize;
  const expectedOriginZ = chunkZ * chunkSize;
  const vertexSize = chunkSize + 1;
  if (!page || typeof page !== 'object'
      || page.key !== expectedKey
      || page.chunkX !== chunkX
      || page.chunkZ !== chunkZ
      || page.originX !== expectedOriginX
      || page.originZ !== expectedOriginZ) {
    throw new Error(`World chunk worker returned mismatched page metadata for ${expectedKey}.`);
  }
  if (!(page.tiles instanceof Uint8Array) || page.tiles.length !== chunkSize ** 2) {
    throw new Error(`World chunk worker returned invalid tile data for ${expectedKey}.`);
  }
  if (!(page.heights instanceof Float32Array) || page.heights.length !== vertexSize ** 2) {
    throw new Error(`World chunk worker returned invalid height data for ${expectedKey}.`);
  }
}

function createCancelledRequestError(message) {
  const error = new Error(message);
  error.cancelled = true;
  return error;
}

export class WorkerBackedWorldStore extends InfiniteWorldStore {
  constructor({
    chunkWorker,
    surfaceMaskConfig = null,
    contentProvider = null,
    ...options
  }) {
    super(options);
    this.chunkWorker = chunkWorker;
    this.contentProvider = contentProvider;
    this.surfaceMaskConfig = surfaceMaskConfig ?? createSurfaceMaskConfig(null);
    this.pendingChunks = new Map();
    this.baseTerrainRevision = 0;
    this.worldStateEpoch = 0;
    this.disposed = false;
    this.renderPagesPreparedInWorker = true;
  }

  restoreBaseTerrainState(baseTerrain, generator) {
    this.baseTerrain = baseTerrain;
    this.generator = generator;
    this.cache.clear();
    this.generatedTileBlocks.clear();
    this.generatedHeightBlocks.clear();
    this.lastTileBlock = null;
    this.lastHeightBlock = null;
  }

  setBaseTerrain(baseTerrain) {
    const previousBaseTerrain = this.baseTerrain;
    const previousGenerator = this.generator;
    const previousRevision = this.baseTerrainRevision ?? 0;
    super.setBaseTerrain(baseTerrain);
    try {
      this.chunkWorker.setBaseTerrain?.(this.baseTerrain);
    } catch (error) {
      this.restoreBaseTerrainState(previousBaseTerrain, previousGenerator);
      try {
        this.chunkWorker.setBaseTerrain?.(previousBaseTerrain);
        this.baseTerrainRevision = previousRevision;
      } catch (rollbackError) {
        this.baseTerrainRevision = previousRevision + 1;
        this.pendingChunks.clear();
        throw new AggregateError(
          [error, rollbackError],
          'World base terrain configuration failed and worker rollback was incomplete.',
        );
      }
      throw error;
    }
    this.baseTerrainRevision = previousRevision + 1;
    this.pendingChunks.clear();
  }

  pageEditState(chunkX, chunkZ) {
    const radius = Math.max(2, getSurfaceMaskSearchRadius(this.surfaceMaskConfig.blendCells));
    const minX = chunkX * this.chunkSize - radius;
    const maxX = (chunkX + 1) * this.chunkSize + radius;
    const minZ = chunkZ * this.chunkSize - radius;
    const maxZ = (chunkZ + 1) * this.chunkSize + radius;
    return {
      tiles: this.tileOverrides,
      heights: this.heightOverrides,
      tileVersion: this.tileOverrides.signature(minX, maxX, minZ, maxZ),
      heightVersion: this.heightOverrides.signature(minX, maxX, minZ, maxZ),
      bounds: [minX, maxX, minZ, maxZ],
    };
  }

  pageEditsMatch(state, chunkX, chunkZ) {
    if (!state) return false;
    const current = this.pageEditState(chunkX, chunkZ);
    return state.tiles === current.tiles && state.heights === current.heights
      && state.tileVersion === current.tileVersion && state.heightVersion === current.heightVersion;
  }

  requestWorkerPage(chunkX, chunkZ, priority, retriesRemaining = 1) {
    const epoch = this.worldStateEpoch;
    const baseRevision = this.baseTerrainRevision;
    return Promise.resolve()
      .then(() => {
        if (this.disposed) {
          throw createCancelledRequestError('World chunk request cancelled by store disposal.');
        }
        const editState = this.pageEditState(chunkX, chunkZ);
        const terrainOverrides = {
          tiles: editState.tiles.entriesInRect(...editState.bounds),
          heights: editState.heights.entriesInRect(...editState.bounds),
        };
        return Promise.resolve(this.chunkWorker.request(chunkX, chunkZ, { priority, terrainOverrides })).then(page => {
          if (this.disposed || epoch !== this.worldStateEpoch || baseRevision !== this.baseTerrainRevision) {
            throw createCancelledRequestError('World chunk request superseded by a world change.');
          }
          if (!this.pageEditsMatch(editState, chunkX, chunkZ)) {
            return this.requestWorkerPage(chunkX, chunkZ, priority, retriesRemaining);
          }
          return { ...page, editState };
        });
      })
      .catch((error) => {
        if (this.disposed) {
          throw createCancelledRequestError('World chunk request cancelled by store disposal.');
        }
        if (!error?.retryable || retriesRemaining <= 0) throw error;
        return this.requestWorkerPage(chunkX, chunkZ, priority, retriesRemaining - 1);
      });
  }

  requestChunk(chunkX, chunkZ, { priority = 0 } = {}) {
    if (this.disposed) {
      return Promise.reject(createCancelledRequestError('World chunk request rejected after store disposal.'));
    }

    const key = chunkKey(chunkX, chunkZ);
    const cached = this.cache.get(key);
    if (cached && !cached.renderPixelsDirty
        && this.pageEditsMatch(cached.editState, chunkX, chunkZ)) {
      this.clock += 1;
      cached.lastUsed = this.clock;
      return Promise.resolve(cached);
    }
    const pending = this.pendingChunks.get(key);
    if (pending) {
      this.chunkWorker.reprioritize?.(chunkX, chunkZ, priority);
      return pending;
    }

    const sourceRevision = this.baseTerrainRevision;
    const sourceEpoch = this.worldStateEpoch;
    const workerRequest = this.requestWorkerPage(chunkX, chunkZ, priority);
    const contentRequest = Promise.resolve().then(() => {
      if (this.disposed) {
        throw createCancelledRequestError('World chunk request cancelled by store disposal.');
      }
      return this.contentProvider
        ? this.contentProvider.getChunk(this.getContentWorldId(), chunkX, chunkZ)
        : null;
    });
    let request;
    request = Promise.all([workerRequest, contentRequest])
      .then(async ([page, content]) => {
        if (this.disposed) {
          throw createCancelledRequestError('World chunk request cancelled by store disposal.');
        }
        if (sourceRevision !== this.baseTerrainRevision || sourceEpoch !== this.worldStateEpoch) {
          throw createCancelledRequestError('World chunk request superseded by a base terrain change.');
        }
        if (!this.pageEditsMatch(page.editState, chunkX, chunkZ)) {
          page = await this.requestWorkerPage(chunkX, chunkZ, priority);
          if (this.disposed || sourceRevision !== this.baseTerrainRevision || sourceEpoch !== this.worldStateEpoch) {
            throw createCancelledRequestError('World chunk request superseded by a world change.');
          }
        }
        assertWorkerPage(page, chunkX, chunkZ, this.chunkSize);
        return this.completeWorkerPage({
          ...page,
          ...(content ? { content } : {}),
        });
      })
      .finally(() => {
        if (this.pendingChunks.get(key) === request) {
          this.pendingChunks.delete(key);
        }
      });
    this.pendingChunks.set(key, request);
    return request;
  }

  getContentWorldId() {
    return String(
      this.baseTerrain?.source?.mapId
      ?? this.baseTerrain?.source?.seed
      ?? `seed-${this.generator.toMetadata().seed}`,
    );
  }

  cancelChunk(chunkX, chunkZ) {
    return this.chunkWorker.cancel?.(chunkX, chunkZ) ?? false;
  }

  refreshPageRenderPixels(page) {
    // Compatibility entry point stays asynchronous: render fields belong to the worker.
    page.renderPixelsDirty = true;
    return this.requestChunk(page.chunkX, page.chunkZ);
  }

  completeWorkerPage(page) {
    const current = this.cache.get(page.key);
    if (current && !current.renderPixelsDirty
        && this.pageEditsMatch(current.editState, page.chunkX, page.chunkZ)) return current;
    if (!page.tilePixels || !page.surfaceMaskPixels || !page.waterFieldPixels || !page.waterFlowPixels
        || page.renderPixelsDirty) {
      throw new Error('World chunk worker must return a complete render-ready terrain page.');
    }
    if (!page.waterGenerationRecorded && Number.isFinite(page.timings?.waterGenerationMs)) {
      recordWaterGeneration(page, page.timings.waterGenerationMs);
    }
    this.clock += 1;
    const completed = { ...page, revision: this.revision, lastUsed: this.clock };
    this.cache.set(page.key, completed);
    this.evictCache();
    return completed;
  }

  toDocument() {
    const document = super.toDocument();
    return {
      ...document,
      chunks: document.chunks.map((chunk) => encodeChunkDocument(chunk, this.chunkSize)),
    };
  }

  loadInfiniteDocument(document) {
    assertGeneratorMetadata(document.world?.generator, this.generator.toMetadata());
    const chunks = decodeAndValidateChunks(document.chunks, this.chunkSize, this.vertexSize);
    const forestEdits = normalizeForestEditDocument(document.forestEdits ?? {});
    super.loadInfiniteDocument({ ...document, chunks, forestEdits });
  }

  clearOverrides() {
    this.worldStateEpoch += 1;
    this.pendingChunks.clear();
    return super.clearOverrides();
  }

  restoreSnapshot(snapshot) {
    this.worldStateEpoch += 1;
    this.pendingChunks.clear();
    super.restoreSnapshot(snapshot);
  }

  /**
   * Internal synchronous load transaction snapshot. The referenced maps/source
   * are replaced, never mutated, by loadDocument, so retaining references avoids
   * cloning a potentially very large Azgaar guidance atlas solely for rollback.
   */
  createTransactionSnapshot() {
    return Object.freeze({
      tileOverrides: this.tileOverrides,
      heightOverrides: this.heightOverrides,
      baseTerrain: this.baseTerrain,
      forestEdits: this.forestEdits,
    });
  }

  restoreTransactionSnapshot(snapshot, { emit = true } = {}) {
    this.worldStateEpoch += 1;
    this.pendingChunks.clear();
    if (this.baseTerrain !== snapshot.baseTerrain) {
      this.setBaseTerrain(snapshot.baseTerrain);
    }
    this.tileOverrides = snapshot.tileOverrides;
    this.heightOverrides = snapshot.heightOverrides;
    this.forestEdits = snapshot.forestEdits;
    this.cache.clear();
    if (emit) this.emit({ kind: 'reset' });
  }

  loadDocument(document) {
    this.worldStateEpoch += 1;
    this.pendingChunks.clear();
    const previous = this.createTransactionSnapshot();

    try {
      if (document?.version !== INFINITE_WORLD_FORMAT_VERSION) {
        throw new Error(
          'This file uses an older dense map format that is no longer supported. '
          + 'Use a current infinite-world save, or import Azgaar Full JSON.',
        );
      }
      this.loadInfiniteDocument(document);
      this.cache.clear();
      this.emit({ kind: 'reset' });
    } catch (error) {
      try {
        this.restoreTransactionSnapshot(previous, { emit: false });
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'World load failed and the previous base terrain could not be restored.',
        );
      }
      throw error;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingChunks.clear();

    const errors = [];
    try {
      this.contentProvider?.dispose?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.chunkWorker.dispose();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'World store disposal failed.');
    }
  }
}
