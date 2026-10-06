import { Sphere } from 'three/webgpu';
import { TurnEnvelopeFrustum } from '../../../render/visibility/TurnEnvelopeFrustum.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { writeInstances } from './StylizedLodRuntime.js';

const CAMERA_STATE_SIZE = 25;

function writeCameraState(camera, origin, target) {
  const position = camera.position;
  const quaternion = camera.quaternion;
  target[0] = position.x + origin.x;
  target[1] = position.y;
  target[2] = position.z + origin.z;
  target[3] = quaternion.x;
  target[4] = quaternion.y;
  target[5] = quaternion.z;
  target[6] = quaternion.w;
  target[7] = origin.x;
  target[8] = origin.z;
  const projection = camera.projectionMatrix.elements;
  for (let index = 0; index < 16; index += 1) target[index + 9] = projection[index];
}

function cameraStatesMatch(current, previous) {
  if (!previous || current[7] !== previous[7] || current[8] !== previous[8]) return false;
  if (Math.hypot(
    current[0] - previous[0],
    current[1] - previous[1],
    current[2] - previous[2],
  ) >= 2) return false;
  const quaternionDot = current[3] * previous[3]
    + current[4] * previous[4]
    + current[5] * previous[5]
    + current[6] * previous[6];
  if (Math.abs(quaternionDot) <= 0.998) return false;
  for (let index = 9; index < CAMERA_STATE_SIZE; index += 1) {
    if (current[index] !== previous[index]) return false;
  }
  return true;
}

/** Main-camera selection only. Full resident buffers are retained for auxiliary views. */
export class BudgetedDetailVisibility {
  constructor(view) {
    this.view = view;
    this.fullMeshes = [];
    this.records = [];
    this.key = '';
    this.job = null;
    this.selectionPose = null;
    this.cameraState = new Float64Array(CAMERA_STATE_SIZE);
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
    writeCameraState(camera, origin, this.cameraState);
    if (!cameraStatesMatch(this.cameraState, this.job?.pose ?? this.selectionPose)) {
      // Keep the previous complete selection visible while its replacement is built.
      // Only the initial selection needs the full-resident fallback.
      if (!this.selectionPose) this.showFull(true);
      this.turnEnvelope.update(camera, this.view.config?.enhancements?.detailTurnMarginDegrees ?? 12);
      this.job = {
        pose: new Float64Array(this.cameraState),
        prototype: 0,
        index: 0,
        selected: this.instances.map(() => []),
      };
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
