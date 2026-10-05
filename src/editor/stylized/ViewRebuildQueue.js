/** Each view has one resumable replacement; obsolete LOD requests cannot run. */
export function syncViewRebuildQueue(queue, views, pendingProperty = 'pendingRebuild') {
  const keys = new Set();
  for (const view of views) {
    const job = view?.[pendingProperty];
    if (job) keys.add(job.key);
  }
  queue.retain(job => keys.has(job.key));
  for (const view of views) {
    const job = view?.[pendingProperty];
    if (job) queue.enqueue(job);
  }
}
