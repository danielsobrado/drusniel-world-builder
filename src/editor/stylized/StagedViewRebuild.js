import { createIteratorBuilder } from './ResumableIterator.js';

/** Retain a complete publication while assembling its replacement in small units. */
export function stepViewRebuild(view, job, shouldYield, factory, pendingProperty = 'pendingRebuild') {
  if (!job || shouldYield?.()) return false;
  const revision = view.revisionTracker?.revision ?? 0;
  const prototypes = view.prototypeRevision ?? 0;
  let state = view.stagedRebuild;
  const moved = state?.job.focus && job.focus
    && (state.job.focus.chunkX !== job.focus.chunkX || state.job.focus.chunkZ !== job.focus.chunkZ);
  if (!state || moved || state.revision !== revision || state.prototypes !== prototypes) {
    state = { job, revision, prototypes, builder: createIteratorBuilder(() => factory(job)) };
    view.stagedRebuild = state;
  }
  view.currentShouldYield = shouldYield;
  const result = state.builder.step({ shouldYield });
  if (result === null) return false;
  view.stagedRebuild = null;
  view.lastUpdateKey = state.job.updateKey;
  if (view[pendingProperty]?.updateKey === state.job.updateKey) view[pendingProperty] = null;
  return true;
}
