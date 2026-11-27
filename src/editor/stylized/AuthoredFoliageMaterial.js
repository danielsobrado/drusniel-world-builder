import * as THREE from 'three/webgpu';
import { attribute, dot, float, materialAO, materialRoughness, mix, mx_noise_float, normalWorld, positionGeometry, positionWorld, sin, smoothstep, vec3 } from 'three/tsl';
import { surfaceWetnessUniform } from '../weather/surfaceWetness.js';
import { LOOK_SNOW_STEPS } from '../biomes/BiomeLooks.js';
import { authoredTexture } from './AuthoredTextureNode.js';
import { authoredGreenMask, gradePlantPart, resolveFoliagePalette } from './forest/foliagePalette.js';
import { understoryShadeEmission } from './forest/foliageLight.js';
import { foliageMaterialClass } from './forest/FoliageNodeMaterial.js';
import { crownInteriorVisibilityNode, crownPuffNormalNode } from './forest/TreeFoliageSurface.js';
import { understoryEdgeNodes } from './forest/crownEdge.js';
import { applyCloudShadow } from './CloudShadow.js';
import { meadowPatchOnPlant } from './understoryPatch.js';
import { worldNoiseField } from './worldNoise.js';
import { WORLD_NOISE_LAYERS } from './worldNoiseLayout.js';
import { sampleWorldSurfaceContextVarying } from './worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from './worldSurfaceContext/WorldSurfaceContactNodes.js';

/** Roughness of a fully rain-wet leaf. */
const WET_LEAF_ROUGHNESS = 0.34;

/** Share of the sky fill a plant's foot keeps (was 0.42: on top of the AO it drew a black base). */
export const UNDERSTORY_FOOT_FILL = 0.7;
/** Share of a crown's interior visibility that also dims its albedo, standing in for self-shadow. */
export const CROWN_SELF_SHADE = 0.5;

/**
 * Foot darkening and canopy shade for a plant, as the grass takes them
 * (meadowPigment's groundAo): deep only where the ground field says the floor
 * is occluded, so an isolated shrub on open ground does not stand in a black
 * pool. A fixed 0.60 floor times the contact term made every base read as a hole.
 */
export function understoryFootShade(baseRamp, groundContact) {
  const foot = float(0.86).sub(groundContact.contact.mul(0.26));
  return mix(foot, float(1), baseRamp).mul(float(1).sub(groundContact.canopy.mul(0.14)));
}

/**
 * How dark a plant's crown interior may get, by the plant's height in metres.
 * A shrub has an inside its own leaves shade; a ground-cover mat (sorrel,
 * periwinkle) does not, and reading its leaves as "interior" by their place in
 * the bounding box turned them near-black in open meadow. 1 means no interior shade.
 */
export function crownInteriorFloor(heightMeters) {
  const t = Math.min(1, Math.max(0, (heightMeters - 0.15) / (0.5 - 0.15)));
  return 1 - 0.55 * t * t * (3 - 2 * t);
}

/** The lower part of a plant takes the terrain's normal (applySkywardNormal), fading out by 40% of its height. */
export function seatPlantNormal(material, baseT, groundContact) {
  material.foliageGroundNormalNode = groundContact.normal;
  material.foliageGroundNormalWeightNode = smoothstep(0.0, 0.4, baseT).oneMinus().mul(0.8).mul(groundContact.inside);
}

/** Clone authored channels into a node material before assigning foliage nodes. */
export function cloneAuthoredNodeMaterial(source, { lit = false } = {}) {
  let material;
  const promote = lit && (source.isMeshBasicMaterial || source.isMeshBasicNodeMaterial);
  if (promote) material = new THREE.MeshLambertNodeMaterial();
  else if (source.isNodeMaterial) material = source.clone();
  else if (source.isMeshPhysicalMaterial) material = new THREE.MeshPhysicalNodeMaterial();
  else if (source.isMeshStandardMaterial) material = new THREE.MeshStandardNodeMaterial();
  else if (source.isMeshPhongMaterial) material = new THREE.MeshPhongNodeMaterial();
  else if (source.isMeshLambertMaterial) material = new THREE.MeshLambertNodeMaterial();
  else if (source.isMeshBasicMaterial) material = new THREE.MeshBasicNodeMaterial();
  else material = new THREE.MeshStandardNodeMaterial();
  if (promote || !source.isNodeMaterial) material.copy(source);
  if (lit) material = new (foliageMaterialClass(material.constructor))().copy(material);
  // Several authored plant GLBs declare KHR_materials_unlit. Their albedo and
  // cutouts belong to the asset; their lighting belongs to the outdoor scene.
  if (promote) material.lights = true;
  // Plants are dielectric. glTF's default metallicFactor is 1, so a bush GLB that
  // never set it lost its diffuse term and took no sun, only sky fill (2026-11-24).
  // A small authored value is a deliberate sheen and stays.
  if (lit && material.metalness > 0.5) {
    material.metalness = 0;
    material.metalnessMap = null;
  }
  // NodeMaterial.copy skips inherited accessors such as Material.alphaTest.
  // Keep the authored cutoff when adding output effects or foliage nodes.
  material.alphaTest = source.alphaTest ?? 0;
  return material;
}

export function authoredFoliageColor(material) {
  const value = new THREE.Color(material.color ?? '#ffffff');
  const base = vec3(value.r, value.g, value.b);
  if (material.map) return authoredTexture(material.map).rgb.mul(base);
  const heightGrad = smoothstep(0.0, 0.72, positionGeometry.y);
  const ribPhase = positionGeometry.x.mul(38).add(positionGeometry.z.mul(38)).add(positionGeometry.y.mul(14));
  const ribs = sin(ribPhase).mul(0.5).add(0.5);
  const mottle = mx_noise_float(positionGeometry.mul(9.5)).mul(0.5).add(0.5);
  const shade = mix(float(0.42), float(1.48), heightGrad.mul(0.68).add(ribs.mul(0.18)).add(mottle.mul(0.14)));
  return base.mul(shade);
}

/**
 * The biome's understory look (biome-looks `understory`), per instance: greyed
 * toward its own luminance by its saturation, then tinted by rgb. A shrub
 * shared by several biomes otherwise wore one biome's green in all of them.
 *
 * In snow country the leaves and bark facing the sky carry snow, broken in
 * clumps, as shrubs and logs do in Community Shaders' snow cover. `w` packs
 * saturation + 4 * snow steps (BiomeLooks LOOK_SNOW_STEPS).
 */
export function biomeUnderstoryColor(color) {
  const look = attribute('instanceBiomeLook', 'vec4');
  const snowSteps = look.w.div(4).floor();
  const saturation = look.w.sub(snowSteps.mul(4));
  const tinted = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, saturation).mul(look.xyz);
  // Snow clumps from the mottle of the world noise (one tap; it was a 3D Perlin
  // on every understory pixel, snow or not).
  const clumps = worldNoiseField(WORLD_NOISE_LAYERS.meso)(positionWorld.xz.add(positionWorld.y).div(2.6)).g;
  // A trace of snow switches it off, as on the rocks (snowDeposition): taiga's 0.1
  // mixed 13% white into dark leaves, which in linear light doubled their value
  // and drew every shrub, plant and log there pale blue (2026-11-12 captures).
  const depth = snowSteps.div(LOOK_SNOW_STEPS);
  // Shift remaining summer foliage on deep snow toward dormant winter umber/bark
  // so bushes never read as green summer shrubs spray-painted white.
  const dormant = depth.smoothstep(0.32, 0.85);
  const luma = dot(tinted, vec3(0.2126, 0.7152, 0.0722));
  const winterBark = vec3(0.34, 0.25, 0.19).mul(luma.mul(1.85).clamp(0.45, 1.35));
  const seasonal = mix(tinted, winterBark, dormant.mul(0.82));
  const cap = smoothstep(0.22, 0.62, normalWorld.y.add(clumps.sub(0.5).mul(0.45)))
    .mul(depth.mul(1.15).clamp(0, 1)).mul(depth.smoothstep(0.16, 0.42));
  return mix(seasonal, vec3(0.90, 0.94, 0.98), cap.mul(0.88));
}

/**
 * Green leaves share the meadow/canopy ramp; flowers, bark and stone retain their pigment.
 * `biomeLook` reads the instance's understory look; its mesh must carry
 * `instanceBiomeLook` (a part with `instanceBiomeLook: true`).
 */
export function applyUnderstoryPalette(material, config, tileId = null, role = 'auto', {
  biomeLook = false,
  bounds = null,
  softEdges = false,
} = {}) {
  const sample = authoredFoliageColor(material);
  const graded = gradePlantPart(sample, resolveFoliagePalette(config, tileId), role);
  // Leaves follow the meadow/canopy patches; non-green stones, stems, and petals stay grounded.
  const plantGreen = (role === 'leaf' || role === 'foliage')
    ? float(1)
    : (role === 'auto' ? authoredGreenMask(sample) : float(0));
  const patched = meadowPatchOnPlant(graded, config);
  const local = (role === 'leaf' || role === 'foliage') ? patched : mix(graded, patched, plantGreen);
  const color = biomeLook ? biomeUnderstoryColor(local) : local;
  const blossom = role === 'petal' || role === 'center';
  // Pure-shader root/base AO and generic WSC contact collar (PR 4) so bushes
  // and ferns sit planted in the floor without double-counting AO.
  const groundContact = sampleWorldSurfaceContextVarying(positionWorld.xz, 'understory');
  const spanY = bounds ? Math.max(0.05, bounds.max[1] - bounds.min[1]) : 0.85;
  const localHeightM = bounds ? positionGeometry.y.sub(bounds.min[1]) : float(spanY);
  const localHeightT = localHeightM.div(spanY).clamp(0, 1);
  const worldHeightT = positionWorld.y.sub(groundContact.height).div(Math.max(0.35, spanY)).clamp(0, 1);
  const baseT = mix(localHeightT, worldHeightT, groundContact.validity);
  const baseRamp = smoothstep(0.0, 0.30, baseT);
  const baseAo = understoryFootShade(baseRamp, groundContact);
  // Shrubs cast no shadow on themselves: inner and underside leaves lose part of
  // the sun here and their sky light below, or the crown reads as one flat sheet.
  const interiorFloor = crownInteriorFloor(spanY);
  const interior = bounds && !blossom && interiorFloor < 1 ? crownInteriorVisibilityNode(bounds, interiorFloor) : float(1);
  const contact = !blossom
    ? applyWorldSurfaceContact({
      surface: { color },
      wsc: groundContact,
      profile: 'understory',
      fallbackHeight: localHeightM,
      mask: mix(float(1), float(0.62), plantGreen),
      applyAo: false,
    })
    : null;
  const groundedColor = blossom
    ? color.mul(mix(float(0.82), float(1.0), baseRamp))
    : contact.color.mul(baseAo).mul(mix(float(1), interior, CROWN_SELF_SHADE));
  // Cutout shrub/understory cards get GPU edge-on grazing fade + soft horizon-air fringe.
  const edge = softEdges && material.map && !blossom
    ? understoryEdgeNodes(authoredTexture(material.map).a, {
      cut: Math.max(0.32, material.alphaTest ?? 0.35),
      greenMask: plantGreen,
    })
    : null;
  material.colorNode = edge ? groundedColor.mul(edge.airRim.oneMinus()) : groundedColor;
  if (edge) {
    let opacity = edge.opacity;
    if (material.alphaMap) opacity = opacity.mul(authoredTexture(material.alphaMap).g);
    if (material.opacity < 1) opacity = opacity.mul(material.opacity);
    material.opacityNode = opacity;
  }
  const fillAttenuation = mix(float(UNDERSTORY_FOOT_FILL), float(1.0), baseRamp);
  const fill = understoryShadeEmission(groundedColor, { blossom, airRim: edge?.airRim ?? null })
    .mul(fillAttenuation).mul(interior);
  material.aoNode = (material.aoNode ?? materialAO).mul(interior);
  material.foliageVisibilityNode = interior;
  material.foliageTransmissionNode = (blossom
    ? float(0.16)
    : mix(float(0.02), float(0.22), plantGreen)).mul(mix(float(0.28), float(1.0), baseRamp));
  if (!blossom) {
    seatPlantNormal(material, baseT, groundContact);
    material.foliageWrapDiffuseNode = mix(float(0.08), float(0.32), plantGreen);
    material.foliageRimGlowNode = mix(float(0), float(0.14), plantGreen).mul(baseRamp);
    // A crown's puff normal points a mat's lower leaves at the ground, so it scales with the crown like the interior shade.
    const crownShare = (1 - interiorFloor) / 0.55;
    if (bounds && crownShare > 0) {
      // Vertex-safe puff normals: modest upward bias keeps sunlit shrub sides rich at noon.
      material.foliageShapeNormalNode = crownPuffNormalNode(bounds, 0.34, 0.12);
      material.foliageNormalBlendNode = mix(float(0.22), float(0.76), smoothstep(0.06, 0.38, localHeightT)).mul(crownShare);
    }
  }
  // Retain any authored emission (e.g. flower centres).
  material.emissiveNode = material.emissiveNode ? material.emissiveNode.add(fill) : fill;
  if ('roughness' in material) {
    // Rain film on leaves that face the sky: the sun glints, as on the terrain.
    const wet = surfaceWetnessUniform.mul(smoothstep(0.1, 0.7, normalWorld.y));
    material.roughnessNode = mix(materialRoughness, materialRoughness.min(WET_LEAF_ROUGHNESS), wet);
  }
  return applyCloudShadow(material, config.sky);
}
