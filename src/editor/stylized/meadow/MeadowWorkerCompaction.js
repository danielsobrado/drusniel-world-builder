import { createCompaction } from './meadowGrassCompaction.js';

/** A tile retains its completed prefix while a worker prepares additional ranks. */
export class MeadowWorkerCompaction {
  constructor(pool, options) {
    this.pool = pool;
    this.options = options;
    this.template = options.template;
    this.recycled = options.output;
    this.result = options.previous ?? null;
    this.pending = false;
    this.cancelled = false;
    this.fallback = null;
  }

  get asynchronous() { return !this.fallback; }
  get output() {
    return this.cancelled ? null : this.fallback?.output
      ?? (this.result !== this.options.previous ? this.result?.output : null);
  }
  get processedCount() { return this.fallback?.processedCount ?? this.result?.capacity ?? 0; }
  get progress() { return this.processedCount / this.template.instanceCount; }
  get done() { return this.fallback?.done ?? this.processedCount >= this.template.instanceCount; }

  promote(template, output = null) {
    this.template = template;
    if (this.fallback) return this.fallback.promote(template, output);
    const previous = this.recycled;
    this.recycled = output;
    return previous;
  }

  advance(limit) {
    if (this.cancelled || this.pending || this.done) return;
    if (this.pool.failed) {
      this.fallback ??= createCompaction({ ...this.options, template: this.template,
        output: this.recycled?.position.byteLength ? this.recycled : null,
        previous: this.result });
      this.recycled = null;
      this.fallback.advance(limit);
      return;
    }
    this.pool.dispatch(this);
  }

  complete(output, capacity) {
    this.pending = false;
    this.completedAt = performance.now();
    // The previous published prefix is owned by the layer. Intermediate worker
    // results have never been published and can return to its pool immediately.
    if (this.result && this.result !== this.options.previous) this.options.recycle?.(this.result.output, this.result.template);
    this.result = { output, capacity, template: this.pool.templateForCapacity(this.template, capacity) };
    if (this.cancelled) {
      this.options.recycle?.(output, this.result.template);
      this.result = null;
    }
  }

  cancel() {
    if (this.cancelled) return;
    if (this.fallback) this.options.recycle?.(this.fallback.output, this.template);
    else if (this.result && this.result !== this.options.previous) this.options.recycle?.(this.result.output, this.result.template);
    this.cancelled = true;
    this.result = null;
    if (this.recycled) this.options.recycle?.(this.recycled, this.template);
    this.recycled = null;
  }
}
