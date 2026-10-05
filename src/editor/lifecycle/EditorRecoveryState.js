import { PLAYER_MODE_WALK } from '../player/playerConstants.js';
/** In-memory state for a renderer restart; generated meshes never enter it. */
export function captureEditorRecoveryState({ controller, editorCamera, playerController,
  viewModeController, proceduralWorkshop, floatingOrigin, exploration }) {
  exploration.tour.stop(); controller.cancelBlockedWorldInteraction(); controller.flushTopEdit();
  return {
    document: controller.toDocument(), origin: floatingOrigin.getState(),
    undoStack: [...controller.undoStack], redoStack: [...controller.redoStack],
    selectedObjectId: controller.selectedObjectId, selectedConstructionId: controller.selectedConstructionId,
    mode: viewModeController.mode, paused: viewModeController.paused, cameraView: viewModeController.cameraView,
    flight: viewModeController.captureFlightState?.() ?? null,
    editor: { position: editorCamera.camera.position.toArray(), target: editorCamera.controls.target.toArray(),
      quaternion: editorCamera.camera.quaternion.toArray(), zoom: editorCamera.camera.zoom },
    player: { state: structuredClone(playerController.state), yaw: playerController.yaw, pitch: playerController.pitch },
    workshop: proceduralWorkshop.captureRuntimeState(),
  };
}

export async function restoreEditorRecoveryState(state, { controller, editorCamera, playerController,
  viewModeController, proceduralWorkshop }) {
  controller.undoStack = [...state.undoStack]; controller.redoStack = [...state.redoStack];
  editorCamera.camera.position.fromArray(state.editor.position);
  editorCamera.controls.target.fromArray(state.editor.target);
  editorCamera.camera.quaternion.fromArray(state.editor.quaternion);
  editorCamera.camera.zoom = state.editor.zoom; editorCamera.camera.updateProjectionMatrix();
  playerController.setPose({ x: state.player.state.x, z: state.player.state.z, yaw: state.player.yaw, pitch: state.player.pitch });
  if (state.mode === PLAYER_MODE_WALK || state.flight?.returnState.mode === PLAYER_MODE_WALK) {
    viewModeController.setMode(PLAYER_MODE_WALK, { spawn: { x: state.player.state.x, z: state.player.state.z } });
  }
  playerController.state = structuredClone(state.player.state); playerController.yaw = state.player.yaw;
  playerController.pitch = state.player.pitch; playerController.applyCameraState();
  if (state.cameraView !== viewModeController.cameraView) viewModeController.toggleCameraView();
  if (state.paused || state.flight?.returnState.paused) viewModeController.pause();
  if (state.flight) viewModeController.restoreFlightState(state.flight);
  if (state.selectedObjectId) controller.setSelectedObject(state.selectedObjectId);
  if (state.selectedConstructionId) controller.setSelectedConstruction(state.selectedConstructionId);
  await proceduralWorkshop.restoreRuntimeState(state.workshop); controller.emitState();
}
