import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cameraViewMatrix,
  dot,
  mix,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  vec3,
  vec4,
  varyingProperty,
} from 'three/tsl';

import { assignGrassMaterialData } from '../../../render/postprocessing/PostProcessingMaterialData.js';
import { grassGustSheenUniforms } from '../ambient/GrassGustSheen.js';
import { applyJungleMist } from '../ambient/jungleMistOutput.js';
import { applyCloudShadow } from '../CloudShadow.js';
import { FOREST_FLOOR_FILL, foliageSkyFill } from '../forest/foliageLight.js';
import { spellLightIrradiance, spellWorldEnabled } from '../../vfx/render/SpellWorldLight.js';
import { createMeadowBladePosition, meadowInstance } from './meadowBladeShape.js';
import { applyHandoff, applyPublicationFade } from './meadowFade.js';
import { meadowPigment } from './meadowPigment.js';
export { meadowBladeWorldNormal } from './meadowBladeNormals.js';

/**
 * One material for every band's batch.
 *
 * @param {object} options
 * @param {object} options.uniforms createMeadowUniforms()
 * @param {object} options.tuning GrassTuning uniforms
 * @param {object} options.config stylizedSurface
 * @param {object} options.sunDirection live sun direction node
 * @param {number} options.bandCount bands that retire stems
 * @param {boolean} [options.handoff] dissolve into the far cards past uniforms.handoff
 * @param {number} options.tileSize metres
 */
export function createMeadowBladeMaterial({
  uniforms, tuning, config, sunDirection, bandCount = 4, handoff = false, tileSize,
}) {
  // Use MeshStandardNodeMaterial (matching terrainMaterial.js) so blades receive the
  // exact same `scene.environment` IBL sky fill under overcast clouds, rain, and canopy
  // shade instead of plunging dark relative to Standard terrain (WSC PR 3).
  const material = new THREE.MeshStandardNodeMaterial({
    metalness: 0,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  material.name = 'meadow-grass-blades';
  // Shadow receivers interpolate positionWorld so these varying assignments stay in the vertex stage.
  const bentNormal = varyingProperty('vec3', 'meadowBentNormal');
  const gust = varyingProperty('float', 'meadowGust');
  const profileHeight = varyingProperty('float', 'meadowProfileHeight');
  const position = createMeadowBladePosition({
    uniforms, tuning, config, bandCount, tileSize,
    interaction: uniforms.interaction, normalOutput: bentNormal, gustOutput: gust, heightOutput: profileHeight,
  });
  material.positionNode = position;

  const blade = meadowInstance(uniforms.origin);
  const { pigment, bladeValue, rootShade, canopy, color: albedo, height } = meadowPigment({
    uniforms, tuning, config, blade, marks: true, height: profileHeight,
  });

  // Deformation-aware shading uses the normal computed with the vertex position.
  // Interpolation adds no second wind, tuft or interaction-map evaluation.
  const side = attribute('bladeProfile', 'vec4').x.clamp(-1, 1).toVarying();
  const worldNormal = bentNormal.normalize();
  material.normalNode = cameraViewMatrix.mul(vec4(worldNormal, 0)).xyz.normalize();
  const detailReach = cameraPosition.distance(blade.base).smoothstep(6, 14).oneMinus().toVarying('meadowBladeDetailReach');
  const edge = side.abs();
  const rib = blade.shape.greaterThan(.5).select(
    edge.smoothstep(.04, .18).mul(.06).add(.94), edge.mul(.04).add(.98));
  material.colorNode = albedo.mul(mix(1, rib, detailReach));

  // Sun through the thin tip, carrying the blade's own colour, and a small shared
  // fill so roots and terrain stay together without bleaching the field.
  const view = normalize(cameraPosition.sub(positionWorld));
  const transmission = pow(dot(view.negate(), normalize(sunDirection)).max(0), tuning.translucencyPower);
  // Gust fronts crossing the meadow (grass-test's gust sheen): where the travelling
  // wave bends the tips over, their paler side turns up and catches the light.
  // Computed per stem in the vertex stage; the ambient layer sets how much shows.
  const sheen = mix(pigment, vec3(1, 1, 0.86), 0.55)
    .mul(uniforms.sunColor.add(uniforms.skyColor.mul(0.5)))
    .mul(gust).mul(height.mul(height)).mul(grassGustSheenUniforms.weight);
  const floorFill = foliageSkyFill(albedo, FOREST_FLOOR_FILL).mul(canopy);
  const emissive = pigment.mul(bladeValue).mul(uniforms.sunColor)
    .mul(transmission).mul(uniforms.appearance.backlight).mul(tuning.translucencyStrength)
    .mul(smoothstep(0.35, 1, height))
    .add(albedo.mul(uniforms.skyColor).mul(uniforms.appearance.fill).mul(mix(0.75, 1, rootShade)))
    .add(floorFill)
    .add(sheen);
  // A spell's light warming the meadow round it (one uniform light, no scene light).
  // Evaluated per vertex: blades are thin, and the meadow's overdraw makes a
  // per-fragment term cost far more than it shows.
  material.emissiveNode = spellWorldEnabled
    ? emissive.add(albedo.mul(spellLightIrradiance(positionWorld, worldNormal).toVarying('meadowSpellLight')))
    : emissive;

  if (handoff) applyHandoff(material, { base: blade.base, fadeIn: null, fadeOut: uniforms.handoff });
  applyPublicationFade(material, { instance: blade, time: uniforms.time });
  applyCloudShadow(material, config.sky);
  applyJungleMist(material, config.ambientEffects);
  return assignGrassMaterialData(material);
}
