import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { resolveAssetUrl } from '../assetUrl.js';

const FILES = Object.freeze({
  /** RG tangent-space spherical-grain normal, B crevice cavity AO, A grain height (Snowflow MIT). */
  grain: 'assets/textures/snow/snow-grain-rnm.png',
  /** R wind-carved sastrugi height, G billowing snow pillows, B crystal sparkle mask (CC0 noise lib). */
  drift: 'assets/textures/snow/snow-drift-pack.png',
  /** R sharp glacier fracture network, G sinuous glacial veins, B meltwater scallops (CC0 noise lib). */
  glacier: 'assets/textures/ice/glacier-depth-pack.png',
});

let shared = null;

/**
 * Lazy on-demand sampler-free textures for upgraded snow & glacier shading.
 * Uses NearestFilter + repeatMipTextureLoad so the terrain material consumes
 * zero additional WebGPU sampler bindings, and never loads at startup.
 */
export function acquireSnowDetailMaps({ loader, baseUrl = import.meta.env?.BASE_URL ?? '/' } = {}) {
  if (!loader && !shared && typeof document === 'undefined') return null;
  if (!shared) {
    const entry = { textures: {}, ready: uniform(0), refs: 0, disposed: false };
    let pending = Object.keys(FILES).length;
    let failed = false;
    const imageLoader = loader ?? new THREE.TextureLoader();
    for (const [kind, file] of Object.entries(FILES)) {
      const url = resolveAssetUrl(baseUrl, file);
      const map = imageLoader.load(url, () => {
        pending -= 1;
        if (!entry.disposed && !failed && pending === 0) entry.ready.value = 1;
      }, undefined, () => {
        failed = true;
        entry.ready.value = 0;
      });
      map.name = `Snow/Ice detail ${kind}`;
      map.colorSpace = THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = true;
      map.anisotropy = 1;
      entry.textures[kind] = map;
    }
    shared = entry;
  }
  const entry = shared;
  entry.refs += 1;
  let released = false;
  return {
    ...entry.textures,
    ready: entry.ready,
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
