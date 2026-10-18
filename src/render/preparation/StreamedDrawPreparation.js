import { withDrawPreparation, withPreparationFrame } from './DrawPreparation.js';
import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

const MAX_WAIT_FRAMES = 4;

/** New renderers are staged on the same scene/pass cache before publication. */
export class StreamedDrawPreparation {
  constructor({ scene, renderer, settings, render, invalidateHistory }) {
    Object.assign(this, { scene, renderer, settings, render, invalidateHistory });
    this.prepared = new WeakSet();
    this.preparedVariants = new WeakMap();
    this.stagedMaterials = new Map();
    this.pending = new Set();
    this.hidden = new Map();
    this.disposed = false;
    this.waitFrames = 0;
    this.reservation = null;
  }
  beginFrame(budget) {
    this.revealPending();
    this.reservation?.cancel();
    this.reservation = null;
    if (this.disposed || !this.settings.enabled || this.pending.size === 0) {
      this.waitFrames = 0;
      return;
    }
    // Compilation runs late, after simulation and scene updates. Reserve a
    // turn before earlier queues spend the shared allowance; a perpetually
    // busy scene must not leave these meshes hidden indefinitely.
    if (++this.waitFrames >= MAX_WAIT_FRAMES) this.reservation = budget.reserve(6);
  }
  flushBudgeted(camera, budget) {
    const reservation = this.reservation;
    this.reservation = null;
    if (reservation) reservation.run(() => this.flush(camera));
    else budget.tryRun(() => this.flush(camera, budget.shouldYield), 6);
  }
  register(root) { this.discover(root); }
  discover(root = this.scene) {
    if (!this.settings.enabled || this.disposed) return;
    // Called after a variant/actor is installed, never scans the scene per frame.
    root.traverse(object => {
      if (!object.isMesh || this.prepared.has(object) || object.userData.skipWarmup) return;
      this.pending.add(object);
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
  }
  requestMaterial(mesh, material) {
    if (this.disposed || !this.settings.enabled || this.preparedVariants.get(mesh)?.has(material)) return false;
    this.stagedMaterials.set(mesh, material);
    this.pending.add(mesh);
    return true;
  }
  isMaterialReady(mesh, material) {
    return !this.settings.enabled || this.preparedVariants.get(mesh)?.has(material) === true;
  }
  flush(camera, shouldYield = null) {
    this.revealPending();
    if (shouldYield?.()) return;
    if (this.disposed || !this.settings.enabled || this.pending.size === 0) return;
    const targets = [];
    for (const mesh of this.pending) {
      this.pending.delete(mesh);
      let root = mesh;
      while (root.parent) root = root.parent;
      if (root !== this.scene) { this.stagedMaterials.delete(mesh); continue; }
      targets.push(mesh);
      if (targets.length >= this.settings.meshesPerFrame) break;
    }
    if (targets.length === 0) return;
    this.waitFrames = 0;
    const started = performance.now();
    const materials = new Map(targets.map(mesh => [mesh, mesh.material]));
    try {
      for (const target of targets) target.material = this.stagedMaterials.get(target) ?? target.material;
      withPreparationFrame(this.renderer, null, () => withDrawPreparation(this.scene, targets, () => this.render(camera)));
      for (const target of targets) {
        this.markPrepared(target, target.material);
        this.stagedMaterials.delete(target);
      }
      this.invalidateHistory?.();
      PerfCounters.inc('streamedDrawsPrepared', targets.length);
    } catch (error) {
      this.settings = { ...this.settings, enabled: false };
      this.pending.clear(); this.stagedMaterials.clear();
      PerfCounters.inc('streamedDrawPreparationFailures');
      console.warn('Streamed draw preparation unavailable.', error);
    } finally {
      for (const [mesh, material] of materials) mesh.material = material;
    }
    PerfCounters.inc('streamedDrawPreparationMs', performance.now() - started);
  }
  hidePending() {
    for (const mesh of this.pending) {
      if (this.stagedMaterials.has(mesh) && this.prepared.has(mesh)) continue;
      if (!mesh.parent || !mesh.visible) continue;
      this.hidden.set(mesh, mesh.visible); mesh.visible = false;
    }
  }
  revealPending() {
    for (const [mesh, visible] of this.hidden) mesh.visible = visible;
    this.hidden.clear();
  }
  dispose() {
    this.reservation?.cancel(); this.reservation = null;
    this.revealPending(); this.disposed = true; this.pending.clear(); this.stagedMaterials.clear();
  }
}
