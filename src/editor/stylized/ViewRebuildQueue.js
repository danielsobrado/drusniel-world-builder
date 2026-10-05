/** Each view has one resumable replacement; obsolete LOD requests cannot run. */
export function syncViewRebuildQueue(queue, views, pendingProperty = 'pendingRebuild') {
  const jobs = views.flatMap(view => view?.[pendingProperty] ? [view[pendingProperty]] : []);
  const keys = new Set(jobs.map(job => job.key));
  queue.retain(job => keys.has(job.key));
  for (const job of jobs) queue.enqueue(job);
}
