import { PRIMARY_POINTER_BUTTON } from '../constants.js';
import { emitAudio } from '../audio/index.js';
import {
  PLAYER_MODE_EDIT,
  PLAYER_MODE_WALK,
  PLAYER_MODE_FLY,
  PLAYER_MODES,
} from './playerConstants.js';
import { applyTerrainInspectionMode } from './ViewModeSurfacePolicy.js';
import { FreeFlyController } from './FreeFlyController.js';

export const CAMERA_VIEW_FIRST = 'first';
export const CAMERA_VIEW_THIRD = 'third';

/** The key that flips between them. Claimed on the capture phase — see below. */
export const CAMERA_VIEW_TOGGLE_CODE = 'KeyV';

function invokeOptional(callback, label, ...args) {
  if (typeof callback !== 'function') return;
  try {
    callback(...args);
  } catch (error) {
    console.error(`View mode ${label} callback failed.`, error);
  }
}

export class ViewModeController {
  constructor({
    editorCamera, playerController, terrainView, thirdPersonCamera = null,
    freeFlySettings = { enabled: true, moveSpeed: 24, fastMultiplier: 4, lookSensitivity: 0.003 },
  }) {
    this.editorCamera = editorCamera;
    this.playerController = playerController;
    this.terrainView = terrainView;
    /**
     * Optional second camera for walk mode. Absent, the toggle is inert and walk
     * mode behaves exactly as it did before the character existed.
     */
    this.thirdPersonCamera = thirdPersonCamera;
    this.cameraView = CAMERA_VIEW_FIRST;
    this.canvas = terrainView.renderer.domElement;
    this.mode = PLAYER_MODE_EDIT;
    this.freeFly = new FreeFlyController({ canvas: this.canvas, settings: freeFlySettings,
      isBlocked: () => this.playerController.uiBlocked || Boolean(this.cameraOverride) });
    /**
     * Walking suspended for in-world editing.
     *
     * A flag within walk mode: editing in place preserves the walking camera,
     * while free flight owns a separate navigation camera.
     */
    this.paused = false;
    this.awaitingSpawn = false;
    this.spacePressed = false;
    this._lastTimestamp = null;
    this.playerFrameStatus = { position: { x: 0, y: 0, z: 0 } };
    this.hasPlayerFrameStatus = false;
    this.listeners = new Set();
    this.unsubscribePlayer = playerController.subscribe(() => this.emit());
    this.editorCamera.setEnabled(true);
    this.playerController.setEnabled(false);
    this.syncTerrainInspectionMode();

    this.boundHandlers = {
      pointerDown: (event) => this.onSpawnPointerDown(event),
      keyDown: (event) => this.onSpawnKeyDown(event),
      keyUp: (event) => this.onSpawnKeyUp(event),
    };
    this.canvas.addEventListener('pointerdown', this.boundHandlers.pointerDown, true);
    window.addEventListener('keydown', this.boundHandlers.keyDown, true);
    window.addEventListener('keyup', this.boundHandlers.keyUp, true);
  }

  get camera() {
    if (this.cameraOverride) return this.cameraOverride;
    if (this.mode === PLAYER_MODE_FLY) {
      if (this.freeFly.camera.far !== this.playerController.camera.far) {
        this.freeFly.camera.far = this.playerController.camera.far;
        this.freeFly.camera.updateProjectionMatrix();
      }
      return this.freeFly.camera;
    }
    if (this.mode !== PLAYER_MODE_WALK) return this.editorCamera.camera;
    if (!this.isThirdPerson) return this.playerController.camera;

    const camera = this.thirdPersonCamera.camera;
    const playerCamera = this.playerController.camera;
    // Far-terrain mode updates the player camera at runtime. Keep the optional
    // third-person camera on the same range without coupling the composition
    // root to every camera implementation.
    if (camera.far !== playerCamera.far) {
      camera.far = playerCamera.far;
      camera.updateProjectionMatrix();
    }
    return camera;
  }

  get isThirdPerson() {
    return this.cameraView === CAMERA_VIEW_THIRD && this.thirdPersonCamera !== null;
  }

  getState() {
    return Object.freeze({
      mode: this.mode,
      cameraView: this.cameraView,
      paused: this.paused,
      awaitingSpawn: this.awaitingSpawn,
      player: this.playerController.getStatus(),
    });
  }

  syncTerrainInspectionMode() {
    applyTerrainInspectionMode(this.terrainView, this.mode === PLAYER_MODE_EDIT);
  }

  /**
   * Flip between first and third person.
   *
   * @returns {boolean} whether the view actually changed
   */
  toggleCameraView() {
    if (!this.thirdPersonCamera || this.mode !== PLAYER_MODE_WALK) return false;
    this.cameraView = this.cameraView === CAMERA_VIEW_THIRD
      ? CAMERA_VIEW_FIRST
      : CAMERA_VIEW_THIRD;
    if (this.isThirdPerson) {
      // The boom has no idea where the player is until it has run once; easing
      // in from wherever it was left flies the camera across the map.
      this.thirdPersonCamera.reset();
      this.thirdPersonCamera.update(0, this.playerController.getStatus());
    }
    invokeOptional(this.onCameraViewChange, 'camera view', this.cameraView);
    this.emit();
    return true;
  }

  /**
   * Capture-phase key handler for the view toggle.
   *
   * `PlayerController` stops immediate propagation on every non-Escape key while
   * walking, so this has to be attached before it is constructed — see
   * `attachCaptureHotkey`. Returns true when the event was claimed.
   */
  handleCameraViewKey(event) {
    if (this.handleFlightKey(event)) return true;
    if (event.code !== CAMERA_VIEW_TOGGLE_CODE) return false;
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (this.mode !== PLAYER_MODE_WALK || this.paused || this.awaitingSpawn) return false;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    event.preventDefault();
    return this.toggleCameraView();
  }

  handleFlightKey(event) {
    if (event.code === 'KeyF' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
      && !this.playerController.uiBlocked && !this.playerController.harnessActive && !this.cameraOverride
      && !event.target?.matches?.('input, select, textarea, [contenteditable="true"]')) {
      event.preventDefault();
      return this.mode === PLAYER_MODE_FLY ? this.stopFreeFly() : this.startFreeFly({ requestPointerLock: true });
    }
    return this.freeFly.handleKey(event);
  }

  startFreeFly({ requestPointerLock = false } = {}) {
    if (!this.freeFly.settings.enabled || this.mode === PLAYER_MODE_FLY || this.cameraOverride
      || this.playerController.uiBlocked || this.playerController.harnessActive) return false;
    invokeOptional(this.onBeforeFreeFly, 'before free flight');
    const camera = this.camera;
    this.flightReturnState = { mode: this.mode, paused: this.paused, playerEnabled: this.playerController.enabled,
      editorEnabled: this.editorCamera.controls.enabled };
    this.cancelSpawnSelection();
    this.freeFly.start(camera);
    this.flightGenerator = this.terrainView.worldStore?.generator;
    this.mode = PLAYER_MODE_FLY; this.paused = false;
    this.playerController.setEnabled(false); this.editorCamera.setEnabled(false);
    this._lastTimestamp = null;
    invokeOptional(this.onLeaveOrbitEditing, 'leave orbit editing');
    this.syncTerrainInspectionMode(); this.emit();
    if (requestPointerLock) this.freeFly.requestPointerLock();
    return true;
  }

  stopFreeFly() {
    if (this.mode !== PLAYER_MODE_FLY) return false;
    const previous = this.flightReturnState;
    this.mode = previous.mode; this.paused = previous.paused;
    this.freeFly.stop();
    this.playerController.setEnabled(previous.playerEnabled);
    this.playerController.setPaused(previous.paused);
    this.editorCamera.setEnabled(previous.editorEnabled);
    this._lastTimestamp = null; this.syncTerrainInspectionMode(); this.emit();
    return true;
  }

  captureFlightState() {
    return this.mode === PLAYER_MODE_FLY ? { ...this.freeFly.captureState(), returnState: { ...this.flightReturnState } } : null;
  }

  restoreFlightState(state) {
    if (!state) return false;
    if (!this.startFreeFly()) return false;
    if (!this.freeFly.restoreState(state)) { this.stopFreeFly(); return false; }
    if ([PLAYER_MODE_EDIT, PLAYER_MODE_WALK].includes(state.returnState?.mode)) this.flightReturnState = { ...state.returnState };
    this.emit(); return true;
  }

  /** Suspend walking so the world can be edited from the player's viewpoint. */
  pause() {
    if (this.mode !== PLAYER_MODE_WALK || this.paused) return false;
    this.paused = true;
    this.playerController.setPaused(true);
    // Only wall building is offered while paused; force the construction tool
    // so a leftover terrain/object tool cannot still paint from first person.
    invokeOptional(this.onPausedEditing, 'paused editing');
    this.emit();
    return true;
  }

  /** Resume walking. Clicking the viewport re-locks the pointer as before. */
  resume() {
    if (!this.paused) return false;
    this.paused = false;
    this.playerController.setPaused(false);
    this.emit();
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  setMode(mode, { requestPointerLock = false, spawn = null } = {}) {
    if (!PLAYER_MODES.includes(mode)) {
      return;
    }
    invokeOptional(this.onBeforeModeChange, 'before mode change');
    if (mode === PLAYER_MODE_FLY) { this.startFreeFly({ requestPointerLock }); return; }
    if (this.mode === PLAYER_MODE_FLY) this.stopFreeFly();

    if (mode === PLAYER_MODE_WALK) {
      if (this.mode === PLAYER_MODE_WALK) {
        // Already walking, or paused mid-walk: re-entering resumes rather than
        // respawning, so clicking the viewport puts the player straight back.
        this.resume();
        if (requestPointerLock) {
          this.playerController.requestPointerLock();
        }
        return;
      }

      if (spawn) {
        this.enterWalkMode(spawn, { requestPointerLock });
        return;
      }

      if (this.awaitingSpawn) {
        return;
      }

      this.beginSpawnSelection();
      return;
    }

    this.cancelSpawnSelection();
    this.resume();
    if (this.mode === PLAYER_MODE_EDIT) {
      return;
    }

    const focus = this.playerController.getFocusWorld();
    this.mode = PLAYER_MODE_EDIT;
    this.syncTerrainInspectionMode();
    this.playerController.setEnabled(false);
    this.editorCamera.setEnabled(true);
    this.editorCamera.focusWorld(focus.x, focus.z);
    emitAudio('camera.mode.orbit');
    this.emit();
  }

  beginSpawnSelection() {
    this.awaitingSpawn = true;
    this.spacePressed = false;
    // Drop orbit brush/object ghosts immediately — spawn hover must not keep
    // a raise/paint preview pinned to the ground under the cursor.
    invokeOptional(this.onLeaveOrbitEditing, 'leave orbit editing');
    this.emit();
  }

  cancelSpawnSelection() {
    if (!this.awaitingSpawn) {
      return;
    }
    this.awaitingSpawn = false;
    this.spacePressed = false;
    this.emit();
  }

  enterWalkMode(spawn, { requestPointerLock = false } = {}) {
    this.awaitingSpawn = false;
    this.spacePressed = false;
    this.mode = PLAYER_MODE_WALK;
    this.syncTerrainInspectionMode();
    this.editorCamera.setEnabled(false);
    this.playerController.setEnabled(true, spawn);
    // The boom carries the last walk's pose; entering somewhere else entirely
    // would otherwise be a long swoop across the world.
    this.thirdPersonCamera?.reset();
    this._lastTimestamp = null;
    if (requestPointerLock) {
      this.playerController.requestPointerLock();
    }
    // Direct spawn (world map / harness) skips beginSpawnSelection, so clear
    // here too — otherwise the last orbit brush stays rendered while walking.
    invokeOptional(this.onLeaveOrbitEditing, 'leave orbit editing');
    emitAudio('camera.mode.player');
    this.emit();
  }

  onSpawnPointerDown(event) {
    if (!this.awaitingSpawn || event.button !== PRIMARY_POINTER_BUTTON || this.spacePressed) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const spawn = this.terrainView.pickWorld(
      event.clientX,
      event.clientY,
      this.editorCamera.camera,
    );
    if (!spawn) {
      return;
    }

    this.enterWalkMode(spawn, { requestPointerLock: true });
  }

  onSpawnKeyDown(event) {
    if (event.code === 'Space') {
      this.spacePressed = true;
    }

    if (!this.awaitingSpawn) {
      return;
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      this.cancelSpawnSelection();
    }
  }

  onSpawnKeyUp(event) {
    if (event.code === 'Space') {
      this.spacePressed = false;
    }
  }

  resize(width, height) {
    this.editorCamera.resize(width, height);
    this.playerController.resize(width, height);
    this.thirdPersonCamera?.resize(width, height);
    this.freeFly.resize(width, height);
  }

  update(timestamp) {
    if (this.cameraOverride) return;
    if (this.mode === PLAYER_MODE_FLY) {
      if (this.flightGenerator !== this.terrainView.worldStore?.generator) { this.stopFreeFly(); return; }
      const dt = this._lastTimestamp === null ? 0 : (timestamp - this._lastTimestamp) / 1000;
      this.freeFly.update(dt); this._lastTimestamp = timestamp; return;
    }
    if (this.mode === PLAYER_MODE_WALK) {
      this.playerController.update(timestamp);
      this.playerController.readFrameStatus(this.playerFrameStatus);
      this.hasPlayerFrameStatus = true;
      if (this.isThirdPerson) {
        const deltaSeconds = this._lastTimestamp === null
          ? 0
          : (timestamp - this._lastTimestamp) / 1000;
        this.thirdPersonCamera.update(deltaSeconds, this.playerFrameStatus);
      }
      this._lastTimestamp = timestamp;
    } else {
      this.hasPlayerFrameStatus = false;
      this._lastTimestamp = null;
      this.editorCamera.update();
    }
  }

  getPlayerFrameStatus() {
    return this.mode === PLAYER_MODE_WALK && this.hasPlayerFrameStatus
      ? this.playerFrameStatus
      : null;
  }

  readFocusWorld(out) {
    if (this.focusOverride) {
      out.x = this.focusOverride.x;
      out.z = this.focusOverride.z;
      return out;
    }
    if (this.mode === PLAYER_MODE_FLY) {
      out.x = this.freeFly.camera.position.x;
      out.z = this.freeFly.camera.position.z;
      return out;
    }
    return this.mode === PLAYER_MODE_WALK
      ? this.playerController.readFocusWorld(out)
      : this.editorCamera.readFocusWorld(out);
  }

  getFocusWorld() {
    return Object.freeze(this.readFocusWorld({}));
  }

  // Walking and free flight turn the minimap with the camera heading; the
  // orbit view keeps it north-up so its click-to-recentre maths stays valid.
  getHeading() {
    return this.mode === PLAYER_MODE_FLY ? this.freeFly.euler.y
      : this.mode === PLAYER_MODE_WALK ? this.playerController.yaw : 0;
  }

  shiftWorld(shiftX, shiftZ) {
    this.editorCamera.shiftWorld(shiftX, shiftZ);
    this.playerController.shiftWorld(shiftX, shiftZ);
    this.thirdPersonCamera?.shiftWorld(shiftX, shiftZ);
    this.freeFly.shiftWorld(shiftX, shiftZ);
  }

  emit() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('View mode listener failed.', error);
      }
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.boundHandlers.pointerDown, true);
    window.removeEventListener('keydown', this.boundHandlers.keyDown, true);
    window.removeEventListener('keyup', this.boundHandlers.keyUp, true);
    this.unsubscribePlayer?.();
    this.freeFly.dispose();
    this.playerController.dispose();
    this.listeners.clear();
  }
}
