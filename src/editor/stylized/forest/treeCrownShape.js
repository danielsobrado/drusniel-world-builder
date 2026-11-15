import { cos, mix, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import { TREE_SHAPE_FIELDS, TREE_SHAPE_SPAN } from './treeShapeCode.js';

const TWO_PI = Math.PI * 2;
/** Share of the crown's height its top shifts toward the light at full asymmetry. */
const CROWN_SHEAR = 0.25;
/** A low-crowned tree's bole thickening still fades out over this share of its height. */
const BOLE_SHARE = 0.15;
/** Root flare fades out over this share of the tree's height. */
const FLARE_SHARE = 0.08;

/** The trunk scale alone from a packed morphology z (treeShapeCode.js). */
export function treeTrunkScaleNode(packed) {
  return packed.sub(packed.mul(1 / TREE_SHAPE_SPAN).floor().mul(TREE_SHAPE_SPAN));
}

/** Every field of a packed morphology z; divisions are by powers of two, so exact. */
export function treeShapeNodes(packed) {
  const code = packed.mul(1 / TREE_SHAPE_SPAN).floor();
  const shape = { trunk: packed.sub(code.mul(TREE_SHAPE_SPAN)) };
  let base = 1;
  for (const [name, levels, signed, step] of TREE_SHAPE_FIELDS) {
    const above = code.mul(1 / base).floor();
    let stored = above.sub(above.mul(1 / levels).floor().mul(levels));
    if (signed) stored = stored.sub(stored.mul(2 / levels).floor().mul(levels));
    shape[name] = stored.mul(step);
    base *= levels;
  }
  return shape;
}

/**
 * One tree's crown and bole, in its prototype's space (before the instance
 * matrix). Leaves and bark take the same radial factor inside the crown band, so
 * branches stay in their foliage, and nothing moves the crown off the trunk axis:
 * the taper scales about it, the asymmetry only adds reach on the light side, the
 * shear grows from zero at the crown base, and a crown only ever stretches,
 * downward from its fixed top, which a tree's impostor never has to show.
 * The light side is hashed from the dither seed.
 *
 * `band` is [crown base, crown top] (tagCrownBand); `morphology` the instance
 * vec3: leaf x/y = crown width/height scale, z = packed trunk and shape.
 */
export function shapeTreePosition(position, { kind, center, band, morphology, seed }) {
  const [crownMin, crownMax] = band;
  const height = Math.max(crownMax - crownMin, 1e-3);
  const shape = treeShapeNodes(morphology.z);
  const offset = vec2(position.x.sub(center.x), position.z.sub(center.z));
  const t = position.y.sub(crownMin).mul(1 / height).clamp(0, 1);
  const angle = seed.mul(TWO_PI * 5);
  const light = vec2(cos(angle), sin(angle));
  const facing = offset.div(offset.length().max(1e-4)).dot(light).mul(0.5).add(0.5);
  const crown = shape.taper.mul(t.mul(-2).add(1)).add(1)
    .mul(shape.asymmetry.mul(facing.mul(facing)).add(1));
  const shear = shape.asymmetry.mul(CROWN_SHEAR * height).mul(t);
  let radial;
  let y = position.y;
  if (kind === 'leaf') {
    radial = morphology.x.mul(crown);
    y = position.y.sub(crownMax).mul(morphology.y).add(crownMax);
  } else {
    const boleTop = Math.max(crownMin, BOLE_SHARE * crownMax, 1e-3);
    const flareTop = Math.max(FLARE_SHARE * crownMax, 1e-3);
    const bole = shape.bole.mul(smoothstep(0, boleTop, position.y).oneMinus())
      .add(shape.flare.mul(smoothstep(0, flareTop, position.y).oneMinus())).add(1);
    const inCrown = smoothstep(crownMin - 0.1 * height, crownMin + 0.1 * height, position.y);
    radial = shape.trunk.mul(mix(bole, crown, inCrown));
  }
  return vec3(
    offset.x.mul(radial).add(light.x.mul(shear)).add(center.x),
    y,
    offset.y.mul(radial).add(light.y.mul(shear)).add(center.z),
  );
}

/**
 * Gives every leaf and trunk material of one prototype the same crown band, so
 * the tree is shaped as one. A leafless snag takes its upper stem as its crown.
 */
export function tagCrownBand(parts) {
  let min = Infinity;
  let max = -Infinity;
  let top = -Infinity;
  for (const { geometry, kind } of parts) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    top = Math.max(top, geometry.boundingBox.max.y);
    if (kind !== 'leaf') continue;
    min = Math.min(min, geometry.boundingBox.min.y);
    max = Math.max(max, geometry.boundingBox.max.y);
  }
  const band = min < max ? [min, max] : top > 0 ? [top * 0.6, top] : null;
  if (!band) return parts;
  for (const part of parts) {
    if (part.kind === 'leaf' || part.kind === 'trunk') part.material.userData.treeCrownBand = band;
  }
  return parts;
}
