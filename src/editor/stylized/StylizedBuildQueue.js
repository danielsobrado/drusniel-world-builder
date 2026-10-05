/**
 * Limits heavy stylized rebuilds per frame.
 */
export class StylizedBuildQueue {
  constructor({
    buildsPerFrame = 1,
    budgetMs = 3,
    now = () => performance.now(),
    shouldYield = null,
    budgetProvider = null,
  } = {}) {
    this.buildsPerFrame = buildsPerFrame;
    this.budgetMs = budgetMs;
    this.now = now;
    // Optional frame-wide gate. Each queue is budgeted on its own, but rocks,
    // trees and bushes all flush inside one update, so without a shared view of
    // the frame three separately "cheap" queues can still stack into one hitch.
    this.shouldYield = typeof shouldYield === 'function' ? shouldYield : null;
    this.budgetProvider = budgetProvider;
    this.queue = [];
    this.entriesByKey = new Map();
    this.sortDirty = false;
    this.nextSequence = 0;
  }

  get size() {
    return this.queue.length;
  }

  clear() {
    this.queue.length = 0;
    this.entriesByKey.clear();
    this.sortDirty = false;
    this.nextSequence = 0;
  }

  retain(keep) {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.queue.length; readIndex += 1) {
      const job = this.queue[readIndex];
      if (keep(job)) {
        this.queue[writeIndex++] = job;
      } else {
        this.entriesByKey.delete(job.key);
      }
    }
    this.queue.length = writeIndex;
  }

  enqueue(job) {
    const key = job.key;
    const priority = Number.isFinite(job.priority)
      ? job.priority
      : Number.POSITIVE_INFINITY;
    const existing = this.entriesByKey.get(key);
    if (existing) {
      Object.assign(existing, job);
      if (existing.queuePriority === priority) return false;
      existing.queuePriority = priority;
      this.sortDirty = true;
      return true;
    }

    const queued = {
      ...job,
      queuePriority: priority,
      queueSequence: this.nextSequence,
      requestedAt: job.requestedAt ?? this.now(),
    };
    this.nextSequence += 1;
    this.queue.push(queued);
    this.entriesByKey.set(key, queued);
    this.sortDirty = true;
    return true;
  }

  sortQueue() {
    if (!this.sortDirty) return;
    this.queue.sort((left, right) => (
      right.queuePriority - left.queuePriority
      || right.queueSequence - left.queueSequence
    ));
    this.sortDirty = false;
  }

  flush(run) {
    if (this.queue.length === 0) return { built: 0, remaining: 0 };
    const startedAt = this.now();
    const budgetMs = this.budgetProvider?.(this.budgetMs) ?? this.budgetMs;
    let built = 0;
    const shouldYield = () => (
      this.now() - startedAt >= budgetMs
      || Boolean(this.shouldYield?.())
    );
    if (shouldYield()) return { built: 0, remaining: this.queue.length };
    this.sortQueue();
    while (
      this.queue.length > 0
      && built < this.buildsPerFrame
      && !shouldYield()
    ) {
      const job = this.queue.pop();
      this.entriesByKey.delete(job.key);
      // Only count successful work so stale/no-op jobs cannot starve real rebuilds.
      const completed = this.workRunner
        ? this.workRunner(() => run(job, shouldYield)) : run(job, shouldYield);
      if (completed) {
        built += 1;
      }
    }
    return { built, remaining: this.queue.length };
  }
}
