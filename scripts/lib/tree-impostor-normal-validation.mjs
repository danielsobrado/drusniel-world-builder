import { TREE_NORMAL_MASK_FLOOR_BYTE } from '../../src/editor/stylized/impostor/TreeImpostorNormalEncoding.js';

/** Coverage belongs to albedo; all covered normal pixels must survive PNG. */
export function validateTreeNormalPixels(albedo, normal, label = 'Tree normal atlas') {
  if (albedo.length !== normal.length || albedo.length % 4) throw new Error(`${label}: RGBA dimensions differ.`);
  let visible = 0, foliage = 0, trunk = 0;
  for (let i = 0; i < albedo.length; i += 4) {
    if (albedo[i + 3] < 128) continue;
    visible++;
    const length = Math.hypot(...[0, 1, 2].map(c => normal[i + c] / 255 * 2 - 1));
    if (normal[i + 3] < TREE_NORMAL_MASK_FLOOR_BYTE || Math.abs(length - 1) > .04) {
      throw new Error(`${label}: missing or invalid normal at covered pixel ${i / 4}.`);
    }
    if (normal[i + 3] > TREE_NORMAL_MASK_FLOOR_BYTE) foliage++;
    else trunk++;
  }
  return { visible, foliage, trunk };
}
