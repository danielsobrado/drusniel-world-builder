import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { resolveAssetUrl } from '../../assets/assetUrl.js';

/** Bounded workers owned by one atlas load; downloads overlap initialization. */
export function createFoliageKtx2Loader(renderer, baseUrl) {
  if (!renderer) return null;
  let loader;
  try {
    loader = new KTX2Loader().setTranscoderPath(resolveAssetUrl(baseUrl, 'assets/gods-end/decoders/basis/'))
      .setWorkerLimit(2).detectSupport(renderer);
    loader.init().catch(() => {}); // loadAsync observes the same failure and uses the raw fallback.
    return loader;
  } catch (error) {
    loader?.dispose();
    console.warn('Compressed foliage support unavailable; using baked RGBA mip chains.', error);
    return null;
  }
}

/** Texture payload bytes; excludes driver padding and renderer metadata. */
export function foliageTextureBytes(map) {
  if (map.mipmaps?.length) return map.mipmaps.reduce((sum, mip) => sum + (mip.data?.byteLength ?? 0), 0);
  let width = map.image?.width ?? 0, height = map.image?.height ?? 0, total = 0;
  if (!width || !height) return 0;
  do {
    total += width * height * 4;
    if (!map.generateMipmaps || (width <= 1 && height <= 1)) break;
    width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);
  } while (true);
  return total;
}
