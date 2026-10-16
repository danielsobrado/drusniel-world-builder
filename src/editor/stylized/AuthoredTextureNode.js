import { texture } from 'three/tsl';

/**
 * Samples an authored glTF texture with its loader-provided texture matrix.
 * Optimized assets move UV scale/offset into KHR_texture_transform, which the
 * loader writes to the texture's offset/repeat. A bare `texture(map)` ignores
 * that matrix (only a material's own map slot applies it), so the forest-pack
 * conifers, whose crowns repeat their needle atlas ~16×, sampled one corner of
 * it and rendered as pale cream columns. `setUpdateMatrix` applies it.
 */
export function authoredTexture(textureValue) {
  return texture(textureValue).setUpdateMatrix(true);
}
