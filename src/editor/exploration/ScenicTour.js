import { PLAYER_MODE_WALK } from '../player/playerConstants.js';
import { CatmullRomCurve3, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { SettlementSamplingPreparation } from '../world/settlements/SettlementSamplingPreparation.js';

/** Gods' End curve traversal, adapted to the current world and floating origin. */
export class ScenicTour {
  constructor({ terrainView, viewModeController, settings, container, invalidateHistory }) {
    Object.assign(this, { terrainView, viewModeController, settings, invalidateHistory });
    this.camera = new PerspectiveCamera(55, 1, 0.1, 2000);
    this.active = false; this.elapsed = 0; this.point = new Vector3(); this.ahead = new Vector3();
    this.targetRotation = new Quaternion(); this.generator = null;
    this.preparationGeneration = 0;
    this.button = document.createElement('button'); this.button.type = 'button';
    this.button.dataset.captureUi = '';
    this.button.className = 'scenic-tour-button'; this.button.textContent = 'Scenic tour';
    this.button.title = 'Fly around nearby terrain; Escape returns to your view';
    this.button.style.cssText = 'position:absolute;top:12px;right:12px;z-index:104;padding:8px 12px;border-radius:8px;background:#243027;color:#f0eedf;border:1px solid #81937a;';
    this.onClick = () => {
      if (this.active || this.preparing) this.stop();
      else void this.start().catch(error => console.error('Scenic tour preparation failed.', error));
    };
    this.button.addEventListener('click', this.onClick);
    this.onKey = event => { if (this.active && event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.stop(); } };
    window.addEventListener('keydown', this.onKey, true);
    if (settings.enabled) container.append(this.button);
  }
  localRoute(center = null) {
    const focus = this.viewModeController.getFocusWorld();
    center ??= this.terrainView.floatingOrigin.toCanonical(focus.x, focus.z);
    const points = [], radius = this.settings.radiusMeters;
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2, distance = radius * (0.8 + 0.2 * Math.sin(angle * 3));
      const x = center.x + Math.cos(angle) * distance, z = center.z + Math.sin(angle) * distance;
      points.push(new Vector3(x, this.terrainView.getCanonicalHeight(x, z) + this.settings.clearanceMeters, z));
    }
    return points;
  }
  async start(points = null) {
    if (!this.settings.enabled || this.active || this.preparing) return false;
    if (points !== null && (!Array.isArray(points) || points.length < 3 || points.some(point => ![point.x, point.y, point.z].every(Number.isFinite)))) {
      throw new Error('A scenic tour needs at least three finite canonical points.');
    }
    const focus = this.viewModeController.getFocusWorld();
    const center = this.terrainView.floatingOrigin.toCanonical(focus.x, focus.z);
    const store = this.terrainView.worldStore, generator = store.generator;
    const sampling = new SettlementSamplingPreparation(store), generation = ++this.preparationGeneration;
    this.sampling = sampling; this.preparing = true; this.button.textContent = 'Preparing tour';
    const radius = this.settings.radiusMeters * 1.5, tileSize = store.tileSize;
    const bounds = { minX: (points ? Math.min(...points.map(p => p.x)) - radius : center.x - radius) / tileSize,
      maxX: (points ? Math.max(...points.map(p => p.x)) + radius : center.x + radius) / tileSize,
      minZ: -(points ? Math.max(...points.map(p => p.z)) + radius : center.z + radius) / tileSize,
      maxZ: -(points ? Math.min(...points.map(p => p.z)) - radius : center.z - radius) / tileSize };
    const startedAt = performance.now();
    try {
      for (;;) {
        let units = 0;
        if (sampling.prepare(bounds, () => ++units > 16)) break;
        if (generation !== this.preparationGeneration || store.generator !== generator) return false;
        if (performance.now() - startedAt > 120000) throw new Error('Scenic tour terrain preparation timed out.');
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      if (generation !== this.preparationGeneration || store.generator !== generator) return false;
      points ??= this.localRoute(center);
      this.preparing = false;
      return this.activate(points);
    } finally {
      if (!this.active || generation !== this.preparationGeneration) {
        sampling.dispose();
        if (this.sampling === sampling) { this.sampling = null; this.preparing = false; this.button.textContent = 'Scenic tour'; }
      }
    }
  }
  activate(points) {
    this.curve = new CatmullRomCurve3(points.map(point => new Vector3(point.x, point.y, point.z)), true, 'centripetal');
    this.length = this.curve.getLength();
    if (!(this.length > 0)) throw new Error('A scenic tour needs a nonzero route.');
    this.generator = this.terrainView.worldStore.generator;
    const view = this.viewModeController;
    this.previous = { paused: view.paused, editorEnabled: view.editorCamera.controls.enabled };
    if (view.mode === PLAYER_MODE_WALK) view.pause();
    view.editorCamera.setEnabled(false); document.exitPointerLock?.();
    view.cameraOverride = this.camera; this.active = true; this.elapsed = 0;
    this.button.textContent = 'Stop tour'; this.update(0, true); this.invalidateHistory?.(); return true;
  }
  update(dt, immediate = false) {
    if (!this.active) return;
    if (this.generator !== this.terrainView.worldStore.generator) { this.stop(); return; }
    this.elapsed += Math.max(0, Math.min(dt, 0.1));
    if (this.elapsed >= this.settings.durationSeconds) { this.stop(); return; }
    const progress = this.elapsed / this.settings.durationSeconds;
    this.curve.getPointAt(progress, this.point);
    this.point.y = Math.max(this.point.y, this.terrainView.getCanonicalHeight(this.point.x, this.point.z) + this.settings.clearanceMeters);
    this.curve.getPointAt((progress + this.settings.lookAheadMeters / this.length) % 1, this.ahead);
    this.ahead.y = Math.max(this.ahead.y, this.terrainView.getCanonicalHeight(this.ahead.x, this.ahead.z) + this.settings.clearanceMeters * 0.5);
    const origin = this.terrainView.floatingOrigin;
    const position = origin.toRender(this.point.x, this.point.z), ahead = origin.toRender(this.ahead.x, this.ahead.z);
    const camera = this.camera, element = this.terrainView.renderer.domElement;
    camera.aspect = element.clientWidth / Math.max(1, element.clientHeight); camera.updateProjectionMatrix();
    camera.position.set(position.x, this.point.y, position.z);
    this.targetRotation.copy(camera.quaternion); camera.lookAt(ahead.x, this.ahead.y, ahead.z);
    if (!immediate) { this.targetRotation.slerp(camera.quaternion, 1 - Math.exp(-4 * dt)); camera.quaternion.copy(this.targetRotation); }
    camera.updateMatrixWorld();
    this.viewModeController.focusOverride = camera.position;
  }
  preloadFocus() {
    if (!this.active) return null;
    const point = this.curve.getPointAt((this.elapsed / this.settings.durationSeconds + this.settings.preloadMeters / this.length) % 1);
    return { x: point.x, z: point.z };
  }
  shiftWorld(shiftX, shiftZ) { this.camera.position.x -= shiftX; this.camera.position.z -= shiftZ; }
  stop() {
    this.preparationGeneration++;
    this.preparing = false; this.sampling?.dispose(); this.sampling = null;
    this.button.textContent = 'Scenic tour';
    if (!this.active) return;
    this.active = false; const view = this.viewModeController;
    view.cameraOverride = null; view.focusOverride = null;
    view.editorCamera.setEnabled(this.previous.editorEnabled);
    if (view.mode === PLAYER_MODE_WALK && !this.previous.paused) view.resume();
    this.button.textContent = 'Scenic tour'; this.invalidateHistory?.();
  }
  dispose() { this.stop(); window.removeEventListener('keydown', this.onKey, true); this.button.removeEventListener('click', this.onClick); this.button.remove(); }
}
