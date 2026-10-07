import { moduleProjectedPixels } from './ConstructionLod.js';
import { resolveRequestedLodBand } from '../compile/ConstructionLodState.js';

const LOD_REFRESH_MS = 50;
const LOD_POSITION_SCALE = 8;
const LOD_ROTATION_SCALE = 500;
const CONSTRUCTION_COARSE_BUILD_PRIORITY_BIAS = 1_000_000;

function updateCameraState(state, camera, viewportHeight) {
  const position = camera.position;
  const quaternion = camera.quaternion;
  const n0 = Math.round(position.x * LOD_POSITION_SCALE);
  const n1 = Math.round(position.y * LOD_POSITION_SCALE);
  const n2 = Math.round(position.z * LOD_POSITION_SCALE);
  const n3 = Math.round(quaternion.x * LOD_ROTATION_SCALE);
  const n4 = Math.round(quaternion.y * LOD_ROTATION_SCALE);
  const n5 = Math.round(quaternion.z * LOD_ROTATION_SCALE);
  const n6 = Math.round(quaternion.w * LOD_ROTATION_SCALE);
  const n7 = Math.round((camera.zoom ?? 1) * 10);
  const n8 = Math.round((camera.fov ?? 0) * 10);
  const n9 = Math.round(viewportHeight * 10);
  const changed = state[0] !== n0 || state[1] !== n1 || state[2] !== n2
    || state[3] !== n3 || state[4] !== n4 || state[5] !== n5
    || state[6] !== n6 || state[7] !== n7 || state[8] !== n8 || state[9] !== n9;
  state[0] = n0; state[1] = n1; state[2] = n2; state[3] = n3; state[4] = n4;
  state[5] = n5; state[6] = n6; state[7] = n7; state[8] = n8; state[9] = n9;
  return changed;
}


/** Classify only resident module candidates, with time and camera-state gates. */
export function updateConstructionLod(view, camera, viewportHeight) {
    if (!camera || !(viewportHeight > 0)) return;
    const now = performance.now();
    if (!view.lodDirty && now < view.nextLodEvaluationAt) return;
    const cameraChanged = updateCameraState(view.lodCameraState, camera, viewportHeight);
    view.nextLodEvaluationAt = now + LOD_REFRESH_MS;
    if (!cameraChanged && !view.lodDirty) return;
    view.lodDirty = false;
    view.refreshResidency(camera);

    let nearCount = 0;
    let coarseCount = 0;
    let shellCount = 0;
    const origin = view.floatingOrigin.getState();
    for (const entry of view.entries.values()) {
      if (!entry.plan) continue;
      if (entry.moduleResidency) view.reconcileModuleResidency(entry);
      const pinned = entry.record.id === view.selectedId;
      let uncovered = 0;
      for (const module of entry.activePlanModules ?? entry.plan.modules) {
        const resident = entry.modules.get(module.id);
        if (!resident) continue;
        const pixels = moduleProjectedPixels({
          camera,
          module,
          height: entry.record.dimensions.height,
          viewportHeight,
          // Module bounds are canonical; the camera is in render space.
          origin,
          cameraY: camera.position.y,
        });
        const previousVisible = resident.visibleBand ?? resident.band ?? null;
        const band = resolveRequestedLodBand({
          pixels,
          previousVisible,
          pinned,
          now,
          visibleSince: resident.visibleSince ?? 0,
          styleKey: entry.record.style?.key,
          force: !resident.builtBand || resident.meshes.length === 0,
          // Metre hysteresis (`transition.hysteresisMetres`) activates only when
          // distanceMetres / nearDistanceMetres / shellDistanceMetres are passed.
          // Pixel hysteresis from selectConstructionLod remains the live path.
        });
        resident.requestedBand = band;
        if (band === 'shell' && (resident.pendingBuildKey || resident.buildState)) {
          view.buildQueue.removeModule(entry.record.id, module.id);
          view.disposeResidentBuild(resident);
          resident.pendingBuildKey = null;
        }
        if (band !== previousVisible) {
          // A transition starts once per requested destination; the frames it
          // then spends waiting for that band's build are counted separately,
          // so the counter reports real requests, not queue latency.
          if (resident.transitionTarget === band) {
            view.stats.lodTransitionWaitFrames += 1;
          } else {
            resident.transitionTarget = band;
            view.stats.lodTransitionsStarted += 1;
            view.stats.lodTransitions += 1;
          }
          // Any band that draws masonry needs a build of that band — including
          // a module that has never been built, which is every module that was
          // in the far band when its plan landed.
          const needsRebuild = (
            (band === 'near' || band === 'coarse')
            && resident.builtBand !== band
          );
          if (needsRebuild) {
            const buildPriority = (
              band === 'near' ? 0 : CONSTRUCTION_COARSE_BUILD_PRIORITY_BIAS
            ) - pixels;
            view.enqueueModuleBuild(entry.record.id, module, band, buildPriority);
            // Keep showing the previous band until the destination mesh lands.
          } else {
            resident.visibleBand = band;
            resident.visibleSince = now;
            resident.band = band;
            resident.transitionTarget = null;
          }
        } else {
          resident.transitionTarget = null;
          resident.band = band;
          resident.visibleBand = band;
        }
        const shown = resident.visibleBand ?? resident.band ?? band;
        const visible = shown !== 'shell' && resident.meshes.length > 0;
        for (const mesh of resident.meshes) mesh.visible = visible;
        // Each module's ribbon covers exactly the arc its masonry vacated.
        if (resident.shellMesh) resident.shellMesh.visible = !visible;
        if (!visible) uncovered += 1;
        if (band === 'near') nearCount += 1;
        else if (band === 'coarse') coarseCount += 1;
        else shellCount += 1;
      }
      // The record-wide ribbon is only the fallback for arcs no module owns a
      // shell for; once every module has one it would just double the surface.
      if (entry.shellMesh) {
        entry.shellMesh.visible = uncovered > 0 && !view.modulesOwnTheirShells(entry);
      }
    }
    view.stats.modulesNear = nearCount;
    view.stats.modulesCoarse = coarseCount;
    view.stats.modulesShell = shellCount;
    view.enforceDraftOcclusion();
  }
