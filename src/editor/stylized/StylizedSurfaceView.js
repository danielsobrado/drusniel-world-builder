import { registerCollisionNaturalSource } from '../collision/CollisionPlayerBridge.js';
import { TerrainMaterialBakeGpuBridge } from '../materials/TerrainMaterialBakeGpuBridge.js';
import { TerrainMaterialBakeRuntime } from '../materials/TerrainMaterialBakeRuntime.js';
import { StylizedSurfaceView as StylizedSurfaceViewBase } from './StylizedSurfaceViewBase.js';
import { loadOptionalTreeVariants } from './loadOptionalTreeVariants.js';
import { installTerrainWaterQueries } from '../water/TerrainWaterQueries.js';

export class StylizedSurfaceView extends StylizedSurfaceViewBase {
  constructor(options) {
    super(options);
    installTerrainWaterQueries(options.terrainView);
    this.materialBakeRuntime = this.enabled && !this.impostorBakeMode && this.config.materialBake?.enabled
      ? new TerrainMaterialBakeRuntime({
        terrainView: options.terrainView,
        revisionTracker: this.revisionTracker,
        config: this.config.materialBake,
      })
      : null;
    this.materialBakeGpuBridge = this.materialBakeRuntime
      ? new TerrainMaterialBakeGpuBridge({
        terrainView: options.terrainView,
        config: this.config.materialBake,
      })
      : null;
    this.collisionSourceDisposed = false;
    this.releaseCollisionNaturalSource = null;
    this.ready = this.ready.then((result) => {
      if (!this.collisionSourceDisposed
          && !this.impostorBakeMode
          && (this.treeView?.manifestStore || this.rockView)) {
        this.releaseCollisionNaturalSource = registerCollisionNaturalSource({
          treeView: this.treeView?.manifestStore ? this.treeView : null,
          rockSource: this.rockView,
        });
      }
      return result;
    });
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
        ? await loadOptionalTreeVariants({
          definitions: this.config.assets.treeVariants ?? [],
          acquire: (scene) => this.acquireTreeSource(scene),
        })
        : [];
      await Promise.all([
        this.treeView?.buildFromScene(sharedScene, treeVariants),
        this.flowerView?.ready,
      ].filter(Boolean));
      this.releaseDetachedTreeSources();
      return null;
    } catch (error) {
      console.warn('Some stylized assets failed to load; remaining layers stay active.', error);
      return null;
    }
  }

  update(timestamp, camera, body = null) {
    super.update(timestamp, camera, body);
    const updateMaterials = () => {
      this.materialBakeRuntime?.update(this.shouldYieldWork);
      this.materialBakeGpuBridge?.update({ shouldYield: this.shouldYieldWork, maxUploads: 1, publicationBudget: this.publicationBudget });
    };
    if (this.runDeferredWork) this.runDeferredWork(updateMaterials);
    else updateMaterials();
  }

  getPreparationStatus() {
    const base = super.getPreparationStatus();
    const materials = this.materialBakeRuntime?.getStats().inFlight ?? 0;
    return { ...base, materials, ready: base.ready && materials === 0 };
  }

  dispose() {
    this.materialBakeGpuBridge?.dispose();
    this.materialBakeGpuBridge = null;
    this.materialBakeRuntime?.dispose();
    this.materialBakeRuntime = null;
    this.collisionSourceDisposed = true;
    this.releaseCollisionNaturalSource?.();
    this.releaseCollisionNaturalSource = null;
    super.dispose();
  }
}
