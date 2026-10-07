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
    this.revisionClock = '';
    this.localSourceKey = '';
    this.originScratch = { x: 0, z: 0 };
    this.instanceRows = [];
    this.positionScratch = new Vector3();
    this.rotationScratch = new Quaternion();
    this.rotationAxis = new Vector3(0, 1, 0);
    this.scaleScratch = new Vector3(1, 1, 1);
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
      this.meshes = createInstancedRenderers({ root: this.root, renderer: this.terrainView.renderer, partsByPrototype: [this.parts], capacity: 128,
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

  terrainWindowRevision(focus) {
    let revision = 0;
    for (const slot of this.terrainView.slots) {
      const descriptor = slot.descriptor;
      if (!slot.page || !descriptor
          || Math.abs(descriptor.chunkX - focus.chunkX) > 2
          || Math.abs(descriptor.chunkZ - focus.chunkZ) > 2) {
        continue;
      }
      revision = ((revision * 33)
        ^ descriptor.chunkX
        ^ (descriptor.chunkZ << 8)
        ^ (slot.pageRevision ?? 0)) >>> 0;
    }
    return revision;
  }

  resolveSourceKey(focus, bounds, worldBounds, store) {
    const view = this.terrainView;
    const terrainClock = Number.isFinite(view.contentRevision)
      ? view.contentRevision
      : this.terrainWindowRevision(focus);
    const surfaceClock = this.surface.revisionTracker?.revision ?? 0;
    const objectClock = this.controller.objectMap.revision ?? 0;
    const constructionClock = this.constructionSpatialIndex?.revision ?? 0;
    const clock = `${focus.chunkX}:${focus.chunkZ}:${terrainClock}:${surfaceClock}:${objectClock}:${constructionClock}:${store.revision}`;
    if (clock === this.revisionClock) return this.localSourceKey;
    this.revisionClock = clock;
    const terrainRevision = this.terrainWindowRevision(focus);
    const surfaceRevision = this.surface.revisionTracker?.windowSignature?.(focus, 2, 1)
      ?? surfaceClock;
    const objectRevision = this.controller.objectMap.signatureForBounds?.(bounds)
      ?? objectClock;
    const constructionRevision = this.constructionSpatialIndex?.signatureForBounds?.(worldBounds)
      ?? constructionClock;
    this.localSourceKey = `${focus.chunkX}:${focus.chunkZ}:${terrainRevision}:${surfaceRevision}:${objectRevision}:${constructionRevision}:${store.revision}`;
    return this.localSourceKey;
  }

  update(camera) {
    void camera;
    this.root.visible = this.enabled;
    if (!this.enabled || !this.parts || this.disposed) return;
    const view = this.terrainView;
    const origin = view.floatingOrigin.readState?.(this.originScratch)
      ?? view.floatingOrigin.getState();
    const tileSize = view.worldStore.tileSize;
    this.anchor.place(this.root, origin);
    const generator = view.worldStore.generator;
    if (generator !== this.worldGenerator) {
      this.worldGenerator = generator;
      this.generator = new RoadsideLanternGenerator(generator);
      this.key = ''; this.sourceKey = ''; this.revisionClock = ''; this.localSourceKey = ''; this.pending = null;
    }
    const focus = view.focusChunk;
    if (!focus) return;
    const store = this.controller.roadsideDetails;
    const x = (focus.chunkX + 0.5) * view.chunkWorldSize;
    const z = -(focus.chunkZ + 0.5) * view.chunkWorldSize;
    const reach = view.chunkWorldSize * 2;
    const bounds = {
      minX: (x - reach) / tileSize - 2,
      maxX: (x + reach) / tileSize + 2,
      minZ: (-z - reach) / tileSize - 2,
      maxZ: (-z + reach) / tileSize + 2,
    };
    const worldBounds = {
      minX: x - reach,
      maxX: x + reach,
      minZ: z - reach,
      maxZ: z + reach,
    };
    const sourceKey = this.resolveSourceKey(focus, bounds, worldBounds, store);
    if (!this.pending && sourceKey === this.sourceKey) return;
    if (this.pending?.sourceKey !== sourceKey) {
      const residentChunks = new Set();
      for (const slot of view.slots) {
        if (slot.page && slot.descriptor) {
          residentChunks.add(`${slot.descriptor.chunkX}:${slot.descriptor.chunkZ}`);
        }
      }
      this.pending = {
        sourceKey,
        rows: [],
        identities: new Set(),
        residentChunks,
        constructionBounds: new Map(),
        constructionIds: new Set(),
        iterator: this.generator.candidates(x / tileSize, -z / tileSize, reach, tileSize),
        finalizing: false,
        finalizeIndex: 0,
      };
    }

    const pending = this.pending;
    const started = performance.now();
    while (!pending.finalizing && !this.surface.shouldYieldWork?.()) {
      const next = pending.iterator.next();
      if (next.done) {
        pending.finalizing = true;
        break;
      }
      const detail = next.value;
      if (store.has(detail.key) || pending.identities.has(detail.key) || pending.rows.length >= 128) continue;
      const chunkX = Math.floor(detail.x / view.chunkWorldSize);
      const chunkZ = Math.floor(-detail.z / view.chunkWorldSize);
      if (!pending.residentChunks.has(`${chunkX}:${chunkZ}`)) continue;
      const water = view.getCanonicalWater(detail.x, detail.z);
      if (water.coverage > 0.05 || water.shoreDistance < 3 && water.kind !== 0) continue;
      const cellX = Math.floor(detail.cellX);
      const cellZ = Math.floor(detail.cellZ);
      if (this.controller.objectMap.queryBounds({
        minX: cellX - 1,
        maxX: cellX + 1,
        minZ: cellZ - 1,
        maxZ: cellZ + 1,
      }).length) continue;
      const region = {
        minX: detail.x - 2,
        maxX: detail.x + 2,
        minZ: detail.z - 2,
        maxZ: detail.z + 2,
      };
      const ids = this.constructionSpatialIndex?.idsForBounds?.(
        region,
        0,
        pending.constructionIds,
      ) ?? pending.constructionIds;
      let obstructed = false;
      for (const id of ids) {
        let cached = pending.constructionBounds.get(id);
        if (cached === undefined) {
          const record = this.controller.constructionStore?.get(id);
          cached = record
            ? { bounds: cubicBezierPathBounds(record.path), margin: record.dimensions.thickness ?? 0 }
            : null;
          pending.constructionBounds.set(id, cached);
        }
        const b = cached?.bounds;
        const margin = cached?.margin ?? 0;
        if (b && b.minX - margin <= region.maxX && b.maxX + margin >= region.minX
            && b.minZ - margin <= region.maxZ && b.maxZ + margin >= region.minZ) {
          obstructed = true;
          break;
        }
      }
      if (obstructed) continue;
      const height = view.worldStore.sampleHeight(detail.cellX, detail.cellZ);
      const slope = Math.max(
        Math.abs(view.worldStore.sampleHeight(detail.cellX + 1, detail.cellZ) - height),
        Math.abs(view.worldStore.sampleHeight(detail.cellX, detail.cellZ + 1) - height),
      ) / tileSize;
      if (!Number.isFinite(height) || slope > 0.25) continue;
      pending.rows.push({ ...detail, height });
      pending.identities.add(detail.key);
    }

    while (pending.finalizing
        && pending.finalizeIndex < pending.rows.length
        && !this.surface.shouldYieldWork?.()) {
      const index = pending.finalizeIndex++;
      const record = pending.rows[index];
      let row = this.instanceRows[index];
      if (!row) {
        row = { matrix: new Matrix4(), fade: 1, seed: 0 };
        this.instanceRows[index] = row;
      }
      this.positionScratch.set(record.x, record.height, record.z);
      this.rotationScratch.setFromAxisAngle(this.rotationAxis, record.rotationY);
      row.matrix.compose(this.positionScratch, this.rotationScratch, this.scaleScratch);
    }

    if (pending.finalizing && pending.finalizeIndex >= pending.rows.length) {
      this.records = pending.rows;
      this.instanceRows.length = this.records.length;
      this.anchor.follow(origin);
      writeInstances(this.meshes, [this.instanceRows], this.anchor);
      this.anchor.place(this.root, origin);
      this.key = sourceKey;
      this.sourceKey = sourceKey;
      this.pending = null;
      PerfCounters.set('roadsideLanternInstances', this.records.length);
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
    this.revisionClock = ''; this.localSourceKey = ''; this.instanceRows.length = 0;
  }
}
