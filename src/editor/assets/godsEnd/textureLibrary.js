import catalog from './catalog.generated.json' with { type: 'json' };
import { resolveAssetUrl } from '../assetUrl.js';

export const GODS_END_IMAGE_TEXTURES = Object.freeze(catalog.textures.filter(
  (texture) => /\.(?:png|jpe?g|webp)$/i.test(texture.path),
));

export function populateGodsEndTextureSelect(select) {
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Choose a Gods’ End texture…';
  select.replaceChildren(empty, ...GODS_END_IMAGE_TEXTURES.map((texture) => {
    const option = document.createElement('option');
    option.value = texture.path;
    option.textContent = texture.name;
    return option;
  }));
}

/** Uses the existing bounded upload/persistence path after fetching a local library file. */
export async function loadGodsEndTextureFile(assetPath, { baseUrl = import.meta.env?.BASE_URL ?? '/', fetchImpl = fetch } = {}) {
  const texture = GODS_END_IMAGE_TEXTURES.find((entry) => entry.path === assetPath);
  if (!texture) throw new Error('Choose an image from the Gods’ End texture library.');
  const response = await fetchImpl(resolveAssetUrl(baseUrl, texture.path));
  if (!response.ok) throw new Error(`Gods’ End texture could not load: HTTP ${response.status}.`);
  const type = /\.png$/i.test(texture.path) ? 'image/png' : /\.webp$/i.test(texture.path) ? 'image/webp' : 'image/jpeg';
  return new File([await response.blob()], texture.name.split('/').at(-1), { type });
}
