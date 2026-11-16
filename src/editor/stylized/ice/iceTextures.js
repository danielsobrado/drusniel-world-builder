import * as THREE from 'three/webgpu';
import { decodeImagePixels } from '../worldNoise.js';

const SIZE = 512;
const FILES = Object.freeze({
  detail: '/assets/textures/ice/ice-detail.png',
  surface: '/assets/textures/ice/ice-normal-rough.png',
});
/** What each texture reads before its file arrives: clear ice, flat and glossy. */
const NEUTRAL = Object.freeze({ detail: [0, 70, 0, 255], surface: [128, 128, 40, 255] });

let shared = null;

function createTexture(fill) {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(fill, i);
  const texture = new THREE.DataTexture(pixels, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The ice PBR set (scripts/pack-ice-textures.mjs), shared by every ice
 * material: `detail` R veins, G milky cloud, B fractures; `surface` RG normal,
 * B roughness. Full size and neutral from the first call so materials compile
 * at once; the pixels arrive when the browser is idle, never at startup, and
 * only in a world that draws ice at all.
 *
 * @returns {{ detail: THREE.DataTexture, surface: THREE.DataTexture }}
 */
export function acquireIceTextures(baseUrl = import.meta.env?.BASE_URL?.replace(/\/$/, '') ?? '') {
  if (shared) return shared;
  shared = { detail: createTexture(NEUTRAL.detail), surface: createTexture(NEUTRAL.surface) };
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return shared;
  const load = () => Promise.all(Object.entries(FILES).map(async ([key, path]) => {
    const data = await decodeImagePixels(`${baseUrl}${path}`);
    shared[key].image.data.set(data.subarray(0, SIZE * SIZE * 4));
    shared[key].needsUpdate = true;
  })).catch((error) => console.warn('Ice textures failed to load; ice keeps its neutral surface.', error));
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 1500);
  return shared;
}
