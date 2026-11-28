import { materialColor, materialRoughness, positionWorld } from 'three/tsl';
import { groundTownFoundation } from '../../../render/materials/townGroundContact.js';
import { NOISE, planarNoise } from '../../locations/materials/locationNoise.js';

/** Construction walls stand in open ground, not on a paved apron: a taller, broken soil splash. */
const FOOTING_HEIGHT_SCALE = 2.4;
const FOOTING_CONTACT = 1;

/**
 * A construction wall's foot in the soil of the terrain it stands on: the same
 * `foundation` contact band and soil as town buildings (townGroundContact.js).
 * Construction geometry is meshed at the terrain's absolute height, so the band
 * follows the WSC terrain height directly; outside the WSC window the wall is
 * left as it was.
 */
export function groundConstructionFooting(material) {
  // A stone's colour is its vertex colour, which three multiplies in after this node: the band stains each
  // stone with the soil rather than replacing it. `vertexColors` stays declared (CLAUDE.md, workshop).
  const color = (material.colorNode ?? materialColor).rgb;
  const footing = groundTownFoundation({ color, roughness: material.roughnessNode ?? materialRoughness }, {
    terrainRelative: true,
    heightScale: FOOTING_HEIGHT_SCALE,
    contact: FOOTING_CONTACT,
    noise: planarNoise(NOISE.patch, positionWorld.xz.mul(0.9)).sub(0.5),
  });
  material.colorNode = footing.color;
  material.roughnessNode = footing.roughness;
  // No `groundLight` emission: it re-lights a town's own shade fill, and on unlit-emission stone it only added
  // the paving's fill light to the band, which drew a pale stripe along every wall foot (Phase 0B capture).
  return material;
}
