import * as THREE from 'three/webgpu';
import { dot, float, materialColor, mix, normalWorld, positionGeometry, vec3, vertexColor } from 'three/tsl';

import { WEATHER_FAMILIES, weatherTownSurface } from './townWeathering.js';

/**
 * One palette for a whole town — and for every workshop building, so a house
 * looks the same in the workshop, as a baked object and in a settlement.
 *
 * Every surface of a settlement used to be coloured on its own: cool grey
 * masonry from the workshop's stone palette, warm photographed setts, orange
 * earth, saturated render. Side by side they read as four kits. Two things tie
 * them together here, after the glade wall work (construction/): quiet faces
 * that let bevels and crevice shadow do the drawing, and one family of colour.
 *
 * - `TOWN_GROUND` is the trodden earth of the place; the paving's earth layer
 *   is tinted to it.
 * - `FAMILY_GRADE` pulls each material family a little toward one daylight.
 * - Every family is then weathered as the medieval kit's towns are
 *   (render/materials/townWeathering): moss on ledges and slates, rain runs
 *   down faces, and a damp foot where a wall meets its ground.
 */
export const TOWN_GROUND = Object.freeze([0.47, 0.41, 0.33]);

/** A multiplier per material family, in linear colour. */
const FAMILY_GRADE = Object.freeze({
  stone: [1, 1, 1],
  mortar: [1.0, 0.98, 0.94],
  wood: [1, 1, 1],
  roof: [0.96, 0.95, 0.94],
});
/**
 * Joint mortar of bare masonry, as a share of the stone it binds. The
 * workshop's is two-thirds of the stone, which reads as a pale grid between
 * blocks; recessed, weathered joints are darker than the faces they part.
 */
const JOINT_DARKENING = 0.62;
const WEATHER_OF_SLOT = Object.freeze({ stone: 'stone', wood: 'timber', roof: 'roof' });
/**
 * One palette with the medieval kit's towns: each family keeps only part of its
 * own hue (`keep`) and takes the rest from the kit's — warm grey stone, cream
 * lime render, dark brown timber — at its own brightness, lifted by `gain`.
 * The workshop's finishes are paint-box bright (ochre reads as mud once
 * weathered), its stone palettes lean teal and its timber silver-green.
 * Hues are scaled so their luma is 1, so a family keeps its brightness.
 */
const KIT_HUE = Object.freeze({
  // Half the style's own hue stays, so sandstone stays warm and granite cool-grey;
  // the teal it used to pick up was the meadow-green bounce (SettlementGroundBounce).
  stone: Object.freeze({ hue: [1.28, 1.0, 0.7], keep: 0.5, gain: 1.05 }),
  // The rubble photograph is darker than dressed block faces: lifted to sit with them.
  rubble: Object.freeze({ hue: [1.28, 1.0, 0.7], keep: 0.15, gain: 1.35 }),
  // Lime render is a warm cream even out of the sun: cool sky fill turned a
  // greyer target grey-blue on every shaded wall.
  render: Object.freeze({ hue: [1.14, 1.0, 0.76], keep: 0.25, gain: 1.22 }),
  wood: Object.freeze({ hue: [1.32, 0.94, 0.66], keep: 0.3, gain: 0.82 }),
});
const LUMA = [0.3, 0.55, 0.15];
const FORGED_IRON = new THREE.Color('#38332e');
/**
 * Photographed relief per family, as a multiple of the workshop's own normal
 * scale (tuned for its synthesised maps). A town is seen from a stride away
 * under a raking sun, where a scan's pits, grain and laps are what make a
 * surface read as made of something.
 */
const RELIEF = Object.freeze({ stone: 1.7, wood: 1.5, mortar: 1.4, roof: 1.3 });

function kitHued(albedo, { hue, keep, gain }) {
  const scale = 1 / (hue[0] * LUMA[0] + hue[1] * LUMA[1] + hue[2] * LUMA[2]);
  const target = vec3(...hue.map((channel) => channel * scale * gain));
  return mix(target.mul(dot(albedo, vec3(...LUMA))), albedo.mul(gain), keep);
}
/** Offset, in metres, between two instances' weathering, from their stable seed. */
const SEED_SPREAD = 173;

/**
 * Grade one workshop material. Weathering is placed in the mesh's own frame,
 * where the ground is y = 0, so it follows every instance; `seed` (a node)
 * shifts the pattern, so a street of one pooled variant is not weathered alike.
 *
 * @param {object} material a workshop material (ProceduralWorkshopMaterials)
 * @param {string} slot its material family
 * @param {{ plastered?: boolean, seed?: import('three/tsl').Node }} [options]
 *   whether the `mortar` family is a rendered wall, and the weathering offset seed
 */
export function gradeTownMaterial(material, slot, { plastered = true, seed = float(0) } = {}) {
  if (slot === 'metal') {
    // The workshop's fittings are brass; a town's hinges, studs, brackets and
    // shutter stays are black forged iron, as the kit towns' are.
    material.color.copy(FORGED_IRON);
    material.metalness = 0.6;
    material.roughness = 0.55;
  }
  const grade = FAMILY_GRADE[slot];
  if (!grade) {
    // Emissive and metal families are left as authored; the dithered instance
    // material still wants an explicit colour node to vary.
    material.colorNode ??= materialColor;
    return;
  }
  // A masonry finish dressed in the town's rubble set is a stone wall, graded as stone;
  // without one, its `mortar` family is the joint mortar behind the blocks.
  const rubble = slot === 'mortar' && !plastered && Boolean(material.map);
  const role = rubble ? 'stone' : slot;
  if (material.normalMap && RELIEF[role]) material.normalScale.multiplyScalar(RELIEF[role]);
  const joints = slot === 'mortar' && !plastered && !rubble;
  const family = WEATHER_FAMILIES[slot === 'mortar' && !rubble ? (plastered ? 'plaster' : 'mortar') : WEATHER_OF_SLOT[role]];
  const tone = joints ? grade.map((channel) => channel * JOINT_DARKENING) : grade;
  const spread = seed.mul(SEED_SPREAD);
  // Three multiplies vertex colours in after the colour node, which would put the
  // per-stone palette back after it was graded: take it in here instead.
  const painted = material.vertexColors ? materialColor.rgb.mul(vertexColor().rgb) : materialColor.rgb;
  material.vertexColors = false;
  let albedo = painted.mul(vec3(...(rubble ? FAMILY_GRADE.stone : tone)));
  const hued = rubble ? KIT_HUE.rubble : slot === 'mortar' ? (plastered ? KIT_HUE.render : null) : KIT_HUE[slot];
  if (hued) albedo = kitHued(albedo, hued);
  material.colorNode = weatherTownSurface(albedo, {
    place: positionGeometry.add(vec3(spread, 0, spread.mul(0.61))),
    up: normalWorld.y,
    height: positionGeometry.y,
    family,
  });
}
