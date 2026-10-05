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
      const pending = surface.detailViews?.filter(view => view.pendingRebuild) ?? [];
      if (!pending.length) continue;
      for (const view of pending) surface.detailBuildQueue.enqueue(view.pendingRebuild);
      surface.detailBuildQueue.flush((job, yieldWork) => {
        const view = surface.detailViews.find(item => job.key.startsWith(`${item.layerName}:`));
        return view?.applyPendingRebuild(yieldWork) ?? false;
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
