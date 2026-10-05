function buildKey(job) {
  return `${job.constructionId}:${job.module.id}`;
}

function jobPriority(job) {
  return Number.isFinite(job.priority) ? job.priority : Number.POSITIVE_INFINITY;
}

export class ConstructionBuildQueue {
  constructor() {
    this.jobs = new Map();
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
    this.jobs.set(key, { job, serial: ++this.serial });
  }

  shift() {
    let selectedKey = null;
    let selected = null;
    for (const [key, current] of this.jobs) {
      if (!selected
        || jobPriority(current.job) < jobPriority(selected.job)
        || (jobPriority(current.job) === jobPriority(selected.job) && current.serial < selected.serial)) {
        selectedKey = key;
        selected = current;
      }
    }
    if (!selected) return undefined;
    this.jobs.delete(selectedKey);
    return selected.job;
  }

  removeModule(constructionId, moduleId) {
    this.jobs.delete(`${constructionId}:${moduleId}`);
  }

  removeConstruction(constructionId) {
    for (const [key, current] of this.jobs) {
      if (current.job.constructionId === constructionId) this.jobs.delete(key);
    }
  }

  some(predicate) {
    for (const current of this.jobs.values()) {
      if (predicate(current.job)) return true;
    }
    return false;
  }

  clear() {
    this.jobs.clear();
  }
}
