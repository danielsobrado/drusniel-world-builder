import * as THREE from 'three/webgpu';
import { resolveAssetUrl } from '../assets/assetUrl.js';

const MAX_CACHED_SETS = 24;
const BASE_SET_CACHE = new Map();
let sharedLoader = null;

function textureLoader() {
  sharedLoader ??= new THREE.TextureLoader();
  return sharedLoader;
}

function configureMap(texture, colorSpace, repeat, rotationDeg) {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.repeat.set(repeat, repeat);
  texture.rotation = THREE.MathUtils.degToRad(rotationDeg);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.userData = { ...texture.userData, sharedSurface: true };
  texture.needsUpdate = true;
  return texture;
}

function loadBaseSet({ folder, set, maps }) {
  const key = `${folder}/${set}`;
  if (BASE_SET_CACHE.has(key)) {
    const existing = BASE_SET_CACHE.get(key);
    BASE_SET_CACHE.delete(key);
    BASE_SET_CACHE.set(key, existing);
    return existing;
  }
  if (BASE_SET_CACHE.size >= MAX_CACHED_SETS) {
    const oldestKey = BASE_SET_CACHE.keys().next().value;
    const oldest = BASE_SET_CACHE.get(oldestKey);
    BASE_SET_CACHE.delete(oldestKey);
    if (oldest?.loaded) {
      oldest.color?.dispose();
      oldest.normal?.dispose();
      oldest.arm?.dispose();
      oldest.rough?.dispose();
    }
  }
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  const loader = textureLoader();
  const load = (suffix, colorSpace) => {
    const url = resolveAssetUrl(baseUrl, `assets/textures/${folder}/${set}-${suffix}.webp`);
    return loader.loadAsync(url).then((tex) => {
      tex.name = `workshop-pbr-${folder}-${set}-${suffix}`;
      return configureMap(tex, colorSpace, 1, 0);
    });
  };
  const entry = {
    loaded: false,
    color: null,
    normal: null,
    arm: null,
    rough: null,
    promise: null,
  };
  const suffixes = maps === 'arm'
    ? [['color', THREE.SRGBColorSpace], ['normal', THREE.NoColorSpace], ['arm', THREE.NoColorSpace]]
    : [['color', THREE.SRGBColorSpace], ['normal', THREE.NoColorSpace], ['rough', THREE.NoColorSpace]];
  entry.promise = Promise.all(suffixes.map(([suffix, cs]) => load(suffix, cs).then((tex) => [suffix, tex])))
    .then((pairs) => {
      for (const [suffix, tex] of pairs) entry[suffix] = tex;
      entry.loaded = true;
      return entry;
    })
    .catch((error) => {
      BASE_SET_CACHE.delete(key);
      throw error;
    });
  BASE_SET_CACHE.set(key, entry);
  return entry;
}

function bindDecodedSet(material, base, preset, owned) {
  const wrap = (source, colorSpace) => {
    const clone = source.clone();
    clone.image = source.image;
    configureMap(clone, colorSpace, preset.repeat ?? 1, preset.rotation ?? 0);
    owned.push(clone);
    return clone;
  };
  material.map = wrap(base.color, THREE.SRGBColorSpace);
  material.normalMap = wrap(base.normal, THREE.NoColorSpace);
  material.bumpMap = null;
  if (base.arm) {
    const arm = wrap(base.arm, THREE.NoColorSpace);
    arm.channel = 0;
    material.aoMap = arm;
    material.aoMapIntensity = preset.aoStrength ?? 1;
    material.roughnessMap = arm;
    material.metalnessMap = preset.metalness > 0 ? arm : null;
  } else if (base.rough) {
    material.aoMap = null;
    material.roughnessMap = wrap(base.rough, THREE.NoColorSpace);
    material.metalnessMap = null;
  }
  material.emissive?.set(0);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
}

/**
 * Lazily bind on-demand CC0 full-PBR texture maps (albedo + normal + ARM or roughness)
 * onto a cloned workshop material. Textures attach only after full decode so WebGPU
 * never uploads an uninitialized 0×0 image.
 */
export function applyWorkshopPbrAssetMaps(material, preset) {
  if (!preset?.pbrAsset || typeof Image === 'undefined') return false;
  const base = loadBaseSet(preset.pbrAsset);
  const owned = [];
  let disposed = false;
  const dispose = () => {
    disposed = true;
    owned.forEach((map) => map.dispose());
    owned.length = 0;
    material.removeEventListener('dispose', dispose);
  };
  material.addEventListener('dispose', dispose);
  if (base.loaded) {
    bindDecodedSet(material, base, preset, owned);
  } else {
    base.promise.then((resolved) => {
      if (!disposed) bindDecodedSet(material, resolved, preset, owned);
    }).catch(() => { /* Keep procedural fallback if offline or asset fails to load. */ });
  }
  return true;
}
