import * as THREE from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { generateTerrainMaterialFamilyPixels } from './TerrainMaterialFamilyPixels.js';
import { acquireWorldNoise, downsampleWorldNoiseLayer, WORLD_NOISE_NEUTRAL } from '../stylized/worldNoise.js';
import { WORLD_NOISE_LAYER_NAMES } from '../stylized/worldNoiseLayout.js';

const atlasEntries = new Map();
const FULL_MIP_CHAIN_RATIO = 4 / 3;

function publishCounters() {
  let bytes = 0;
  for (const entry of atlasEntries.values()) bytes += entry.estimatedGpuBytes;
  PerfCounters.set('terrainMaterialFamilyAtlasEntries', atlasEntries.size);
  PerfCounters.set('terrainMaterialFamilyAtlasBytes', bytes);
}

function createAtlas(config) {
  const families = generateTerrainMaterialFamilyPixels(config);
  const { resolution } = families;
  // The world-noise layers ride behind the family layers: the terrain has no
  // sampler to spare, and this array is one it already binds. Neutral until
  // the file arrives (worldNoise.js), then filtered down to this resolution.
  const noiseLayer = families.depth;
  const depth = noiseLayer + WORLD_NOISE_LAYER_NAMES.length;
  const layerBytes = resolution * resolution * 4;
  const pixels = new Uint8Array(layerBytes * depth).fill(WORLD_NOISE_NEUTRAL);
  pixels.set(families.pixels);
  const texture = new THREE.DataArrayTexture(pixels, resolution, resolution, depth);
  acquireWorldNoise(import.meta.env?.BASE_URL?.replace(/\/$/, '') ?? '').whenLoaded((noise) => {
    for (let layer = 0; layer < WORLD_NOISE_LAYER_NAMES.length; layer += 1) {
      downsampleWorldNoiseLayer(noise, layer, resolution, pixels, (noiseLayer + layer) * layerBytes);
    }
    texture.needsUpdate = true;
  });
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return {
    texture,
    resolution,
    depth,
    noiseLayer,
    refs: 0,
    estimatedGpuBytes: Math.ceil(pixels.byteLength * FULL_MIP_CHAIN_RATIO),
  };
}

export function acquireTerrainMaterialFamilyAtlas(config) {
  const key = config?.families;
  if (!config?.enabled || !key?.enabled) return null;
  let entry = atlasEntries.get(key);
  if (!entry) {
    entry = createAtlas(config);
    atlasEntries.set(key, entry);
    publishCounters();
  }
  entry.refs += 1;
  let released = false;
  return Object.freeze({
    texture: entry.texture,
    resolution: entry.resolution,
    depth: entry.depth,
    noiseLayer: entry.noiseLayer,
    release() {
      if (released) return;
      released = true;
      entry.refs -= 1;
      if (entry.refs <= 0 && atlasEntries.get(key) === entry) {
        atlasEntries.delete(key);
        entry.texture.dispose();
        publishCounters();
      }
    },
  });
}

export function attachTerrainMaterialFamilyAtlas(material, lease) {
  if (!lease) return;
  const dispose = () => {
    lease.release();
    material.removeEventListener('dispose', dispose);
  };
  material.addEventListener('dispose', dispose);
}

export function getTerrainMaterialFamilyAtlasEntryCount() {
  return atlasEntries.size;
}
