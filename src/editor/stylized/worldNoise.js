import * as THREE from 'three/webgpu';
import { int, texture } from 'three/tsl';
import { WORLD_NOISE_LAYER_NAMES, WORLD_NOISE_SIZE } from './worldNoiseLayout.js';

const URL_PATH = '/assets/textures/noise/world-noise.png';
/** Every field's mean (scripts/lib/noise-pack-math.mjs): what a shader reads before the file arrives. */
export const WORLD_NOISE_NEUTRAL = 128;

let shared = null;

function createTexture(pixels) {
  const texture = new THREE.DataArrayTexture(pixels, WORLD_NOISE_SIZE, WORLD_NOISE_SIZE, WORLD_NOISE_LAYER_NAMES.length);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export async function decodeImagePixels(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`World noise ${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * The shared world-noise array (worldNoiseLayout.js): one GPU texture every
 * material that wants a noise field binds, in place of procedural noise.
 *
 * It exists at full size from the first call, filled with each field's mean,
 * so a material compiles and draws before the file arrives; the pixels are
 * fetched once the browser is idle, never on the startup path, and swapped in
 * place. `whenLoaded` hands the decoded pixels to consumers that keep their
 * own copy (the terrain's family atlas).
 *
 * @returns {{ texture: THREE.DataArrayTexture, whenLoaded: (use: (pixels: Uint8Array) => void) => void }}
 */
export function acquireWorldNoise(baseUrl = '') {
  if (shared) return shared;
  const pixels = new Uint8Array(WORLD_NOISE_SIZE * WORLD_NOISE_SIZE * WORLD_NOISE_LAYER_NAMES.length * 4).fill(WORLD_NOISE_NEUTRAL);
  const texture = createTexture(pixels);
  const waiting = [];
  let loaded = false;
  shared = {
    texture,
    whenLoaded(use) {
      if (loaded) use(pixels);
      else waiting.push(use);
    },
  };
  // Node (tests, bakes) has no bitmap decoder: the neutral texture is the result.
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return shared;
  const load = () => decodeImagePixels(`${baseUrl}${URL_PATH}`).then((data) => {
    pixels.set(data.subarray(0, pixels.length));
    texture.needsUpdate = true;
    loaded = true;
    for (const use of waiting.splice(0)) use(pixels);
  }).catch((error) => console.warn('World noise failed to load; shaders keep its neutral fields.', error));
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 1500);
  return shared;
}

/** One layer of `pixels` box-filtered down to `resolution`, RGBA, written at `target[offset]`. */
export function downsampleWorldNoiseLayer(pixels, layer, resolution, target, offset) {
  const step = WORLD_NOISE_SIZE / resolution;
  const base = layer * WORLD_NOISE_SIZE * WORLD_NOISE_SIZE * 4;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        let sum = 0;
        for (let sy = 0; sy < step; sy += 1) {
          for (let sx = 0; sx < step; sx += 1) {
            sum += pixels[base + ((y * step + sy) * WORLD_NOISE_SIZE + x * step + sx) * 4 + channel];
          }
        }
        target[offset + (y * resolution + x) * 4 + channel] = Math.round(sum / (step * step));
      }
    }
  }
}

/**
 * A layer of the shared array as `(uv) => vec3`, for any material with a texture
 * slot free. The terrain has none: it reads the same layers through its family
 * atlas (TerrainMaterialFamilyAtlas `noiseLayer`).
 */
export function worldNoiseField(layer) {
  const noise = acquireWorldNoise().texture;
  return (uv) => texture(noise, uv).depth(int(layer)).rgb;
}
