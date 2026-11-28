import { createIteratorBuilder } from './ResumableIterator.js';

/** Retain a complete publication while assembling its replacement in small units. */
export function stepViewRebuild(view, job, shouldYield, factory, pendingProperty = 'pendingRebuild') {
  if (!job) { cancelStagedViewRebuild(view); return false; }
  const focus = view.terrainView?.focusChunk;
  if (focus && job.focus && (focus.chunkX !== job.focus.chunkX || focus.chunkZ !== job.focus.chunkZ)) {
    cancelStagedViewRebuild(view);
    if (view[pendingProperty] === job) view[pendingProperty] = null;
    return false;
  }
  if (shouldYield?.()) return false;
  const revision = view.revisionTracker?.revision ?? 0;
  const prototypes = `${view.prototypeRevision ?? 0}:${view.impostorVersion ?? 0}:${job.rockSource?.prototypeRevision ?? 0}:${view.biomeAssetPalette?.revision ?? 0}`;
  let state = view.stagedRebuild;
  const moved = state?.job.focus && job.focus
    && (state.job.focus.chunkX !== job.focus.chunkX || state.job.focus.chunkZ !== job.focus.chunkZ);
  if (!state || moved || state.revision !== revision || state.prototypes !== prototypes) {
    cancelStagedViewRebuild(view);
    state = { job, revision, prototypes, lastProgressAt: performance.now(), builder: createIteratorBuilder(() => factory(job)) };
    view.stagedRebuild = state;
  }
  view.currentShouldYield = shouldYield;
  const progress = state.builder.progress;
  const workBefore = view.workProgress ?? 0;
  view.blockedDependency = null;
  const result = state.builder.step({ shouldYield });
  view.workProgress = (view.workProgress ?? 0) + state.builder.progress - progress;
  if (view.workProgress > workBefore) state.lastProgressAt = performance.now();
  if (result === null) return false;
  view.stagedRebuild = null;
  view.lastUpdateKey = state.job.updateKey;
  if (view[pendingProperty]?.updateKey === state.job.updateKey) view[pendingProperty] = null;
  return true;
}

export function cancelStagedViewRebuild(view) {
  view.stagedRebuild?.builder.cancel();
  view.stagedRebuild = null;
}
