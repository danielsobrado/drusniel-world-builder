import * as THREE from 'three/webgpu';
import { resolveMeadowGroundDetail } from '../meadow/meadowGroundDetailConfig.js';
import { resolvePathPaint } from '../path/terrainPathPaint.js';
import { sampleHeight } from '../scatterMath.js';
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

const RECENTER_THRESHOLD_M = 16;
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
    this.terrainView = terrainView;
    this.resolution = resolution;
    this.span = span;
    this.texelMeters = span / resolution;
    this.soilTable = buildBiomeSoilPalette(config);
    this.forestLitter = linearFromHex(config?.trees?.forestFloor?.litterColor ?? DEFAULT_SOIL_HEX);
    this.centerX = Number.NaN;
    this.centerZ = Number.NaN;
    this.lastSlotSignature = '';
    this.slotsByChunk = new Map();
    this.disposed = false;
  }

  /**
   * Updates the window origin every frame (2 floats) and repacks textures only
   * when the focus drifts past the hysteresis band or an overlapping slot changes.
   */
  update(focusCanonical, origin) {
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
    let signature = `${targetX}:${targetZ}`;
    let residentCount = 0;
    for (const slot of this.terrainView.slots) {
      const d = slot.descriptor;
      if (!d || !slot.page || slot.loading) continue;
      if (d.chunkX < minChunkX || d.chunkX > maxChunkX || d.chunkZ < minChunkZ || d.chunkZ > maxChunkZ) continue;
      this.slotsByChunk.set(`${d.chunkX}:${d.chunkZ}`, slot);
      signature += `|${d.key}:${slot.pageRevision}:${slot.forestFloorKey ?? ''}`;
      residentCount += 1;
    }

    if (residentCount === 0) {
      if (wscUniforms.active.value !== 0) clearWorldSurfaceContext();
      return false;
    }

    if (signature !== this.lastSlotSignature) {
      this.centerX = targetX;
      this.centerZ = targetZ;
      this.rebuild(targetX, targetZ, chunkSize, tileSize, chunkWorldSize);
      this.lastSlotSignature = signature;
    }

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
    const halfStep = step * 0.5;
    const toHalf = THREE.DataUtils.toHalfFloat;
    const zeroHalf = toHalf(0);
    const oneHalf = toHalf(1);

    for (let iz = 0; iz < res; iz += 1) {
      const worldZ = originZ + (iz + 0.5) * step;
      const chunkZ = Math.floor(-worldZ / chunkWorldSize);
      for (let ix = 0; ix < res; ix += 1) {
        const worldX = originX + (ix + 0.5) * step;
        const chunkX = Math.floor(worldX / chunkWorldSize);
        const slot = this.slotsByChunk.get(`${chunkX}:${chunkZ}`);
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
        let hL = this.sampleSlotHeight(worldX - halfStep, worldZ, chunkSize, tileSize, chunkWorldSize);
        let hR = this.sampleSlotHeight(worldX + halfStep, worldZ, chunkSize, tileSize, chunkWorldSize);
        let hN = this.sampleSlotHeight(worldX, worldZ - halfStep, chunkSize, tileSize, chunkWorldSize);
        let hS = this.sampleSlotHeight(worldX, worldZ + halfStep, chunkSize, tileSize, chunkWorldSize);
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
        const vegByte = slot.page.surfaceMaskPixels
          ? (slot.page.surfaceMaskPixels[cellIdx * 4 + 1] ?? 0)
          : 0;

        const tIdx = (tileId & 255) * 3;
        const litterBlend = Math.min(0.75, litter * 0.55 + canopy * 0.25);
        const sr = soilTable[tIdx] * (1 - litterBlend) + forestLitter[0] * litterBlend;
        const sg = soilTable[tIdx + 1] * (1 - litterBlend) + forestLitter[1] * litterBlend;
        const sb = soilTable[tIdx + 2] * (1 - litterBlend) + forestLitter[2] * litterBlend;

        geoData[offset] = toHalf(h - baseHeight);
        geoData[offset + 1] = toHalf(gx * invLen);
        geoData[offset + 2] = toHalf(gz * invLen);
        geoData[offset + 3] = oneHalf; // explicit per-texel validity = 1

        baseData[offset] = Math.round(Math.sqrt(clamp01(sr)) * 255);
        baseData[offset + 1] = Math.round(Math.sqrt(clamp01(sg)) * 255);
        baseData[offset + 2] = Math.round(Math.sqrt(clamp01(sb)) * 255);
        baseData[offset + 3] = WSC_DEFAULT_ROUGHNESS_BYTE;

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
