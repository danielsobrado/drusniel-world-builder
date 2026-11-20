import * as THREE from 'three/webgpu';
import { floatToHalf } from './WaterField.js';
import { sampleWorldStoreWater, sampleWorldStoreWaterSurface } from './TerrainWaterQueries.js';
import { createSeaDiffractionSampler, resolveSeaDiffraction } from './SeaDiffraction.js';
import { WATER_KIND_NONE, WATER_KIND_OCEAN } from './WaterConstants.js';

const FAR_DISTANCE = 1e6;
const DIAGONAL = Math.SQRT2;

export function distanceTransform(mask, size, match) {
  const distances = new Float32Array(size * size);
  for (let i = 0; i < distances.length; i++) distances[i] = mask[i] === match ? 0 : FAR_DISTANCE;
  const update = (x, y, nx, ny, cost) => {
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) return;
    const index = y * size + x;
    distances[index] = Math.min(distances[index], distances[ny * size + nx] + cost);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    update(x, y, x - 1, y, 1);
    update(x, y, x, y - 1, 1);
    update(x, y, x - 1, y - 1, DIAGONAL);
    update(x, y, x + 1, y - 1, DIAGONAL);
  }
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
    update(x, y, x + 1, y, 1);
    update(x, y, x, y + 1, 1);
    update(x, y, x + 1, y + 1, DIAGONAL);
    update(x, y, x - 1, y + 1, DIAGONAL);
  }
  return distances;
}

function createTexture(size) {
  const texture = new THREE.DataTexture(
    new Uint16Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.HalfFloatType,
  );
  texture.name = 'coastal-swash-input';
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A sampled view of authoritative ocean classification and editable terrain. */
export class CoastalSwashInputs {
  constructor(worldStore, size, texelMeters, runupMeters, diffraction = null) {
    this.worldStore = worldStore;
    this.size = size;
    this.texelMeters = texelMeters;
    this.runupMeters = runupMeters;
    this.diffraction = resolveSeaDiffraction(diffraction);
    this.texture = createTexture(size);
    this.revision = null;
    this.originX = NaN;
    this.originZ = NaN;
    this.oceanCount = 0;
    this.eligibleCount = 0;
  }

  update(originX, originZ) {
    const revision = `${this.worldStore.baseTerrainRevision}:${this.worldStore.revision}`;
    if (this.originX === originX && this.originZ === originZ && this.revision === revision) return false;
    const { worldStore, size, texelMeters } = this;
    const types = new Uint8Array(size * size);
    const valid = new Uint8Array(size * size);
    const heights = new Float32Array(size * size);
    const cells = new Map();
    const tileSize = worldStore.tileSize;
    const seaLevel = worldStore.generator.seaLevel;
    let oceanCount = 0;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const worldX = originX + (x + 0.5) * texelMeters;
      const worldZ = originZ + (z + 0.5) * texelMeters;
      const cx = Math.floor(worldX / tileSize);
      const cz = Math.floor(-worldZ / tileSize);
      const key = `${cx}:${cz}`;
      let kind = cells.get(key);
      if (kind === undefined) {
        kind = sampleWorldStoreWater(worldStore, cx + 0.5, cz + 0.5).kind;
        cells.set(key, kind);
      }
      const index = z * size + x;
      types[index] = kind === WATER_KIND_OCEAN ? 1 : 0;
      valid[index] = kind === WATER_KIND_OCEAN || kind === WATER_KIND_NONE ? 1 : 0;
      if (types[index]) oceanCount++;
      heights[index] = worldStore.sampleHeight(worldX / tileSize, -worldZ / tileSize) - seaLevel;
    }
    const oceanDistances = distanceTransform(types, size, 1);
    const landDistances = distanceTransform(types, size, 0);
    const pixels = this.texture.image.data;
    const shelter = this.diffraction.enabled
      ? createSeaDiffractionSampler({
        sampleWater: (cellX, cellZ) => sampleWorldStoreWaterSurface(worldStore, cellX, cellZ),
        tileSizeMeters: tileSize,
        settings: this.diffraction,
      })
      : null;
    const range = this.runupMeters + 3;
    let eligibleCount = 0;
    for (let i = 0; i < types.length; i++) {
      const distance = (types[i] ? -landDistances[i] : oceanDistances[i]) * texelMeters;
      const eligible = valid[i] && Math.abs(distance) < range && heights[i] < range
        && heights[i] > -3 ? 1 : 0;
      if (eligible) eligibleCount++;
      const offset = i * 4;
      pixels[offset] = floatToHalf(Math.max(-16, Math.min(16, heights[i])));
      pixels[offset + 1] = floatToHalf(Math.max(-128, Math.min(128, distance)));
      pixels[offset + 2] = floatToHalf(eligible);
      const worldX = originX + (i % size + 0.5) * texelMeters;
      const worldZ = originZ + (Math.floor(i / size) + 0.5) * texelMeters;
      const shoreDistance = Math.max(0, -distance);
      pixels[offset + 3] = floatToHalf(eligible && shelter
        ? shelter(worldX / tileSize, -worldZ / tileSize, shoreDistance) : 1);
    }
    this.texture.needsUpdate = true;
    this.originX = originX;
    this.originZ = originZ;
    this.revision = revision;
    this.oceanCount = oceanCount;
    this.eligibleCount = eligibleCount;
    return true;
  }

  dispose() {
    this.texture.dispose();
  }
}

/** Inexpensive activation check; inland lakes do not activate ocean swash. */
export function nearOcean(worldStore, x, z, radius) {
  const tile = worldStore.tileSize;
  const steps = [-1, -0.5, 0, 0.5, 1];
  for (const dx of steps) for (const dz of steps) {
    const cx = (x + dx * radius) / tile;
    const cz = -(z + dz * radius) / tile;
    if (sampleWorldStoreWater(worldStore, cx, cz).kind === WATER_KIND_OCEAN) return true;
  }
  return false;
}
