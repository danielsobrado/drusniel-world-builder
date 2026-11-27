import { Frustum, Matrix4, REVISION, Sphere } from 'three/webgpu';
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
    this.enabled = REVISION === '187' && renderer?.backend?.isWebGPUBackend === true && typeof renderer._geometries?.has === 'function';
    if (!this.enabled) return;
    scene.traverse(mesh => {
      if (!mesh.userData?.locationStructure || !mesh.geometry?.boundingSphere || !mesh.frustumCulled || mesh.castShadow) return;
      this.entries.push({ mesh, lastProtected: null });
    });
  }

  update(camera, now = performance.now()) {
    if (!this.enabled || now < this.nextSample) return;
    this.nextSample = now + this.settings.sampleMs;
    if (camera.coordinateSystem !== this.renderer.coordinateSystem || camera.reversedDepth !== this.renderer.reversedDepthBuffer) {
      for (const entry of this.entries) entry.lastProtected = now;
      return;
    }
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem, camera.reversedDepth);
    let remaining = this.settings.evictionsPerSample, resident = 0, protectedCount = 0;
    for (const entry of this.entries) {
      const { mesh } = entry;
      mesh.updateWorldMatrix(true, false);
      this.sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      const distance = this.sphere.center.distanceTo(camera.position) - this.sphere.radius;
      const protectedSection = !Number.isFinite(distance) || distance <= this.settings.protectMeters || this.frustum.intersectsSphere(this.sphere);
      if (protectedSection || entry.lastProtected === null || now < entry.lastProtected) entry.lastProtected = now;
      if (protectedSection) protectedCount++;
      if (!this.renderer._geometries.has(mesh.geometry)) continue;
      if (!protectedSection && remaining > 0 && now - entry.lastProtected >= this.settings.idleMs) {
        mesh.geometry.dispose();
        remaining--;
        PerfCounters.inc('locationStructure.evictions');
      } else resident++;
    }
    PerfCounters.set('locationStructure.sections', this.entries.length);
    PerfCounters.set('locationStructure.resident', resident);
    PerfCounters.set('locationStructure.protected', protectedCount);
  }

  dispose() {
    this.enabled = false;
    this.entries.length = 0;
    for (const key of ['sections', 'resident', 'protected']) PerfCounters.set(`locationStructure.${key}`, 0);
  }
}
