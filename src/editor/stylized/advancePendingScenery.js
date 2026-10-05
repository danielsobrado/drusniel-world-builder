const LAYERS = [
  ['rock', 'pendingRebuild', 'applyPendingRebuild'],
  ['tree', 'pendingLodRebuild', 'applyPendingRebuild'],
  ['bush', 'pendingRebuild', 'applyPendingRebuild'],
];

/** Advance one waiting publication before mandatory updates exhaust the frame
 * cutoff. Collision preparation stays first; every queue uses the same allowance. */
export function advancePendingScenery(surface) {
  const first = surface.earlySceneryCursor ?? 0;
  for (let offset = 0; offset < 4; offset++) {
    const index = (first + offset) % 4;
    if (index === 3) {
      const views = surface.detailViews ?? [];
      let pending = false;
      for (const view of views) {
        if (!view?.pendingRebuild) continue;
        surface.detailBuildQueue.enqueue(view.pendingRebuild);
        pending = true;
      }
      if (!pending) continue;
      surface.detailBuildQueue.flush((job, yieldWork) => {
        for (const view of views) {
          if (job.key.startsWith(`${view.layerName}:`)) {
            return view.applyPendingRebuild(yieldWork) ?? false;
          }
        }
        return false;
      });
    } else {
      const [layer, property, method] = LAYERS[index];
      const view = surface[`${layer}View`];
      if (!view?.[property] || layer === 'bush' && surface.rockView?.pendingRebuild) continue;
      const queue = surface[`${layer}BuildQueue`];
      queue.enqueue(view[property]);
      queue.flush((_job, yieldWork) => view[method](yieldWork));
    }
    surface.earlySceneryCursor = (index + 1) % 4;
    return;
  }
}
