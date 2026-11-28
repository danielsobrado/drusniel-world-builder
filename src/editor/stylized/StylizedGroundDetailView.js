import { applyJungleMist } from './ambient/jungleMistOutput.js';
import { valueNoise } from '../world/valueNoise2d.js';
import { completeIterator, ITERATOR_PENDING } from './ResumableIterator.js';
import { BudgetedDetailVisibility } from './lod/BudgetedDetailVisibility.js';
import { stepViewRebuild, cancelStagedViewRebuild } from './StagedViewRebuild.js';
import { retainPendingScatterWindow } from './PendingScatterWindow.js';
import * as THREE from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { materialList } from '../assets/assetUrl.js';
import { evaluateDetailSurfacePlacement } from './DetailSurfacePlacement.js';
import { CANDIDATE_PENDING } from './StableScatterManifest.js';
import { instanceCapacity } from './scatterMath.js';
import { createStableChunkManifestBuilder } from './StableScatterManifest.js';
import {
  createInstancedRenderers,
  iterateInstancedRenderers,
  disposeInstancedRenderers,
} from './lod/StylizedLodRuntime.js';
import { InstanceAnchor } from './lod/InstanceAnchor.js';
import { ScatterInstanceRows } from './lod/ScatterInstanceRows.js';
import { iterateAuthoredGroupedPrototypes } from './StylizedPrototypeBake.js';
import { acceptsStrategicDetailPlacement } from './StrategicDetailPlacement.js';
import { registerPrototypeIndices } from './BiomeAssetPalette.js';
import { createBiomePrototypeSelector } from './BiomePrototypeSelector.js';
import { createPathClearanceField } from './TreeManifestStore.js';
import { applyPlantMotion } from './PlantMotionNodes.js';
import { applyUnderstoryPalette, cloneAuthoredNodeMaterial } from './AuthoredFoliageMaterial.js';
import { applySkywardNormal } from './forest/foliageLight.js';
import { assignBushFoliageMaterialData } from '../../render/postprocessing/PostProcessingMaterialData.js';
import { canopyShade } from './forest/ForestFloor.js';
import { placementTileId } from '../biomes/BiomeLooks.js';
import { understoryLookAt } from '../biomes/understoryRampLooks.js';
import { createOceanDistanceField } from '../water/OceanDistanceField.js';
import {
  collectChunkDebrisLogs,
  collectChunkObstacleCircles,
  computePrototypeFootprint,
  footprintHitsObstacle,
  nearestDebrisLog,
  pathBlockedForFootprint,
} from './UnderstoryClearance.js';
import { collectChunkTreeBases, sampleMicrohabitat } from './MicrohabitatField.js';

const DETAIL_UP = new THREE.Vector3(0, 1, 0);
const DETAIL_REPRESENTATIONS = Object.freeze([{ band: 'near', fade: 1, ditherDirection: 1 }]);
const DETAIL_SCRATCH = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  yaw: new THREE.Quaternion(),
  axis: new THREE.Vector3(),
  side: new THREE.Vector3(),
  up: new THREE.Vector3(),
  basis: new THREE.Matrix4(),
};

function cloneDetailMaterial(source, { wind = null, height = 0, bounds = null, motion = 'woody-shrub', groundConform = false, foliageConfig = null, tileId = null, role = 'auto', ambientEffects = null } = {}) {
  const material = cloneAuthoredNodeMaterial(source, { lit: !!foliageConfig });
  const cutout = Boolean(material.map || material.alphaMap || material.transparent);
  // Foliage parts carry `instanceBiomeLook` (see appendVariants), so they wear each biome's understory look.
  if (foliageConfig) {
    applyUnderstoryPalette(material, foliageConfig, tileId, role, {
      biomeLook: true,
      bounds,
      softEdges: cutout,
    });
  }
  // Swayed with the meadow's own wave, so a tuft is not a rigid patch in a moving
  // sward (groundDetailWind.js).
  applyPlantMotion(material, { wind, height, profile: motion, groundConform });
  if (foliageConfig) applySkywardNormal(material);
  if ('roughness' in material) material.roughness = Math.max(0.72, material.roughness ?? 1);
  if ('metalness' in material) material.metalness = 0;
  if (material.map?.colorSpace !== undefined) {
    material.map.colorSpace = THREE.SRGBColorSpace;
  }
  if (cutout) {
    material.alphaTest = Math.max(0.32, material.alphaTest ?? 0);
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
  }
  applyJungleMist(material, ambientEffects);
  material.needsUpdate = true;
  return foliageConfig ? assignBushFoliageMaterialData(material) : material;
}

/**
 * Sparse authored accents over the procedural grass carpet and below water.
 *
 * Dense grass remains the purpose-built shared blade buffer. This layer is for
 * recognisable clover, weed, flower and reed silhouettes whose texture/material
 * parts matter at walking distance. Pack grouping, biome eligibility and scale
 * live entirely in configuration so another GLB can join without view changes.
 */
export class StylizedGroundDetailView {
  constructor({
    terrainView,
    config,
    revisionTracker,
    layerConfig,
    layerName,
    priorityChannel,
    biomeAssetPalette = null,
    regionalCharacterField = null,
    forestFieldProvider = null,
    treePlacementsProvider = null,
    rockBlockersProvider = null,
    bushPlacementsProvider = null,
    debrisPlacementsProvider = null,
    debrisFootprintsProvider = null,
    obstacleVersionProvider = null,
    paletteLayerId = null,
  }) {
    this.terrainView = terrainView;
    this.config = config;
    this.revisionTracker = revisionTracker;
    this.layerConfig = layerConfig;
    this.layerName = layerName;
    this.paletteLayerId = paletteLayerId
      ?? (layerName === 'aquaticPlant' ? 'aquaticPlants' : 'groundDetails');
    this.priorityChannel = priorityChannel;
    this.biomeAssetPalette = biomeAssetPalette;
    this.regionalCharacterField = regionalCharacterField;
    this.forestFieldProvider = forestFieldProvider;
    this.treePlacementsProvider = treePlacementsProvider;
    this.rockBlockersProvider = rockBlockersProvider;
    this.bushPlacementsProvider = bushPlacementsProvider;
    this.debrisPlacementsProvider = debrisPlacementsProvider;
    this.debrisFootprintsProvider = debrisFootprintsProvider;
    this.obstacleVersionProvider = obstacleVersionProvider;
    this.prototypeIndicesByAsset = new Map();
    this.prototypes = [];
    this.prototypeFootprints = [];
    this.prototypeHeightOffsets = [];
    // Lying deadwood (`conform: true`) tilts to the slope under it, or one end floats.
    this.prototypeConform = [];
    this.prototypePlacementRules = [];
    this.prototypeWaterRules = [];
    this.prototypeStrandRules = [];
    this.prototypeShoreRules = [];
    this.prototypeMinCanopy = [];
    this.prototypeMinShoreClearance = [];
    this.prototypeScanSyncHooks = [];
    this.oceanDistance = layerName === 'shoreLife'
      ? createOceanDistanceField(terrainView, layerConfig.coastalReachMeters ?? 48) : null;
    this.prototypeBiomeRules = [];
    this.prototypeIndexForRoll = null;
    this.prototypeRevision = 0;
    this.meshes = [];
    this.manifestCache = new Map();
    this.pendingManifests = new Map();
    this.lastUpdateKey = null;
    this.pendingRebuild = null;
    this.disposed = false;
    this.root = new THREE.Group();
    // Instances are written relative to this, not in canonical metres (InstanceAnchor).
    this.instanceAnchor = new InstanceAnchor();
    this.instanceRows = new ScatterInstanceRows(layerName,
      placement => this.placementMatrix(placement), placement => this.placementAppearance(placement));
    this.root.name = `stylized-${layerName}`;
    this.visibility = config.enhancements?.detailVisibility && layerConfig.castShadow !== true
      && ['groundDetail', 'tropicalPlant'].includes(layerName) ? new BudgetedDetailVisibility(this) : null;
    terrainView.scene.add(this.root);
  }

  placementMatrix(placement) {
    const index = placement.prototypeIndex;
    const baseHeight = Number.isFinite(placement.waterPlacementHeight)
      ? placement.waterPlacementHeight : placement.height;
    const heightOffset = this.prototypeHeightOffsets[index] ?? 0;
    const scale = placement.scale ?? 1;
    const footprint = this.prototypeFootprints?.[index];
    const conform = this.prototypeConform?.[index] === true;
    const groundNormal = placement.groundNormal
      ?? (conform ? this.slopeNormal(placement.x, placement.z) : null);

    if (conform && !placement.groundNormal && footprint) {
      const hx = footprint.halfX * scale;
      const hz = footprint.halfZ * scale;
      const longHalf = Math.max(hx, hz);
      if (longHalf >= 0.75) {
        const yaw = placement.rotationY ?? 0;
        const alongX = hx >= hz;
        const dirX = alongX ? Math.cos(yaw) : Math.sin(yaw);
        const dirZ = alongX ? -Math.sin(yaw) : Math.cos(yaw);
        const span = longHalf * 0.85;
        const h0 = this.terrainView.getCanonicalHeight(placement.x - dirX * span, placement.z - dirZ * span);
        const h1 = this.terrainView.getCanonicalHeight(placement.x + dirX * span, placement.z + dirZ * span);
        const yMid = Math.min(baseHeight, 0.5 * (h0 + h1)) - 0.04 + heightOffset;
        DETAIL_SCRATCH.axis.set(dirX * span * 2, h1 - h0, dirZ * span * 2).normalize();
        DETAIL_SCRATCH.normal.fromArray(groundNormal);
        if (alongX) {
          DETAIL_SCRATCH.side.crossVectors(DETAIL_SCRATCH.axis, DETAIL_SCRATCH.normal).normalize();
          DETAIL_SCRATCH.up.crossVectors(DETAIL_SCRATCH.side, DETAIL_SCRATCH.axis).normalize();
          DETAIL_SCRATCH.basis.makeBasis(DETAIL_SCRATCH.axis, DETAIL_SCRATCH.up, DETAIL_SCRATCH.side);
        } else {
          DETAIL_SCRATCH.side.crossVectors(DETAIL_SCRATCH.normal, DETAIL_SCRATCH.axis).normalize();
          DETAIL_SCRATCH.up.crossVectors(DETAIL_SCRATCH.side, DETAIL_SCRATCH.axis).normalize();
          DETAIL_SCRATCH.basis.makeBasis(DETAIL_SCRATCH.side, DETAIL_SCRATCH.up, DETAIL_SCRATCH.axis);
        }
        DETAIL_SCRATCH.quaternion.setFromRotationMatrix(DETAIL_SCRATCH.basis);
        return new THREE.Matrix4().compose(
          DETAIL_SCRATCH.position.set(placement.x, yMid, placement.z),
          DETAIL_SCRATCH.quaternion,
          DETAIL_SCRATCH.scale.setScalar(scale),
        );
      }
    }

    return new THREE.Matrix4().compose(
      DETAIL_SCRATCH.position.set(placement.x, baseHeight + heightOffset, placement.z),
      groundNormal
        ? DETAIL_SCRATCH.quaternion.setFromUnitVectors(DETAIL_UP,
          DETAIL_SCRATCH.normal.fromArray(groundNormal)).multiply(
          DETAIL_SCRATCH.yaw.setFromAxisAngle(DETAIL_UP, placement.rotationY))
        : DETAIL_SCRATCH.quaternion.setFromAxisAngle(DETAIL_UP, placement.rotationY),
      DETAIL_SCRATCH.scale.setScalar(scale),
    );
  }

  /** Terrain normal from central differences one metre apart. */
  slopeNormal(x, z) {
    const h = (px, pz) => this.terrainView.getCanonicalHeight(px, pz);
    const nx = h(x - 0.5, z) - h(x + 0.5, z);
    const nz = h(x, z - 0.5) - h(x, z + 0.5);
    const length = Math.hypot(nx, 1, nz);
    return [nx / length, 1 / length, nz / length];
  }

  placementAppearance(placement) {
    const range = Math.max(0, Number(this.layerConfig.colorVariation) || 0);
    return {
      seed: placement.priority,
      colorVariation: (1 - range * 0.5 + placement.priority * range)
        * canopyShade(this.forestFieldProvider?.(), placement.x, placement.z),
      surfaceData: placement.surfaceData,
      biomeLook: understoryLookAt(this.config, this.prototypeBiomeRules[placement.prototypeIndex]?.paletteTileId,
        placementTileId(this.terrainView, placement)),
    };
  }

  appendVariants(authoredVariants = []) {
    return completeIterator(this.appendVariantsJob(authoredVariants));
  }

  *appendVariantsJob(authoredVariants = []) {
    if (!this.layerConfig?.enabled || this.disposed || authoredVariants.length === 0) return;
    const firstNewPrototype = this.prototypes.length;
    for (const { scene, definition } of authoredVariants) {
      const firstIndex = this.prototypes.length;
      const extracted = yield* iterateAuthoredGroupedPrototypes(scene, {
        scale: definition.scale,
        groups: definition.prototypeGroups,
        label: `${this.layerName} variant ${definition.scene}`,
      });
      for (const [groupIndex, parts] of extracted.entries()) {
        this.prototypeConform.push(definition.conform === true);
        this.prototypeHeightOffsets.push(
          definition.prototypeHeightOffsets?.[groupIndex]
            ?? definition.heightOffset
            ?? this.layerConfig.heightOffset
            ?? 0,
        );
        const placementRule = definition.prototypePlacements?.[groupIndex]
          ?? definition.placement
          ?? null;
        this.prototypePlacementRules.push(placementRule);
        this.prototypeWaterRules.push(
          definition.prototypeWater?.[groupIndex]
            ?? definition.water
            ?? (placementRule?.strategy === 'shoreline-colonies'
              ? this.layerConfig.surfaceWater
              : null),
        );
        this.prototypeStrandRules.push(null);
        this.prototypeShoreRules.push(null);
        this.prototypeBiomeRules.push({
          tileIds: definition.tileIds ?? null,
          // The tile the part materials' ramp is built for (cloneDetailMaterial below).
          paletteTileId: definition.paletteTileId ?? definition.tileIds?.[0],
          weight: definition.prototypeWeights?.[groupIndex] ?? definition.weight ?? 1,
          character: definition.character ?? null,
          characterStrength: definition.characterStrength,
          canopy: definition.canopy,
          motion: definition.motion ?? null,
          affinity: definition.affinity ?? null,
        });
        // Only living foliage variants carry chlorophyll palette grading; rigid stones,
        // scanned logs, exposed roots, deadfall, and structures keep their native textures.
        const foliage = ['groundDetail', 'tropicalPlant'].includes(this.layerName)
          && definition.motion !== 'rigid'
          && definition.sway !== false;
        const prototype = [];
        for (const { geometry, source } of parts) {
          const sourceMaterial = materialList(source)[0];
          if (!sourceMaterial) {
            geometry.dispose();
            throw new Error(`${this.layerName} prototype contains a mesh without a material.`);
          }
          geometry.computeBoundingBox();
          const part = {
            geometry,
            material: cloneDetailMaterial(sourceMaterial, {
              // Water plants keep their own current-driven sway, not the air's;
              // stones (`sway: false`) keep still.
              wind: this.layerName === 'aquaticPlant' || definition.sway === false
                ? null
                : (this.config.wind ?? null),
              height: geometry.boundingBox.max.y - Math.min(0, geometry.boundingBox.min.y),
              bounds: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() },
              motion: definition.motion,
              groundConform: Boolean(foliage && definition.conform !== true && this.layerName !== 'aquaticPlant'),
              role: definition.materialRoles?.[sourceMaterial.name],
              foliageConfig: foliage ? this.config : null,
              // `paletteTileId` grades a shrub with another biome's foliage palette
              // without growing it there: desert sagebrush wore the lime meadow green.
              tileId: definition.paletteTileId ?? definition.tileIds?.[0],
              ambientEffects: this.config.ambientEffects,
            }),
            kind: 'detail',
            instanceBiomeLook: foliage,
          };
          prototype.push(part);
          yield part.material;
        }
        this.prototypes.push(prototype);
        this.prototypeFootprints.push(computePrototypeFootprint(prototype));
      }
      if (extracted.length === 0) {
        throw new Error(`${this.layerName} variant ${definition.scene} produced no prototypes.`);
      }
      registerPrototypeIndices(
        this.prototypeIndicesByAsset,
        definition.id ?? definition.scene,
        firstIndex,
        extracted.length,
      );
    }
    this.prototypeIndexForRoll = createBiomePrototypeSelector({
      rules: this.prototypeBiomeRules,
      regionalCharacterField: this.regionalCharacterField,
      communities: true,
    });
    const capacity = instanceCapacity({
      residentRadius: this.layerConfig.residentRadius,
      perChunk: this.layerConfig.perChunk,
    });
    this.meshes.push(...yield* iterateInstancedRenderers({
      root: this.root,
      partsByPrototype: this.prototypes.slice(firstNewPrototype),
      renderer: this.terrainView.renderer,
      capacity,
      name: `stylized-${this.layerName}-${firstNewPrototype}`,
      castShadow: this.layerConfig.castShadow === true,
    }));
    this.prototypeRevision += 1;
  }

  /**
   * Adds prototypes that are built in code rather than extracted from a GLB.
   *
   * The donor's shore life — starfish, strand debris, creeping leaves, sea grass —
   * is geometry it generates, and that is worth keeping: it costs no asset, no
   * atlas and no load, so a whole layer can be installed synchronously at boot
   * instead of streaming in through residency. Everything downstream is the same
   * machinery the authored prototypes use: the same deterministic per-chunk
   * manifest, the same spacing and biome rules, the same instanced renderers, and
   * the same rebuild path.
   *
   * A definition is: `{ id, parts, heightOffset, placement, strand, tileIds,
   * weight, character, characterStrength, canopy }`, where `parts` is a list of
   * `{ geometry, material, kind }` exactly as `appendVariants` produces. `strand`
   * is a band relative to sea level (see `strandPlacement.js`) and is what makes a
   * layer of these live on a shore rather than everywhere.
   */
  appendProceduralPrototypes(definitions = []) {
    if (!this.layerConfig?.enabled || this.disposed || definitions.length === 0) return;
    const firstNewPrototype = this.prototypes.length;
    for (const definition of definitions) {
      if (!Array.isArray(definition.parts) || definition.parts.length === 0) {
        throw new Error(`${this.layerName} prototype ${definition.id ?? '?'} has no parts.`);
      }
      this.prototypeHeightOffsets.push(
        definition.heightOffset ?? this.layerConfig.heightOffset ?? 0,
      );
      this.prototypeConform.push(definition.conform === true);
      this.prototypePlacementRules.push(definition.placement ?? null);
      this.prototypeWaterRules.push(definition.water ?? null);
      this.prototypeStrandRules.push(
        definition.strand ?? this.layerConfig.strand ?? null,
      );
      this.prototypeShoreRules.push(definition.shoreHabitat ?? null);
      this.prototypeMinCanopy.push(Number.isFinite(definition.minCanopy) ? definition.minCanopy : 0);
      this.prototypeMinShoreClearance.push(
        Number.isFinite(definition.minShoreClearance) ? definition.minShoreClearance : 0,
      );
      if (typeof definition.syncScannedBark === 'function') {
        this.prototypeScanSyncHooks.push(definition.syncScannedBark);
      }
      this.prototypeBiomeRules.push({
        tileIds: definition.tileIds ?? null,
        paletteTileId: definition.paletteTileId ?? definition.tileIds?.[0],
        weight: definition.weight ?? 1,
        character: definition.character ?? null,
        characterStrength: definition.characterStrength,
        canopy: definition.canopy,
        affinity: definition.affinity ?? null,
      });
      const parts = definition.parts.map((part) => ({
        geometry: part.geometry,
        material: part.material,
        kind: part.kind ?? 'detail',
        instanceSurface: part.instanceSurface,
        instanceBiomeLook: part.instanceBiomeLook,
      }));
      this.prototypes.push(parts);
      this.prototypeFootprints.push(computePrototypeFootprint(parts));
      registerPrototypeIndices(
        this.prototypeIndicesByAsset,
        definition.id,
        this.prototypes.length - 1,
        1,
      );
    }
    this.prototypeIndexForRoll = createBiomePrototypeSelector({
      rules: this.prototypeBiomeRules,
      regionalCharacterField: this.regionalCharacterField,
      communities: true,
    });
    const capacity = instanceCapacity({
      residentRadius: this.layerConfig.residentRadius,
      perChunk: this.layerConfig.perChunk,
    });
    this.meshes.push(...createInstancedRenderers({
      root: this.root,
      partsByPrototype: this.prototypes.slice(firstNewPrototype),
      renderer: this.terrainView.renderer,
      capacity,
      name: `stylized-${this.layerName}-${firstNewPrototype}`,
      castShadow: this.layerConfig.castShadow === true,
    }));
    this.prototypeRevision += 1;
  }

  /** Upgrades procedural bark textures on procedural deadwood materials once tree scans finish loading. */
  syncScannedBark(barkScans) {
    if (!barkScans || this.disposed) return false;
    let upgraded = false;
    for (const sync of this.prototypeScanSyncHooks) {
      if (sync(barkScans)) upgraded = true;
    }
    if (upgraded && this.prototypes.length > 0 && this.terrainView?.renderer) {
      disposeInstancedRenderers(this.root, this.meshes);
      this.meshes = [];
      const capacity = instanceCapacity({
        residentRadius: this.layerConfig.residentRadius,
        perChunk: this.layerConfig.perChunk,
      });
      this.meshes.push(...createInstancedRenderers({
        root: this.root,
        partsByPrototype: this.prototypes,
        renderer: this.terrainView.renderer,
        capacity,
        name: `stylized-${this.layerName}-0`,
        castShadow: this.layerConfig.castShadow === true,
      }));
      this.instanceRows = new ScatterInstanceRows(this.layerName,
        placement => this.placementMatrix(placement), placement => this.placementAppearance(placement));
      this.lastUpdateKey = null;
      this.pendingRebuild = null;
      this.prototypeRevision += 1;
    }
    return upgraded;
  }

  manifestForChunk(chunkX, chunkZ, shouldYield = null) {
    const forestField = this.forestFieldProvider?.();
    this.pathClearance ??= this.terrainView.tileMap
      ? createPathClearanceField(this.terrainView, this.config)
      : null;
    const { obstacles, signature: obstacleSignature } = collectChunkObstacleCircles(chunkX, chunkZ, {
      treePlacementsProvider: this.treePlacementsProvider,
      rockBlockersProvider: this.rockBlockersProvider,
      bushPlacementsProvider: this.bushPlacementsProvider,
      debrisPlacementsProvider: this.debrisPlacementsProvider,
      debrisFootprintsProvider: this.debrisFootprintsProvider,
    });
    const nurseLogs = this.layerName === 'groundDetail'
      ? collectChunkDebrisLogs(chunkX, chunkZ, this.debrisPlacementsProvider, this.debrisFootprintsProvider)
      : [];
    const treeBases = (this.layerName === 'groundDetail' || this.layerName === 'forestDebris')
      ? collectChunkTreeBases(chunkX, chunkZ, this.treePlacementsProvider)
      : [];
    const microScratch = { log: 0, treeBase: 0, water: 0, shade: 0, gap: 0 };
    const key = [
      this.revisionTracker.signature(chunkX, chunkZ, 1),
      this.prototypes.length,
      this.layerConfig.perChunk,
      this.layerConfig.tileIds.join(','),
      JSON.stringify(this.layerConfig.densityByTile ?? null),
      this.layerConfig.regionalChannel ?? 'meadow',
      JSON.stringify(this.layerConfig.water ?? null),
      JSON.stringify(this.layerConfig.surfaceWater ?? null),
      JSON.stringify(this.prototypeBiomeRules),
      JSON.stringify(this.prototypePlacementRules),
      JSON.stringify(this.prototypeWaterRules),
      JSON.stringify(this.prototypeStrandRules),
      JSON.stringify(this.prototypeShoreRules),
      this.pathClearance?.signature ?? 'nopath',
      this.regionalCharacterField?.signature ?? 'uniform-regions',
      forestField?.signature ?? 'uniform-forest',
      obstacleSignature,
      this.biomeAssetPalette?.revision ?? 0,
    ].join('|');
    const cacheKey = `${chunkX}:${chunkZ}`;
    const cached = this.manifestCache.get(cacheKey);
    if (cached?.key === key) return cached.placements;
    const options = {
      kind: this.layerName,
      chunkX,
      chunkZ,
      chunkSize: this.terrainView.worldStore.chunkSize,
      tileSize: this.terrainView.worldStore.tileSize,
      perChunk: this.layerConfig.perChunk,
      tileIds: this.layerConfig.tileIds,
      tileAt: (cellX, cellZ) => this.terrainView.tileMap.get(cellX, cellZ),
      heightAt: (x, z) => this.terrainView.getCanonicalHeight(x, z),
      prototypeCount: this.prototypes.length,
      prototypeIndexForRoll: (roll, tileId, x, z) => {
        const needsHabitat = this.prototypeIndexForRoll.usesCanopy || this.prototypeIndexForRoll.usesMicrohabitat;
        const habitat = needsHabitat ? (forestField?.sample(x, z) ?? null) : null;
        const microhabitat = this.prototypeIndexForRoll.usesMicrohabitat
          ? sampleMicrohabitat(x, z, { habitat, treeBases, logSpines: nurseLogs, out: microScratch })
          : null;
        const automaticIndex = this.prototypeIndexForRoll(
          roll,
          tileId,
          x,
          z,
          habitat,
          microhabitat,
        );
        return this.biomeAssetPalette?.resolvePrototypeIndex({
          tileId,
          layerId: this.paletteLayerId,
          automaticIndex,
          prototypeIndicesByAsset: this.prototypeIndicesByAsset,
          roll,
        }) ?? automaticIndex;
      },
      minScale: this.layerConfig.minScale,
      maxScale: this.layerConfig.maxScale,
      radiusForScale: (scale) => this.layerConfig.radius * scale,
      randomChannelOffset: (this.priorityChannel ?? 41) * 16,
      priorityChannel: this.priorityChannel,
      candidateEvaluator: (candidate, shouldYield) => {
        const placementRule = this.prototypePlacementRules[candidate.prototypeIndex];
        const biomeRule = this.prototypeBiomeRules[candidate.prototypeIndex];
        if (!acceptsStrategicDetailPlacement(
          candidate,
          placementRule,
          {
            tileSize: this.terrainView.worldStore.tileSize,
            tileAt: (cellX, cellZ) => this.terrainView.tileMap.get(cellX, cellZ),
          },
        )) return null;
        const footprint = this.prototypeFootprints[candidate.prototypeIndex] ?? null;
        if (this.layerName !== 'aquaticPlant'
          && this.layerName !== 'shoreLife'
          && placementRule?.strategy !== 'path-interior'
          && pathBlockedForFootprint(this.pathClearance, candidate, footprint)) {
          return null;
        }

        const habitat = forestField?.sample(candidate.x, candidate.z) ?? null;
        const detailMotion = biomeRule?.motion ?? null;
        const detailCharacter = biomeRule?.character ?? placementRule?.character ?? 'meadow';
        const logHit = nurseLogs.length > 0 && detailCharacter === 'forest'
          && detailMotion !== 'rigid' && placementRule?.strategy !== 'path-interior'
          ? nearestDebrisLog(candidate.x, candidate.z, nurseLogs)
          : null;
        const onNurseLog = Boolean(
          logHit && logHit.log.older && logHit.dist <= logHit.log.radius + 0.14
          && (candidate.tileId === 8 || candidate.tileId === 6),
        );
        if (this.layerName !== 'aquaticPlant'
          && !onNurseLog
          && footprintHitsObstacle(candidate, footprint, obstacles)) {
          return null;
        }

        // A layer of woodland floor lives under canopy, thinning out with it.
        const coverage = habitat?.patchCoverage ?? 0;
        const edge = habitat?.patchEdge ?? 0;
        const minCanopy = this.prototypeMinCanopy[candidate.prototypeIndex] ?? 0;
        if (this.layerConfig.canopyGate && (candidate.priority >= coverage || coverage < minCanopy)) return null;

        const minShore = this.prototypeMinShoreClearance[candidate.prototypeIndex] ?? 0;
        if (minShore > 0) {
          const seaLevel = this.terrainView.worldStore?.generator?.seaLevel;
          if (Number.isFinite(seaLevel) && candidate.height <= seaLevel + 0.9) return null;
          this.oceanDistance ??= createOceanDistanceField(this.terrainView, 24);
          const dist = this.oceanDistance.worldDistanceAt(candidate.x, candidate.z);
          if (Number.isFinite(dist) && dist < minShore) return null;
        }

        if (this.prototypeConform[candidate.prototypeIndex] && footprint) {
          const scale = candidate.scale ?? 1;
          const longHalf = Math.max(footprint.halfX, footprint.halfZ) * scale;
          if (longHalf >= 0.75) {
            const yaw = candidate.rotationY ?? 0;
            const alongX = footprint.halfX >= footprint.halfZ;
            const dirX = alongX ? Math.cos(yaw) : Math.sin(yaw);
            const dirZ = alongX ? -Math.sin(yaw) : Math.cos(yaw);
            const span = longHalf * 0.85;
            const h0 = options.heightAt(candidate.x - dirX * span, candidate.z - dirZ * span);
            const h1 = options.heightAt(candidate.x + dirX * span, candidate.z + dirZ * span);
            if (Math.abs(h1 - h0) > span * 0.9) return null;
            const seaLevel = this.terrainView.worldStore?.generator?.seaLevel;
            if (Number.isFinite(seaLevel) && Math.min(h0, h1) <= seaLevel + 0.25) return null;
          }
        }

        const metadata = evaluateDetailSurfacePlacement(this, candidate, options.heightAt, shouldYield);
        if (!metadata) return null;
        if (metadata === CANDIDATE_PENDING) return metadata;

        const tileDensity = this.layerConfig.densityByTile?.[candidate.tileId] ?? 1;
        if (tileDensity < 1 && candidate.priority >= tileDensity) return null;
        const micro = sampleMicrohabitat(candidate.x, candidate.z, {
          habitat, treeBases, logSpines: nurseLogs, out: microScratch,
        });
        // Shoreline sedges & reeds (`affinity.water >= 4`) keep to wet banks & wetlands cleanly.
        if (biomeRule?.affinity?.water >= 4 && candidate.tileId !== 12 && micro.water < 0.3) {
          return null;
        }
        // Group vegetative ground details into microhabitat-responsive colonies rather
        // than uniform single-plant confetti across the floor.
        const isColonialDetail = this.layerName === 'groundDetail'
          && placementRule?.strategy !== 'path-interior'
          && detailMotion !== 'rigid'
          && candidate.tileId !== 13;
        const bankBoost = micro.water;
        const baseScale = candidate.scale ?? 1;
        if (this.layerName === 'forestDebris') {
          // Concentrate fungi clusters & damp leaf litter near tree bases, water, and dense shade.
          const isFungi = biomeRule?.affinity?.shade >= 1.5;
          const microScore = Math.max(micro.treeBase, micro.water, micro.shade * 0.75);
          if (isFungi && candidate.priority >= Math.min(1, 0.25 + microScore * 0.85)) return null;
          return true;
        }
        const colonyRaw = isColonialDetail
          ? valueNoise(candidate.x / 6.5, candidate.z / 6.5, 0x636f6c6f) * 0.5 + 0.5
          : 0.5;
        const colony = isColonialDetail ? Math.max(0, Math.min(1, (colonyRaw - 0.24) / 0.52)) : 0.5;
        const localHabitatBoost = Math.max(micro.log, micro.treeBase * 0.9, bankBoost);
        let colonyGate = isColonialDetail
          ? Math.min(1, 0.24 + 0.78 * colony + localHabitatBoost * 0.75)
          : 1;
        let detailScale = isColonialDetail
          ? baseScale * (0.94 + 0.26 * colony) * (1 + bankBoost * 0.28)
          : baseScale;
        if (isColonialDetail) {
          if (candidate.tileId === 8) {
            if (detailMotion === 'fern-frond') {
              colonyGate = Math.min(1, 0.48 + 0.75 * colony + bankBoost * 0.55);
              detailScale *= 1.24;
            }
            if (logHit && logHit.dist < 1.45) colonyGate = 1;
          } else if (candidate.tileId === 9 && detailMotion === 'fern-frond') {
            colonyGate = Math.min(1, colony * 0.36 + bankBoost * 0.95);
          } else if (candidate.tileId === 6) {
            if (edge > 0.28 || coverage < 0.72) colonyGate = Math.min(1, colonyGate + 0.22);
            else if (coverage >= 0.85 && edge < 0.18) colonyGate *= 0.74;
          } else if (candidate.tileId === 5) {
            if (colony > 0.45 || coverage > 0.40 || bankBoost > 0.2) colonyGate = Math.min(1, colonyGate + 0.24);
            else colonyGate *= 0.65;
          }
        }
        const perchHeight = onNurseLog
          ? { waterPlacementHeight: candidate.height + 0.19, scale: detailScale * 0.78 }
          : { scale: detailScale };
        if (!this.regionalCharacterField) {
          return candidate.priority < colonyGate
            ? { ...(metadata ?? {}), ...perchHeight }
            : null;
        }
        // Let forest-adapted scans/herbs follow natural local colonies under canopy without double-draining
        // the 400-candidate pool when regional channels soften mid-chunk.
        const channel = this.layerConfig.regionalChannel ?? placementRule?.character ?? detailCharacter;
        const regionalValue = this.regionalCharacterField.sampleChannel(
          candidate.x,
          candidate.z,
          channel,
        );
        const gate = detailCharacter === 'forest' && this.layerName === 'groundDetail'
          ? Math.min(1, colonyGate * (0.58 + 0.48 * regionalValue))
          : regionalValue * colonyGate;
        return candidate.priority < gate
          ? { ...(metadata ?? {}), regionalMeadow: regionalValue, ...perchHeight }
          : null;
      },
    };
    const prepared = this.terrainView.preparedPlacement;
    if (prepared && !prepared.ensureChunk(chunkX, chunkZ, 2, 1)) return null;
    let state = this.pendingManifests.get(cacheKey);
    if (state?.key !== key) {
      state = { key, builder: createStableChunkManifestBuilder(options) };
      this.pendingManifests.set(cacheKey, state);
    }
    const before = state.builder.progress;
    const built = state.builder.step({ shouldYield });
    this.workProgress = (this.workProgress ?? 0) + state.builder.progress - before;
    if (built === null) return null;
    const placements = this.layerName === 'groundDetail'
      ? Object.freeze(this.appendNurseLogFlora(built.slice(), chunkX, chunkZ, options))
      : built;
    this.pendingManifests.delete(cacheKey);
    this.manifestCache.set(cacheKey, { key, placements });
    return placements;
  }

  /**
   * Adds deterministic flanking ferns/herbs and perched nurse-log seedlings along fallen
   * logs owned by `(chunkX, chunkZ)` using existing instanced prototypes.
   */
  appendNurseLogFlora(placements, chunkX, chunkZ, options) {
    const localLogs = collectChunkDebrisLogs(
      chunkX,
      chunkZ,
      this.debrisPlacementsProvider,
      this.debrisFootprintsProvider,
      0,
    );
    if (localLogs.length === 0) return placements;
    const candidateAssets = {
      fern: '/assets/ground/scans/forest-fern-02.glb',
      sorrel: '/assets/ground/scans/forest-sorrel-01.glb',
      calathea: '/assets/ground/scans/tropical-calathea-01.glb',
      berry: '/assets/ground/boreal/taiga-berry-moss-01.glb',
    };
    const speciesByAsset = new Map();
    for (const [alias, key] of Object.entries(candidateAssets)) {
      const indices = this.prototypeIndicesByAsset.get(key);
      if (indices?.length > 0) speciesByAsset.set(alias, indices[0]);
    }
    if (speciesByAsset.size === 0) return placements;
    const seaLevel = this.terrainView.worldStore?.generator?.seaLevel;
    const { tileSize, tileAt, heightAt } = options;
    for (const log of localLogs) {
      const lenX = log.x1 - log.x0;
      const lenZ = log.z1 - log.z0;
      const span = Math.hypot(lenX, lenZ);
      if (span < 0.6) continue;
      const dirX = lenX / span;
      const dirZ = lenZ / span;
      const perpX = -dirZ;
      const perpZ = dirX;
      const tileId = tileAt(Math.floor(log.x / tileSize), Math.floor(-log.z / tileSize));
      const pickForTile = (primary, secondary) => {
        for (const id of [primary, secondary, 'fern']) {
          const idx = speciesByAsset.get(id);
          if (idx === undefined) continue;
          const allowed = this.prototypeBiomeRules[idx]?.tileIds;
          if (!allowed || allowed.includes(tileId)) return idx;
        }
        return null;
      };
      const flankA = pickForTile(tileId === 5 || tileId === 7 ? 'calathea' : (tileId === 9 ? 'berry' : 'fern'), 'sorrel');
      const flankB = pickForTile(tileId === 8 || tileId === 6 ? 'sorrel' : 'fern', 'berry');
      const perchIdx = tileId === 8 ? pickForTile('fern', 'sorrel') : (tileId === 6 ? pickForTile('sorrel', 'fern') : null);
      const spots = [
        { along: -0.28, side: log.radius + 0.34, idx: flankA, scale: 0.94, perch: false },
        { along: 0.24, side: -(log.radius + 0.30), idx: flankB, scale: 1.0, perch: false },
      ];
      if (log.older && perchIdx !== null) {
        spots.push({ along: 0.04, side: 0, idx: perchIdx, scale: 0.66, perch: true });
      }
      spots.forEach((spot, sIdx) => {
        if (spot.idx === null || placements.length >= (options.perChunk ?? 400) + 32) return;
        const px = log.x + dirX * (span * 0.5 * spot.along) + perpX * spot.side;
        const pz = log.z + dirZ * (span * 0.5 * spot.along) + perpZ * spot.side;
        const h = heightAt(px, pz);
        if (!Number.isFinite(h)) return;
        if (Number.isFinite(seaLevel) && h <= seaLevel + 0.35) return;
        if (pathBlockedForFootprint(this.pathClearance, { x: px, z: pz }, this.prototypeFootprints[spot.idx] ?? null)) return;
        const seed = Math.abs(Math.sin(px * 12.7 + pz * 31.3 + sIdx * 7.1)) % 1;
        placements.push({
          x: px,
          z: pz,
          height: h,
          tileId,
          prototypeIndex: spot.idx,
          scale: spot.scale * (0.9 + seed * 0.2),
          rotationY: ((log.phase + sIdx * 2.1) % (Math.PI * 2)),
          priority: seed,
          ...(spot.perch ? { waterPlacementHeight: h + log.radius * 0.72 } : {}),
        });
      });
    }
    return placements;
  }

  update() {
    if (this.disposed || this.prototypes.length === 0 || !this.terrainView.focusChunkKey) return;
    const focus = this.terrainView.focusChunk;
    const origin = this.terrainView.floatingOrigin.getState();
    this.instanceAnchor.place(this.root, origin);
    const radius = this.layerConfig.residentRadius;
    const revisionSignature = this.revisionTracker.windowSignature(focus, radius + 1, 1);
    const obstacleVersion = this.obstacleVersionProvider?.() ?? 0;
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${revisionSignature}:${
      this.biomeAssetPalette?.revision ?? 0
    }:o${obstacleVersion}:p${this.prototypeRevision}`;
    if (updateKey === this.lastUpdateKey && !this.pendingRebuild) return;
    if (this.pendingRebuild?.updateKey === updateKey) return;
    retainPendingScatterWindow(this.pendingManifests, focus, radius);
    this.pendingRebuild = {
      key: `${this.layerName}:${updateKey}`,
      updateKey,
      focus: { ...focus },
    };
  }

  applyPendingRebuild(shouldYield = null) {
    return stepViewRebuild(this, this.pendingRebuild, shouldYield,
      job => this.iterateRebuild(job.focus));
  }

  *iterateRebuild(focus) {
    PerfCounters.inc(`${this.layerName}Rebuilds`);
    const job = this.instanceRows.begin();
    const activeChunks = new Set();
    const radius = this.layerConfig.residentRadius;
    for (let chunkZ = focus.chunkZ - radius; chunkZ <= focus.chunkZ + radius; chunkZ += 1) {
      for (let chunkX = focus.chunkX - radius; chunkX <= focus.chunkX + radius; chunkX += 1) {
        const key = `${chunkX}:${chunkZ}`;
        activeChunks.add(key);
        let manifest = null;
        while (manifest === null) {
          manifest = this.manifestForChunk(chunkX, chunkZ, this.currentShouldYield);
          if (manifest === null) {
            this.blockedDependency = { reason: 'detail-manifest', dependencyType: 'detail-manifest', chunkKeys: [key] };
            yield ITERATOR_PENDING;
          }
        }
        yield* this.instanceRows.stageChunk(job, key, manifest, DETAIL_REPRESENTATIONS);
      }
    }
    yield* this.instanceRows.stageRetired(job);
    yield;
    const origin = this.terrainView.floatingOrigin.getState();
    const proposed = this.instanceAnchor.proposed(origin);
    const rebased = proposed.x !== this.instanceRows.anchorX || proposed.z !== this.instanceRows.anchorZ;
    const changed = job.changes.some(changes => changes?.size > 0);
    if (!this.visibility || changed || rebased || job.manifestsChanged) {
      let counts;
      if (this.sceneryPublicationBudget) {
        const publication = yield* this.instanceRows.prepareCommit(job, this.meshes, [], proposed, Boolean(this.visibility));
        counts = yield* publication.publish(() => this.sceneryPublicationBudget);
      } else {
        counts = this.instanceRows.commit(job, this.meshes, [], proposed, Boolean(this.visibility));
      }
      this.instanceAnchor.x = proposed.x;
      this.instanceAnchor.z = proposed.z;
      const count = counts.near;
      if (this.visibility) {
        this.visibility.reset(this.instanceRows.storage.map(storage => storage.buckets.near));
      }
      PerfCounters.set(`${this.layerName}Instances`, count);
    } else {
      this.instanceRows.chunks = job.chunks;
    }
    this.instanceAnchor.place(this.root, this.terrainView.floatingOrigin.getState());
    for (const key of this.manifestCache.keys()) {
      if (!activeChunks.has(key)) this.manifestCache.delete(key);
    }
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelStagedViewRebuild(this);
    this.pendingRebuild = null;
    this.pendingManifests.clear();
    this.visibility?.dispose();
    this.terrainView.scene.remove(this.root);
    disposeInstancedRenderers(this.root, this.meshes);
    for (const parts of this.prototypes) {
      for (const part of parts) {
        part.geometry?.dispose();
        part.material?.dispose();
      }
    }
    this.prototypes.length = 0;
    this.prototypeHeightOffsets.length = 0;
    this.prototypeConform.length = 0;
    this.prototypePlacementRules.length = 0;
    this.prototypeWaterRules.length = 0;
    this.prototypeStrandRules.length = 0;
    this.prototypeShoreRules.length = 0;
    this.prototypeMinCanopy.length = 0;
    this.prototypeMinShoreClearance.length = 0;
    this.prototypeScanSyncHooks.length = 0;
    this.oceanDistance?.cache.clear();
    this.prototypeBiomeRules.length = 0;
    this.prototypeIndicesByAsset.clear();
    this.prototypeIndexForRoll = null;
    this.manifestCache.clear();
  }
}
