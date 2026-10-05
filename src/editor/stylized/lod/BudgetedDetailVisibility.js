import { Sphere } from 'three/webgpu';
import { TurnEnvelopeFrustum } from '../../../render/visibility/TurnEnvelopeFrustum.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { writeInstances } from './StylizedLodRuntime.js';

/** Main-camera selection only. Full resident buffers are retained for auxiliary views. */
export class BudgetedDetailVisibility {
  constructor(view) {
    this.view = view;
    this.fullMeshes = [];
    this.records = [];
    this.key = '';
    this.job = null;
    this.selectionPose = null;
    this.scratchSphere = new Sphere();
    this.turnEnvelope = new TurnEnvelopeFrustum();
    this.frustum = this.turnEnvelope.frustum;
  }

  reset(instances) {
    this.disposeMeshes();
    this.instances = instances;
    this.records = instances.map((rows, prototype) => {
      const bounds = new Sphere();
      const parts = this.view.prototypes[prototype];
      for (const part of parts) {
        part.geometry.computeBoundingSphere();
        bounds.union(part.geometry.boundingSphere);
      }
      return rows.map(row => {
        const sphere = bounds.clone().applyMatrix4(row.matrix);
        sphere.radius += 2.75; // wind, placement padding, and the bounded camera motion envelope
        return sphere;
      });
    });
    for (const parts of this.view.meshes) {
      for (const mesh of parts) {
        const full = mesh.clone();
        full.instanceMatrix = mesh.instanceMatrix.clone();
        full.geometry = mesh.geometry.clone();
        full.visible = false;
        full.name = `${mesh.name}-auxiliary`;
        this.view.root.add(full);
        this.fullMeshes.push(full);
      }
    }
    this.key = '';
    this.job = null;
    this.selectionPose = null;
    this.eligible = instances.reduce((n, rows) => n + rows.length, 0);
    PerfCounters.set(`${this.view.layerName}VisibilityEligible`, this.eligible);
    PerfCounters.set(`${this.view.layerName}VisibilitySubmitted`, this.eligible);
    PerfCounters.set(`${this.view.layerName}VisibilityRetainedBytes`, this.fullMeshes.reduce((sum, mesh) =>
      sum + mesh.instanceMatrix.array.byteLength + Object.values(mesh.geometry.attributes)
        .reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0), 0));
  }

  update(camera, shouldYield = () => false) {
    if (!this.instances || !camera || this.view.pendingRebuild) return;
    const origin = this.view.terrainView.floatingOrigin.getState();
    camera.updateMatrixWorld();
    const projectionKey = camera.projectionMatrix.elements.join(',');
    const pose = { x: camera.position.x + origin.x, y: camera.position.y, z: camera.position.z + origin.z,
      rotation: camera.quaternion.clone(), projectionKey, originX: origin.x, originZ: origin.z };
    const matches = previous => previous && previous.projectionKey === projectionKey
      && previous.originX === origin.x && previous.originZ === origin.z
      && Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z) < 2
      && Math.abs(previous.rotation.dot(pose.rotation)) > 0.998;
    if (!matches(this.job?.pose ?? this.selectionPose)) {
      // A camera change exposes full resident detail immediately while a new selection is pending.
      this.showFull(true);
      this.turnEnvelope.update(camera, this.view.config?.enhancements?.detailTurnMarginDegrees ?? 12);
      this.job = { pose, prototype: 0, index: 0, selected: this.instances.map(() => []) };
    }
    if (!this.job) return;
    const started = performance.now();
    const job = this.job;
    while (job.prototype < this.records.length) {
      const rows = this.records[job.prototype];
      while (job.index < rows.length) {
        if (shouldYield()) { PerfCounters.inc(`${this.view.layerName}VisibilityCpuMs`, performance.now() - started); return; }
        const sphere = rows[job.index];
        const local = this.scratchSphere;
        local.center.set(sphere.center.x - origin.x, sphere.center.y, sphere.center.z - origin.z);
        local.radius = sphere.radius;
        if (this.frustum.intersectsSphere(local)) job.selected[job.prototype].push(this.instances[job.prototype][job.index]);
        job.index += 1;
      }
      job.prototype += 1;
      job.index = 0;
    }
    if (shouldYield()) return;
    const beforeUploads = PerfCounters.get('attributeBytesUploaded');
    const submitted = writeInstances(this.view.meshes, job.selected, this.view.instanceAnchor);
    PerfCounters.inc(`${this.view.layerName}VisibilityUploadBytes`, PerfCounters.get('attributeBytesUploaded') - beforeUploads);
    this.showFull(false);
    this.selectionPose = job.pose;
    this.job = null;
    PerfCounters.set(`${this.view.layerName}VisibilitySubmitted`, submitted);
    PerfCounters.inc(`${this.view.layerName}VisibilityCpuMs`, performance.now() - started);
  }

  showFull(full, recordMainVisibility = true) {
    for (const parts of this.view.meshes) for (const mesh of parts) mesh.visible = !full;
    for (const mesh of this.fullMeshes) mesh.visible = full;
    if (full && recordMainVisibility) PerfCounters.set(`${this.view.layerName}VisibilitySubmitted`, this.eligible);
  }

  withFull(operation) {
    const states = [...this.view.meshes.flat(), ...this.fullMeshes].map(mesh => [mesh, mesh.visible]);
    this.showFull(true, false);
    try { return operation(); } finally { for (const [mesh, visible] of states) mesh.visible = visible; }
  }

  disposeMeshes() { for (const mesh of this.fullMeshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); } this.fullMeshes.length = 0; }
  dispose() { this.disposeMeshes(); this.records = []; this.instances = null; this.job = null; }
}
