import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { MeadowWorkerCompaction } from './MeadowWorkerCompaction.js';

const WORKER_COUNT = 2;
const outputBuffers = output => output ? ['position', 'rotation', 'data'].map(name => output[name].buffer) : [];

/** No unbounded queue: tiles dispatch in the layer's current visibility order. */
export class MeadowCompactionPool {
  constructor({ workerFactory = () => new Worker(new URL('./meadowCompaction.worker.js', import.meta.url), { type: 'module' }),
    workerCount = WORKER_COUNT } = {}) {
    this.workers = [];
    this.pending = new Map();
    this.templates = new Map();
    this.serial = 0;
    this.failed = false;
    this.disposed = false;
    try {
      for (let i = 0; i < workerCount; i++) {
        const worker = workerFactory();
        this.workers.push(worker);
        worker.addEventListener('message', event => this.complete(event.data));
        worker.addEventListener('error', () => this.fail());
        worker.addEventListener('messageerror', () => this.fail());
      }
    } catch { this.fail(); }
  }

  register(template) {
    if (this.failed || this.templates.has(template)) return;
    const id = this.templates.size;
    this.templates.set(template, id);
    this.hasCards ||= Boolean(template.userData.meadow.cards);
    const definition = { count: template.instanceCount, meadow: template.userData.meadow,
      attributes: Object.fromEntries(['instancePosition', 'instanceRotation', 'instanceData']
        .map(name => [name, template.getAttribute(name).array])) };
    try {
      for (const worker of this.workers) worker.postMessage({ type: 'template', id, definition });
    } catch { this.fail(); }
  }

  create(options) {
    this.register(options.template);
    return new MeadowWorkerCompaction(this, options);
  }

  eligibleWorkers(template) {
    // Far cards must keep progressing while blade promotions stay continuously
    // busy. A blade-only field can use the complete pool.
    return this.hasCards && this.workers.length > 1
      ? [this.workers[template.userData.meadow.cards ? 1 : 0]] : this.workers;
  }

  hasCapacity(template) {
    return this.failed || this.eligibleWorkers(template).some(worker =>
      ![...this.pending.values()].some(job => job.worker === worker));
  }

  templateForCapacity(template, capacity) {
    return [...this.templates.keys()].find(candidate => candidate.instanceCount === capacity
      && candidate.userData.meadow.tileSize === template.userData.meadow.tileSize
      && candidate.userData.meadow.cards === template.userData.meadow.cards) ?? template;
  }

  dispatch(task) {
    if (this.failed || this.disposed) return;
    const busy = new Set([...this.pending.values()].map(job => job.worker));
    const worker = this.eligibleWorkers(task.template).find(candidate => !busy.has(candidate));
    if (!worker) return;
    this.register(task.template);
    if (this.failed) return;
    const id = ++this.serial;
    const output = task.recycled;
    const capacity = task.template.instanceCount;
    const request = { type: 'build', id, templateId: this.templates.get(task.template),
      snapshot: task.options.snapshot, centerX: task.options.centerX, centerZ: task.options.centerZ,
      previous: task.result ? { output: task.result.output, capacity: task.result.capacity } : null, output };
    task.pending = true;
    task.recycled = null;
    this.pending.set(id, { worker, task, capacity, started: performance.now() });
    try {
      worker.postMessage(request, outputBuffers(output));
      PerfCounters.inc('meadowWorkerRequests');
    } catch { this.fail(); }
  }

  complete(message) {
    const job = this.pending.get(message?.id);
    if (!job || this.disposed) return;
    const output = message.output;
    if (message.error || message.capacity !== job.capacity || !Number.isInteger(output?.count)
        || output.count < 0 || output.count > job.capacity
        || output.position?.length !== job.capacity * 4 || output.rotation?.length !== job.capacity * 2
        || output.data?.length !== job.capacity * 4) {
      this.fail(); return;
    }
    this.pending.delete(message.id);
    job.task.complete(message.output, message.capacity);
    PerfCounters.inc('meadowWorkerRanksPrepared', message.capacity - (message.previousCapacity ?? 0));
    PerfCounters.inc('meadowWorkerCompleteMs', performance.now() - job.started);
  }

  fail() {
    if (this.failed) return;
    this.failed = true;
    for (const { task } of this.pending.values()) task.pending = false;
    this.pending.clear();
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    PerfCounters.inc('meadowWorkerFailures');
  }

  dispose() {
    this.disposed = true;
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.pending.clear();
    this.templates.clear();
  }
}
