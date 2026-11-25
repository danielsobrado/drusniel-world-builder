import * as THREE from 'three/webgpu';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { resolveMeadowGroundDetail } from '../meadow/meadowGroundDetailConfig.js';
import { resolvePathPaint } from '../path/terrainPathPaint.js';
import { sampleHeight } from '../scatterMath.js';
import { acquireWorldNoise } from '../worldNoise.js';
import {
  WSC_DEFAULT_ROUGHNESS_BYTE,
  WSC_RESOLUTION,
  WSC_SPAN_M,
  clearWorldSurfaceContext,
  wscBaseTexture,
  wscEcoTexture,
  wscGeoTexture,
  wscUniforms,
} from '../worldSurfaceContext/WorldSurfaceContextState.js';
import {
  createTerrainSurfaceEvaluator,
  sampleMaterialBakeChannels,
  srgbByteToLinear,
} from '../worldSurfaceContext/TerrainSurfaceEvaluator.js';

const RECENTER_THRESHOLD_M = 16;
const MAX_UPLOAD_DEFERRAL_MS = 100;
const WSC_UPLOAD_BYTES = wscGeoTexture.image.data.byteLength + wscBaseTexture.image.data.byteLength
  + wscEcoTexture.image.data.byteLength;
const DEFAULT_SOIL_HEX = '#6e5435';

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
    this.surfaceEvaluator = createTerrainSurfaceEvaluator(config);
    this.worldNoisePixels = null;
    this.worldNoiseVersion = 0;
    acquireWorldNoise(import.meta.env?.BASE_URL?.replace(/\/$/, '') ?? '').whenLoaded((pixels) => {
      if (this.disposed) return;
      this.worldNoisePixels = pixels;
      this.worldNoiseVersion += 1;
    });
    this.centerX = Number.NaN;
    this.centerZ = Number.NaN;
    this.lastSlotSignature = '';
    this.uploadDeferredAt = null;
    this.slotsByChunk = new Map();
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
      signature += `|${d.key}:${slot.pageRevision}:${slot.forestFloorKey ?? ''}:${slot.materialBake?.descriptor?.key ?? ''}`;
      residentCount += 1;
    }

    if (residentCount === 0) {
      if (this.lastSlotSignature || wscUniforms.active.value !== 0) {
        clearWorldSurfaceContext();
        PerfCounters.inc('textureBytesUploaded', WSC_UPLOAD_BYTES);
      }
      this.lastSlotSignature = '';
      this.uploadDeferredAt = null;
      return false;
    }

    if (signature !== this.lastSlotSignature) {
      if (publicationBudget && !publicationBudget.canPublish(WSC_UPLOAD_BYTES)) {
        this.uploadDeferredAt ??= now;
        if (now - this.uploadDeferredAt < MAX_UPLOAD_DEFERRAL_MS) {
          wscUniforms.active.value = 0;
          return false;
        }
        PerfCounters.inc('wscUploadDeadlineOverrides');
      }
      this.centerX = targetX;
      this.centerZ = targetZ;
      this.rebuild(targetX, targetZ, chunkSize, tileSize, chunkWorldSize);
      this.lastSlotSignature = signature;
      PerfCounters.inc('textureBytesUploaded', WSC_UPLOAD_BYTES);
    }
    this.uploadDeferredAt = null;

    const minX = this.centerX - half;
    const minZ = this.centerZ - half;
    wscUniforms.canonicalOrigin.value.set(minX, minZ);
    wscUniforms.renderOrigin.value.set(minX - ox, minZ - oz);
    wscUniforms.inverseSpan.value = 1 / this.span;
    wscUniforms.active.value = 1;
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

  rebuild(centerX, centerZ, chunkSize, tileSize, chunkWorldSize) {
    const res = this.resolution;
    const step = this.texelMeters;
    const half = this.span * 0.5;
    const originX = centerX - half;
    const originZ = centerZ - half;

    const baseHeight = this.resolveBaseHeight(centerX, centerZ, chunkSize, tileSize, chunkWorldSize);

    const geoData = wscGeoTexture.image.data;
    const baseData = wscBaseTexture.image.data;
    const ecoData = wscEcoTexture.image.data;
    const soilTable = this.soilTable;
    const forestLitter = this.forestLitter;
    const surfaceEvaluator = this.surfaceEvaluator;
    const halfStep = step * 0.5;
    const toHalf = THREE.DataUtils.toHalfFloat;
    const zeroHalf = toHalf(0);
    const oneHalf = toHalf(1);
    const bakeScratch = {
      grassWeight: 0,
      dirtWeight: 1,
      rockWeight: 0,
      snowWeight: 0,
      wetness: 0,
      shoreline: 0,
      macroR: 1,
      macroG: 1,
      macroB: 1,
      slope: 0,
      curvature: 0,
    };
    const surfaceOut = { r: 0, g: 0, b: 0, roughness: WSC_DEFAULT_ROUGHNESS_BYTE / 255 };
    const evalInput = {
      tileId: 0,
      tileR: 0,
      tileG: 0,
      tileB: 0,
      worldX: 0,
      worldZ: 0,
      height: 0,
      grassCoverage: 0,
      pathMask: 0,
      canopy: 0,
      litter: 0,
      bakeSample: null,
      worldNoisePixels: this.worldNoisePixels,
      stormSnow: 0,
    };

    // Cache chunk slot lookup for row/column interior texels to avoid 80k+ string keys.
    const fastSlot = (cx, cz, curCx, curCz, curSlot) => (
      cx === curCx && cz === curCz ? curSlot : this.slotsByChunk.get(`${cx}:${cz}`)
    );
    const fastHeight = (wx, wz, curCx, curCz, curSlot) => {
      const cx = Math.floor(wx / chunkWorldSize);
      const cz = Math.floor(-wz / chunkWorldSize);
      const s = fastSlot(cx, cz, curCx, curCz, curSlot);
      if (!s?.page?.heights) return Number.NaN;
      const sd = s.descriptor;
      const lx = Math.max(0, Math.min(chunkSize - 1e-4, wx / tileSize - sd.originCellX));
      const lz = Math.max(0, Math.min(chunkSize - 1e-4, -wz / tileSize - sd.originCellZ));
      return sampleHeight(s.page, lx, lz, chunkSize);
    };

    for (let iz = 0; iz < res; iz += 1) {
      const worldZ = originZ + (iz + 0.5) * step;
      const chunkZ = Math.floor(-worldZ / chunkWorldSize);
      let cachedChunkX = Number.NaN;
      let cachedSlot = null;
      for (let ix = 0; ix < res; ix += 1) {
        const worldX = originX + (ix + 0.5) * step;
        const chunkX = Math.floor(worldX / chunkWorldSize);
        if (chunkX !== cachedChunkX) {
          cachedChunkX = chunkX;
          cachedSlot = this.slotsByChunk.get(`${chunkX}:${chunkZ}`);
        }
        const slot = cachedSlot;
        const offset = (iz * res + ix) * 4;
        if (!slot?.page?.heights) {
          geoData[offset] = zeroHalf;
          geoData[offset + 1] = zeroHalf;
          geoData[offset + 2] = zeroHalf;
          geoData[offset + 3] = zeroHalf; // explicit per-texel validity = 0
          baseData[offset] = 0;
          baseData[offset + 1] = 0;
          baseData[offset + 2] = 0;
          baseData[offset + 3] = WSC_DEFAULT_ROUGHNESS_BYTE;
          ecoData[offset] = 0;
          ecoData[offset + 1] = 0;
          ecoData[offset + 2] = 0;
          ecoData[offset + 3] = 0;
          continue;
        }
        const d = slot.descriptor;
        const localX = Math.max(0, Math.min(chunkSize - 1e-4, worldX / tileSize - d.originCellX));
        const localZ = Math.max(0, Math.min(chunkSize - 1e-4, -worldZ / tileSize - d.originCellZ));
        const h = sampleHeight(slot.page, localX, localZ, chunkSize);
        if (!Number.isFinite(h)) {
          geoData[offset] = zeroHalf;
          geoData[offset + 1] = zeroHalf;
          geoData[offset + 2] = zeroHalf;
          geoData[offset + 3] = zeroHalf;
          baseData[offset] = 0;
          baseData[offset + 1] = 0;
          baseData[offset + 2] = 0;
          baseData[offset + 3] = WSC_DEFAULT_ROUGHNESS_BYTE;
          ecoData[offset] = 0;
          ecoData[offset + 1] = 0;
          ecoData[offset + 2] = 0;
          ecoData[offset + 3] = 0;
          continue;
        }

        // Central-difference terrain normal (uses neighbour slots seamlessly across chunk edges).
        let hL = fastHeight(worldX - halfStep, worldZ, chunkX, chunkZ, slot);
        let hR = fastHeight(worldX + halfStep, worldZ, chunkX, chunkZ, slot);
        let hN = fastHeight(worldX, worldZ - halfStep, chunkX, chunkZ, slot);
        let hS = fastHeight(worldX, worldZ + halfStep, chunkX, chunkZ, slot);
        if (!Number.isFinite(hL)) hL = h;
        if (!Number.isFinite(hR)) hR = h;
        if (!Number.isFinite(hN)) hN = h;
        if (!Number.isFinite(hS)) hS = h;
        const gx = (hL - hR) / step;
        const gz = (hN - hS) / step;
        const invLen = 1 / Math.hypot(gx, 1, gz);

        let canopy = 0;
        let contact = 0;
        let litter = 0;
        if (slot.forestFloorPixels && slot.forestFloorSize > 0) {
          const fSize = slot.forestFloorSize;
          const fx = Math.max(0, Math.min(fSize - 1, Math.floor((localX / chunkSize) * fSize)));
          const fz = Math.max(0, Math.min(fSize - 1, Math.floor((localZ / chunkSize) * fSize)));
          const fIdx = (fz * fSize + fx) * 4;
          canopy = slot.forestFloorPixels[fIdx] / 255;
          contact = slot.forestFloorPixels[fIdx + 1] / 255;
          litter = slot.forestFloorPixels[fIdx + 2] / 255;
        }

        const cellIdx = Math.floor(localZ) * chunkSize + Math.floor(localX);
        const tileId = slot.page.tiles ? slot.page.tiles[cellIdx] : 0;
        const maskPixels = slot.page.surfaceMaskPixels;
        const pathByte = maskPixels ? (maskPixels[cellIdx * 4] ?? 0) : 0;
        const vegByte = maskPixels ? (maskPixels[cellIdx * 4 + 1] ?? 0) : 0;
        const tilePixels = slot.page.tilePixels;

        let sr;
        let sg;
        let sb;
        let roughnessByte = WSC_DEFAULT_ROUGHNESS_BYTE;
        if (tilePixels || slot.materialBake?.channels) {
          const tileR = tilePixels ? srgbByteToLinear(tilePixels[cellIdx * 4]) : soilTable[(tileId & 255) * 3];
          const tileG = tilePixels ? srgbByteToLinear(tilePixels[cellIdx * 4 + 1]) : soilTable[(tileId & 255) * 3 + 1];
          const tileB = tilePixels ? srgbByteToLinear(tilePixels[cellIdx * 4 + 2]) : soilTable[(tileId & 255) * 3 + 2];
          const hasBake = sampleMaterialBakeChannels(
            slot.materialBake,
            localX / chunkSize,
            localZ / chunkSize,
            bakeScratch,
          );
          evalInput.tileId = tileId;
          evalInput.tileR = tileR;
          evalInput.tileG = tileG;
          evalInput.tileB = tileB;
          evalInput.worldX = worldX;
          evalInput.worldZ = worldZ;
          evalInput.height = h;
          evalInput.grassCoverage = vegByte / 255;
          evalInput.pathMask = pathByte / 255;
          evalInput.canopy = canopy;
          evalInput.litter = litter;
          evalInput.bakeSample = hasBake ? bakeScratch : null;
          surfaceEvaluator.evaluate(evalInput, surfaceOut);
          sr = surfaceOut.r;
          sg = surfaceOut.g;
          sb = surfaceOut.b;
          roughnessByte = Math.round(clamp01(surfaceOut.roughness) * 255);
        } else {
          // Minimal test/uninitialized fallback when neither tilePixels nor materialBake exist.
          const tIdx = (tileId & 255) * 3;
          const litterBlend = Math.min(0.75, litter * 0.55 + canopy * 0.25);
          sr = soilTable[tIdx] * (1 - litterBlend) + forestLitter[0] * litterBlend;
          sg = soilTable[tIdx + 1] * (1 - litterBlend) + forestLitter[1] * litterBlend;
          sb = soilTable[tIdx + 2] * (1 - litterBlend) + forestLitter[2] * litterBlend;
        }

        geoData[offset] = toHalf(h - baseHeight);
        geoData[offset + 1] = toHalf(gx * invLen);
        geoData[offset + 2] = toHalf(gz * invLen);
        geoData[offset + 3] = oneHalf; // explicit per-texel validity = 1

        baseData[offset] = Math.round(Math.sqrt(clamp01(sr)) * 255);
        baseData[offset + 1] = Math.round(Math.sqrt(clamp01(sg)) * 255);
        baseData[offset + 2] = Math.round(Math.sqrt(clamp01(sb)) * 255);
        baseData[offset + 3] = roughnessByte;

        ecoData[offset] = Math.round(clamp01(contact) * 255);
        ecoData[offset + 1] = Math.round(clamp01(canopy) * 255);
        ecoData[offset + 2] = Math.round(clamp01(litter) * 255);
        ecoData[offset + 3] = vegByte;
      }
    }

    wscUniforms.baseHeight.value = baseHeight;
    wscGeoTexture.needsUpdate = true;
    wscBaseTexture.needsUpdate = true;
    wscEcoTexture.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.slotsByChunk.clear();
    clearWorldSurfaceContext();
  }
}
