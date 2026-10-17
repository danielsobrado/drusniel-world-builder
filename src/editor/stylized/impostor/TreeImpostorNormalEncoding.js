// Canvas premultiplies RGB by alpha. Zero-alpha trunk pixels lose their normals.
// Reserve the upper half of alpha for classification, retaining 7-bit RGB in
// trunk pixels through canvas/PNG transport. Albedo owns visible coverage.
export const TREE_NORMAL_MASK_FLOOR_BYTE = 128;
export const TREE_NORMAL_MASK_RANGE_BYTE = 127;
export function encodeTreeFoliageMask(mask) {
  return Math.round(TREE_NORMAL_MASK_FLOOR_BYTE + Math.min(1, Math.max(0, mask)) * TREE_NORMAL_MASK_RANGE_BYTE);
}
export function decodeTreeFoliageMaskNode(alpha) {
  return alpha.sub(TREE_NORMAL_MASK_FLOOR_BYTE / 255).mul(255 / TREE_NORMAL_MASK_RANGE_BYTE).clamp(0, 1);
}
