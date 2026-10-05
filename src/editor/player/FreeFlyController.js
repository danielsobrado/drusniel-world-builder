import { Euler, PerspectiveCamera, Vector3 } from 'three';

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight']);
const isTyping = target => Boolean(target?.matches?.('input, select, textarea, [contenteditable="true"]'));

/** Donor flight controls; the view-mode owner handles activation and streaming. */
export class FreeFlyController {
  constructor({ canvas, settings, isBlocked = () => false, eventTarget = globalThis.window, documentTarget = globalThis.document }) {
    Object.assign(this, { canvas, settings, isBlocked, eventTarget, documentTarget });
    this.camera = new PerspectiveCamera(60, 1, 0.1, 5000);
    this.active = false;
    this.keys = new Set();
    this.euler = new Euler(0, 0, 0, 'YXZ');
    this.forward = new Vector3(); this.right = new Vector3(); this.movement = new Vector3();
    this.handlers = {
      keyUp: event => this.keys.delete(event.code),
      mouseMove: event => this.look(event),
      pointerDown: event => {
        if (!this.active || this.isBlocked() || event.button !== 0) return;
        event.preventDefault(); event.stopImmediatePropagation(); this.requestPointerLock();
      },
      blur: () => this.keys.clear(),
      lockChange: () => { if (documentTarget?.pointerLockElement !== canvas) this.keys.clear(); },
    };
    eventTarget?.addEventListener('keyup', this.handlers.keyUp, true);
    eventTarget?.addEventListener('blur', this.handlers.blur);
    documentTarget?.addEventListener('mousemove', this.handlers.mouseMove);
    documentTarget?.addEventListener('pointerlockchange', this.handlers.lockChange);
    canvas?.addEventListener('pointerdown', this.handlers.pointerDown, true);
  }

  start(source) {
    this.camera.position.copy(source.position); this.camera.quaternion.copy(source.quaternion);
    this.camera.far = source.far; this.camera.updateProjectionMatrix();
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.active = true; this.keys.clear(); this.camera.updateMatrixWorld();
  }

  stop() {
    this.active = false; this.keys.clear();
    if (this.documentTarget?.pointerLockElement === this.canvas) this.documentTarget.exitPointerLock?.();
  }

  requestPointerLock() {
    if (this.documentTarget?.pointerLockElement === this.canvas) return;
    const result = this.canvas?.requestPointerLock?.();
    result?.catch?.(() => {});
  }

  handleKey(event) {
    if (!this.active || this.isBlocked() || isTyping(event.target) || event.metaKey || event.altKey) return false;
    if (!MOVEMENT_KEYS.has(event.code)) return false;
    event.preventDefault(); this.keys.add(event.code); return true;
  }

  look(event) {
    if (!this.active || this.isBlocked() || this.documentTarget?.pointerLockElement !== this.canvas) return;
    this.euler.y -= (event.movementX ?? 0) * this.settings.lookSensitivity;
    this.euler.x = Math.max(-1.5, Math.min(1.5, this.euler.x - (event.movementY ?? 0) * this.settings.lookSensitivity));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  update(dt) {
    if (!this.active || !Number.isFinite(dt)) return;
    if (this.isBlocked()) { this.keys.clear(); return; }
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.movement.set(0, 0, 0);
    if (this.keys.has('KeyW')) this.movement.add(this.forward);
    if (this.keys.has('KeyS')) this.movement.sub(this.forward);
    if (this.keys.has('KeyD')) this.movement.add(this.right);
    if (this.keys.has('KeyA')) this.movement.sub(this.right);
    if (this.keys.has('Space')) this.movement.y += 1;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) this.movement.y -= 1;
    const multiplier = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? this.settings.fastMultiplier : 1;
    if (this.movement.lengthSq()) this.camera.position.addScaledVector(this.movement.normalize(),
      this.settings.moveSpeed * multiplier * Math.min(0.05, Math.max(0, dt)));
    this.camera.updateMatrixWorld();
  }

  resize(width, height) { this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); }
  shiftWorld(x, z) { this.camera.position.x -= x; this.camera.position.z -= z; this.camera.updateMatrixWorld(); }
  captureState() { return { position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray() }; }
  restoreState(state) {
    if (!state || state.position?.length !== 3 || state.quaternion?.length !== 4
      || [...state.position, ...state.quaternion].some(value => !Number.isFinite(value))) return false;
    this.camera.position.fromArray(state.position); this.camera.quaternion.fromArray(state.quaternion).normalize();
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ'); this.camera.updateMatrixWorld(); return true;
  }
  dispose() {
    this.stop();
    this.eventTarget?.removeEventListener('keyup', this.handlers.keyUp, true);
    this.eventTarget?.removeEventListener('blur', this.handlers.blur);
    this.documentTarget?.removeEventListener('mousemove', this.handlers.mouseMove);
    this.documentTarget?.removeEventListener('pointerlockchange', this.handlers.lockChange);
    this.canvas?.removeEventListener('pointerdown', this.handlers.pointerDown, true);
  }
}
