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
    this.stats = { completed: 0, advanced: 0, blocked: 0, cancelled: 0 };
    this.queue = [];
    this.entriesByKey = new Map();
    this.sortDirty = false;
    this.nextSequence = 0;
  }

  get size() {
    return this.queue.length;
  }

  clear() {
    this.stats.cancelled += this.queue.length;
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
        this.stats.cancelled += 1;
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

  getDiagnostics({ includeJobs = false } = {}) {
    let oldestAgeMs = 0;
    const now = this.now();
    for (const job of this.queue) oldestAgeMs = Math.max(oldestAgeMs, now - job.requestedAt);
    return { depth: this.size, oldestAgeMs, ...this.stats,
      ...(includeJobs ? { jobs: this.queue.map(job => ({ key: job.key, focus: job.focus,
        chunkX: job.chunkX, chunkZ: job.chunkZ, requestedAt: job.requestedAt, reason: job.blockedReason })) } : {}) };

  }

  sortQueue() {
    if (!this.sortDirty) return;
    this.queue.sort((left, right) => {
      if (left.queuePriority < right.queuePriority) return 1;
      if (left.queuePriority > right.queuePriority) return -1;
      return right.queueSequence - left.queueSequence;
    });
    this.sortDirty = false;
  }

  flush(run) {
    if (this.queue.length === 0) return { built: 0, remaining: 0 };
    const startedAt = this.now();
    const budgetMs = this.budgetProvider?.(this.budgetMs) ?? this.budgetMs;
    let built = 0;
    let turns = 0;
    const deferred = [];
    const shouldYield = () => (
      this.now() - startedAt >= budgetMs
      || Boolean(this.shouldYield?.())
    );
    if (shouldYield()) return { built: 0, remaining: this.queue.length };
    this.sortQueue();
    while (
      this.queue.length > 0
      && turns < this.buildsPerFrame
      && !shouldYield()
    ) {
      const job = this.queue.pop();
      this.entriesByKey.delete(job.key);
      // Only count successful work so stale/no-op jobs cannot starve real rebuilds.
      const before = job.progressProbe?.() ?? 0;
      const outcome = this.workRunner
        ? this.workRunner(() => run(job, shouldYield)) : run(job, shouldYield);
      const structured = outcome !== null && typeof outcome === 'object' && 'completed' in outcome;
      const completed = structured ? outcome.completed : Boolean(outcome);
      const after = job.progressProbe?.() ?? before;
      const advanced = structured ? outcome.advanced : completed || after > before;
      if (advanced) this.stats.advanced += 1;
      if (!completed && !advanced) this.stats.blocked += 1;
      if (completed) { this.stats.completed += 1; built += 1; }
      // A dependency wait consumes time, but not a build turn. In particular,
      // the one-turn tree queue must still reach another ready manifest when
      // its nearest job is waiting on rocks or a prepared field. Deferred jobs
      // are held aside until the end, so each is visited at most once.
      if (completed || advanced) turns += 1;
      if (structured && !completed) {
        job.blockedReason = outcome.reason;
        deferred.push(job);
      }
    }
    for (const job of deferred) this.enqueue(job);
    return { built, remaining: this.queue.length };
  }
}
