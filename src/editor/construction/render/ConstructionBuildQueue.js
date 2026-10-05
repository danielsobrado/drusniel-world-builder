const HEAP_COMPACT_SLACK = 64;

function buildKey(job) {
  return `${job.constructionId}:${job.module.id}`;
}

function jobPriority(job) {
  return Number.isFinite(job.priority) ? job.priority : Number.POSITIVE_INFINITY;
}

function comesFirst(left, right) {
  if (left.priority < right.priority) return true;
  if (left.priority > right.priority) return false;
  return left.serial < right.serial;
}

export class ConstructionBuildQueue {
  constructor() {
    this.jobs = new Map();
    this.heap = [];
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
      current.version += 1;
      this.pushHeap(this.heapEntry(key, current));
      this.compact();
      return;
    }

    const entry = { job, serial: ++this.serial, version: 1 };
    this.jobs.set(key, entry);
    this.pushHeap(this.heapEntry(key, entry));
  }

  shift() {
    while (this.heap.length > 0) {
      const queued = this.popHeap();
      const current = this.jobs.get(queued.key);
      if (!current || current.version !== queued.version) continue;
      this.jobs.delete(queued.key);
      this.compact();
      return current.job;
    }
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
    this.heap.length = 0;
  }

  heapEntry(key, current) {
    return {
      key,
      version: current.version,
      priority: jobPriority(current.job),
      serial: current.serial,
    };
  }

  pushHeap(entry) {
    let index = this.heap.length;
    this.heap.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!comesFirst(this.heap[index], this.heap[parent])) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  popHeap() {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length === 0) return first;
    this.heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.heap.length && comesFirst(this.heap[left], this.heap[best])) best = left;
      if (right < this.heap.length && comesFirst(this.heap[right], this.heap[best])) best = right;
      if (best === index) break;
      [this.heap[index], this.heap[best]] = [this.heap[best], this.heap[index]];
      index = best;
    }
    return first;
  }

  compact() {
    if (this.heap.length <= this.jobs.size * 2 + HEAP_COMPACT_SLACK) return;
    this.heap.length = 0;
    for (const [key, current] of this.jobs) this.pushHeap(this.heapEntry(key, current));
  }
}
