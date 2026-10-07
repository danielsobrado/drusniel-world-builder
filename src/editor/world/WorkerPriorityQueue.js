function precedes(a, b) { return a.priority < b.priority || (a.priority === b.priority && a.id < b.id); }

/** Indexed min-heap: stable dispatch, cancellation and priority updates in O(log n). */
export class WorkerPriorityQueue {
  constructor() { this.items = []; this.indices = new Map(); }
  get length() { return this.items.length; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
  clear() { this.items.length = 0; this.indices.clear(); }
  swap(a, b) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    this.indices.set(this.items[a].id, a);
    this.indices.set(this.items[b].id, b);
  }
  up(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!precedes(this.items[index], this.items[parent])) break;
      this.swap(index, parent);
      index = parent;
    }
    return index;
  }
  down(index) {
    while (index * 2 + 1 < this.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.length && precedes(this.items[child + 1], this.items[child])) child += 1;
      if (!precedes(this.items[child], this.items[index])) break;
      this.swap(index, child);
      index = child;
    }
  }
  push(job) { this.indices.set(job.id, this.length); this.items.push(job); this.up(this.length - 1); }
  shift() { const first = this.items[0]; if (first) this.remove(first.id); return first; }
  remove(id) {
    const index = this.indices.get(id);
    if (index === undefined) return false;
    const last = this.items.pop();
    this.indices.delete(id);
    if (index < this.length) {
      this.items[index] = last;
      this.indices.set(last.id, index);
      this.down(this.up(index));
    }
    return true;
  }
  reprioritize(job, priority) {
    const index = this.indices.get(job.id);
    if (index === undefined) return false;
    job.priority = priority;
    this.down(this.up(index));
    return true;
  }
}
