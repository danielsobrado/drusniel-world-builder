import { visibleBranch } from '../visibility/RenderPassParticipation.js';
import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

/** Each auxiliary view has its own vegetation selection and billboard uniforms. */
export function withAuxiliaryScene(surface, camera, origin, timestamp, operation, isolate = false) {
  const preparation = surface.terrainView?.drawPreparation;
  let draw = preparation?.withPendingDrawsHidden
    ? () => preparation.withPendingDrawsHidden(operation) : operation;
  for (const view of surface.detailViews ?? []) if (view.visibility) {
    if (isolate && view.root && !visibleBranch(view.root)) {
      PerfCounters.inc('reflectionHiddenDetailLayersSkipped');
      continue;
    }
    const next = draw; draw = () => view.visibility.withAuxiliaryCamera
      ? view.visibility.withAuxiliaryCamera(camera, next) : view.visibility.withFull(next);
  }
  for (const batch of surface.treeView?.impostorBatches ?? []) {
    if (!batch) continue;
    const next = draw; draw = () => batch.withCamera(camera, origin, timestamp, next);
  }
  return draw();
}
