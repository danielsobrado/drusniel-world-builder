import { Frustum, Matrix4, REVISION, Sphere, Vector3 } from 'three/webgpu';
import { LocationStructurePrefetch } from './LocationStructurePrefetch.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Keep CPU geometry intact; retire renderer-owned buffers for cold offscreen sections. */
export class LocationStructureResidency {
  constructor(scene, renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.nextSample = -Infinity;
    this.entries = [];
    this.frustum = new Frustum();
    this.projection = new Matrix4();
    this.sphere = new Sphere();
    this.position = new Vector3();
    this.enabled = REVISION === '187' && renderer?.backend?.isWebGPUBackend === true && typeof renderer._geometries?.has === 'function';
    if (!this.enabled) return;
    if (settings.prefetchEnabled) this.prefetch = new LocationStructurePrefetch(renderer, settings);
    scene.traverse(mesh => {
      if (!mesh.userData?.locationStructure || !mesh.geometry?.boundingSphere || !mesh.frustumCulled || mesh.castShadow) return;
      this.entries.push({ mesh, lastProtected: null });
    });
  }

  update(camera, now = performance.now()) {
    if (!this.enabled) return;
    const sample = now >= this.nextSample;
    const prefetch = this.prefetch?.enabled ? this.prefetch : null;
    if (!sample && !prefetch) return;
    if (camera.coordinateSystem !== this.renderer.coordinateSystem || camera.reversedDepth !== this.renderer.reversedDepthBuffer) {
      for (const entry of this.entries) entry.lastProtected = now;
      prefetch?.clear();
      return;
    }
    camera.updateWorldMatrix(true, false);
    this.position.setFromMatrixPosition(camera.matrixWorld);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem, camera.reversedDepth);
    if (!sample) {
      prefetch?.advance(this.frustum, this.position);
      return;
    }
    this.nextSample = now + this.settings.sampleMs;
    prefetch?.beginSample(this.position, now);
    let remaining = this.settings.evictionsPerSample, resident = 0, protectedCount = 0;
    for (const entry of this.entries) {
      const { mesh } = entry;
      mesh.updateWorldMatrix(true, false);
      this.sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      const distance = this.sphere.center.distanceTo(this.position) - this.sphere.radius;
      const visible = this.frustum.intersectsSphere(this.sphere);
      const initialized = this.renderer._geometries.has(mesh.geometry);
      const predicted = prefetch?.consider(mesh, this.sphere, distance, visible, initialized);
      const protectedSection = !Number.isFinite(distance) || distance <= this.settings.protectMeters || visible || predicted;
      if (protectedSection || entry.lastProtected === null || now < entry.lastProtected) entry.lastProtected = now;
      if (protectedSection) protectedCount++;
      if (!initialized) continue;
      if (!protectedSection && remaining > 0 && now - entry.lastProtected >= this.settings.idleMs) {
        mesh.geometry.dispose();
        remaining--;
        PerfCounters.inc('locationStructure.evictions');
      } else resident++;
    }
    prefetch?.endSample();
    prefetch?.advance(this.frustum, this.position);
    PerfCounters.set('locationStructure.sections', this.entries.length);
    PerfCounters.set('locationStructure.resident', resident);
    PerfCounters.set('locationStructure.protected', protectedCount);
  }

  dispose() {
    this.enabled = false;
    this.prefetch?.dispose();
    this.entries.length = 0;
    for (const key of ['sections', 'resident', 'protected']) PerfCounters.set(`locationStructure.${key}`, 0);
  }
}
