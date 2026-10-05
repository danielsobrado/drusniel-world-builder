/** Each view has one resumable replacement; obsolete LOD requests cannot run. */
export function syncViewRebuildQueue(queue, views, pendingProperty = 'pendingRebuild') {
  queue.retain(job => views.some(view => view?.[pendingProperty]?.key === job.key));
  for (const view of views) {
    const job = view?.[pendingProperty];
    if (job) queue.enqueue(job);
  }
}
