/**
 * The surface mask as the GPU reads it: the chunk's cells plus one border cell
 * on each side taken from the neighbouring chunks (computed from the mask
 * builder's tile halo, so no neighbour has to be resident).
 *
 * The mask's texels are cell centres. Without the border, a linear-filtered read
 * clamps the last half cell on each side to its own edge cell, so two chunks
 * never meet at a shared value and grass coverage, paths and water stepped along
 * every chunk edge. With it, the filter blends across the edge into the
 * neighbour's real cell, as it does between any two cells inside a chunk.
 *
 * CPU readers keep the unpadded `page.surfaceMaskPixels`; only the texture is padded.
 */
export const SURFACE_MASK_TEXTURE_PAD = 1;

/** Marks a texture as a padded surface mask, so readers remap their chunk uv. */
export function markPaddedSurfaceMask(texture) {
  texture.userData.surfaceMaskPad = SURFACE_MASK_TEXTURE_PAD;
  return texture;
}

/** The texture coordinate inside a padded surface mask for a chunk `uv` (TSL node); unpadded textures read as-is. */
export function surfaceMaskTextureUv(uvNode, texture) {
  const pad = texture?.userData?.surfaceMaskPad ?? 0;
  const width = texture?.image?.width ?? 0;
  if (!(pad > 0) || !(width > pad * 2)) return uvNode;
  return uvNode.mul((width - pad * 2) / width).add(pad / width);
}

/** A padded copy of an unpadded mask, its border repeating the edge cells (when no halo values are at hand). */
export function padSurfaceMaskByClamping(pixels, chunkSize, out = null) {
  const size = chunkSize + SURFACE_MASK_TEXTURE_PAD * 2;
  const padded = out ?? new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z += 1) {
    const sz = Math.max(0, Math.min(chunkSize - 1, z - SURFACE_MASK_TEXTURE_PAD));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.max(0, Math.min(chunkSize - 1, x - SURFACE_MASK_TEXTURE_PAD));
      const from = (sz * chunkSize + sx) * 4;
      padded.set(pixels.subarray(from, from + 4), (z * size + x) * 4);
    }
  }
  return padded;
}
