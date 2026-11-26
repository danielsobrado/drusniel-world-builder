import { RegionalResourceBudget } from '../performance/RegionalResourceBudget.js';
import { RegionalSceneryBudget } from '../performance/RegionalSceneryBudget.js';
import { RegionalDensityBudget } from '../performance/RegionalDensityBudget.js';
import { AlpineRockView } from './alpine/AlpineRockView.js';
import { PathBridgeView } from './path/PathBridgeView.js';
import { IcebergView } from './ice/IcebergView.js';
import { GlacierSeracView } from './ice/GlacierSeracView.js';
import { SharedWaterMaterials } from './SharedWaterMaterials.js';
import { WaterObstacleUpdates } from './WaterObstacleUpdates.js';
import { WaterReflectionController } from '../../render/reflections/WaterReflectionController.js';
import { SceneryWorkScheduler, createSceneryConsumers } from './SceneryWorkScheduler.js';
import { sceneryPreparationStatus } from './SceneryPreparationStatus.js';
import { getTerrainMaterialBakeGpuState } from '../materials/TerrainMaterialBakeGpu.js';
import { PreparedPlacementStore } from '../world/PreparedPlacementStore.js';
import { placementPreparationRadius } from '../world/PlacementPreparationWindow.js';
import { syncViewRebuildQueue } from './ViewRebuildQueue.js';
import {
  PerfCounters,
  resetWaterChunkGauges,
} from '../performance/qa/PerfCounters.js';
import { vec3 } from 'three/tsl';
import {
  collectObjectBoulderPlacements,
  objectBoulderSignatureForChunk,
  rockSignatureForChunk,
  rocksInfluencingChunk,
} from './chunkRockSignature.js';
import { isTreeImpostorBakeMode } from './impostorBakeMode.js';
import { StylizedBushView } from './StylizedBushView.js';
import { StylizedBuildQueue } from './StylizedBuildQueue.js';
import { StylizedChunkRevisionTracker } from './StylizedChunkRevisionTracker.js';
import { StylizedFlowerView } from './StylizedFlowerView.js';
import { StylizedGroundDetailView } from './StylizedGroundDetailView.js';
import { createForestDebrisPrototypes } from './forest/forestDebrisPrototypes.js';
import { createBiomeUnderstoryPrototypes } from './flora/biomeUnderstoryPrototypes.js';
import { createShoreLifePrototypes } from './shoreLifePrototypes.js';
import { OceanFftController } from '../water/fft/OceanFftController.js';
import { resolveOffshoreFft } from '../water/fft/OceanFftConfig.js';
import { waterVisualClock } from '../water/WaterVisualClock.js';
import { createAquaticFloraPrototypes } from './aquaticFloraPrototypes.js';
import { advancePlantSway } from './plantSway.js';
import { paintContactShade, resolveContactShade } from './contactShade.js';
import { GroundContactField } from './groundContact/GroundContactField.js';
import { buildChunkContactShadeKey, collectChunkContactShadeSources } from './groundContact/contactShadeSources.js';
import {
  FOREST_FLOOR_CANOPY_SAMPLES,
  canopySampleCoord,
  writeForestFloorCanopy,
  writeForestFloorLitter,
} from './forestFloorTexture.js';
import { forestFloorDensity } from './forest/ForestFloor.js';
import { bilinearSample } from './forest/bilinearGrid.js';
import { CANOPY_FLOOR_PATCH_SALT, canopyFloorCover } from '../world/GrassPatchiness.js';
import { isLandStreamingSuspended } from '../water/underwaterState.js';
import {
  GRASS_BLADE_SEGMENTS,
  GRASS_FAR_BLADE_SEGMENTS,
  StylizedGrassSlot,
} from './StylizedGrassSlot.js';
import { GrassBladeProfilePool } from './GrassBladeProfilePool.js';
import { StylizedRockView } from './StylizedRockView.js';
import { CoastalRockImpact } from './CoastalRockImpact.js';
import { syncFoliageLight } from './forest/foliageLight.js';
import { StylizedSceneAssetCache } from './StylizedSceneAssetCache.js';
import { StylizedSkyView } from './StylizedSkyView.js';
import { StylizedTreeView } from './StylizedTreeView.js';
import { StylizedWaterSlot } from './StylizedWaterSlot.js';
import { StylizedVariantResidency } from './StylizedVariantResidency.js';
import { installVariants } from './VariantInstallation.js';
import { StylizedWildlifeView } from './StylizedWildlifeView.js';
import { RegionalCharacterField } from './RegionalCharacterField.js';
import { GrassTuning } from './GrassTuning.js';
import { MeadowGrassField } from './meadow/MeadowGrassField.js';
import { resolveMeadowGrassConfig } from './meadow/meadowGrassConfig.js';
import { resolveForestSeed } from './forest/ForestRuntimeConfig.js';

export class StylizedSurfaceView {
  constructor({
    terrainView,
    objectMap,
    config,
    baseUrl = '/',
    biomeAssetPalette = null,
    snowBand = null,
  }) {
    this.terrainView = terrainView;
    this.objectMap = objectMap;
    this.config = config;
    this.regionalResources = config.enhancements?.regionalResourceBudget ? new RegionalResourceBudget(config.enhancements.regionalBudget) : null;
    this.regionalDensity = config.enhancements?.regionalDensityBudget ? new RegionalDensityBudget(config.enhancements.regionalBudget) : null;
    this.regionalSpatial = config.enhancements?.regionalSpatialBudget ? new RegionalSceneryBudget(config.enhancements.regionalBudget) : null;
    // The dark patch where trunks and boulders meet the ground, resolved once.
    this.contactShadeSettings = resolveContactShade(config);
    this.enabled = Boolean(config?.enabled);
    this.impostorBakeMode = isTreeImpostorBakeMode();
    this.sceneAssets = this.enabled
      ? new StylizedSceneAssetCache({ renderer: terrainView.renderer, baseUrl, requests: config.enhancements?.r187 })
      : null;
    this.treeSourceLeases = [];
    this.installedVariantLeases = [];
    this.rockVariantPaths = [];
    this.bushVariantPaths = [];
    this.groundDetailVariantPaths = [];
    this.aquaticVariantPaths = [];
    this.tropicalKitVariantPaths = [];
    this.revisionTracker = this.enabled
      ? new StylizedChunkRevisionTracker({ worldStore: terrainView.worldStore })
      : null;
    this.preparedPlacement = this.enabled && terrainView.worldStore.chunkWorker
      ? new PreparedPlacementStore({ worldStore: terrainView.worldStore, revisionTracker: this.revisionTracker, config })
      : null;
    terrainView.preparedPlacement = this.preparedPlacement;
    terrainView.stylizedSurface = this;
    this.regionalCharacterField = this.enabled
      ? new RegionalCharacterField({
        seed: resolveForestSeed(terrainView.worldStore),
        config: config.regionalPlacement,
      })
      : null;
    if (this.enabled && !this.impostorBakeMode) {
      for (const terrainSlot of terrainView.slots) terrainSlot.mesh.receiveShadow = true;
    }
    this.skyView = this.enabled && !this.impostorBakeMode && config.sky.enabled
      ? new StylizedSkyView({ terrainView, config })
      : null;
    const sunDirection = this.skyView?.sunDirection ?? vec3(0.35, 0.85, 0.25);
    this.icebergView = this.enabled && !this.impostorBakeMode && this.skyView && config.icebergs?.enabled !== false
      ? new IcebergView({
        scene: terrainView.scene,
        worldStore: terrainView.worldStore,
        floatingOrigin: terrainView.floatingOrigin,
        seaLevel: terrainView.worldStore.generator?.seaLevel ?? 0,
        sunDirection: this.skyView.sunDirectionValue,
        snowGroundByTile: config.biomeLooks?.snow.ground ?? [],
        getDrawPreparation: () => terrainView.drawPreparation,
        geologyLod: config.enhancements?.geologyLod,
      })
      : null;
    this.alpineRockView = this.enabled && !this.impostorBakeMode && this.skyView
      ? new AlpineRockView({
        scene: terrainView.scene,
        terrainView,
        snowGroundByTile: config.biomeLooks?.snow.ground ?? [],
        cragsByTile: config.biomeLooks?.crags ?? [],
        snowBand: config.materialBake?.classification,
        seaLevel: terrainView.worldStore.generator?.seaLevel ?? 0,
        config,
      })
      : null;
    this.glacierSeracView = this.enabled && !this.impostorBakeMode && this.skyView
      ? new GlacierSeracView({
        scene: terrainView.scene,
        terrainView,
        glacierByTile: config.biomeLooks?.glacier ?? [],
        seaLevel: terrainView.worldStore.generator?.seaLevel ?? 0,
        sunDirection: this.skyView.sunDirectionValue,
        pathClearance: this.alpineRockView?.pathClearance ?? null,
        geologyLod: config.enhancements?.geologyLod,
      })
      : null;
    this.pathBridgeView = this.enabled && !this.impostorBakeMode
      ? new PathBridgeView({
        scene: terrainView.scene,
        terrainView,
        naturalTrail: config.path?.naturalTrail ?? null,
      })
      : null;
    terrainView.getBridgeDeckHeight = this.pathBridgeView
      ? (x, z) => this.pathBridgeView.deckHeightAt(x, z)
      : null;
    this.rockView = this.enabled && !this.impostorBakeMode
      ? new StylizedRockView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        biomeAssetPalette,
        regionalCharacterField: this.regionalCharacterField,
      })
      : null;
    this.coastalRockImpact = this.rockView && config.water?.coast?.rockImpact?.enabled
      ? new CoastalRockImpact({ terrainView, rockView: this.rockView, config })
      : null;
    this.treeView = this.enabled
      ? new StylizedTreeView({
        terrainView,
        objectMap,
        config,
        revisionTracker: this.revisionTracker,
        baseUrl,
        biomeAssetPalette,
        regionalCharacterField: this.regionalCharacterField,
        // The snow band lives in the world's configuration, which this config
        // cannot see, so the composition root hands it down: bark has to whiten at
        // the altitude the ground under it does.
        snowBand,
      })
      : null;
    this.flowerView = this.enabled && !this.impostorBakeMode
      ? new StylizedFlowerView({
        terrainView,
        config,
        baseUrl,
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
      })
      : null;
    this.bushView = this.enabled && !this.impostorBakeMode && config.bushes?.enabled
      ? new StylizedBushView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
        biomeAssetPalette,
        regionalCharacterField: this.regionalCharacterField,
      })
      : null;
    const detailObstacleProviders = {
      treePlacementsProvider: (chunkX, chunkZ) => this.treeView?.manifestStore?.peek(chunkX, chunkZ) ?? null,
      rockBlockersProvider: (chunkX, chunkZ) => this.rockView?.manifestStore?.blockerSnapshotForChunk?.(chunkX, chunkZ, 1) ?? null,
      obstacleVersionProvider: () => `${this.treeView?.manifestStore?.version ?? 0}:${this.rockView?.manifestStore?.version ?? 0}:${this.forestDebrisView?.lastUpdateKey ?? ''}`,
    };
    const understoryDebrisProviders = {
      debrisPlacementsProvider: (chunkX, chunkZ) => this.forestDebrisView?.manifestCache.get(`${chunkX}:${chunkZ}`)?.placements ?? null,
      debrisFootprintsProvider: () => this.forestDebrisView?.prototypeFootprints ?? null,
    };
    this.groundDetailView = this.enabled
      && !this.impostorBakeMode
      && config.groundDetails?.enabled
      ? new StylizedGroundDetailView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        layerConfig: config.groundDetails,
        layerName: 'groundDetail',
        priorityChannel: 41,
        biomeAssetPalette,
        regionalCharacterField: this.regionalCharacterField,
        // Lets a wood's shaded interior grow different cover from its fringe.
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
        ...detailObstacleProviders,
        ...understoryDebrisProviders,
      })
      : null;
    this.aquaticPlantView = this.enabled
      && !this.impostorBakeMode
      && config.aquaticPlants?.enabled
      ? new StylizedGroundDetailView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        layerConfig: config.aquaticPlants,
        layerName: 'aquaticPlant',
        priorityChannel: 43,
        biomeAssetPalette,
      })
      : null;
    // grass-test's tropical kit (its coastal-jungle understory): jungle grasses,
    // groundcover and elephant ear, streamed per biome through residency like
    // the other authored layers, on a budget of its own (§11 item 4).
    this.tropicalKitView = this.enabled
      && !this.impostorBakeMode
      && config.tropicalKit?.enabled
      ? new StylizedGroundDetailView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        layerConfig: config.tropicalKit,
        layerName: 'tropicalPlant',
        paletteLayerId: 'tropicalKit',
        priorityChannel: 49,
        biomeAssetPalette,
        regionalCharacterField: this.regionalCharacterField,
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
        ...detailObstacleProviders,
        ...understoryDebrisProviders,
      })
      : null;
    // Water plants are procedural too: seagrass, kelp and the algae ride the same
    // layer as the authored aquatic variants, on the same water rule, but they need
    // no scene to load so they install here.
    if (this.aquaticPlantView) {
      this.aquaticPlantView.appendProceduralPrototypes(
        createAquaticFloraPrototypes(config.aquaticPlants, config.water),
      );
    }
    // Shore life is procedural, so unlike the authored layers it installs here and
    // now: there is no scene to fetch and nothing to stream in through residency.
    this.shoreLifeView = this.enabled
      && !this.impostorBakeMode
      && config.shoreLife?.enabled
      ? new StylizedGroundDetailView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        layerConfig: config.shoreLife,
        layerName: 'shoreLife',
        priorityChannel: 47,
        ...detailObstacleProviders,
      })
      : null;
    if (this.shoreLifeView) {
      this.shoreLifeView.appendProceduralPrototypes(
        createShoreLifePrototypes(config.shoreLife),
      );
    }
    this.forestDebrisView = this.enabled
      && !this.impostorBakeMode
      && config.forestDebris?.enabled
      ? new StylizedGroundDetailView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        layerConfig: config.forestDebris,
        layerName: 'forestDebris',
        priorityChannel: 46,
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
        ...detailObstacleProviders,
        bushPlacementsProvider: (chunkX, chunkZ) => this.bushView?.manifestCache.get(`${chunkX}:${chunkZ}`)?.placements ?? null,
        obstacleVersionProvider: () => `${this.treeView?.manifestStore?.version ?? 0}:${this.rockView?.manifestStore?.version ?? 0}:${this.bushView?.lastUpdateKey ?? ''}`,
      })
      : null;
    this.forestDebrisView?.appendProceduralPrototypes(createForestDebrisPrototypes(config.forestDebris, {
      soilColor: config.trees?.forestFloor?.litterColor,
      floorColor: config.trees?.forestFloor?.groundCoreColor,
      barkGrade: config.trees?.barkGrade,
      baseUrl,
      config,
    }));
    this.groundDetailView?.appendProceduralPrototypes(createBiomeUnderstoryPrototypes(config, {
      soilColor: config.trees?.forestFloor?.litterColor,
      floorColor: config.trees?.forestFloor?.groundCoreColor,
      barkGrade: config.trees?.barkGrade,
      baseUrl,
      config,
    }));
    // Every per-chunk detail layer, authored or procedural, is rebuilt and disposed
    // the same way; the array is what keeps a new layer from having to be added to
    // three separate places.
    this.detailViews = [
      this.groundDetailView,
      this.aquaticPlantView,
      this.shoreLifeView,
      this.forestDebrisView,
      this.tropicalKitView,
    ].filter(Boolean);
    this.wildlifeView = this.enabled
      && !this.impostorBakeMode
      && config.wildlife?.enabled
      ? new StylizedWildlifeView({
        terrainView,
        config: {
          ...config.wildlife,
          variants: config.assets.wildlifeVariants ?? [],
        },
        baseUrl,
        loader: this.sceneAssets.loader,
      })
      : null;
    this.biomeAssetPalette = biomeAssetPalette;
    this.ready = this.bootstrapLayers();
    // Impostor baking only ever looks at trees, which `ready` already covers.
    this.bakeRequest = this.ready.then(() => this.maybeHandleImpostorBake());
    this.bakeRequest.catch((error) => {
      console.error('Tree impostor export request failed.', error);
    });
    this.bladeProfiles = new GrassBladeProfilePool({
      config: config.grass,
      nearSegments: GRASS_BLADE_SEGMENTS,
      farSegments: GRASS_FAR_BLADE_SEGMENTS,
    });
    // `load` swallows its own failures into a fallback set, so this promise settles
    // either way — it exists to tell the Settings control when the list is final.
    this.bladeProfiles.ready = this.bladeProfiles.load(baseUrl);
    // One tuning object for the whole field: its uniforms are shared node objects,
    // so a slider write reaches every slot's material without touching geometry.
    this.grassTuning = new GrassTuning(config);
    // `grass.system: meadow` draws grass-test's meadow (meadow/MeadowGrassField.js)
    // in place of the per-chunk clump slots; `clumps` keeps the slots for A/B.
    const meadowSettings = config.grass?.system === 'meadow' ? resolveMeadowGrassConfig(config.grass.meadow) : null;
    this.meadowGrass = this.enabled && !this.impostorBakeMode && meadowSettings
      ? new MeadowGrassField({
        scene: terrainView.scene,
        terrainView,
        config,
        settings: meadowSettings,
        tuning: this.grassTuning,
        sunDirection,
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
        skyView: this.skyView,
        baseUrl,
        rockPlacementsProvider: () => this.rockView?.getPlacements() ?? [],
        treePlacementsProvider: (chunkX, chunkZ) => this.treeView?.manifestStore?.peek(chunkX, chunkZ) ?? null,
        bushPlacementsProvider: (chunkX, chunkZ) => this.bushView?.manifestCache.get(`${chunkX}:${chunkZ}`)?.placements ?? null,
        debrisPlacementsProvider: (chunkX, chunkZ) => this.forestDebrisView?.manifestCache.get(`${chunkX}:${chunkZ}`)?.placements ?? null,
        debrisFootprintsProvider: () => this.forestDebrisView?.prototypeFootprints ?? null,
      })
      : null;
    this.groundContactField = this.enabled && !this.impostorBakeMode
      ? new GroundContactField({ terrainView, config })
      : null;
    this.slots = this.enabled && !this.impostorBakeMode && !this.meadowGrass
      ? terrainView.slots.map((terrainSlot) => new StylizedGrassSlot({
        terrainSlot,
        terrainView,
        objectMap,
        config,
        sunDirection,
        forestFieldProvider: () => this.treeView?.manifestStore?.forestField ?? null,
        bladeProfileProvider: () => this.bladeProfiles,
        tuning: this.grassTuning,
      }))
      : [];
    this.reflections = this.enabled && !this.impostorBakeMode && config.enhancements?.waterReflections.enabled
      ? new WaterReflectionController(terrainView, config.enhancements.waterReflections) : null;
    // Offshore FFT normals (PR I, I.0 Decision C): one per view. `water.sea.offshoreFft.enabled`,
    // or `?oceanFft=1` for QA; the tier and the backend decide the rest (OceanFftQuality).
    this.oceanFft = this.enabled && !this.impostorBakeMode && config.water?.enabled && config.water.sea?.enabled
      ? OceanFftController.create({
        renderer: terrainView.renderer,
        qualityTier: config.water.qualityTier,
        requested: config.water.sea.offshoreFft?.enabled === true || config.enhancements?.oceanFft === true,
        weather: resolveOffshoreFft(config.water.sea.offshoreFft).weather,
      })
      : null;
    this.sharedWaterMaterials = new SharedWaterMaterials(this.reflections, this.oceanFft?.binding ?? null);
    this.reflectionPrepared = null;
    terrainView.beforeMainRender = camera => {
      // Only ocean water slots read the offshore FFT: inland it would step and transform for nothing.
      if (this.oceanFft && this.waterSlots.some((slot) => slot.hasOceanWater && slot.mesh.visible)) {
        this.oceanFft.prepare(waterVisualClock.value);
      }
      this.skyView?.cascades?.prepare(camera);
      const now = performance.now();
      const prepared = this.reflections?.prepare(camera, this) ?? null;
      this.reflectionPrepared = prepared;
      this.reflectionReservation?.cancel();
      this.reflectionReservation = null;
      const captureTurn = this.reflections?.captureSchedule.nextFrame() ?? false;
      const gpuBusy = this.reflections?.gpuPressure?.busy === true;
      if (prepared && captureTurn && gpuBusy) PerfCounters.inc('reflectionGpuDeferredFrames');
      if (
        prepared
        && captureTurn
        && !gpuBusy
        && now >= this.reflections.nextCapture
        && this.reserveDeferredWork
      ) {
        this.reflectionReservation = this.reflections.captureSchedule.reserve({
          now, estimate: this.reflections.captureBudgetMs,
          contended: this.hasPublicationPressure?.() ?? false,
          reserve: this.reserveDeferredWork, reserveStrict: this.reserveStrictDeferredWork,
        });
        if (!this.reflectionReservation) PerfCounters.inc('reflectionCaptureDeferredFrames');
      }
      // Standalone views have no shared scheduler; preserve their direct capture path.
      this.reflectionBudgetReserved = Boolean(
        prepared
        && !this.reserveDeferredWork
        && !gpuBusy
        && !this.shouldYieldWork?.()
      );
    };
    terrainView.afterMainRender = camera => {
      const prepared = this.reflectionPrepared;
      this.reflectionPrepared = null;
      const capture = () => this.reflections.update(
        camera,
        this,
        performance.now(),
        { budgetReserved: true, prepared },
      );
      this.reflectionReservation?.run(capture);
      this.reflectionReservation = null;
      if (this.reflectionBudgetReserved) this.runDeferredWork ? this.runDeferredWork(capture) : capture();
      this.reflectionBudgetReserved = false;
    };
    this.waterSlots = this.enabled && !this.impostorBakeMode && config.water?.enabled
      ? terrainView.slots.map((terrainSlot) => new StylizedWaterSlot({
        terrainSlot,
        terrainView,
        config,
        sunDirection,
        sharedMaterials: this.sharedWaterMaterials,
      }))
      : [];
    this.waterObstacleUpdates = new WaterObstacleUpdates(this);
    for (const slot of this.slots) slot.mesh.receiveShadow = true;
    // Shared per-frame ceiling for the heavy scatter rebuilds. Rocks, trees and
    // bushes each flush in the same update, so once the frame has already spent
    // this much on rebuilds the remaining queues wait for the next one instead
    // of compounding into a visible stall.
    this.frameBudgetMs = config.streaming?.stylizedFrameBudgetMs ?? 6;
    this.frameStartedAt = 0;
    this.lastBeginFrameTimestamp = null;
    this.grassRockInputs = new WeakMap();
    const shouldYield = () => (
      this.frameStartedAt > 0 && performance.now() - this.frameStartedAt > (this.workBudgetMs ?? this.frameBudgetMs)
    );
    this.grassBuildQueue = new StylizedBuildQueue({
      buildsPerFrame: config.streaming?.grassBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.flowerBuildQueue = new StylizedBuildQueue({
      buildsPerFrame: config.streaming?.flowerBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.treeBuildQueue = new StylizedBuildQueue({
      shouldYield,
      buildsPerFrame: config.streaming?.treeBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.rockBuildQueue = new StylizedBuildQueue({
      shouldYield,
      buildsPerFrame: config.streaming?.rockBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.bushBuildQueue = new StylizedBuildQueue({
      shouldYield,
      buildsPerFrame: config.streaming?.bushBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.detailBuildQueue = new StylizedBuildQueue({
      // These sparse authored rings are intentionally independent of the tree
      // manifest backlog. Sharing its cumulative yield gate could leave water
      // plants and ground accents at zero instances for many seconds while a
      // newly streamed forest window settles. Their measured cost is tracked
      // separately and remains capped to one layer rebuild per frame.
      buildsPerFrame: config.streaming?.detailBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.sceneryScheduler = new SceneryWorkScheduler();
    this.syncSceneryQueue = syncViewRebuildQueue;
    this.sceneryConsumers = createSceneryConsumers(this);
    this.preparationVariants = () => this.variantResidency?.getPreparationStatus().pending ?? 0;
    this.chunkWorldSize = terrainView.worldStore.chunkSize * terrainView.worldStore.tileSize;
    this.tileSize = terrainView.worldStore.tileSize;
    this.variantResidency = this.enabled && !this.impostorBakeMode
      ? this.createVariantResidency(config)
      : null;
    if (this.rockView) this.rockView.assetReadiness = () => this.variantResidency?.getLayerState('rocks');
  }

  /**
   * Everything the first frame genuinely needs.
   *
   * Trees are here rather than in the lazy set because the forest field they
   * build is what grass, bushes and ground details read to decide where a wood's
   * interior is — a deferred forest would make every other layer re-scatter the
   * moment it landed. The prop layers below are not load-bearing that way, so
   * they stream in from `variantResidency` as their biomes come into range.
   */
  acquireTreeSource(path, options) {
    const lease = this.sceneAssets.acquireLease(path, options);
    this.treeSourceLeases.push(lease);
    return lease.ready;
  }

  releaseTreeSources() {
    for (const lease of this.treeSourceLeases.splice(0)) lease.release();
  }

  releaseDetachedTreeSources() {
    if (!this.treeView?.canReleaseTreeSources) return;
    const count = this.treeSourceLeases.length;
    this.releaseTreeSources();
    PerfCounters.inc('regionalTreeSourceLeasesReleased', count);
  }

  async bootstrapLayers() {
    if (!this.enabled) return null;
    const needsScene = this.config.trees.enabled;
    try {
      let sharedScene = null;
      if (needsScene) {
        sharedScene = await this.acquireTreeSource(this.config.assets.scene, { priority: 'high' });
      }
      const treeVariants = this.config.trees.enabled
        ? await Promise.all(
          (this.config.assets.treeVariants ?? []).map(async (definition) => {
            return { definition, scene: await this.acquireTreeSource(definition.scene) };
          }),
        )
        : [];
      await Promise.all([
        this.treeView?.buildFromScene(sharedScene, treeVariants),
        this.flowerView?.ready,
      ].filter(Boolean));
      this.forestDebrisView?.syncScannedBark?.(this.treeView?.barkScans);
      this.groundDetailView?.syncScannedBark?.(this.treeView?.barkScans);
      this.releaseDetachedTreeSources();
      return null;
    } catch (error) {
      console.warn('Some stylized assets failed to load; remaining layers stay active.', error);
      return null;
    }
  }

  /**
   * The prop layers, streamed per biome instead of loaded up front.
   *
   * Each entry hands the residency a way to fetch a variant's scene and a way to
   * install it. Acquiring through the shared cache keeps the ref-count that
   * `dispose` releases, so the recorded paths are the ones actually taken.
   */
  createVariantResidency(config) {
    const layer = (id, paletteLayerId, view, definitions, paths, residentRadius) => ({
      id,
      paletteLayerId,
      definitions: definitions ?? [],
      residentRadius,
      eligibleTileIds: config[paletteLayerId]?.tileIds,
      acquire: async (scene) => {
        const loaded = await this.sceneAssets.acquire(scene, { priority: 'low' });
        paths.push(scene);
        return loaded;
      },
      acquireLease: (scene, priority) => this.sceneAssets.acquireLease(scene, { priority }),
      retainLease: (lease) => this.installedVariantLeases.push(lease),
      apply: variants => installVariants(view, variants),
    });
    const streaming = config.streaming ?? {};
    return new StylizedVariantResidency({
      terrainView: this.terrainView,
      revisionTracker: this.revisionTracker,
      biomeAssetPalette: this.biomeAssetPalette,
      prefetchChunks: streaming.variantPrefetchChunks ?? 4,
      appliesPerFrame: streaming.variantAppliesPerFrame ?? 1,
      rescanIntervalMs: streaming.variantRescanIntervalMs ?? 500,
      manageRequests: config.enhancements?.r187?.prioritizedRequests === true,
      layers: [
        this.rockView && layer(
          'rocks',
          'rocks',
          this.rockView,
          config.assets.rockVariants,
          this.rockVariantPaths,
          config.rocks?.residentRadius ?? 2,
        ),
        this.bushView && layer(
          'bushes',
          'bushes',
          this.bushView,
          config.assets.bushVariants,
          this.bushVariantPaths,
          config.bushes?.residentRadius ?? 2,
        ),
        this.groundDetailView && layer(
          'groundDetails',
          'groundDetails',
          this.groundDetailView,
          config.assets.groundDetailVariants,
          this.groundDetailVariantPaths,
          config.groundDetails?.residentRadius ?? 1,
        ),
        this.aquaticPlantView && layer(
          'aquaticPlants',
          'aquaticPlants',
          this.aquaticPlantView,
          config.assets.aquaticVariants,
          this.aquaticVariantPaths,
          config.aquaticPlants?.residentRadius ?? 1,
        ),
        this.tropicalKitView && layer(
          'tropicalKit',
          'tropicalKit',
          this.tropicalKitView,
          config.assets.tropicalKitVariants,
          this.tropicalKitVariantPaths,
          config.tropicalKit?.residentRadius ?? 1,
        ),
      ].filter(Boolean),
    });
  }

  async maybeHandleImpostorBake() {
    if (!this.impostorBakeMode || typeof window === 'undefined') return null;
    window.__treeImpostorBakeStatus = 'baking';
    try {
      const bundle = await this.exportImpostors();
      window.__treeImpostorBakeBundle = bundle;
      window.__treeImpostorBakeStatus = 'done';
      document.documentElement.dataset.impostorBake = 'done';
      return bundle;
    } catch (error) {
      window.__treeImpostorBakeStatus = 'failed';
      window.__treeImpostorBakeError = error instanceof Error ? error.message : String(error);
      document.documentElement.dataset.impostorBake = 'failed';
      throw error;
    }
  }

  get impostorReady() {
    return this.treeView?.impostorReady ?? Promise.resolve(null);
  }

  async exportImpostors() {
    if (!this.treeView) throw new Error('Tree rendering is disabled.');
    return this.treeView.exportImpostors();
  }

  updateRendererCounters() {
    const renderer = this.terrainView.renderer;
    const info = renderer.info;
    if (!info) return;
    PerfCounters.set('rendererWebGPUBackend', renderer.backend?.isWebGPUBackend ? 1 : 0);
    PerfCounters.set('rendererWebGLBackend', renderer.backend?.isWebGLBackend ? 1 : 0);
    for (const [name, value] of [
      ['rendererDrawCalls', info.render?.drawCalls ?? info.render?.calls],
      ['rendererTriangles', info.render?.triangles],
      ['rendererLines', info.render?.lines],
      ['rendererPoints', info.render?.points],
      ['rendererGeometries', info.memory?.geometries],
      ['rendererTextures', info.memory?.textures],
    ]) {
      if (Number.isFinite(value)) PerfCounters.set(name, value);
    }
  }

  /** This frame's resolved world wind for the offshore FFT (PR I.5): `{ enabled, directionDegrees, intensity }`. */
  setOceanWeather(weather) {
    this.oceanFft?.setWeather(weather);
  }

  setViewDistance({ skyRadius, fogDensity } = {}) {
    this.skyView?.setRadius(skyRadius);
    this.skyView?.setFogDensity(fogDensity);
  }

  /**
   * Allocate and upload the fixed slot texture set while the boot overlay is
   * still visible. Terrain streaming reuses these slots; allowing the first
   * chunk boundary to initialize them made GPU texture creation land directly
   * in a movement frame.
   */
  prewarmStreamingResources(renderer = this.terrainView.renderer) {
    // Geology meshes are created by their residency views only after a cell resolves.
    const textures = new Set();
    for (const terrainSlot of this.terrainView.slots) {
      for (const texture of [
        terrainSlot.tileTexture,
        terrainSlot.surfaceMaskTexture,
        terrainSlot.heightTexture,
        terrainSlot.forestFloorTexture,
        ...Object.values(getTerrainMaterialBakeGpuState(terrainSlot.mesh)?.textures ?? {}),
      ]) {
        if (texture) textures.add(texture);
      }
    }
    for (const waterSlot of this.waterSlots) {
      if (!waterSlot.hasWaterCoverage) continue;
      textures.add(waterSlot.waterFieldTexture);
      textures.add(waterSlot.waterFlowTexture);
      textures.add(waterSlot.waterAppearanceTexture);
      textures.add(waterSlot.waterObstacleTexture);
    }
    let pinnedGrass = 0;
    for (const grassSlot of this.slots) {
      if (!grassSlot.mesh.visible) continue;
      grassSlot.pinResources();
      textures.add(grassSlot.trampleTexture);
      pinnedGrass++;
    }
    for (const texture of textures) renderer.initTexture(texture);
    PerfCounters.set('streamingTexturesPrewarmed', textures.size);
    PerfCounters.set('grassSlotsPinned', pinnedGrass);
    return textures.size;
  }

  /**
   * Temporarily submit one refractive water mesh during boot. Compilation alone
   * does not allocate Three's viewport colour/depth targets; without this warm
   * render, the first shoreline frame creates them while the player is moving.
   */
  beginWaterRefractionPrewarm() {
    if (this.waterSlots.length === 0) return null;
    // The initial resident window is already exercised during startup. Warm
    // the unused pool slots that streaming will claim at the first boundary;
    // warming every slot multiplied viewport-node resources with no additional
    // hitch benefit.
    const slots = this.waterSlots.filter(slot => slot.hasWaterCoverage && slot.isWithinRefractionRange());
    if (slots.length === 0) return null;
    const previous = slots.map((slot) => ({
      slot,
      material: slot.mesh.material,
      visible: slot.mesh.visible,
    }));
    for (const slot of slots) {
      slot.mesh.material = slot.ensureRefractiveMaterial();
      slot.mesh.visible = true;
      slot.refractionPrewarmed = true;
    }
    return () => {
      for (const state of previous) {
        state.slot.mesh.material = state.material;
        state.slot.mesh.visible = state.visible;
      }
    };
  }

  prewarmOneDistantWaterSlot() {
    let candidate = null;
    let candidateDistance = Number.POSITIVE_INFINITY;
    const focus = this.terrainView.focusChunkKey ? this.terrainView.focusChunk : null;
    if (!focus) return false;
    for (const slot of this.waterSlots) {
      const descriptor = slot.terrainSlot.descriptor;
      if (
        !descriptor
        || !slot.hasWaterCoverage
        || !slot.mesh.visible
        || slot.refractionPrewarmed
        || slot.isWithinRefractionRange()
      ) {
        continue;
      }
      const distance = Math.max(
        Math.abs(descriptor.chunkX - focus.chunkX),
        Math.abs(descriptor.chunkZ - focus.chunkZ),
      );
      if (distance < candidateDistance) {
        candidate = slot;
        candidateDistance = distance;
      }
    }
    if (!candidate) return false;
    // Submit one still-distant wet chunk with the refractive variant for a
    // single frame. Its material/texture bindings are then resident before the
    // chunk reaches the near-water band, spreading N cold initializations over
    // N ordinary frames instead of one shoreline hitch.
    const material = candidate.ensureRefractiveMaterial();
    if (this.terrainView.drawPreparation) {
      this.terrainView.drawPreparation.requestMaterial(candidate.mesh, material);
    } else {
      candidate.mesh.material = material;
    }
    candidate.refractionPrewarmed = true;
    PerfCounters.inc('waterRefractionSlotsPrewarmed');
    return true;
  }

  /**
   * The floating origin moved by (dx, dz). Layers that keep render-space state move
   * it with the world here rather than treating a re-centre as movement.
   */
  shiftOrigin(dx, dz) {
    this.meadowGrass?.shiftOrigin(dx, dz);
  }

  getPreparationStatus() {
    return sceneryPreparationStatus(this);
  }

  /** Share one preparation allowance between player collision and rendering. */
  reserveReflectionCapture(camera, now) {
    this.reflectionReservation?.cancel();
    this.reflectionReservation = null;
    if (this.reflections?.prepare(camera, this) && now >= this.reflections.nextCapture) {
      this.reflectionReservation = this.reserveDeferredWork?.(this.reflections.captureBudgetMs) ?? null;
    }
  }

  beginFrame(timestamp) {
    if (this.lastBeginFrameTimestamp === timestamp) return;
    this.lastBeginFrameTimestamp = timestamp;
    this.meadowGrass?.beginFrame?.(timestamp);
    const focus = this.terrainView?.focusChunk;
    if (focus && this.preparedPlacement) {
      const radius = placementPreparationRadius(this.config, this.terrainView.loadRadius ?? 0);
      this.preparedPlacement.setWindow(focus.chunkX, focus.chunkZ, radius);
      this.rockView?.manifestStore.setWindow(focus.chunkX, focus.chunkZ, radius - 2);
      this.treeView?.manifestStore?.setWindow(focus.chunkX, focus.chunkZ, radius - 2);
    }
    if (this.earlySceneryTimestamp !== timestamp && !isLandStreamingSuspended()) {
      this.earlySceneryTimestamp = timestamp;
      this.sceneryScheduler.beginFrame(this.sceneryConsumers, this.shouldYieldWork);
    }
    this.preparedPlacement?.flush(this.shouldYieldWork);
    this.rockView?.beginFrame(timestamp);

  }

  /**
   * @param {number} timestamp
   * @param {object} camera
   * @param {{ x: number, y: number, z: number } | null} [body] the player's feet in
   *   render space, for the layers that react to the body standing in them
   */
  update(timestamp, camera, body = null) {
    this.beginFrame(timestamp);
    if (!this.enabled || this.impostorBakeMode) return;
    this.frameStartedAt = performance.now();
    // These are gauges, not lifetime counters. Reset them before the slot pass
    // so reports describe current water residency instead of accumulating one
    // increment per slot on every frame.
    resetWaterChunkGauges();
    // Ahead of the layer updates: a variant installed here is picked up by this
    // frame's rebuild scheduling rather than waiting for the next one.
    const updateVariants = () => this.variantResidency?.update(this.frameStartedAt, this.shouldYieldWork);
    if (this.runDeferredWork) this.runDeferredWork(updateVariants);
    else updateVariants();
    this.skyView?.update(timestamp, camera);
    syncFoliageLight(this.skyView, this.skyView?.sunHazeFog?.skyFog?.color);
    this.wildlifeView?.update(timestamp, camera);
    // Aquatic plants remain visible while land preparation stands down. Their
    // clock must keep matching the water surface during swimming and diving.
    advancePlantSway(timestamp);
    // Under water, the land stands down: the water sheet and the fog occlude
    // everything above the surface, and this project's cost is in the rebuilding —
    // scatter compactions, buffer uploads, ground-texture paints — rather than in
    // the drawing, so suspending the work is what saves the frame. Nothing is
    // hidden, so nothing pops on surfacing; the field catches up over the next few
    // frames. Water itself keeps updating: it is what you are looking at.
    const landStreaming = !isLandStreamingSuspended();
    for (const slot of this.waterSlots) {
      slot.update(timestamp, this.publicationBudget);
      this.reflections?.residency.update(slot);
    }
    if (this.reflections) this.reflections.residencyReady = true;
    if (!landStreaming) return;
    if (this.regionalDensity) {
      const factor = this.regionalDensity.update(timestamp, {
        triangles: PerfCounters.get('rendererTriangles'), draws: PerfCounters.get('rendererDrawCalls'),
        townInstances: this.terrainView.townRuntime?.streamer.stats.instances ?? 0,
        vegetationInstances: PerfCounters.get('treeNearInstances') + PerfCounters.get('treeProxyInstances') + (this.meadowGrass?.blades.stats.stems ?? 0) + PerfCounters.get('treeImpostorInstances') + PerfCounters.get('rockNearInstances') + PerfCounters.get('rockProxyInstances') + PerfCounters.get('bushNearInstances') + PerfCounters.get('bushProxyInstances'),
      });
      this.meadowGrass?.setRegionalCardReach(factor);
      const sceneryFactor = this.regionalDensity.sceneryFactor;
      for (const view of [this.treeView, this.rockView, this.bushView]) {
        if (view) view.regionalLodFactor = sceneryFactor;
      }
      PerfCounters.set('regionalFarGrassReachFactor', factor);
      PerfCounters.set('regionalSceneryLodFactor', sceneryFactor);
    }
    if (this.regionalSpatial) {
      const sample = () => this.regionalSpatial.update(this, timestamp, this.shouldYieldWork);
      if (this.runDeferredWork) this.runDeferredWork(sample);
      else sample();
      for (const view of [this.treeView, this.rockView, this.bushView]) {
        if (view) view.regionalSpatialBudget = this.regionalSpatial;
      }
      this.meadowGrass?.setRegionalCardBudget(this.regionalSpatial, camera);
    }
    this.meadowGrass?.updateFrame(timestamp, camera, body);
    this.rockView?.update(timestamp, camera);
    if (camera) {
      const origin = this.terrainView.floatingOrigin.getState();
      const cameraWorld = { x: camera.position.x + origin.x, z: camera.position.z + origin.z };
      const updateGeology = () => {
        this.icebergView?.update(cameraWorld, this.shouldYieldWork, this.publicationBudget);
        this.alpineRockView?.update(cameraWorld, this.shouldYieldWork, this.publicationBudget);
        this.glacierSeracView?.update(cameraWorld, this.shouldYieldWork, this.publicationBudget);
        this.pathBridgeView?.update(cameraWorld, this.shouldYieldWork);
      };
      if (this.runDeferredWork) this.runDeferredWork(updateGeology);
      else updateGeology();
    }
    syncViewRebuildQueue(this.rockBuildQueue, [this.rockView]);
    this.coastalRockImpact?.update(camera);
    const rockPlacements = this.rockView?.getPlacements() ?? [];
    this.treeView?.update(timestamp, camera, this.rockView);
    syncViewRebuildQueue(this.treeBuildQueue, [this.treeView], 'pendingLodRebuild');
    this.bushView?.update(timestamp, camera, this.rockView);
    syncViewRebuildQueue(this.bushBuildQueue, [this.bushView]);
    for (const view of this.detailViews) view.update();
    for (const view of this.detailViews) {
      if (view.visibility) this.runDeferredWork?.(() => view.visibility.update(camera, this.shouldYieldWork));
    }
    syncViewRebuildQueue(this.detailBuildQueue, this.detailViews);
    this.sceneryScheduler.flush(this.sceneryConsumers, this.shouldYieldWork);
    if (this.runDeferredWork) this.runDeferredWork(() => this.updateForestGroundTextures());
    else this.updateForestGroundTextures();
    if (camera && this.groundContactField) {
      const origin = this.terrainView.floatingOrigin.getState();
      this.groundContactField.update(
        { x: camera.position.x + origin.x, z: camera.position.z + origin.z },
        origin,
        this.publicationBudget,
      );
    }
    this.flowerView?.update(timestamp);
    this.waterObstacleUpdates.schedule();
    const updateObstacles = () => this.waterObstacleUpdates.flush(this.shouldYieldWork);
    if (this.runDeferredWork) this.runDeferredWork(updateObstacles);
    else updateObstacles();
    this.prewarmOneDistantWaterSlot();
    if (this.regionalResources) {
      const retire = () => this.regionalResources.update(this, timestamp, this.shouldYieldWork);
      if (this.runDeferredWork) this.runDeferredWork(retire);
      else retire();
    }

    const focusChunk = this.terrainView.focusChunkKey ? this.terrainView.focusChunk : null;
    // Canonical camera XZ, once for the whole pass. Grass thins by how far each
    // chunk actually is in metres, and render-local metres only mean the same thing
    // near the origin — on an imported world the camera's render position is a few
    // metres from zero while the ground under it is a planet away from it.
    const canonicalFocus = camera
      ? this.terrainView.floatingOrigin.toCanonical(camera.position.x, camera.position.z)
      : null;
    const rockRadius = this.config.rocks.radius;
    const rockFalloff = this.config.rocks.falloff;
    const objectBoulders = collectObjectBoulderPlacements({
      objectMap: this.objectMap,
      tileSize: this.tileSize,
      radius: rockRadius,
    });

    for (const slot of this.slots) {
      const descriptor = slot.terrainSlot.descriptor;
      if (!descriptor) {
        slot.update(timestamp, focusChunk, '', [], canonicalFocus);
        continue;
      }
      let rockInput = this.grassRockInputs.get(slot);
      if (
        !rockInput
        || rockInput.descriptorKey !== descriptor.key
        || rockInput.rockPlacements !== rockPlacements
        || rockInput.objectBoulders !== objectBoulders
      ) {
        const localRocks = rocksInfluencingChunk({
          descriptor,
          rockPlacements,
          chunkWorldSize: this.chunkWorldSize,
          radius: rockRadius,
          falloff: rockFalloff,
        });
        const localObjectBoulders = rocksInfluencingChunk({
          descriptor,
          rockPlacements: objectBoulders,
          chunkWorldSize: this.chunkWorldSize,
          radius: rockRadius,
          falloff: rockFalloff,
        });
        const signature = [
          objectBoulderSignatureForChunk({
            objectMap: this.objectMap,
            objectPlacements: objectBoulders,
            descriptor,
            tileSize: this.tileSize,
            chunkWorldSize: this.chunkWorldSize,
            radius: rockRadius,
            falloff: rockFalloff,
          }),
          rockSignatureForChunk({
            descriptor,
            rockPlacements,
            chunkWorldSize: this.chunkWorldSize,
            radius: rockRadius,
            falloff: rockFalloff,
          }),
        ].join('|');
        const localBoulders = localObjectBoulders.length === 0
          ? localRocks
          : localRocks.length === 0
            ? localObjectBoulders
            : [...localObjectBoulders, ...localRocks];
        rockInput = {
          descriptorKey: descriptor.key,
          rockPlacements,
          objectBoulders,
          signature,
          localBoulders,
        };
        this.grassRockInputs.set(slot, rockInput);
      }
      slot.update(timestamp, focusChunk, rockInput.signature, rockInput.localBoulders, canonicalFocus);
      if (slot.pendingRebuild) {
        this.grassBuildQueue.enqueue({
          key: slot.pendingRebuild.key,
          slot,
        });
      }
    }

    for (const flowerSlot of this.flowerView?.slots ?? []) {
      if (flowerSlot.pendingRebuild) {
        this.flowerBuildQueue.enqueue({
          key: flowerSlot.pendingRebuild.key,
          slot: flowerSlot,
        });
      }
    }

    this.grassBuildQueue.flush((job) => job.slot.applyPendingRebuild());
    this.sceneryScheduler.flush(this.sceneryConsumers, this.shouldYieldWork);
  }

  updateForestGroundTextures() {
    const field = this.treeView?.manifestStore?.forestField;
    if (!field || this.shouldYieldWork?.()) return;
    for (const terrainSlot of this.terrainView.slots) {
      const descriptor = terrainSlot.descriptor;
      if (!descriptor) continue;
      const contactKey = this.contactShadeKey(descriptor);
      const key = `${descriptor.key}:${terrainSlot.pageRevision}:${field.signature}:${contactKey}`;
      if (terrainSlot.forestFloorKey === key) continue;
      if (this.preparedPlacement && !this.preparedPlacement.ensureChunk(descriptor.chunkX, descriptor.chunkZ, 1, 0)) continue;
      const samples = FOREST_FLOOR_CANOPY_SAMPLES;
      const half = this.chunkWorldSize * 0.5;
      // The canopy's grass density, from the same habitat samples: the litter
      // pass reads it rather than sampling the forest field a second time.
      const floorConfig = this.config.trees?.forestFloor;
      const grassFloor = (this.grassFloorScratch ??= new Float32Array(samples * samples));
      let thinned = false;
      // R is the canopy, G the contact shade: writing the canopy clears the
      // previous shade with it, so the contact pass below starts from a clean
      // texture instead of compounding on the last one.
      this.canopyScratch = writeForestFloorCanopy({
        pixels: terrainSlot.forestFloorPixels,
        size: terrainSlot.forestFloorSize,
        samples,
        scratch: this.canopyScratch,
        canopyAt: (x, z) => {
          const habitat = field.sample(
            descriptor.centerWorldX - half + x / (samples - 1) * this.chunkWorldSize,
            descriptor.centerWorldZ + half - z / (samples - 1) * this.chunkWorldSize,
          );
          const floor = forestFloorDensity(habitat, 'grass', floorConfig);
          grassFloor[z * samples + x] = floor;
          if (floor < 1) thinned = true;
          return habitat.patchCoverage * habitat.suitability * 1.35;
        },
      });
      if (thinned) this.paintForestLitter(terrainSlot, descriptor, grassFloor, samples);
      this.paintContactShade(terrainSlot, descriptor);
      terrainSlot.forestFloorTexture.needsUpdate = true;
      terrainSlot.forestFloorKey = key;
      PerfCounters.inc('forestFloorTextureUploads');
      // Habitat sampling is deliberately budgeted to one low-resolution slot
      // per frame so chunk streaming cannot trigger an unbounded rebuild burst.
      return;
    }
  }

  /**
   * Bare litter between the canopy's grass islands, in the ground texture's
   * third channel: the island field the meadow sampler thins stems with, at
   * the canopy's grass density, so soil shows where the blades are not.
   */
  paintForestLitter(terrainSlot, descriptor, grassFloor, samples) {
    const size = terrainSlot.forestFloorSize;
    const texel = this.chunkWorldSize / size;
    const half = this.chunkWorldSize * 0.5;
    const tileSize = this.terrainView.worldStore.tileSize;
    const seed = (this.terrainView.worldStore.generator?.toMetadata?.().seed ?? 0) ^ CANOPY_FLOOR_PATCH_SALT;
    writeForestFloorLitter({
      pixels: terrainSlot.forestFloorPixels,
      size,
      bareAt: (x, z) => {
        // Texel centre in sample space, as the canopy is upsampled.
        const sx = canopySampleCoord(x, size, samples);
        const sz = canopySampleCoord(z, size, samples);
        const floor = bilinearSample(grassFloor, samples, sx, sz);
        if (floor >= 1) return 0;
        return 1 - canopyFloorCover(
          (descriptor.centerWorldX - half + (x + 0.5) * texel) / tileSize,
          -(descriptor.centerWorldZ + half - (z + 0.5) * texel) / tileSize,
          floor,
          seed,
        );
      },
    });
  }

  /**
   * The soft dark patch where trunks and boulders meet the ground, in the ground
   * texture's second channel — the donor's contact shade, at trunk scale on the
   * texture's two-metre texels.
   */
  paintContactShade(terrainSlot, descriptor) {
    if (!this.contactShadeSettings) return;
    const { sources, debrisSources } = collectChunkContactShadeSources({
      descriptor,
      chunkWorldSize: this.chunkWorldSize,
      settings: this.contactShadeSettings,
      treeView: this.treeView,
      rockView: this.rockView,
      bushView: this.bushView,
      forestDebrisView: this.forestDebrisView,
      alpineRockView: this.alpineRockView,
    });
    if (sources.length === 0) return;
    paintContactShade({
      pixels: terrainSlot.forestFloorPixels,
      size: terrainSlot.forestFloorSize,
      centerWorldX: descriptor.centerWorldX,
      centerWorldZ: descriptor.centerWorldZ,
      chunkWorldSize: this.chunkWorldSize,
      sources,
      channel: 1,
    });
    if (debrisSources.length > 0) {
      paintContactShade({
        pixels: terrainSlot.forestFloorPixels,
        size: terrainSlot.forestFloorSize,
        centerWorldX: descriptor.centerWorldX,
        centerWorldZ: descriptor.centerWorldZ,
        chunkWorldSize: this.chunkWorldSize,
        sources: debrisSources,
        channel: 2,
      });
    }
    PerfCounters.inc('contactShadeSlotsPainted', sources.length);
  }

  /**
   * The part of the ground texture's key that depends on what is standing on it.
   *
   * Without this a chunk keeps the contact shade of whatever stood there when its
   * canopy was last written, so a felled tree would leave its patch behind until
   * the canopy happened to change — the same class of bug as a stale canopy.
   */
  contactShadeKey(descriptor) {
    if (!this.contactShadeSettings) return 'no-contact-shade';
    return buildChunkContactShadeKey({
      descriptor,
      treeView: this.treeView,
      rockView: this.rockView,
      bushView: this.bushView,
      forestDebrisView: this.forestDebrisView,
      alpineRockView: this.alpineRockView,
    });
  }

  dispose() {
    this.regionalSpatial?.dispose();
    this.preparedPlacement?.dispose();
    this.terrainView.preparedPlacement = null;
    this.terrainView.stylizedSurface = null;
    this.skyView?.dispose();
    this.variantResidency?.dispose();
    this.variantResidency = null;
    this.wildlifeView?.dispose();
    this.flowerView?.dispose();
    for (const view of this.detailViews) view.dispose();
    this.detailViews = [];
    this.bushView?.dispose();
    this.treeView?.dispose();
    this.coastalRockImpact?.dispose();
    this.rockView?.dispose();
    this.terrainView.getBridgeDeckHeight = null;
    this.icebergView?.dispose();
    this.alpineRockView?.dispose();
    this.glacierSeracView?.dispose();
    this.pathBridgeView?.dispose();
    this.releaseTreeSources();
    for (const path of this.rockVariantPaths) this.sceneAssets?.release(path);
    this.rockVariantPaths.length = 0;
    for (const path of this.bushVariantPaths) this.sceneAssets?.release(path);
    this.bushVariantPaths.length = 0;
    for (const path of this.groundDetailVariantPaths) this.sceneAssets?.release(path);
    this.groundDetailVariantPaths.length = 0;
    for (const path of this.aquaticVariantPaths) this.sceneAssets?.release(path);
    this.aquaticVariantPaths.length = 0;
    for (const path of this.tropicalKitVariantPaths) this.sceneAssets?.release(path);
    this.tropicalKitVariantPaths.length = 0;
    for (const lease of this.installedVariantLeases) lease.release();
    this.installedVariantLeases.length = 0;
    this.sceneAssets?.dispose();
    this.sceneAssets = null;
    this.grassBuildQueue.clear();
    this.flowerBuildQueue.clear();
    this.treeBuildQueue.clear();
    this.rockBuildQueue.clear();
    this.bushBuildQueue.clear();
    this.detailBuildQueue.clear();
    for (const slot of this.waterSlots) slot.dispose();
    this.waterObstacleUpdates.dispose();
    this.sharedWaterMaterials.dispose();
    this.oceanFft?.dispose();
    this.oceanFft = null;
    this.reflectionReservation?.cancel();
    this.reflections?.dispose();
    this.terrainView.beforeMainRender = null;
    this.terrainView.afterMainRender = null;
    this.waterSlots.length = 0;
    for (const slot of this.slots) slot.dispose();
    this.meadowGrass?.dispose();
    this.groundContactField?.dispose();
    this.groundContactField = null;
    this.slots.length = 0;
    this.revisionTracker?.dispose();
    this.revisionTracker = null;
  }
}
