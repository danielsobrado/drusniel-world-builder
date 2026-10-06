import { Group, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { createGodsEndAssetParts } from '../assets/godsEnd/assetParts.js';
import { createInstancedRenderers, disposeInstancedRenderers, writeInstances } from '../stylized/lod/StylizedLodRuntime.js';
import { InstanceAnchor } from '../stylized/lod/InstanceAnchor.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { RoadsideLanternGenerator, ROADSIDE_LANTERN_KEY } from './RoadsideLanternGenerator.js';
import { cubicBezierPathBounds } from '../construction/curve/CubicBezierPath.js';

export class RoadsideDetailsView {
  constructor({ terrainView, controller, assets, surface, enabled, constructionSpatialIndex = null }) {
    Object.assign(this, { terrainView, controller, assets, surface, defaultEnabled: enabled, constructionSpatialIndex });
    this.root = new Group(); this.root.name = 'roadside-lanterns'; terrainView.scene.add(this.root);
    this.anchor = new InstanceAnchor(); this.records = []; this.meshes = []; this.key = ''; this.disposed = false;
    this.sourceKey = '';
    this.unsubscribe = controller.subscribeMap?.(() => this.synchronizeEnabled());
  }
  get enabled() { return this.controller.roadsideDetails.enabled ?? this.defaultEnabled; }

  async initialize() {
    if (this.loading) return this.loading;
    if (!this.enabled || this.parts || this.disposed || this.failed) return;
    this.loading = this.loadParts();
    try { await this.loading; }
    catch (error) { this.failed = true; throw error; }
    finally { this.loading = null; }
  }

  async loadParts() {
    const definition = this.controller.objectMap.getDefinition(ROADSIDE_LANTERN_KEY);
    if (!definition?.asset) throw new Error('Roadside lantern asset is unavailable.');
    const cache = this.assets.getCache(), path = definition.asset.path;
    const scene = await cache.acquire(path);
    let retained = false;
    try {
      if (this.disposed || !this.enabled) return;
      const parts = createGodsEndAssetParts(scene, definition.asset);
      this.parts = parts.map(part => ({ geometry: part.geometry.applyMatrix4(part.matrix), material: part.material }));
      this.meshes = createInstancedRenderers({ root: this.root, partsByPrototype: [this.parts], capacity: 128,
        name: 'roadside-lantern', castShadow: true });
      this.assetPath = path; retained = true;
    } finally { if (!retained) cache.release(path); }
  }

  synchronizeEnabled() {
    if (this.disposed) return;
    this.root.visible = this.enabled;
    if (!this.enabled) { this.clearResources(); this.failed = false; return; }
    this.initialize().catch(error => this.controller.emitNotice(error.message, true));
  }

  update(camera) {
    this.root.visible = this.enabled;
    if (!this.enabled || !this.parts || this.disposed) return;
    const view = this.terrainView, origin = view.floatingOrigin.getState(), tileSize = view.worldStore.tileSize;
    this.anchor.place(this.root, origin);
    const generator = view.worldStore.generator;
    if (generator !== this.worldGenerator) {
      this.worldGenerator = generator;
      this.generator = new RoadsideLanternGenerator(generator);
      this.key = ''; this.sourceKey = ''; this.pending = null;
    }
    const focus = view.focusChunk;
    if (!focus) return;
    const store = this.controller.roadsideDetails;
    const x = (focus.chunkX + 0.5) * view.chunkWorldSize, z = -(focus.chunkZ + 0.5) * view.chunkWorldSize;
    const reach = view.chunkWorldSize * 2;
    const bounds = { minX: (x - reach) / tileSize - 2, maxX: (x + reach) / tileSize + 2,
      minZ: (-z - reach) / tileSize - 2, maxZ: (-z + reach) / tileSize + 2 };
    let fallbackTerrainRevision = 0;
    if (!Number.isFinite(view.contentRevision)) {
      for (const slot of view.slots) {
        if (!slot.page || !slot.descriptor) continue;
        fallbackTerrainRevision = ((fallbackTerrainRevision * 33)
          ^ slot.descriptor.chunkX ^ (slot.descriptor.chunkZ << 8) ^ (slot.pageRevision ?? 0)) >>> 0;
      }
    }
    const terrainRevision = Number.isFinite(view.contentRevision) ? view.contentRevision : fallbackTerrainRevision;
    const surfaceRevision = this.surface.revisionTracker?.revision
      ?? this.surface.revisionTracker?.windowSignature?.(focus, 2, 1)
      ?? 0;
    const objectRevision = this.controller.objectMap.revision
      ?? this.controller.objectMap.signatureForBounds(bounds);
    const constructionRevision = this.constructionSpatialIndex?.revision ?? 0;
    const sourceKey = `${focus.chunkX}:${focus.chunkZ}:${terrainRevision}:${surfaceRevision}:${objectRevision}:${constructionRevision}:${store.revision}`;
    if (!this.pending && sourceKey === this.sourceKey) return;
    if (this.pending?.sourceKey !== sourceKey) {
      const residentChunks = new Set();
      for (const slot of view.slots) {
        if (slot.page && slot.descriptor) residentChunks.add(`${slot.descriptor.chunkX}:${slot.descriptor.chunkZ}`);
      }
      this.pending = {
        key: sourceKey,
        sourceKey,
        rows: [],
        identities: new Set(),
        residentChunks,
        constructionBounds: new Map(),
        iterator: this.generator.candidates(x / tileSize, -z / tileSize, reach, tileSize),
      };
    }
    const key = sourceKey;
    const started = performance.now();
    while (!this.surface.shouldYieldWork?.()) {
      const next = this.pending.iterator.next();
      if (next.done) {
        this.records = this.pending.rows;
        this.anchor.follow(origin);
        writeInstances(this.meshes, [this.records.map(record => ({ matrix: new Matrix4().compose(
          new Vector3(record.x, record.height, record.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), record.rotationY), new Vector3(1, 1, 1)), fade: 1, seed: 0 }))], this.anchor);
        this.anchor.place(this.root, origin);
        this.key = key; this.sourceKey = sourceKey; this.pending = null;
        PerfCounters.set('roadsideLanternInstances', this.records.length);
        break;
      }
      const detail = next.value;
      if (store.has(detail.key) || this.pending.identities.has(detail.key) || this.pending.rows.length >= 128) continue;
      const chunkX = Math.floor(detail.x / view.chunkWorldSize);
      const chunkZ = Math.floor(-detail.z / view.chunkWorldSize);
      if (!this.pending.residentChunks.has(`${chunkX}:${chunkZ}`)) continue;
      const water = view.getCanonicalWater(detail.x, detail.z);
      if (water.coverage > 0.05 || water.shoreDistance < 3 && water.kind !== 0) continue;
      const cell = { x: Math.floor(detail.cellX), z: Math.floor(detail.cellZ) };
      if (this.controller.objectMap.queryBounds({ minX: cell.x - 1, maxX: cell.x + 1, minZ: cell.z - 1, maxZ: cell.z + 1 }).length) continue;
      const index = this.constructionSpatialIndex;
      const region = { minX: detail.x - 2, maxX: detail.x + 2, minZ: detail.z - 2, maxZ: detail.z + 2 };
      const ids = new Set((index?.keysForBounds(region) ?? []).flatMap(key => index.list(...key.split(':').map(Number))));
      const obstructed = [...ids].some(id => {
        let cached = this.pending.constructionBounds.get(id);
        if (cached === undefined) {
          const record = this.controller.constructionStore.get(id);
          cached = record
            ? { bounds: cubicBezierPathBounds(record.path), margin: record.dimensions.thickness ?? 0 }
            : null;
          this.pending.constructionBounds.set(id, cached);
        }
        const b = cached?.bounds;
        const margin = cached?.margin ?? 0;
        return b && b.minX - margin <= region.maxX && b.maxX + margin >= region.minX
          && b.minZ - margin <= region.maxZ && b.maxZ + margin >= region.minZ;
      });
      if (obstructed) continue;
      const height = view.worldStore.sampleHeight(detail.cellX, detail.cellZ);
      const slope = Math.max(Math.abs(view.worldStore.sampleHeight(detail.cellX + 1, detail.cellZ) - height),
        Math.abs(view.worldStore.sampleHeight(detail.cellX, detail.cellZ + 1) - height)) / tileSize;
      if (!Number.isFinite(height) || slope > 0.25) continue;
      this.pending.rows.push({ ...detail, height });
      this.pending.identities.add(detail.key);
    }
    PerfCounters.inc('roadsideLanternGenerationCpuMs', performance.now() - started);
  }

  dispose() {
    this.disposed = true; this.unsubscribe?.(); this.root.removeFromParent(); this.clearResources();
  }

  clearResources() {
    disposeInstancedRenderers(this.root, this.meshes); this.meshes = [];
    for (const part of this.parts ?? []) part.geometry.dispose();
    if (this.assetPath) this.assets.getCache().release(this.assetPath);
    this.assetPath = null; this.parts = null; this.records = []; this.pending = null; this.key = ''; this.sourceKey = '';
  }
}
