import * as THREE from 'three/webgpu';
import { attribute, float, mix } from 'three/tsl';
import { applyPlantMotion } from '../PlantMotionNodes.js';
import { biomeUnderstoryColor } from '../AuthoredFoliageMaterial.js';
import { authoredGreenMask, gradePlantPart, resolveFoliagePalette } from '../forest/foliagePalette.js';
import { understoryShadeEmission } from '../forest/foliageLight.js';
import { meadowPatchOnPlant } from '../understoryPatch.js';
import { createProceduralBarkTextures } from '../forest/ProceduralBarkTextures.js';
import { deadwoodMaterial } from '../forest/forestDebrisPrototypes.js';
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

function createLivingPlantMaterial(entry, config) {
  const sample = attribute('color', 'vec3');
  const graded = gradePlantPart(sample, resolveFoliagePalette(config, entry.paletteTileId), 'auto');
  const plantGreen = authoredGreenMask(sample);
  const patched = meadowPatchOnPlant(graded, config);
  const local = mix(graded, patched, plantGreen);
  const finalColor = biomeUnderstoryColor(local);
  const blossom = entry.kind === 'blossom';
  const fill = understoryShadeEmission(finalColor, { blossom });

  const material = new THREE.MeshStandardNodeMaterial({
    vertexColors: false,
    roughness: entry.ice ? 0.16 : 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    colorNode: finalColor,
    emissiveNode: fill,
  });
  material.foliageTransmissionNode = blossom
    ? float(0.16)
    : mix(float(0.02), float(0.22), plantGreen);

  applyPlantMotion(material, {
    wind: config?.wind,
    height: entry.height ?? 0.5,
    profile: entry.motionProfile ?? 'woody-shrub',
  });
  return material;
}

function createGlacialIceFloraMaterial() {
  const iceColor = biomeUnderstoryColor(attribute('color', 'vec3'));
  return new THREE.MeshPhysicalNodeMaterial({
    vertexColors: false,
    roughness: 0.14,
    metalness: 0,
    ior: 1.31,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
    side: THREE.FrontSide,
    colorNode: iceColor,
    emissiveNode: iceColor.mul(0.1),
  });
}

/**
 * Builds `StylizedGroundDetailView` prototype definitions for all 80 biome-specific
 * trunks, understories, small plants, and glacier formations across biomes `0–14` and `32`.
 */
export function createBiomeUnderstoryPrototypes(config = {}, environment = {}) {
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
      material = createGlacialIceFloraMaterial();
    } else if (isTrunk) {
      const deadwood = deadwoodMaterial(getBarkTextures(entry.barkProfile ?? 'spruce'), {
        ...environment,
        barkProfile: entry.barkProfile ?? 'spruce',
        horizontal: false,
        olderWood: true,
        roughness: 0.94,
        bumpScale: 0.022,
      });
      material = deadwood.material;
      swapScannedBark = deadwood.swapScannedBark;
    } else {
      material = createLivingPlantMaterial(entry, config);
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
