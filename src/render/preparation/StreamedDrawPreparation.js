import { withDrawPreparation, withPreparationFrame } from './DrawPreparation.js';
import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';
import { BudgetedAttributeInitialization } from './BudgetedAttributeInitialization.js';
import { acquireReflectionShadowRegistry } from '../reflections/ReflectionShadowRegistry.js';
import { DrawUploadEstimate } from './DrawUploadEstimate.js';

const MAX_WAIT_FRAMES = 4;
export const INITIAL_UPLOAD_BYTES_PER_FRAME = 768 * 1024;

/** New renderers are staged on the same scene/pass cache before publication. */
export class StreamedDrawPreparation {
  constructor({ scene, renderer, settings, render, invalidateHistory, diagnostics = false }) {
    Object.assign(this, { scene, renderer, settings, render, invalidateHistory });
    this.prepared = new WeakSet();
    this.preparedVariants = new WeakMap();
    this.bypassedVariants = new WeakMap();
    this.stagedMaterials = new Map();
    this.pending = new Set();
    this.isolated = new WeakSet();
    this.enqueuedAt = diagnostics ? new Map() : null;
    this.initialUploadBytes = new Map();
    this.initialUploadAttributes = new Map();
    this.attributeInitialization = new BudgetedAttributeInitialization(renderer);
    this.hidden = new Map();
    this.disposed = false;
    this.waitFrames = 0;
    this.reservation = null;
    this.releaseUpload = null;
    this.uploadEstimate = new DrawUploadEstimate();
    this.hierarchy = null;
    this.hierarchyLease = null;
    this.preparationCostMs = null;
  }
  beginFrame(budget) {
    this.revealPending();
    this.reservation?.cancel();
    this.reservation = null;
    this.releaseUpload?.();
    this.releaseUpload = null;
    if (this.disposed || !this.settings.enabled || this.pending.size === 0) {
      this.waitFrames = 0;
      return;
    }
    // Compilation runs late, after simulation and scene updates. Reserve a
    // turn before earlier queues spend the shared allowance; a perpetually
    // busy scene must not leave these meshes hidden indefinitely.
    if (++this.waitFrames >= MAX_WAIT_FRAMES) {
      this.reservation = budget.reserve(6);
      if (this.reservation) {
        const mesh = this.pending.values().next().value;
        const attributes = this.initialUploadAttributes.get(mesh);
        const sliced = attributes && this.attributeInitialization.supported;
        const estimate = this.uploadEstimate.estimate(mesh, new Set(), sliced ? attributes : []);
        const initial = this.initialUploadBytes.get(mesh) ?? 0;
        const bytes = sliced ? INITIAL_UPLOAD_BYTES_PER_FRAME + estimate.bytes : Math.max(initial, estimate.bytes);
        this.releaseUpload = budget.reserveUpload?.(bytes);
      }
    }
  }
  flushBudgeted(camera, budget) {
    const reservation = this.reservation;
    this.reservation = null;
    this.releaseUpload?.();
    this.releaseUpload = null;
    const bytes = Math.min(INITIAL_UPLOAD_BYTES_PER_FRAME, budget.remainingUploadBytes?.() ?? Infinity);
    if (reservation) reservation.run(shouldYield => this.flush(camera, shouldYield, bytes, budget));
    else budget.tryRun(() => this.flush(camera, budget.shouldYield, bytes, budget), 6);
  }
  register(root, { uploadBytes = 0, uploadAttributes = null } = {}) {
    this.discover(root);
    if (uploadBytes > 0 && this.pending.has(root)) this.initialUploadBytes.set(root, uploadBytes);
    if (uploadAttributes && this.pending.has(root)) this.initialUploadAttributes.set(root, uploadAttributes);
  }
  enqueue(mesh) {
    if (this.pending.has(mesh)) return;
    this.pending.add(mesh);
    if (this.enqueuedAt) {
      this.enqueuedAt.set(mesh, performance.now());
      PerfCounters.inc('streamedDrawJobsQueued');
    }
  }
  cancelDiagnostics(mesh) {
    if (this.enqueuedAt?.delete(mesh)) PerfCounters.inc('streamedDrawJobsCancelled');
  }
  cancelAllDiagnostics() {
    if (!this.enqueuedAt?.size) return;
    PerfCounters.inc('streamedDrawJobsCancelled', this.enqueuedAt.size);
    this.enqueuedAt.clear();
  }
  discover(root = this.scene) {
    if (!this.settings.enabled || this.disposed) return;
    // Called after a variant/actor is installed, never scans the scene per frame.
    root.traverse(object => {
      if (!object.isMesh || this.prepared.has(object) || this.isMaterialReady(object, object.material) || object.userData.skipWarmup) return;
      this.enqueue(object);
    });
  }
  markInitialScene() {
    this.scene.traverse(object => { if (object.isMesh) this.markPrepared(object, object.material); });
  }
  markPrepared(mesh, material) {
    this.prepared.add(mesh);
    let variants = this.preparedVariants.get(mesh);
    if (!variants) this.preparedVariants.set(mesh, variants = new Set());
    variants.add(material);
    this.uploadEstimate.mark(mesh);
  }
  markBypassed(mesh, material) {
    let variants = this.bypassedVariants.get(mesh);
    if (!variants) this.bypassedVariants.set(mesh, variants = new Set());
    variants.add(material);
    if (this.enqueuedAt?.delete(mesh)) PerfCounters.inc('streamedDrawJobsBypassed');
  }
  requestMaterial(mesh, material) {
    if (this.disposed || this.isMaterialReady(mesh, material)) return false;
    this.stagedMaterials.set(mesh, material);
    this.enqueue(mesh);
    return true;
  }
  isMaterialReady(mesh, material) {
    return !this.settings.enabled || this.preparedVariants.get(mesh)?.has(material) === true
      || this.bypassedVariants.get(mesh)?.has(material) === true;
  }
  cancel(mesh) {
    if (this.pending.delete(mesh)) {
      this.cancelDiagnostics(mesh);
      this.attributeInitialization.cancel(this.initialUploadAttributes.get(mesh) ?? []);
      this.initialUploadAttributes.delete(mesh);
      this.initialUploadBytes.delete(mesh);
      this.stagedMaterials.delete(mesh);
    }
    if (this.hidden.has(mesh)) {
      mesh.visible = this.hidden.get(mesh);
      this.hidden.delete(mesh);
    }
  }
  flush(camera, shouldYield = null, byteLimit = INITIAL_UPLOAD_BYTES_PER_FRAME, budget = null) {
    this.revealPending();
    if (shouldYield?.()) return;
    if (this.disposed || !this.settings.enabled || this.pending.size === 0) return;
    const targets = [];
    const materials = new Map();
    const plannedBuffers = new Set();
    const started = performance.now();
    let uploadBytes = 0;
    // The pass itself cannot yield. Limit the batch using the last observed
    // cost, while retaining the one-job progress guarantee.
    const slackMs = budget?.slack?.strictAvailable?.() ?? Infinity;
    const targetLimit = this.preparationCostMs === null ? this.settings.meshesPerFrame
      : Math.min(this.settings.meshesPerFrame, Math.max(1, Math.floor(slackMs / this.preparationCostMs)));
    const uploadStarted = performance.now();
    let budgetedBytes = 0;
    try {
      for (const mesh of this.pending) {
        if (shouldYield?.()) break;
        const isolated = this.isolated.has(mesh);
        if (isolated && targets.length) break;
        let root = mesh;
        while (root.parent) root = root.parent;
        if (root !== this.scene) {
          this.cancel(mesh);
          continue;
        }
        const attributes = this.initialUploadAttributes.get(mesh);
        const budgeted = attributes && this.attributeInitialization.supported;
        if (budgeted) {
          const result = this.attributeInitialization.advance(attributes,
            byteLimit - uploadBytes, shouldYield);
          uploadBytes += result.bytes;
          budgetedBytes += result.bytes;
          if (!result.ready) break;
        }
        const initial = this.initialUploadBytes.get(mesh) ?? 0;
        const estimate = this.uploadEstimate.estimate(mesh, plannedBuffers, budgeted ? attributes : []);
        const bytes = budgeted ? estimate.bytes : Math.max(initial, estimate.bytes);
        // An indivisible upload may exceed the local slice only if the shared budget admits it.
        if (uploadBytes + bytes > byteLimit && (targets.length || budgetedBytes > 0
            || (budget ? !budget.canPublish(uploadBytes + bytes) : byteLimit < INITIAL_UPLOAD_BYTES_PER_FRAME))) break;
        if (budget && bytes > budget.maxUploadBytes) PerfCounters.inc('streamedOversizedPublicationBytes', bytes);
        for (const buffer of estimate.buffers) plannedBuffers.add(buffer);
        this.pending.delete(mesh);
        uploadBytes += bytes;
        targets.push(mesh);
        if (isolated || targets.length >= targetLimit || uploadBytes >= byteLimit) break;
      }
      PerfCounters.inc('streamedInitialUploadCpuMs', performance.now() - uploadStarted);
      PerfCounters.set('meadowInitialGpuUploadMaxFrameBytes',
        Math.max(PerfCounters.get('meadowInitialGpuUploadMaxFrameBytes'), budgetedBytes));
      if (budgetedBytes) PerfCounters.inc('streamedDrawInitialUploadBytes', budgetedBytes);
      if (targets.length === 0) return;
      this.waitFrames = 0;
      for (const mesh of targets) materials.set(mesh, mesh.material);
      for (const target of targets) target.material = this.stagedMaterials.get(target) ?? target.material;
      this.hierarchyLease ??= acquireReflectionShadowRegistry(this.scene);
      this.hierarchy = this.hierarchyLease.registry;
      const prepareStarted = performance.now();
      if (this.enqueuedAt) {
        PerfCounters.inc('streamedDrawPassRequests');
        for (const target of targets) {
          const queuedAt = this.enqueuedAt.get(target);
          if (queuedAt !== undefined) PerfCounters.inc('streamedDrawQueueWaitMs', prepareStarted - queuedAt);
        }
      }
      const prepared = withPreparationFrame(this.renderer, null, () => {
        try {
          withDrawPreparation(this.scene, targets, () => this.render(camera), this.hierarchy.owners);
          return true;
        } catch (error) {
          if (this.renderer._isDeviceLost) throw error;
          PerfCounters.inc('streamedDrawPreparationFailures');
          if (targets.length > 1) {
            for (const target of targets) {
              this.isolated.add(target);
              this.pending.add(target);
            }
          } else {
            const [target] = targets;
            this.markBypassed(target, target.material);
            this.stagedMaterials.delete(target);
            this.initialUploadBytes.delete(target);
            this.attributeInitialization.release(this.initialUploadAttributes.get(target) ?? []);
            this.initialUploadAttributes.delete(target);
            console.warn('Skipping preparation for a draw.', {
              mesh: target.name || target.uuid,
              material: target.material?.name || target.material?.type,
              error,
            });
          }
          return false;
        }
      });
      const preparedAt = performance.now();
      const sample = Math.max(0.01, (preparedAt - prepareStarted) / targets.length);
      this.preparationCostMs = this.preparationCostMs === null ? sample
        : Math.max(sample, this.preparationCostMs * 0.75 + sample * 0.25);
      PerfCounters.set('streamedDrawPreparationEstimatedMeshMs', this.preparationCostMs);
      // Count attempted publication even when a shader error forces isolation.
      PerfCounters.inc('streamedDrawInitialUploadBytes', uploadBytes - budgetedBytes);
      if (!prepared) return;
      if (this.enqueuedAt) {
        PerfCounters.inc('streamedDrawPassCpuMs', preparedAt - prepareStarted);
        PerfCounters.inc('streamedDrawJobsCompleted', targets.length);
      }
      for (const target of targets) {
        if (this.enqueuedAt) {
          const queuedAt = this.enqueuedAt.get(target);
          if (queuedAt !== undefined) PerfCounters.inc('streamedDrawReadyDelayMs', preparedAt - queuedAt);
          this.enqueuedAt.delete(target);
        }
        this.markPrepared(target, target.material);
        this.stagedMaterials.delete(target);
        this.initialUploadBytes.delete(target);
        this.attributeInitialization.release(this.initialUploadAttributes.get(target) ?? []);
        this.initialUploadAttributes.delete(target);
      }
      this.invalidateHistory?.();
      PerfCounters.inc('streamedDrawsPrepared', targets.length);
    } catch (error) {
      this.cancelAllDiagnostics();
      this.settings = { ...this.settings, enabled: false };
      this.pending.clear(); this.stagedMaterials.clear(); this.initialUploadBytes.clear();
      this.attributeInitialization.cancel(); this.initialUploadAttributes.clear();
      PerfCounters.inc('streamedDrawPreparationFailures');
      console.warn('Streamed draw preparation unavailable.', error);
    } finally {
      for (const [mesh, material] of materials) mesh.material = material;
      PerfCounters.inc('streamedDrawPreparationMs', performance.now() - started);
    }
  }
  hidePending() {
    for (const mesh of this.pending) {
      if (this.stagedMaterials.has(mesh) && this.isMaterialReady(mesh, mesh.material)) continue;
      if (!mesh.parent || !mesh.visible) continue;
      this.hidden.set(mesh, mesh.visible); mesh.visible = false;
    }
  }
  revealPending() {
    for (const [mesh, visible] of this.hidden) mesh.visible = visible;
    this.hidden.clear();
  }
  dispose() {
    this.cancelAllDiagnostics();
    this.reservation?.cancel(); this.reservation = null;
    this.releaseUpload?.(); this.releaseUpload = null;
    this.hierarchyLease?.release(); this.hierarchyLease = null; this.hierarchy = null;
    this.revealPending(); this.disposed = true; this.pending.clear(); this.stagedMaterials.clear(); this.initialUploadBytes.clear();
    this.attributeInitialization.cancel(); this.initialUploadAttributes.clear();
  }
}
