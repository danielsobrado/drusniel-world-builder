import * as THREE from 'three/webgpu';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { resolveMeadowGroundDetail } from '../meadow/meadowGroundDetailConfig.js';
import { resolvePathPaint } from '../path/terrainPathPaint.js';
import { sampleHeight } from '../scatterMath.js';
import { acquireWorldNoise } from '../worldNoise.js';
import {
  WSC_BORDER_FADE_M,
  WSC_RESOLUTION,
  WSC_SPAN_M,
  clearWorldSurfaceContext,
  wscBaseTexture,
  wscEcoTexture,
  wscGeoTexture,
  wscUniforms,
} from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { createTerrainSurfaceEvaluator } from '../worldSurfaceContext/TerrainSurfaceEvaluator.js';
import { STALE_SIGNATURE, WscRebuildCache, slotChunkSignature } from './wscRebuildCache.js';
import { createWscTexelWriter, encodeTexelHeight } from './wscTexelWriter.js';

export { contactGrassSuppression } from './wscTexelWriter.js';

const RECENTER_THRESHOLD_M = 16;
const MAX_UPLOAD_DEFERRAL_MS = 100;
const WSC_UPLOAD_BYTES = wscGeoTexture.image.data.byteLength + wscBaseTexture.image.data.byteLength
  + wscEcoTexture.image.data.byteLength;
const DEFAULT_SOIL_HEX = '#6e5435';
// A cold build (nothing reusable: teleport, noise load) spends at most this much
// of a budgeted frame, instead of ~28 ms at once. The old window stays shown
// while it still covers the focus; otherwise WSC is off until the build lands.
const COLD_BUILD_SLICE_MS = 4;

function clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function linearFromHex(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * Builds a 256-entry linear RGB soil/litter colour table per terrain tile ID,
 * harmonising `biomeLooks.soil`, `grass.meadow.groundDetail.byTileId[].litter`,
 * `trees.forestFloor.litterColor`, and `path.paint.color` with `terrainMaterial.js`.
 */
export function buildBiomeSoilPalette(config) {
  const table = new Float32Array(256 * 3);
  const pathPaint = resolvePathPaint(config?.path?.paint);
  const fallbackEarth = linearFromHex(pathPaint?.color ?? '#b7a476');
  const fallbackDuff = [fallbackEarth[0] * 0.42, fallbackEarth[1] * 0.35, fallbackEarth[2] * 0.26];
  const forestLitter = linearFromHex(config?.trees?.forestFloor?.litterColor ?? DEFAULT_SOIL_HEX);
  const detail = resolveMeadowGroundDetail(config?.grass?.meadow?.groundDetail);
  const biomeSoils = config?.biomeLooks?.soil ?? {};

  for (let id = 0; id < 256; id += 1) {
    const hasBiomeSoil = typeof biomeSoils[id] === 'string';
    const soil = hasBiomeSoil ? linearFromHex(biomeSoils[id]) : fallbackDuff;
    let r = soil[0] * 0.55 + fallbackDuff[0] * 0.45;
    let g = soil[1] * 0.55 + fallbackDuff[1] * 0.45;
    let b = soil[2] * 0.55 + fallbackDuff[2] * 0.45;
    if (detail) {
      const lr = detail.litter[id * 4];
      const lg = detail.litter[id * 4 + 1];
      const lb = detail.litter[id * 4 + 2];
      const litterAmount = detail.litter[id * 4 + 3];
      const mixShare = 0.25 + 0.4 * litterAmount;
      r = r * (1 - mixShare) + lr * mixShare;
      g = g * (1 - mixShare) + lg * mixShare;
      b = b * (1 - mixShare) + lb * mixShare;
    } else if (!hasBiomeSoil) {
      r = forestLitter[0];
      g = forestLitter[1];
      b = forestLitter[2];
    }
    table[id * 3] = clamp01(r);
    table[id * 3 + 1] = clamp01(g);
    table[id * 3 + 2] = clamp01(b);
  }
  return table;
}

export function buildForestGrassCoreDensityTable(config) {
  const table = new Float32Array(256);
  const ff = config?.trees?.forestFloor;
  if (!ff) {
    table.fill(1);
    return table;
  }
  const fallback = Number.isFinite(ff.grassCoreDensity) ? clamp01(ff.grassCoreDensity) : 0.16;
  table.fill(fallback);
  const byTileId = ff.byTileId;
  if (byTileId && typeof byTileId === 'object') {
    for (const [key, entry] of Object.entries(byTileId)) {
      const id = Number(key);
      if (Number.isInteger(id) && id >= 0 && id < 256 && Number.isFinite(entry?.grassCoreDensity)) {
        table[id] = clamp01(entry.grassCoreDensity);
      }
    }
  }
  return table;
}

/**
 * Maintains the camera-centred GPU ground-contact textures purely from
 * already-resident terrain slots (zero generator calls, zero GPU readbacks).
 */
export class GroundContactField {
  constructor({ terrainView, config, resolution = WSC_RESOLUTION, span = WSC_SPAN_M }) {
    if (resolution !== WSC_RESOLUTION) throw new RangeError(`World Surface Context resolution must be ${WSC_RESOLUTION}.`);
    this.terrainView = terrainView;
    this.resolution = resolution;
    this.span = span;
    this.texelMeters = span / resolution;
    this.soilTable = buildBiomeSoilPalette(config);
    this.forestLitter = linearFromHex(config?.trees?.forestFloor?.litterColor ?? DEFAULT_SOIL_HEX);
    this.forestGrassCoreDensity = buildForestGrassCoreDensityTable(config);
    this.surfaceEvaluator = createTerrainSurfaceEvaluator(config);
    this.worldNoisePixels = null;
    this.worldNoiseVersion = 0;
    this.cancelNoiseSubscription = acquireWorldNoise(import.meta.env?.BASE_URL?.replace(/\/$/, '') ?? '').whenLoaded((pixels) => {
      if (this.disposed) return;
      this.worldNoisePixels = pixels;
      this.worldNoiseVersion += 1;
    });
    this.centerX = Number.NaN;
    this.centerZ = Number.NaN;
    this.lastSlotSignature = '';
    this.uploadDeferredAt = null;
    this.slotsByChunk = new Map();
    this.publishedChunkRevisions = new Map();
    this.rebuildCache = new WscRebuildCache(resolution);
    this.texelHeights = new Float64Array(resolution * resolution);
    this.buildGeo = new Uint16Array(wscGeoTexture.image.data.length);
    this.buildBase = new Uint8Array(wscBaseTexture.image.data.length);
    this.buildEco = new Uint8Array(wscEcoTexture.image.data.length);
    this.pendingBuild = null;
    this.disposed = false;
  }

  /**
   * Updates the window origin every frame (2 floats) and repacks textures only
   * when the focus drifts past the hysteresis band or an overlapping slot changes.
   */
  update(focusCanonical, origin, publicationBudget = null, now = performance.now()) {
    if (this.disposed || !this.terrainView?.slots) return false;
    const fx = Number(focusCanonical?.x);
    const fz = Number(focusCanonical?.z);
    if (!Number.isFinite(fx) || !Number.isFinite(fz)) return false;

    const ox = Number(origin?.x) || 0;
    const oz = Number(origin?.z) || 0;
    const half = this.span * 0.5;
    const needsRecenter = !Number.isFinite(this.centerX)
      || Math.abs(fx - this.centerX) >= RECENTER_THRESHOLD_M
      || Math.abs(fz - this.centerZ) >= RECENTER_THRESHOLD_M;
    const targetX = needsRecenter ? Math.round(fx / this.texelMeters) * this.texelMeters : this.centerX;
    const targetZ = needsRecenter ? Math.round(fz / this.texelMeters) * this.texelMeters : this.centerZ;

    const chunkSize = this.terrainView.worldStore?.chunkSize ?? 64;
    const tileSize = this.terrainView.worldStore?.tileSize ?? 2;
    const chunkWorldSize = chunkSize * tileSize;
    const minChunkX = Math.floor((targetX - half - this.texelMeters) / chunkWorldSize);
    const maxChunkX = Math.floor((targetX + half + this.texelMeters) / chunkWorldSize);
    const minChunkZ = Math.floor(-(targetZ + half + this.texelMeters) / chunkWorldSize);
    const maxChunkZ = Math.floor(-(targetZ - half - this.texelMeters) / chunkWorldSize);

    this.slotsByChunk.clear();
    let signature = `${targetX}:${targetZ}:n${this.worldNoiseVersion}`;
    let residentCount = 0;
    for (const slot of this.terrainView.slots) {
      const d = slot.descriptor;
      if (!d || !slot.page || slot.loading) continue;
      if (d.chunkX < minChunkX || d.chunkX > maxChunkX || d.chunkZ < minChunkZ || d.chunkZ > maxChunkZ) continue;
      this.slotsByChunk.set(`${d.chunkX}:${d.chunkZ}`, slot);
      signature += `|${slotChunkSignature(slot)}`;
      residentCount += 1;
    }

    if (residentCount === 0) {
      if (this.lastSlotSignature || wscUniforms.active.value !== 0) {
        clearWorldSurfaceContext();
        this.rebuildCache.invalidate();
        PerfCounters.inc('textureBytesUploaded', WSC_UPLOAD_BYTES);
      }
      this.pendingBuild = null;
      this.lastSlotSignature = '';
      this.publishedChunkRevisions.clear();
      this.uploadDeferredAt = null;
      return false;
    }

    if (signature !== this.lastSlotSignature) {
      if (publicationBudget && !publicationBudget.canPublish(WSC_UPLOAD_BYTES)) {
        this.uploadDeferredAt ??= now;
        if (now - this.uploadDeferredAt < MAX_UPLOAD_DEFERRAL_MS) {
          // Retain the previously published WSC window if it still validly covers
          // the focus chunk with unchanged revision (prevents contact popping on
          // routine 16 m walking recenters); hide stale coverage otherwise.
          return this.publishPreviousIfCovering(fx, fz, ox, oz, chunkWorldSize);
        }
        PerfCounters.inc('wscUploadDeadlineOverrides');
      }
      // A build in flight for this window continues even if a slot changed since
      // it began: restarting on every streamed chunk could starve it, and the
      // chunks that changed are recorded stale and re-evaluated next frame.
      let job = this.pendingBuild;
      if (!job || job.centerX !== targetX || job.centerZ !== targetZ) {
        job = this.beginBuild(targetX, targetZ, chunkSize, tileSize, chunkWorldSize, signature);
      }
      const sliced = Boolean(publicationBudget) && !job.reuse && this.lastSlotSignature !== '';
      if (!this.advanceBuild(job, sliced ? performance.now() + COLD_BUILD_SLICE_MS : Infinity)) {
        this.pendingBuild = job;
        PerfCounters.inc('wscColdBuildSlices');
        return this.publishPreviousIfCovering(fx, fz, ox, oz, chunkWorldSize);
      }
      this.pendingBuild = null;
      this.finishBuild(job);
      this.centerX = targetX;
      this.centerZ = targetZ;
      this.lastSlotSignature = job.signature;
      this.publishedChunkRevisions.clear();
      for (const [k, slot] of job.slotsByChunk) {
        this.publishedChunkRevisions.set(k, slot.pageRevision);
      }
      PerfCounters.inc('textureBytesUploaded', WSC_UPLOAD_BYTES);
    }
    this.uploadDeferredAt = null;
    this.publishWindow(ox, oz);
    return true;
  }

  publishWindow(ox, oz) {
    const half = this.span * 0.5;
    const minX = this.centerX - half;
    const minZ = this.centerZ - half;
    wscUniforms.canonicalOrigin.value.set(minX, minZ);
    wscUniforms.renderOrigin.value.set(minX - ox, minZ - oz);
    wscUniforms.inverseSpan.value = 1 / this.span;
    wscUniforms.active.value = 1;
  }

  /**
   * Keeps the published window while it still validly covers the focus chunk
   * with an unchanged revision (no contact popping on routine recentres);
   * hides stale coverage otherwise.
   */
  publishPreviousIfCovering(fx, fz, ox, oz, chunkWorldSize) {
    const half = this.span * 0.5;
    const focusChunkKey = `${Math.floor(fx / chunkWorldSize)}:${Math.floor(-fz / chunkWorldSize)}`;
    const focusSlot = this.slotsByChunk.get(focusChunkKey);
    const focusInsidePrev = Number.isFinite(this.centerX)
      && Math.abs(fx - this.centerX) < (half - WSC_BORDER_FADE_M)
      && Math.abs(fz - this.centerZ) < (half - WSC_BORDER_FADE_M);
    const prevCoversFocus = focusInsidePrev
      && this.lastSlotSignature !== ''
      && focusSlot
      && this.publishedChunkRevisions.get(focusChunkKey) === focusSlot.pageRevision;
    if (!prevCoversFocus) {
      wscUniforms.active.value = 0;
      return false;
    }
    this.publishWindow(ox, oz);
    return true;
  }

  sampleSlotHeight(worldX, worldZ, chunkSize, tileSize, chunkWorldSize) {
    const chunkX = Math.floor(worldX / chunkWorldSize);
    const chunkZ = Math.floor(-worldZ / chunkWorldSize);
    const slot = this.slotsByChunk.get(`${chunkX}:${chunkZ}`);
    if (!slot?.page?.heights) return Number.NaN;
    const d = slot.descriptor;
    const localX = Math.max(0, Math.min(chunkSize - 1e-4, worldX / tileSize - d.originCellX));
    const localZ = Math.max(0, Math.min(chunkSize - 1e-4, -worldZ / tileSize - d.originCellZ));
    return sampleHeight(slot.page, localX, localZ, chunkSize);
  }

  resolveBaseHeight(centerX, centerZ, chunkSize, tileSize, chunkWorldSize) {
    const direct = this.sampleSlotHeight(centerX, centerZ, chunkSize, tileSize, chunkWorldSize);
    if (Number.isFinite(direct)) return direct;
    // If center slot is still streaming while neighbours are resident, anchor
    // half-float height precision to the first finite resident slot height.
    for (const slot of this.slotsByChunk.values()) {
      const heights = slot?.page?.heights;
      if (heights && heights.length > 0 && Number.isFinite(heights[0])) {
        return heights[0];
      }
    }
    return 0;
  }

  /** Builds the whole window now (tests and unbudgeted callers). */
  rebuild(centerX, centerZ, chunkSize, tileSize, chunkWorldSize) {
    const job = this.beginBuild(centerX, centerZ, chunkSize, tileSize, chunkWorldSize, null);
    this.advanceBuild(job, Infinity);
    this.finishBuild(job);
  }

  beginBuild(centerX, centerZ, chunkSize, tileSize, chunkWorldSize, signature) {
    const step = this.texelMeters;
    const half = this.span * 0.5;
    const originX = centerX - half;
    const originZ = centerZ - half;
    // The build reads this snapshot, not the live map, which update() refills every frame.
    const slotsByChunk = new Map(this.slotsByChunk);
    const signatures = new Map([...slotsByChunk].map(([key, slot]) => [key, slotChunkSignature(slot)]));
    // A recentre keeps every texel whose chunks are unchanged and evaluates only the
    // strip it uncovers (~1/8 of the window for a 16 m step).
    const reuse = this.rebuildCache.plan({
      originX, originZ, step, halfStep: step * 0.5, noiseVersion: this.worldNoiseVersion, slotsByChunk,
      chunkX: (x) => Math.floor(x / chunkWorldSize), chunkZ: (z) => Math.floor(-z / chunkWorldSize),
    });
    return {
      centerX, centerZ, originX, originZ, signature, slotsByChunk, signatures, reuse,
      noiseVersion: this.worldNoiseVersion, chunkWorldSize, row: 0, reused: 0,
      baseHeight: this.resolveBaseHeight(centerX, centerZ, chunkSize, tileSize, chunkWorldSize),
      write: createWscTexelWriter({
        soilTable: this.soilTable, forestLitter: this.forestLitter,
        forestGrassCoreDensity: this.forestGrassCoreDensity, surfaceEvaluator: this.surfaceEvaluator,
        worldNoisePixels: this.worldNoisePixels, slotsByChunk, chunkSize, tileSize, chunkWorldSize, step,
      }),
    };
  }

  /** Builds rows into the back buffers until done or past `deadline`; returns whether done. */
  advanceBuild(job, deadline) {
    const res = this.resolution;
    const step = this.texelMeters;
    const { originX, originZ, chunkWorldSize, reuse, write, baseHeight, slotsByChunk } = job;
    const previous = this.rebuildCache;
    const heights = this.texelHeights;
    const geo = this.buildGeo;
    const base = this.buildBase;
    const eco = this.buildEco;
    for (; job.row < res; job.row += 1) {
      if (deadline !== Infinity && performance.now() >= deadline) return false;
      const iz = job.row;
      const worldZ = originZ + (iz + 0.5) * step;
      const chunkZ = Math.floor(-worldZ / chunkWorldSize);
      let cachedChunkX = Number.NaN;
      let cachedSlot = null;
      for (let ix = 0; ix < res; ix += 1) {
        const worldX = originX + (ix + 0.5) * step;
        const chunkX = Math.floor(worldX / chunkWorldSize);
        if (chunkX !== cachedChunkX) {
          cachedChunkX = chunkX;
          cachedSlot = slotsByChunk.get(`${chunkX}:${chunkZ}`);
        }
        const texel = iz * res + ix;
        const offset = texel * 4;
        const source = reuse ? reuse.sourceIndex(ix, iz) : -1;
        if (source >= 0) {
          const from = source * 4;
          for (let c = 0; c < 4; c += 1) {
            geo[offset + c] = previous.geo[from + c];
            base[offset + c] = previous.base[from + c];
            eco[offset + c] = previous.eco[from + c];
          }
          const reusedHeight = previous.heights[source];
          heights[texel] = reusedHeight;
          if (Number.isFinite(reusedHeight)) geo[offset] = encodeTexelHeight(reusedHeight, baseHeight);
          job.reused += 1;
          continue;
        }
        heights[texel] = write(cachedSlot, chunkX, chunkZ, worldX, worldZ, geo, base, eco, offset, baseHeight);
      }
    }
    return true;
  }

  /** Publishes a finished build and records it for the next recentre. */
  finishBuild(job) {
    const res = this.resolution;
    // A slot that changed or left while a spread-out build read it is recorded stale.
    for (const [key, built] of job.signatures) {
      const slot = this.slotsByChunk.get(key);
      if (!slot || slotChunkSignature(slot) !== built) job.signatures.set(key, STALE_SIGNATURE);
    }
    this.rebuildCache.store({
      originX: job.originX, originZ: job.originZ, noiseVersion: job.noiseVersion, signatures: job.signatures,
      geo: this.buildGeo, base: this.buildBase, eco: this.buildEco, heights: this.texelHeights,
    });
    wscGeoTexture.image.data.set(this.buildGeo);
    wscBaseTexture.image.data.set(this.buildBase);
    wscEcoTexture.image.data.set(this.buildEco);
    PerfCounters.inc('wscTexelsReused', job.reused);
    PerfCounters.inc('wscTexelsEvaluated', res * res - job.reused);
    wscUniforms.baseHeight.value = job.baseHeight;
    wscGeoTexture.needsUpdate = true;
    wscBaseTexture.needsUpdate = true;
    wscEcoTexture.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.cancelNoiseSubscription?.();
    this.cancelNoiseSubscription = null;
    this.slotsByChunk.clear();
    this.publishedChunkRevisions.clear();
    this.rebuildCache.invalidate();
    this.pendingBuild = null;
    clearWorldSurfaceContext();
  }
}
