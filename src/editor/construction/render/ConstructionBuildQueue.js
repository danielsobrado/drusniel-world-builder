const COMPACT_HEAD_MIN = 64;

function buildKey(job) {
  return `${job.constructionId}:${job.module.id}`;
}

export class ConstructionBuildQueue {
  constructor() {
    this.jobs = new Map();
    this.order = [];
    this.head = 0;
    this.serial = 0;
  }

  get length() {
    return this.jobs.size;
  }

  upsert(job) {
    const key = buildKey(job);
    const current = this.jobs.get(key);
    if (current) {
      current.job = job;
      return;
    }

    const serial = ++this.serial;
    this.jobs.set(key, { job, serial });
    this.order.push({ key, serial });
  }

  shift() {
    while (this.head < this.order.length) {
      const queued = this.order[this.head++];
      const current = this.jobs.get(queued.key);
      if (!current || current.serial !== queued.serial) continue;
      this.jobs.delete(queued.key);
      this.compact();
      return current.job;
    }
    this.compact(true);
    return undefined;
  }

  removeModule(constructionId, moduleId) {
    this.jobs.delete(`${constructionId}:${moduleId}`);
    this.compact();
  }

  removeConstruction(constructionId) {
    for (const [key, current] of this.jobs) {
      if (current.job.constructionId === constructionId) this.jobs.delete(key);
    }
    this.compact();
  }

  some(predicate) {
    for (const current of this.jobs.values()) {
      if (predicate(current.job)) return true;
    }
    return false;
  }

  clear() {
    this.jobs.clear();
    this.order.length = 0;
    this.head = 0;
  }

  compact(force = false) {
    if (!force && (this.head < COMPACT_HEAD_MIN || this.head * 2 < this.order.length)) return;
    if (this.head === 0) return;
    this.order = this.order.slice(this.head);
    this.head = 0;
  }
}
