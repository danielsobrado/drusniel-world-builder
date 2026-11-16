import * as THREE from 'three/webgpu';

const URL_PATH = '/assets/textures/noise/deadwood-noise.png';
export const DEADWOOD_NOISE_SIZE = 256;
export const DEADWOOD_NOISE_NEUTRAL = 128;

let shared = null;

function createNoiseTexture(pixels) {
  const texture = new THREE.DataTexture(pixels, DEADWOOD_NOISE_SIZE, DEADWOOD_NOISE_SIZE, THREE.RGBAFormat);
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

async function decodeNoiseImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Deadwood noise ${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * Shared tileable deadwood noise (R: gnarled grain, G: fissures/cracks,
 * B: organic moss/lichen cushions), loaded asynchronously on idle so startup
 * compiles and renders immediately with a neutral 128 fallback.
 */
export function acquireDeadwoodNoise(baseUrl = '') {
  if (shared) return shared;
  const pixels = new Uint8Array(DEADWOOD_NOISE_SIZE * DEADWOOD_NOISE_SIZE * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = DEADWOOD_NOISE_NEUTRAL;
    pixels[i + 1] = DEADWOOD_NOISE_NEUTRAL;
    pixels[i + 2] = DEADWOOD_NOISE_NEUTRAL;
    pixels[i + 3] = 255;
  }
  const texture = createNoiseTexture(pixels);
  const waiting = [];
  let loaded = false;
  shared = {
    texture,
    whenLoaded(use) {
      if (loaded) use(pixels);
      else waiting.push(use);
    },
  };
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return shared;
  const load = () => decodeNoiseImage(`${baseUrl}${URL_PATH}`)
    .then((data) => {
      pixels.set(data.subarray(0, pixels.length));
      texture.needsUpdate = true;
      loaded = true;
      for (const use of waiting.splice(0)) use(pixels);
    })
    .catch((error) => console.warn('Deadwood noise failed to load; shaders keep neutral fields.', error));
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 2500 });
  else setTimeout(load, 250);
  return shared;
}
