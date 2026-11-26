/** Indexed binary min-heap. Updating an existing job is O(log n). */
export class WorkPriorityHeap {
  constructor() {
    this.items = [];
    this.indices = new Map();
  }

  static precedes(a, b) {
    return a.queuePriority < b.queuePriority
      || (a.queuePriority === b.queuePriority && a.queueSequence < b.queueSequence);
  }

  clear() { this.items.length = 0; this.indices.clear(); }
  peek() { return this.items[0]; }

  swap(a, b) {
    const items = this.items;
    [items[a], items[b]] = [items[b], items[a]];
    this.indices.set(items[a], a); this.indices.set(items[b], b);
  }

  up(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!WorkPriorityHeap.precedes(this.items[index], this.items[parent])) break;
      this.swap(index, parent);
      index = parent;
    }
    return index;
  }

  down(index) {
    const items = this.items;
    for (;;) {
      const left = index * 2 + 1, right = left + 1;
      let best = index;
      if (left < items.length && WorkPriorityHeap.precedes(items[left], items[best])) best = left;
      if (right < items.length && WorkPriorityHeap.precedes(items[right], items[best])) best = right;
      if (best === index) return;
      this.swap(index, best);
      index = best;
    }
  }

  push(item) {
    this.indices.set(item, this.items.length);
    this.items.push(item);
    this.up(this.items.length - 1);
  }

  changed(item) {
    const index = this.indices.get(item);
    if (index !== undefined) this.down(this.up(index));
  }

  remove(item) {
    const index = this.indices.get(item);
    if (index === undefined) return false;
    const last = this.items.pop();
    this.indices.delete(item);
    if (last !== item) {
      this.items[index] = last;
      this.indices.set(last, index);
      this.down(this.up(index));
    }
    return true;
  }

  pop() {
    const item = this.peek();
    if (item) this.remove(item);
    return item;
  }
}
