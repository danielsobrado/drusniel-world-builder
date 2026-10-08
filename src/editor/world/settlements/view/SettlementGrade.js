import { materialColor, mix, positionGeometry, smoothstep, vec3 } from 'three/tsl';

/**
 * One palette for a whole town.
 *
 * Every surface of a settlement used to be coloured on its own: cool grey
 * masonry from the workshop's stone palette, warm photographed setts, orange
 * earth, saturated render. Side by side they read as four kits. Two things tie
 * them together here, after the glade wall work (construction/): quiet faces
 * that let bevels and crevice shadow do the drawing, and one family of colour.
 *
 * - `TOWN_GROUND` is the trodden earth of the place. The paving's earth layer
 *   is tinted to it, and every wall is washed toward it at its foot, so a
 *   building rises out of its ground instead of meeting it in a ruled line.
 * - `FAMILY_GRADE` pulls each material family a little toward one warm
 *   daylight: the stone loses its blue cast, the timber and roofs sit under it.
 */
export const TOWN_GROUND = Object.freeze([0.47, 0.41, 0.33]);

/** A multiplier per material family, in linear colour. */
const FAMILY_GRADE = Object.freeze({
  stone: [1.1, 1.0, 0.86],
  mortar: [1.02, 0.99, 0.93],
  wood: [1.0, 0.97, 0.92],
  roof: [1.02, 0.98, 0.94],
});
/** How high up a wall the ground's colour climbs, in metres, and how strongly it takes at the very foot. */
const SPLASH = Object.freeze({ height: 1.5, strength: 0.6 });

/**
 * Grade one workshop material for a settlement. The wash is by height in the
 * mesh's own frame, where the ground is y = 0, so it follows every instance.
 */
export function gradeSettlementMaterial(material, slot) {
  const grade = FAMILY_GRADE[slot];
  if (!grade) {
    // Emissive and metal families are left as authored; the dithered instance
    // material still wants an explicit colour node to vary.
    material.colorNode ??= materialColor;
    return;
  }
  const rise = smoothstep(0, SPLASH.height, positionGeometry.y);
  const splash = rise.oneMinus().pow(2).mul(SPLASH.strength);
  material.colorNode = mix(materialColor.rgb.mul(vec3(...grade)), vec3(...TOWN_GROUND).mul(1.15), splash);
}
