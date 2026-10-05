import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { Vector3 } from 'three/webgpu';
import { createMeadowBladeMaterial } from './meadowBladeMaterial.js';
import { createMeadowCardMaterial, loadMeadowCardAtlas } from './meadowCardMaterial.js';
import { createMeadowTemplate } from './meadowGrassGeometry.js';
import {
  LOD_ORDER, bandStemCount, grassTrianglesPerBlade, lodThresholds, selectLod,
} from './meadowGrassLayout.js';
import { MeadowGroundSampler } from './MeadowGroundSampler.js';
import { MeadowInteractionMap } from './MeadowInteractionMap.js';
import { MeadowTileLayer } from './MeadowTileLayer.js';
import { createMeadowUniforms } from './meadowUniforms.js';

const CARD_ATLAS = 'assets/ground/meadow/meadow-grass-cards.webp';

/**
 * The meadow grass, ported from grass-test's `GrassField` and `FarGrassField`.
 *
 *  - *Blades* to `maxDistance`: individual blades at the meadow's real scale on
 *    chunk-aligned tiles, four LOD bands that cut segments and thin the stand,
 *    one draw per band. The donor measured its whole near meadow at 0.29 M
 *    triangles.
 *  - *Cards* beyond, to `far.distance`: billboard clumps of ~180 stems at two
 *    triangles each, handed over by a screen-door dissolve so neither layer is
 *    blended.
 *  - The terrain's painted ground cover carries the green past the cards.
 *
 * Both layers compact tiles nearest-first under one per-frame time budget.
 */
export class MeadowGrassField {
  /**
   * @param {object} options
   * @param {object} options.scene
   * @param {object} options.terrainView InfiniteTerrainView
   * @param {object} options.config stylizedSurface
   * @param {object} options.settings resolveMeadowGrassConfig()
   * @param {object} options.tuning GrassTuning
   * @param {object} options.sunDirection live sun direction node
   * @param {() => object | null} [options.forestFieldProvider]
   * @param {() => object[]} [options.rockPlacementsProvider] canonical rock placements
   * @param {object | null} [options.skyView] for the sun and sky light
   * @param {string} [options.baseUrl]
   */
  constructor({
    scene, terrainView, config, settings, tuning, sunDirection, forestFieldProvider, skyView = null, baseUrl = '/',
    rockPlacementsProvider = () => [],
  }) {
    this.terrainView = terrainView;
    this.settings = settings;
    this.forward = new Vector3();
    this.viewCone = { x: 0, z: 0, tangent: 1 };
    this.canonical = { x: 0, z: 0 };
    this.skyView = skyView;
    // The player's body stamp, built before the uniforms that read it. Its window is
    // render space, like the blades, but the ground it tests the body sphere against
    // is asked in canonical coordinates, because that is how the terrain answers.
    this.interactionOrigin = { x: 0, z: 0 };
    this.interaction = settings.interaction
      ? new MeadowInteractionMap({
        resolution: settings.interaction.resolution,
        worldSize: settings.interaction.worldSize,
        recoverySpeed: settings.interaction.recoverySpeed,
        strength: settings.interaction.strength,
        bodyRadius: settings.interaction.bodyRadius,
        uploadIntervalFrames: settings.interaction.uploadIntervalFrames,
        getHeight: (x, z) => terrainView.getCanonicalHeight(
          x + this.interactionOrigin.x,
          z + this.interactionOrigin.z,
        ),
      })
      : null;
    this.uniforms = createMeadowUniforms(settings, this.interaction);
    this.ground = new MeadowGroundSampler({
      terrainView,
      tileIds: config.grass.tileIds,
      shapeTable: settings.shapeTable,
      forestFieldProvider,
      forestFloorConfig: config.trees?.forestFloor ?? null,
      rockPlacementsProvider,
      rocks: config.rocks ?? null,
    });
    const far = settings.far;
    const bladeTemplates = Object.fromEntries(LOD_ORDER.map((band) => [band, createMeadowTemplate({
      detail: settings.lod[band].detail,
      count: bandStemCount(settings.tileSize, settings.lod[band].density),
      tileSize: settings.tileSize,
    })]));
    this.bladeMaterial = createMeadowBladeMaterial({
      uniforms: this.uniforms,
      tuning: tuning.uniforms,
      config,
      sunDirection,
      // With cards taking over, the last band's stems are dissolved, not retired.
      bandCount: far ? LOD_ORDER.length - 1 : LOD_ORDER.length,
      handoff: Boolean(far),
      tileSize: settings.tileSize,
    });
    const thresholds = lodThresholds(settings.maxDistance, settings.lod);
    // About half a second of running ahead of a density boundary. Preparation
    // uses the same shared deadline; the drawn band and viewing range stay put.
    const preparationLead = settings.tileSize;
    this.blades = new MeadowTileLayer({
      scene,
      name: 'meadow-grass',
      tileSize: settings.tileSize,
      templates: bladeTemplates,
      material: this.bladeMaterial,
      selectBand: (nearest) => selectLod(nearest, thresholds),
      selectPreparationBand: (nearest) => selectLod(Math.max(0, Math.sqrt(nearest) - preparationLead) ** 2, thresholds),
      reach: settings.maxDistance + preparationLead,
      ground: this.ground,
    });
    this.cards = null;
    if (far) {
      this.atlas = loadMeadowCardAtlas(`${baseUrl}${CARD_ATLAS}`);
      this.cardMaterial = createMeadowCardMaterial({
        uniforms: this.uniforms, tuning: tuning.uniforms, config, sunDirection, atlas: this.atlas,
      });
      const cardTemplate = createMeadowTemplate({
        detail: 1, count: bandStemCount(far.tileSize, far.density), tileSize: far.tileSize, cards: true,
      });
      const start = settings.maxDistance * far.transitionStart;
      this.cards = new MeadowTileLayer({
        scene,
        name: 'meadow-grass-cards',
        tileSize: far.tileSize,
        templates: { cards: cardTemplate },
        material: this.cardMaterial,
        // A card tile is wanted where any of it lies between the handoff and the
        // far edge.
        selectBand: (nearest, farthest) => (nearest < far.distance ** 2 && farthest > start ** 2 ? 'cards' : null),
        reach: far.distance,
        ground: this.ground,
      });
    }
    this.stats = {};
  }

  get meshes() {
    return [...this.blades.meshes, ...(this.cards?.meshes ?? [])];
  }

  syncLight() {
    const sky = this.skyView;
    if (!sky?.directional || !sky?.hemisphere) return;
    this.uniforms.sunColor.value.copy(sky.directional.color).multiplyScalar(sky.directional.intensity / Math.PI);
    this.uniforms.skyColor.value.copy(sky.hemisphere.color).multiplyScalar(sky.hemisphere.intensity / Math.PI);
  }

  /**
   * @param {number} timestamp
   * @param {object} camera
   * @param {{ x: number, y: number, z: number } | null} [body] the player's feet in
   *   render space, or null to let the pressed grass stand back up
   */
  update(timestamp, camera, body = null, shouldYield = null, budgetProvider = null) {
    if (!camera) return;
    const origin = this.terrainView.floatingOrigin.getState();
    this.interactionOrigin.x = origin.x;
    this.interactionOrigin.z = origin.z;
    const canonical = this.canonical;
    canonical.x = camera.position.x + origin.x;
    canonical.z = camera.position.z + origin.z;
    let viewCone = null;
    if (camera.getWorldDirection) {
      camera.getWorldDirection(this.forward);
      const length = Math.hypot(this.forward.x, this.forward.z);
      if (length > 0.01) {
        viewCone = this.viewCone;
        viewCone.x = this.forward.x / length;
        viewCone.z = this.forward.z / length;
        viewCone.tangent = Math.tan((camera.fov ?? 60) * Math.PI / 360) * (camera.aspect ?? 1);
      }
    }
    this.uniforms.time.value = timestamp / 1000;
    this.uniforms.origin.value.set(origin.x, origin.z);
    this.syncLight();
    this.interaction?.update(body);
    this.ground.beginFrame();
    const startedAt = performance.now();
    const deadline = shouldYield?.() ? startedAt : startedAt + this.settings.buildBudgetMs;
    for (const layer of [this.blades, this.cards]) if (layer) {
      layer.workBudgetProvider = budgetProvider;
      layer.workBudgetMs = this.settings.buildBudgetMs;
      layer.workRunner = this.workRunner;
    }
    // Blades first: the ground under the player matters more than the horizon.
    this.blades.update(canonical, origin, deadline, timestamp / 1000, viewCone);
    this.cards?.update(canonical, origin, deadline, timestamp / 1000, viewCone);
    PerfCounters.set('meadowVisibleMissingTiles', this.blades.stats.visibleMissing + (this.cards?.stats.visibleMissing ?? 0));
    PerfCounters.set('meadowVisibleCapacityLagTiles', this.blades.stats.visibleCapacityLag + (this.cards?.stats.visibleCapacityLag ?? 0));
    PerfCounters.set('meadowInViewMissingTiles', this.blades.stats.inViewMissing + (this.cards?.stats.inViewMissing ?? 0));
    PerfCounters.set('meadowInViewCapacityLagTiles', this.blades.stats.inViewCapacityLag + (this.cards?.stats.inViewCapacityLag ?? 0));
    PerfCounters.inc('meadowGrassMs', performance.now() - startedAt);
  }

  getState() {
    const blades = this.blades.getState();
    const cards = this.cards?.getState() ?? null;
    const bladeTriangles = LOD_ORDER.reduce(
      (sum, band) => sum + (blades.bands[band] ?? 0) * grassTrianglesPerBlade(this.settings.lod[band].detail), 0,
    );
    const cardTriangles = (cards?.stems ?? 0) * 2;
    return {
      blades,
      cards,
      tiles: blades.tiles + (cards?.tiles ?? 0),
      building: blades.building + (cards?.building ?? 0),
      stems: blades.stems,
      triangles: bladeTriangles + cardTriangles,
      bladeTriangles,
      cardTriangles,
    };
  }

  /**
   * The floating origin moved by (dx, dz). The stamp's window moves with the world,
   * so re-basing is not the player moving: scrolling the ink here would smear the
   * trail the player never touched.
   */
  shiftOrigin(dx, dz) {
    this.interaction?.shiftOrigin(dx, dz);
  }

  dispose() {
    this.blades.dispose();
    this.cards?.dispose();
    this.bladeMaterial.dispose();
    this.cardMaterial?.dispose();
    this.atlas?.dispose();
    this.interaction?.dispose();
  }
}
