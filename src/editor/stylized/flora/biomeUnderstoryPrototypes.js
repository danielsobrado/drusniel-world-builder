import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraViewMatrix,
  clamp,
  color,
  dot,
  float,
  mix,
  normalGeometry,
  normalWorld,
  positionGeometry,
  positionWorld,
  smoothstep,
  texture,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { LOOK_SNOW_STEPS } from '../../biomes/BiomeLooks.js';
import { surfaceWetnessUniform } from '../../weather/surfaceWetness.js';
import { applyPlantMotion } from '../PlantMotionNodes.js';
import { biomeUnderstoryColor, UNDERSTORY_FOOT_FILL, understoryFootShade } from '../AuthoredFoliageMaterial.js';
import { barkBumpNormal, barkPackedNormal } from '../forest/TreeBarkMaterial.js';
import { acquireDeadwoodNoise } from '../forest/deadwoodNoise.js';
import { authoredGreenMask, gradePlantPart, resolveFoliagePalette } from '../forest/foliagePalette.js';
import { understoryShadeEmission } from '../forest/foliageLight.js';
import { foliageMaterialClass } from '../forest/FoliageNodeMaterial.js';
import { assignBushFoliageMaterialData } from '../../../render/postprocessing/PostProcessingMaterialData.js';
import { createProceduralBarkTextures } from '../forest/ProceduralBarkTextures.js';
import { deadwoodMaterial } from '../forest/forestDebrisPrototypes.js';
import { acquireIceTextures } from '../ice/iceTextures.js';
import { meadowPatchOnPlant } from '../understoryPatch.js';
import { worldNoiseField } from '../worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../worldNoiseLayout.js';
import { sampleGroundContactVarying } from '../groundContact/GroundContactState.js';
import { COLD_ALPINE_BIOME_FLORA } from './biomeFloraColdAlpine.js';
import { COASTAL_ARID_BIOME_FLORA } from './biomeFloraCoastalArid.js';
import { SAVANNA_BADLANDS_BIOME_FLORA } from './biomeFloraSavannaBadlands.js';
import { TEMPERATE_ROAD_FARM_BIOME_FLORA } from './biomeFloraTemperateRoadFarm.js';
import { TROPICAL_BIOME_FLORA } from './biomeFloraTropical.js';
import { WETLAND_RAINFOREST_BIOME_FLORA } from './biomeFloraWetlandRainforest.js';

export const BIOME_FLORA_CATALOG = Object.freeze([
  ...COASTAL_ARID_BIOME_FLORA,
  ...SAVANNA_BADLANDS_BIOME_FLORA,
  ...TEMPERATE_ROAD_FARM_BIOME_FLORA,
  ...TROPICAL_BIOME_FLORA,
  ...WETLAND_RAINFOREST_BIOME_FLORA,
  ...COLD_ALPINE_BIOME_FLORA,
]);

function triplanarSample(map, point, weights) {
  const planes = [point.yz, point.zx, point.xy];
  const taps = planes.map((coord) => texture(map, coord));
  return {
    planes,
    taps,
    value: taps[0].mul(weights.x).add(taps[1].mul(weights.y)).add(taps[2].mul(weights.z)),
  };
}

function createLivingPlantMaterial(entry, config, environment = {}, deadwoodNoise = null) {
  const sample = attribute('color', 'vec3');
  const graded = gradePlantPart(sample, resolveFoliagePalette(config, entry.paletteTileId), 'auto');
  const plantGreen = authoredGreenMask(sample);
  const patched = meadowPatchOnPlant(graded, config);
  const local = mix(graded, patched, plantGreen);

  // Sample packed CC0 noise textures (deadwood-noise + world-noise micro) for real PBR surface detail.
  const uvCoord = uv();
  const grainSample = deadwoodNoise
    ? texture(deadwoodNoise.texture, uvCoord.mul(3.5))
    : worldNoiseField(WORLD_NOISE_LAYERS.micro)(positionGeometry.xz.mul(2.4));
  const microField = worldNoiseField(WORLD_NOISE_LAYERS.micro)(positionGeometry.xz.mul(3.8).add(positionGeometry.y.mul(1.6)));
  const veinRib = dot(uvCoord.sub(0.5).abs(), vec3(2, 0, 0).xy).oneMinus().clamp(0, 1);

  // Smooth ground-contact soil/humus collar + AO from the GPU ground-contact field
  // (vertex stage) so roots & cushions track sloped terrain and biome soil seamlessly.
  const groundContact = sampleGroundContactVarying(positionWorld.xz, 'biomeFlora');
  const heightAbove = mix(positionGeometry.y, positionWorld.y.sub(groundContact.height), groundContact.inside);
  const soilWave = microField.g.sub(0.5).mul(0.06);
  const groundTouch = smoothstep(-0.03, 0.11, heightAbove.add(soilWave)).oneMinus();
  const baseRamp = smoothstep(0.0, 0.24, heightAbove);
  const contactAO = understoryFootShade(baseRamp, groundContact);
  const fallbackSoil = color(environment.soilColor ?? '#5c4a30');
  const soilTone = mix(fallbackSoil, groundContact.soilColor, groundContact.inside)
    .mul(mix(0.84, 1.12, grainSample.r));
  const groundedColor = mix(local, soilTone, groundTouch.mul(0.54)).mul(contactAO);

  const finalColor = biomeUnderstoryColor(groundedColor);
  const blossom = entry.kind === 'blossom';
  const fill = understoryShadeEmission(finalColor, { blossom }).mul(mix(float(UNDERSTORY_FOOT_FILL), float(1.0), baseRamp));

  // Normal relief from vein height + organic noise texture, blending smoothly into the terrain normal at the foot.
  const reliefHeight = mix(grainSample.r, veinRib, plantGreen.mul(0.45)).mul(0.01);
  const bumpNormal = barkBumpNormal(reliefHeight);
  const groundUpView = cameraViewMatrix.mul(vec4(groundContact.normal, 0)).xyz.normalize();
  const skySoft = groundTouch.mul(0.78).max(plantGreen.mul(0.52));
  const blendedNormal = mix(bumpNormal, groundUpView, skySoft).normalize();

  // Spatially varying PBR roughness: soft matte-waxy leaves, matte soil/woody base.
  const baseRoughness = blossom
    ? mix(float(0.66), float(0.78), grainSample.g)
    : mix(float(0.86), mix(float(0.56), float(0.74), microField.r), plantGreen);
  const dryRoughness = baseRoughness.max(groundTouch.mul(0.94)).clamp(0.38, 1);
  const roughnessNode = mix(dryRoughness, dryRoughness.min(0.28), surfaceWetnessUniform.mul(0.6));

  const material = new (foliageMaterialClass(THREE.MeshStandardNodeMaterial))({
    vertexColors: false,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    colorNode: finalColor,
    normalNode: blendedNormal,
    roughnessNode,
    emissiveNode: fill,
  });
  material.foliageTransmissionNode = (blossom
    ? float(0.16)
    : mix(float(0.02), float(0.22), plantGreen)).mul(mix(float(0.30), float(1.0), baseRamp));
  if (!blossom) {
    material.foliageWrapDiffuseNode = mix(float(0.08), float(0.30), plantGreen);
    material.foliageRimGlowNode = mix(float(0), float(0.14), plantGreen).mul(baseRamp);
  }

  applyPlantMotion(material, {
    wind: config?.wind,
    height: entry.height ?? 0.5,
    profile: entry.motionProfile ?? 'woody-shrub',
    groundConform: true,
  });
  return assignBushFoliageMaterialData(material);
}

/**
 * Glacial flora PBR material sharing `ice-detail.png` and `ice-normal-rough.png` via
 * triplanar projection, clearcoat, frost sparkle, and snow-skirt base blending.
 */
function createGlacialIceFloraMaterial(baseUrl = '') {
  const { detail, surface } = acquireIceTextures(baseUrl);
  const facing = normalGeometry.abs().pow(4);
  const weights = facing.div(dot(facing, vec3(1)).max(1e-4)).toVar();
  const fine = positionGeometry.mul(3.4).toVar();
  const coarse = positionGeometry.mul(1.1).toVar();

  const masks = triplanarSample(detail, coarse, weights).value.toVar();
  const fineSurface = triplanarSample(surface, fine, weights);
  const coarseSurface = triplanarSample(surface, coarse, weights);

  const w = [weights.x, weights.y, weights.z];
  const packedNormal = fineSurface.taps.map((tap, i) => barkPackedNormal(tap, fineSurface.planes[i]))
    .reduce((sum, n, i) => sum.add(n.mul(w[i])), vec3(0))
    .mul(0.55)
    .add(
      coarseSurface.taps.map((tap, i) => barkPackedNormal(tap, coarseSurface.planes[i]))
        .reduce((sum, n, i) => sum.add(n.mul(w[i])), vec3(0))
        .mul(0.45),
    )
    .normalize();

  const groundTouch = smoothstep(0.16, -0.05, positionGeometry.y.add(masks.g.sub(0.5).mul(0.08)));
  const groundUpView = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize();
  const iceNormal = mix(packedNormal, groundUpView, groundTouch.mul(0.75)).normalize();

  const look = attribute('instanceBiomeLook', 'vec4');
  const snowSteps = look.w.div(4).floor();
  const snowDepth = snowSteps.div(LOOK_SNOW_STEPS);
  const slopeSnow = smoothstep(0.42, 0.78, normalWorld.y.add(masks.g.sub(0.4).mul(0.45)))
    .mul(snowDepth.mul(1.15).clamp(0, 1));
  const basalSnow = groundTouch.mul(0.88);
  const cap = clamp(slopeSnow.max(basalSnow), 0, 1);

  const blueShare = clamp(smoothstep(0.28, 0.74, masks.b.mul(0.9).add(masks.r.mul(0.45)))
    .add(normalWorld.y.abs().oneMinus().mul(0.28)), 0, 1).toVar();
  const iceTint = mix(attribute('color', 'vec3'), color('#1f78c4'), blueShare.mul(0.42));
  const shadedIce = mix(iceTint, color('#edf4f9'), cap);
  const iceAlbedo = biomeUnderstoryColor(shadedIce);
  const mirrorRoughness = mix(mix(fineSurface.value.b.max(0.22), float(0.08), blueShare), float(0.82), cap);

  const material = new THREE.MeshPhysicalNodeMaterial({
    vertexColors: false,
    roughness: 0.16,
    metalness: 0,
    ior: 1.31,
    side: THREE.FrontSide,
    colorNode: iceAlbedo,
    normalNode: iceNormal,
    roughnessNode: mirrorRoughness,
    clearcoatNode: blueShare.mul(cap.oneMinus()).mul(0.85),
    clearcoatRoughnessNode: float(0.06),
    emissiveNode: iceAlbedo.mul(blueShare.mul(0.18).add(0.06)).mul(cap.oneMinus()),
  });
  return material;
}

/**
 * Builds `StylizedGroundDetailView` prototype definitions for all 80 biome-specific
 * trunks, understories, small plants, and glacier formations across biomes `0–14` and `32`,
 * wired with PBR normal/roughness maps and smooth terrain contact skirts.
 */
export function createBiomeUnderstoryPrototypes(config = {}, environment = {}) {
  const baseUrl = environment.baseUrl ?? '';
  const deadwoodNoise = acquireDeadwoodNoise(baseUrl);
  const barkByProfile = new Map();
  const getBarkTextures = (profile = 'spruce') => {
    if (!barkByProfile.has(profile)) {
      barkByProfile.set(profile, createProceduralBarkTextures({ profile, resolution: 256 }));
    }
    return barkByProfile.get(profile);
  };

  return BIOME_FLORA_CATALOG.map((entry) => {
    const geometry = entry.createGeometry();
    let material;
    let swapScannedBark = null;
    const isTrunk = entry.kind === 'trunk';

    if (entry.ice) {
      material = createGlacialIceFloraMaterial(baseUrl);
    } else if (isTrunk) {
      const deadwood = deadwoodMaterial(getBarkTextures(entry.barkProfile ?? 'spruce'), {
        ...environment,
        barkProfile: entry.barkProfile ?? 'spruce',
        horizontal: false,
        olderWood: true,
        roughness: 0.94,
        bumpScale: 0.024,
      });
      material = deadwood.material;
      swapScannedBark = deadwood.swapScannedBark;
    } else {
      material = createLivingPlantMaterial(entry, config, environment, deadwoodNoise);
    }

    return {
      id: `biome-flora/${entry.id}`,
      tileIds: entry.tileIds,
      paletteTileId: entry.paletteTileId,
      weight: entry.weight ?? 1.2,
      conform: entry.conform === true,
      heightOffset: -0.015,
      parts: [{
        geometry,
        material,
        kind: isTrunk ? 'detail' : 'leaf',
        instanceBiomeLook: true,
      }],
      syncScannedBark(barkScans) {
        if (!swapScannedBark || !(barkScans instanceof Map)) return false;
        const scan = barkScans.get(entry.barkProfile ?? 'spruce');
        return scan ? swapScannedBark(scan) : false;
      },
    };
  });
}
