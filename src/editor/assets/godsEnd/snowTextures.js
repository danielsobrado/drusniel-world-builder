import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { resolveAssetUrl } from '../assetUrl.js';

const FILES = Object.freeze({
  color: 'snow007c_color_1k.jpg', normal: 'snow007c_normal_gl_1k.jpg',
  packed: 'snow007c_ao_rough_height_1k.jpg',
});
let shared = null;

/** Donor Snow007C maps: sRGB albedo, linear GL normal, and linear AO/roughness/height. */
export function acquireSnowTextures({ loader, baseUrl = import.meta.env?.BASE_URL ?? '/' } = {}) {
  // CPU-only callers do not have an image decoder. An injected loader supports tests.
  if (!loader && typeof document === 'undefined') return null;
  if (!shared) {
    const entry = { textures: {}, ready: uniform(0), refs: 0, disposed: false };
    let pending = Object.keys(FILES).length;
    let failed = false;
    const imageLoader = loader ?? new THREE.TextureLoader();
    for (const [kind, file] of Object.entries(FILES)) {
      const url = resolveAssetUrl(baseUrl, `assets/textures/snow/${file}`);
      const map = imageLoader.load(url, () => {
        pending -= 1;
        if (!entry.disposed && !failed && pending === 0) entry.ready.value = 1;
      }, undefined, () => {
        failed = true;
        entry.ready.value = 0;
      });
      map.name = `Gods End snow ${kind}`;
      map.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true;
      map.anisotropy = 8;
      entry.textures[kind] = map;
    }
    shared = entry;
  }
  const entry = shared;
  entry.refs += 1;
  let released = false;
  return {
    ...entry.textures, ready: entry.ready,
    release() {
      if (released) return;
      released = true;
      entry.refs -= 1;
      if (entry.refs === 0) {
        entry.disposed = true;
        entry.ready.value = 0;
        Object.values(entry.textures).forEach((map) => map.dispose());
        shared = null;
      }
    },
  };
}
