import { Sphere, Vector3 } from 'three/webgpu';
import { StagedGeometryUploads } from '../../render/preparation/StagedGeometryUploads.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Prepare detached static buffers without hiding structural geometry. */
export class LocationStructurePrefetch {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.uploads = new StagedGeometryUploads(renderer, {
      minStaticBytes: 1,
      maxDetachedBytes: settings.prefetchMaxDetachedBytes,
      maxAllocationsPerFrame: settings.prefetchMaxAllocationsPerFrame,
      maxRestarts: 0,
      counterPrefix: 'locationStructure.prefetch',
    });
    this.enabled = settings.prefetchEnabled && this.uploads.supported
      && typeof renderer._geometries.initGeometry === 'function';
    this.previous = new Vector3();
    this.predicted = new Vector3();
    this.lead = new Vector3();
    this.sphere = new Sphere();
    this.previousAt = null;
    this.candidates = [];
    this.active = null;
    this.rejected = new WeakSet();
  }

  get radius() { return this.settings.protectMeters + this.settings.prefetchExtraMeters; }

  beginSample(position, now) {
    this.predicted.copy(position);
    const elapsed = now - this.previousAt;
    if (this.previousAt !== null && elapsed > 0 && elapsed <= this.settings.sampleMs * 2) {
      this.lead.subVectors(position, this.previous);
      if (this.lead.length() <= this.settings.prefetchMaxLeadMeters) {
        this.lead.multiplyScalar(this.settings.prefetchLookaheadMs / elapsed);
        this.lead.clampLength(0, this.settings.prefetchMaxLeadMeters);
        this.predicted.add(this.lead);
      }
    }
    this.previous.copy(position);
    this.previousAt = now;
    this.candidates.length = 0;
  }

  consider(mesh, sphere, distance, visible, resident) {
    const predictedDistance = sphere.center.distanceTo(this.predicted) - sphere.radius;
    const nearby = Math.min(distance, predictedDistance) <= this.radius;
    if (nearby && !visible && !resident && !this.rejected.has(mesh)) {
      this.candidates.push({ mesh, priority: Math.min(distance, predictedDistance) });
    }
    return nearby;
  }

  endSample() {
    this.candidates.sort((a, b) => a.priority - b.priority);
    if (this.active && !this.candidates.some(entry => entry.mesh === this.active)) this.cancel();
    PerfCounters.set('locationStructure.prefetchCandidates', this.candidates.length);
  }

  cancel() {
    if (!this.active) return;
    this.uploads.cancel(this.active);
    this.active = null;
    PerfCounters.inc('locationStructure.prefetchCancelled');
  }

  clear() {
    this.cancel();
    this.candidates.length = 0;
    this.previousAt = null;
    PerfCounters.set('locationStructure.prefetchCandidates', 0);
  }

  advance(frustum, position) {
    if (!this.enabled) return;
    if (this.renderer._isDeviceLost || !this.uploads.supported) {
      this.clear();
      return;
    }
    this.uploads.beginFrame();
    if (!this.active) this.active = this.candidates.shift()?.mesh ?? null;
    const mesh = this.active;
    if (!mesh) return;
    const manager = this.renderer._geometries;
    const geometry = mesh.geometry;
    mesh.updateWorldMatrix(true, false);
    this.sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const distance = this.sphere.center.distanceTo(position) - this.sphere.radius;
    if (manager.has(geometry) || frustum.intersectsSphere(this.sphere)
        || !Number.isFinite(distance) || distance > this.radius + this.settings.prefetchMaxLeadMeters) {
      this.cancel();
      return;
    }
    let initialized = false;
    try {
      const attributes = new Set(Object.values(geometry.attributes));
      if (geometry.index) attributes.add(geometry.index);
      const entries = this.uploads.entries(mesh);
      if (entries.length !== attributes.size || entries.some(entry => !attributes.has(entry.attribute))) {
        this.rejected.add(mesh);
        this.cancel();
        return;
      }
      const deadline = performance.now() + this.settings.prefetchMaxMs;
      const result = this.uploads.advance(mesh, this.settings.prefetchSliceBytes, () => performance.now() >= deadline);
      if (!result.ready) return;
      if (this.uploads.fallbacks.has(mesh)) {
        this.rejected.add(mesh);
        this.cancel();
        return;
      }
      // Register geometry disposal ownership before installing complete buffers.
      manager.initGeometry(geometry);
      initialized = true;
      this.uploads.adopt(mesh);
      this.active = null;
      this.candidates = this.candidates.filter(entry => entry.mesh !== mesh);
      PerfCounters.inc('locationStructure.prefetchCompleted');
    } catch (error) {
      this.cancel();
      if (initialized) geometry.dispose();
      this.clear();
      this.enabled = false;
      PerfCounters.inc('locationStructure.prefetchFailures');
      console.warn('Location structure prefetch unavailable.', error);
    }
  }

  dispose() {
    this.clear();
    this.uploads.dispose();
    this.enabled = false;
    PerfCounters.set('locationStructure.prefetchDetachedBytes', 0);
  }
}
