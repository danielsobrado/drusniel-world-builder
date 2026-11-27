import * as THREE from 'three/webgpu';
import { sampleHeight } from '../scatterMath.js';
import { WSC_DEFAULT_ROUGHNESS_BYTE } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import {
  sampleMaterialBakeChannels,
  sampleRgba8Bilinear,
  srgbByteToLinear,
} from '../worldSurfaceContext/TerrainSurfaceEvaluator.js';

// Evaluates one World Surface Context texel from resident terrain slots.
//
// Reuse contract (wscRebuildCache.js): a texel reads only its own slot, plus the
// heights of the slots half a texel away for its normal, and field-wide inputs
// that are fixed for the field's lifetime or versioned (world noise). Every slot
// input it reads must change together with `slotChunkSignature(slot)`: a new
// page bumps `pageRevision`, a rewritten forest floor gets a new
// `forestFloorKey`, a new bake a new descriptor key. Reading anything else, or
// editing slot buffers in place without changing that signature, makes a recentre
// keep stale texels.

const toHalf = THREE.DataUtils.toHalfFloat;
const ZERO_HALF = toHalf(0);
const ONE_HALF = toHalf(1);

function clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}

/**
 * Share of grass a contact-shade value clears. The shade and the meadow's root
 * zone share one lobed outline (ecologicalFootprint.js), so the patch value
 * stands in for distance: a default tree's grass is gone where its shade is
 * above ~0.62 (`rootZone.radius`) and back to full below ~0.12 (`+ falloff`).
 */
export function contactGrassSuppression(contact) {
  const t = clamp01((contact - 0.12) / 0.5);
  return t * t * (3 - 2 * t);
}

/** Writes an invalid (validity 0) texel. */
export function writeEmptyTexel(geo, base, eco, offset) {
  geo[offset] = ZERO_HALF;
  geo[offset + 1] = ZERO_HALF;
  geo[offset + 2] = ZERO_HALF;
  geo[offset + 3] = ZERO_HALF;
  base[offset] = 0;
  base[offset + 1] = 0;
  base[offset + 2] = 0;
  base[offset + 3] = WSC_DEFAULT_ROUGHNESS_BYTE;
  eco[offset] = 0;
  eco[offset + 1] = 0;
  eco[offset + 2] = 0;
  eco[offset + 3] = 0;
}

export function encodeTexelHeight(height, baseHeight) {
  return toHalf(height - baseHeight);
}

/**
 * Returns `write(slot, chunkX, chunkZ, worldX, worldZ, geo, base, eco, offset, baseHeight)`,
 * which fills one texel and returns its raw height (NaN when the texel is invalid).
 */
export function createWscTexelWriter({
  soilTable, forestLitter, forestGrassCoreDensity, surfaceEvaluator, worldNoisePixels,
  slotsByChunk, chunkSize, tileSize, chunkWorldSize, step,
}) {
  const halfStep = step * 0.5;
  const bakeScratch = {
    grassWeight: 0, dirtWeight: 1, rockWeight: 0, snowWeight: 0, wetness: 0, shoreline: 0,
    macroR: 1, macroG: 1, macroB: 1, slope: 0, curvature: 0,
  };
  const surfaceOut = { r: 0, g: 0, b: 0, roughness: WSC_DEFAULT_ROUGHNESS_BYTE / 255 };
  const ffScratch = [0, 0, 0, 0];
  const maskScratch = [0, 0, 0, 0];
  const evalInput = {
    tileId: 0, tileR: 0, tileG: 0, tileB: 0, worldX: 0, worldZ: 0, height: 0, grassCoverage: 0,
    pathMask: 0, canopy: 0, litter: 0, bakeSample: null, worldNoisePixels, stormSnow: 0,
  };

  const heightAt = (wx, wz, curCx, curCz, curSlot) => {
    const cx = Math.floor(wx / chunkWorldSize);
    const cz = Math.floor(-wz / chunkWorldSize);
    const s = cx === curCx && cz === curCz ? curSlot : slotsByChunk.get(`${cx}:${cz}`);
    const sd = s?.descriptor;
    // A build spread over frames can outlive a slot's chunk: a recycled slot is missing.
    if (!s?.page?.heights || sd.chunkX !== cx || sd.chunkZ !== cz) return Number.NaN;
    const lx = Math.max(0, Math.min(chunkSize - 1e-4, wx / tileSize - sd.originCellX));
    const lz = Math.max(0, Math.min(chunkSize - 1e-4, -wz / tileSize - sd.originCellZ));
    return sampleHeight(s.page, lx, lz, chunkSize);
  };

  return function write(slot, chunkX, chunkZ, worldX, worldZ, geo, base, eco, offset, baseHeight) {
    const d = slot?.descriptor;
    if (!slot?.page?.heights || d.chunkX !== chunkX || d.chunkZ !== chunkZ) {
      writeEmptyTexel(geo, base, eco, offset);
      return Number.NaN;
    }
    const localX = Math.max(0, Math.min(chunkSize - 1e-4, worldX / tileSize - d.originCellX));
    const localZ = Math.max(0, Math.min(chunkSize - 1e-4, -worldZ / tileSize - d.originCellZ));
    const h = sampleHeight(slot.page, localX, localZ, chunkSize);
    if (!Number.isFinite(h)) {
      writeEmptyTexel(geo, base, eco, offset);
      return Number.NaN;
    }

    // Central-difference terrain normal across resident neighbours; falls back
    // to exact one-sided derivative beside an unloaded slot instead of halving slope.
    const hL = heightAt(worldX - halfStep, worldZ, chunkX, chunkZ, slot);
    const hR = heightAt(worldX + halfStep, worldZ, chunkX, chunkZ, slot);
    const hN = heightAt(worldX, worldZ - halfStep, chunkX, chunkZ, slot);
    const hS = heightAt(worldX, worldZ + halfStep, chunkX, chunkZ, slot);
    const hasL = Number.isFinite(hL);
    const hasR = Number.isFinite(hR);
    const gx = (hasL && hasR)
      ? (hL - hR) / step
      : (hasL ? (hL - h) / halfStep : (hasR ? (h - hR) / halfStep : 0));
    const hasN = Number.isFinite(hN);
    const hasS = Number.isFinite(hS);
    const gz = (hasN && hasS)
      ? (hN - hS) / step
      : (hasN ? (hN - h) / halfStep : (hasS ? (h - hS) / halfStep : 0));
    const invLen = 1 / Math.hypot(gx, 1, gz);

    const normU = localX / chunkSize;
    const normV = localZ / chunkSize;
    let canopy = 0;
    let contact = 0;
    let litter = 0;
    if (slot.forestFloorPixels && slot.forestFloorSize > 0) {
      sampleRgba8Bilinear(slot.forestFloorPixels, slot.forestFloorSize, normU, normV, ffScratch);
      canopy = ffScratch[0];
      contact = ffScratch[1];
      litter = ffScratch[2];
    }

    const cellIdx = Math.floor(localZ) * chunkSize + Math.floor(localX);
    const tileId = slot.page.tiles ? slot.page.tiles[cellIdx] : 0;
    const maskPixels = slot.page.surfaceMaskPixels;
    let pathMaskVal = 0;
    let vegMaskVal = 0;
    if (maskPixels) {
      sampleRgba8Bilinear(maskPixels, chunkSize, normU, normV, maskScratch);
      pathMaskVal = maskScratch[0];
      vegMaskVal = maskScratch[1];
    }
    const tilePixels = slot.page.tilePixels;

    let sr;
    let sg;
    let sb;
    let roughnessByte = WSC_DEFAULT_ROUGHNESS_BYTE;
    if (tilePixels || slot.materialBake?.channels) {
      const tileR = tilePixels ? srgbByteToLinear(tilePixels[cellIdx * 4]) : soilTable[(tileId & 255) * 3];
      const tileG = tilePixels ? srgbByteToLinear(tilePixels[cellIdx * 4 + 1]) : soilTable[(tileId & 255) * 3 + 1];
      const tileB = tilePixels ? srgbByteToLinear(tilePixels[cellIdx * 4 + 2]) : soilTable[(tileId & 255) * 3 + 2];
      const hasBake = sampleMaterialBakeChannels(slot.materialBake, normU, normV, bakeScratch);
      evalInput.tileId = tileId;
      evalInput.tileR = tileR;
      evalInput.tileG = tileG;
      evalInput.tileB = tileB;
      evalInput.worldX = worldX;
      evalInput.worldZ = worldZ;
      evalInput.height = h;
      evalInput.grassCoverage = vegMaskVal;
      evalInput.pathMask = pathMaskVal;
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

    geo[offset] = encodeTexelHeight(h, baseHeight);
    geo[offset + 1] = toHalf(gx * invLen);
    geo[offset + 2] = toHalf(gz * invLen);
    geo[offset + 3] = ONE_HALF; // explicit per-texel validity = 1

    base[offset] = Math.round(Math.sqrt(clamp01(sr)) * 255);
    base[offset + 1] = Math.round(Math.sqrt(clamp01(sg)) * 255);
    base[offset + 2] = Math.round(Math.sqrt(clamp01(sb)) * 255);
    base[offset + 3] = roughnessByte;

    // Ecological vegetation coverage: mirrors forestFloor canopy suppression & path wear
    // so WSC `eco.a` and diagnostic `D11` reflect actual ecological blade density (PR 3),
    // and the grass a trunk or stone clears at its foot (PR 6).
    const coreDensity = forestGrassCoreDensity[tileId & 255];
    const effectiveVeg = clamp01(vegMaskVal * (1 - canopy * (1 - coreDensity)) * (1 - pathMaskVal)
      * (1 - contactGrassSuppression(contact)));

    eco[offset] = Math.round(clamp01(contact) * 255);
    eco[offset + 1] = Math.round(clamp01(canopy) * 255);
    eco[offset + 2] = Math.round(clamp01(litter) * 255);
    eco[offset + 3] = Math.round(effectiveVeg * 255);
    return h;
  };
}
