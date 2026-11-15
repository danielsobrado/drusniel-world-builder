/**
 * A tree's crown and bole shape, carried in the integer part of its morphology z
 * beside the trunk scale (`z = trunk + SPAN × code`), because a tree leaf part is
 * at WebGPU's eight-vertex-buffer limit. Code 0 is the plain prototype, so an
 * instance nobody shaped (a canopy cluster, the identity morphology) decodes as
 * it always did. The shader decode is in treeCrownShape.js.
 *
 * Fields, least significant first: [name, levels, signed, value of one level].
 * 11 bits keep z below 8192, where float32 still holds the trunk to 5e-4.
 */
export const TREE_SHAPE_SPAN = 4;
export const TREE_ASYMMETRY_MAX = 0.45;
export const TREE_SHAPE_FIELDS = Object.freeze([
  // Extra crown reach toward the tree's light side.
  Object.freeze(['asymmetry', 8, false, TREE_ASYMMETRY_MAX / 7]),
  // Crown width at its base over its top: + conical, − spreading/flat-topped.
  Object.freeze(['taper', 8, true, 0.1]),
  // Bole thickening below the crown, fading out by the crown base.
  Object.freeze(['bole', 8, true, 0.15]),
  // Root flare, fading out a short way above the ground.
  Object.freeze(['flare', 4, false, 0.15]),
]);
const MAX_CODE = TREE_SHAPE_FIELDS.reduce((product, [, levels]) => product * levels, 1) - 1;
const MIN_TRUNK = 0.05;
const MAX_TRUNK = TREE_SHAPE_SPAN - 0.02;

export function encodeTreeShape(shape = {}) {
  let code = 0;
  let base = 1;
  for (const [name, levels, signed, step] of TREE_SHAPE_FIELDS) {
    const lowest = signed ? -levels / 2 : 0;
    const highest = signed ? levels / 2 - 1 : levels - 1;
    const level = Math.min(highest, Math.max(lowest, Math.round((Number(shape[name]) || 0) / step)));
    code += (level < 0 ? level + levels : level) * base;
    base *= levels;
  }
  return code;
}

export function decodeTreeShape(code) {
  const shape = {};
  let base = 1;
  for (const [name, levels, signed, step] of TREE_SHAPE_FIELDS) {
    const stored = Math.floor(code / base) % levels;
    shape[name] = (signed && stored >= levels / 2 ? stored - levels : stored) * step;
    base *= levels;
  }
  return shape;
}

export function packTreeTrunk(trunkScale, code = 0) {
  const trunk = Math.min(MAX_TRUNK, Math.max(MIN_TRUNK, trunkScale));
  return trunk + TREE_SHAPE_SPAN * Math.min(MAX_CODE, Math.max(0, Math.trunc(code) || 0));
}

export function unpackTreeTrunk(packed) {
  const code = Math.floor(packed / TREE_SHAPE_SPAN);
  return { trunkScale: packed - code * TREE_SHAPE_SPAN, code };
}
